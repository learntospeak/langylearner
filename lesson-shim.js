// --- TOP OF lesson-shim.js ---
import TTS from './modules/tts-adapter.js';
import Chat from './modules/chat-adapter.js';

// Point the adapter at your backend route. Keep fallback on.
// Allow override via window.__TTS_ENDPOINT to avoid port conflicts (e.g., ntopng on :3000).
const overrideEndpoint = window.__TTS_ENDPOINT;
const isLiveServer = location.port === '5500';
const defaultTtsEndpoint = isLiveServer ? 'http://localhost:3000/api/tts' : '/api/tts';
const selectedTtsEndpoint = overrideEndpoint ?? defaultTtsEndpoint;
TTS.configure({ endpoint: selectedTtsEndpoint, allowFallback: true });

// Derive chat endpoint from the TTS endpoint by swapping /tts -> /chat, unless explicitly overridden.
const derivedChat = (selectedTtsEndpoint || '').replace(/\/tts(\b|$)/, '/chat');
const defaultChatEndpoint = isLiveServer ? (derivedChat || 'http://localhost:3000/api/chat') : '/api/chat';
Chat.configure({ endpoint: window.__CHAT_ENDPOINT ?? defaultChatEndpoint });

// Expose a pointer to the current scene so the Speak button knows what to play.
// (If you already set this elsewhere, keep yours.)
window.__KR_CURRENT_SCENE__ ||= null;

console.info('[lesson-shim] build=no-scene-toggles v11');
window.__LS_BUILD = 'no-scene-toggles@v11';

// lesson-shim.js — with Pronounce + Romaji toggle
window.LessonShim = (() => {
  // ---------- utils ----------
  const norm = (s) => (s || "").replace(/[。．、，！？!\?()\[\]{}'"「」『』・…：:；;\-＿_〜~ー\s]/g, "").toLowerCase();
  const q = (sel) => (sel ? document.querySelector(sel) : null);
  const qa = (sel) => (sel ? Array.from(document.querySelectorAll(sel)) : []);
  // remove Japanese/ASCII full stops (and the fullwidth dot)
  const stripStops = (s) => (s || "").replace(/[。．.]/g, "");

  // Treat punctuation as optional
  const PUNCT_RX = /[。、，,.!?！？]/g;

  function ensureKanaBindings(inp) {
    if (!inp) return;
    // WanaKana IME: bind once
    if (window.wanakana && !inp.dataset.kanaBound) {
      wanakana.bind(inp, { IMEMode: true });
      inp.dataset.kanaBound = "1";
    }
    // Smart normalizer: bind once (it reads inp.dataset.expectedKana at runtime)
    if (!inp.dataset.smartBound) {
      attachSmartNormalizer(inp);
      inp.dataset.smartBound = "1";
    }
     }

  // Canonicalize for comparisons only (do NOT bind to input events)
  // Compare-friendly canonicalizer (keeps kana; ignores punctuation/spaces)
  function canonJP(s = "") {
    const h = (window.wanakana ? wanakana.toHiragana(s) : s) || "";
    return h.replace(PUNCT_RX, "").replace(/[ \u3000]/g, "").trim();
  }


  // --- HINT HELPERS ---

  const H = {
    toHira: (s) => (window.wanakana ? wanakana.toHiragana(s || "") : (s || "")),
    firstDiff(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; },
    makeHint(expectedJP, gotRaw, sentence) {
      const got = H.toHira(gotRaw);
      const exp = sentence?.romaji_full ? H.toHira(sentence.romaji_full) : H.toHira(expectedJP);
      // ignore punctuation for hint logic
      const gotNP = (got || "").replace(PUNCT_RX, "");
      const expNP = (exp || "").replace(PUNCT_RX, "");

      if (!gotRaw || !gotRaw.trim())
        return `Type your answer. Hint: starts with 「${expNP.slice(0, 2)}」`;

      // Common pitfalls
      if (expectedJP.includes("こんにちは") && got.includes("こんにちわ"))
        return "Use 「は」 (ha) not 「わ」 in こんにちは.";

      if (/願/.test(expectedJP) && got === "おねがいします")
        return ""; // accept kana reading for 願

      if (expNP.includes("っ") && !gotNP.includes("っ")) {
        const idx = expNP.indexOf("っ"), next = expNP[idx + 1] || "";
        return `Add a small 「っ」 before 「${next}」.`;
      }

      if (gotNP.length !== expNP.length)
        return gotNP.length < expNP.length
          ? `You're missing ${expNP.length - gotNP.length} character(s).`
          : `You have ${gotNP.length - expNP.length} extra character(s).`;

      const i = H.firstDiff(gotNP, expNP);
      if (i >= 0) return `Check character ${i + 1}: should be 「${expNP[i]}」.`;

      return "Check particles/spelling.";
    },
  };
  // --- MORA HELPERS ---
  const SMALL_KANA = "ゃゅょャュョぁぃぅぇぉァィゥェォゎヮ";
  function splitMora(str = "") {
    const a = [...str]; const out = [];
    for (let i = 0; i < a.length; i++) {
      const c = a[i], n = a[i + 1];
      if (c === "っ" || c === "ッ" || c === "ー") { out.push(c); continue; }
      if (n && SMALL_KANA.includes(n)) { out.push(c + n); i++; continue; }
      out.push(c);
    }
    return out;
  }


  // Show kana chips + next hint under an input, using a reading override if provided.
  // This version is IME-safe: it waits until the value is kana-only, so progress
  // doesn't "reset" between the first and second letters of a syllable.
  function attachKanaGuide(inp, targetJP, map, readingOverride = null) {
    const host = inp.closest(`.${map?.classes?.item || "lesson-item"}`) || inp.parentElement;
    if (!host) return;

    let row = host.querySelector('.guide-row');
    let foot = host.querySelector('.guide-foot');
    if (!row) {
      row = document.createElement('div'); row.className = 'guide-row'; host.appendChild(row);
      foot = document.createElement('div'); foot.className = 'guide-foot'; host.appendChild(foot);
    }

    // persist state on the element
    const tgt = toHira(readingOverride || targetJP || "").replace(PUNCT_RX, "");
    inp._guideTarget = tgt;
    inp._guideProgress = inp._guideProgress || 0;
    inp._guideComp = !!inp._guideComp;

    const kanaOnly = s => /^[\p{sc=Hiragana}\p{sc=Katakana}ー]+$/u.test(s || "");

    const draw = (p) => {
      const moras = splitMora(inp._guideTarget);
      row.innerHTML = moras.map((m, i) => {
        const cls = i < p ? 'done' : (i === p ? 'next' : 'todo');
        return `<span class="chip ${cls}">${m}</span>`;
      }).join('');
      const next = splitMora(inp._guideTarget)[p] || '';
      const r = next ? (window.wanakana ? wanakana.toRomaji(next) : '') : '';
      foot.textContent = next ? `Next: ${next} (${r})` : '✓ Complete';
    };

    const render = () => {
      const val = inp.value || "";
      if (inp._guideComp || !kanaOnly(val)) { draw(inp._guideProgress); return; }
      const want = splitMora(inp._guideTarget);
      const got = splitMora(normalizeKanaToExpected(toHira(val), inp._guideTarget));
      let p = 0; while (p < want.length && p < got.length && want[p] === got[p]) p++;
      inp._guideProgress = p;
      draw(p);
    };

    if (!inp.dataset.kanaGuideBound) {
      inp.dataset.kanaGuideBound = "1";
      const raf = () => requestAnimationFrame(render);
      inp.addEventListener('compositionstart', () => { inp._guideComp = true; });
      inp.addEventListener('compositionend', () => { inp._guideComp = false; raf(); });
      inp.addEventListener('input', raf);
    }
    render();
  }

  // === Canonical readings + helpers (ONE copy only) ===
  const READINGS = {
    "お願いします": "おねがいします",
    "お疲れ様です": "おつかれさまです",
    "お疲れ様": "おつかれさま",
    "疲れ様": "つかれさま"
    // add more as needed…
  };


  function kanjiToReading(jp = "") {
    let out = jp || "";
    for (const k in READINGS) out = out.split(k).join(READINGS[k]);
    return toHira(out); // normalize to hiragana
  }

  function sentenceReadingHira(sentence) {
    if (!sentence) return "";
    // Prefer provided romaji if available, then convert to hira
    if (sentence.romaji_full && window.wanakana) {
      return wanakana.toHiragana(sentence.romaji_full);
    }
    return kanjiToReading(sentence.jp || "");
  }


  // ---- Voice roleplay helpers ----
  function hasRecognition() {
    return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
  }
  function makeRecognition() {
    const Ctor = window.webkitSpeechRecognition || window.SpeechRecognition;
    const r = new Ctor();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.maxAlternatives = 1;
    return r;
  }
  // simple normalized similarity: 1 - (levenshtein / maxLen)
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }
  function kanaSim(a, b) {
    const A = (window.wanakana ? wanakana.toHiragana(a || '') : a || '');
    const B = (window.wanakana ? wanakana.toHiragana(b || '') : b || '');
    if (!A && !B) return 1;
    const d = levenshtein(A, B);
    return 1 - d / Math.max(A.length, B.length, 1);
  }




  // --- SMART NORMALIZER ---
  // Split to mora (you already have splitMora/toHira above)
  function normalizeKanaToExpected(typedRaw, expectedRaw) {
    // strip spaces/punct and compare on kana
    const clean = s => toHira((s || "").replace(/[^\p{sc=Hiragana}\p{sc=Katakana}ー]+/gu, ""));
    const t = splitMora(clean(typedRaw));
    const e = splitMora(clean(expectedRaw));

    const out = [];
    let i = 0, j = 0;

    const bigOf = { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ" };

    while (i < e.length && j < t.length) {
      const em = e[i], tm = t[j];

      if (tm === em) { out.push(tm); i++; j++; continue; }

      // Particles: は/へ/を typed as わ/え/お
      if ((em === "は" && tm === "わ") || (em === "へ" && tm === "え") || (em === "を" && tm === "お")) {
        out.push(em); i++; j++; continue;
      }

      // Small ya/yu/yo: き + や → きゃ (when expected has small)
      const m = em.match(/^([きぎしじちぢにひびぴみり])([ゃゅょ])$/);
      if (m && tm === m[1] && t[j + 1] === bigOf[m[2]]) {
        out.push(em); i++; j += 2; continue;
      }

      // N-ambiguity: ん + い → に ; ん + (や/ゆ/よ) → にゃ/にゅ/にょ
      if (em === "に" && tm === "ん" && t[j + 1] === "い") {
        out.push("に"); i++; j += 2; continue;
      }
      if (["にゃ", "にゅ", "にょ"].includes(em) && tm === "ん" && ["や", "ゆ", "よ"].includes(t[j + 1])) {
        const want = { "にゃ": "や", "にゅ": "ゆ", "にょ": "よ" }[em];
        if (t[j + 1] === want) { out.push(em); i++; j += 2; continue; }
      }

      // Small っ missing: if expected has っ and next typed mora matches next expected
      if (em === "っ" && t[j] === e[i + 1]) {
        out.push("っ"); i++; continue;
      }

      // Long vowel normalization: おお vs おう (follow expected)
      if (em === "う" && out[out.length - 1] === "お" && tm === "お") {
        out.push("う"); i++; j++; continue;
      }

      // Default: keep typed and advance to avoid locking
      out.push(tm); i++; j++;
    }

    // Append any remaining exactly-matching tail (keeps smooth typing)
    while (i < e.length && j < t.length && t[j] === e[i]) { out.push(t[j]); i++; j++; }

    return out.join("");
  }

  // Let WanaKana IME convert first; then, once the value is kana-only,
  // normalize toward the expected reading. Runs after the current input frame.
  function attachSmartNormalizer(inp) {
    const kanaOnly = s => /^[\p{sc=Hiragana}\p{sc=Katakana}ー]+$/u.test(s || "");
    const run = () => {
      const target = toHira(inp.dataset.expectedKana || "");
      const val = inp.value || "";
      if (!target || !kanaOnly(val)) return;          // wait until kana is committed
      const after = normalizeKanaToExpected(val, target);
      if (after !== val) {
        inp.value = after;
        const end = after.length;
        inp.selectionStart = inp.selectionEnd = end;
      }
    };
    const raf = () => requestAnimationFrame(run);
    inp.addEventListener("input", raf);
    inp.addEventListener("compositionend", raf);
  }





  function toHira(s) { return (window.wanakana ? wanakana.toHiragana(s || "") : (s || "")); }
  // Convert romaji -> ひらがな and fix greeting edge cases on each keystroke
  // Convert romaji -> ひらがな and fix greeting edge cases per keystroke

  // After WanaKana converts, gently fix greeting edge cases only.
  function attachGreetingNormalizer(inp, expectedJP = "") {
    inp.addEventListener("input", () => {
      const before = inp.value;
      let after = before;

      // safe global fixes
      after = after.replace(/こんいちわ/g, "こんにちは");
      after = after.replace(/こんばんわ/g, "こんばんは");

      // enforce は only when that phrase is expected
      if (expectedJP.includes("こんにちは")) after = after.replace(/こんにちわ/g, "こんにちは");
      if (expectedJP.includes("こんばんは")) after = after.replace(/こんばんわ/g, "こんばんは");

      if (after !== before) {
        inp.value = after;
        const end = after.length;
        inp.selectionStart = inp.selectionEnd = end;
      }
    });
  }




  // Insert a disambiguating space after a single romaji "n" before a vowel/ya/yu/yo
  function bindNDisambiguator(inp, expectedJP) {
    // Only enable where it matters (prevents breaking words like "nani")
    const active = /こんにちは|こんばんは/.test(expectedJP || "");
    if (!active) return;

    inp.addEventListener('beforeinput', (e) => {
      if (e.inputType !== 'insertText' || typeof e.data !== 'string') return;
      const ch = e.data;
      if (!/[aiueoyAIUEOY]/.test(ch)) return;

      const pos = inp.selectionStart || 0;
      const val = inp.value || "";

      // Convert the prefix (which may already be kana) back to romaji to inspect the last char
      const romanPrefix = (window.wanakana ? wanakana.toRomaji(val.slice(0, pos)) : val.slice(0, pos));

      // If prefix ends with a single "n" (not "nn" or "n'"), insert a space before the incoming vowel
      if (/n$/.test(romanPrefix) && !/(nn|n')$/.test(romanPrefix)) {
        e.preventDefault();
        const newVal = val.slice(0, pos) + " " + ch + val.slice(pos);
        inp.value = newVal;
        inp.selectionStart = inp.selectionEnd = pos + 2; // after space + inserted char
        // Trigger downstream input handlers (e.g., WanaKana conversion)
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }


  function normalizeToExpected(el, expectedJP) {
    if (!expectedJP) return;
    let v = el.value || "";
    if (expectedJP.includes("こんにちは")) v = v.replace(/こんいちわ|こんにちわ/g, "こんにちは");
    if (expectedJP.includes("こんばんは")) v = v.replace(/こんばんわ/g, "こんばんは");
    el.value = v;
  }


  function ensureHintEl(root, map) {
    let h = root.querySelector(`.${map?.classes?.hint || "hint"}`);
    if (!h) {
      h = document.createElement("div");
      h.className = `${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-1`;
      root.appendChild(h);
    }
    return h;
  }


  let __MAP__ = null;
  function mascotSet(state) {
    const el = (sel) => (typeof sel === "string" ? document.querySelector(sel) : null);
    const root = __MAP__?.mascot ? el(__MAP__.mascot) : null;
    if (!root) return;
    root.classList.remove("mascot-idle", "mascot-talk", "mascot-celebrate", "mascot-confused", "mascot-think");
    if (state) root.classList.add(state);
  }
  function mascotPulse(state, ms = 900) {
    mascotSet(state);
    setTimeout(() => mascotSet("mascot-idle"), ms);
  }


  // React mascot to TTS adapter events so the mouth animates while speaking
  try {
    let __speaking = false;
    document.addEventListener('tts:start', () => { __speaking = true; try { window.__speaking = true; } catch {} ; mascotSet('mascot-talk'); });
    document.addEventListener('tts:end', () => { __speaking = false; try { window.__speaking = false; } catch {} ; mascotSet('mascot-idle'); });
    document.addEventListener('tts:seqend', () => mascotSet('mascot-idle'));
  } catch {}

  // ---------- mascot tip bubble (contextual hints) ----------
  const MascotTip = (() => {
    let tipEl = null;
    let activeTimer = null;
    let bound = false;

    function injectCssOnce() {
      if (document.getElementById('mascot-tip-style')) return;
      const css = `
        .mascot-tip{position:absolute;max-width:240px;padding:8px 10px;border-radius:10px;background:#fff;color:#111;
          border:1px solid #e5e7eb;box-shadow:0 6px 18px rgba(0,0,0,.12);font-size:.9rem;line-height:1.25;z-index:1300}
          .mascot-tip.ok{border-color:#86efac;background:#f0fdf4}
          .mascot-tip.warn{border-color:#f59e0b;background:#fffbeb}
          .mascot-tip.bad{border-color:#fca5a5;background:#fef2f2}
          .mascot-tip::before{content:"";position:absolute;left:-8px;top:14px;border-width:8px;border-style:solid;
            border-color:transparent #e5e7eb transparent transparent}
        .mascot-tip::after{content:"";position:absolute;left:-7px;top:14px;border-width:8px;border-style:solid;
          border-color:transparent #fff transparent transparent}
      `;
      const st = document.createElement('style'); st.id = 'mascot-tip-style'; st.textContent = css; document.head.appendChild(st);
    }

    function ensureTipEl() {
      if (tipEl && tipEl.isConnected) return tipEl;
      injectCssOnce();
      const host = document.getElementById('lesson-wrap') || document.body;
      tipEl = document.createElement('div');
      tipEl.className = 'mascot-tip';
      tipEl.style.display = 'none';
      host.appendChild(tipEl);
      if (!bound) {
        bound = true;
        addEventListener('resize', () => position());
        addEventListener('scroll', () => position(), true);
      }
      return tipEl;
    }

    function getAnchor() {
      const sel = __MAP__?.mascot;
      return sel ? document.querySelector(sel) : null;
    }

    function position() {
      if (!tipEl || tipEl.style.display === 'none') return;
      const wrap = document.getElementById('lesson-wrap');
      const anchor = getAnchor();
      if (!wrap || !anchor) return;
      const wr = wrap.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      const left = Math.round(ar.right - wr.left + 10);
      const top = Math.round(ar.top - wr.top + 6);
      tipEl.style.left = left + 'px';
      tipEl.style.top = top + 'px';
    }

    function hide() {
      if (!tipEl) return;
      tipEl.style.display = 'none';
      if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
    }

    function show(msg, { tone = 'warn', ms = 2800 } = {}) {
      if (!msg) return;
      const el = ensureTipEl();
      el.textContent = msg;
      el.classList.remove('ok','warn','bad');
      el.classList.add(tone);
      el.style.display = 'block';
      position();
      if (activeTimer) clearTimeout(activeTimer);
      activeTimer = setTimeout(() => hide(), ms);
    }

    return { show, hide, position };
  })();

  // ---------- mascot visual feedback (blink + think) ----------
  const MascotVisuals = (() => {
    let cssInjected = false;

    function injectCss() {
      if (cssInjected) return; cssInjected = true;
      const css = `
        @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.12); } }
        @keyframes think { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-6deg); } 75% { transform: rotate(6deg); } }
        @keyframes point { 0%,100% { transform: translate(0,0) rotate(0deg); } 30% { transform: translate(6px, 2px) rotate(6deg); } 70% { transform: translate(6px, 2px) rotate(6deg); } }
        #mascot .eye { transform-origin: center center; animation: blink 4.2s ease-in-out infinite; }
        #mascot.mascot-think { animation: think 0.7s ease-in-out 0s 2; }
        #mascot.mascot-point { animation: point 0.8s ease-in-out 0s 2; }
        @keyframes cuePulse { 0%{ box-shadow:0 0 0 0 rgba(96,165,250,.6);} 100%{ box-shadow:0 0 0 14px rgba(96,165,250,0);} }
        .cue-pulse { position: relative; z-index: 100; animation: cuePulse 1.2s ease-out 0s 2; }
      `;
      const st = document.createElement('style'); st.id = 'mascot-visual-style'; st.textContent = css; document.head.appendChild(st);
    }

    function markEyes() {
      const root = document.getElementById('mascot'); if (!root) return;
      const svg = root.querySelector('svg'); if (!svg) return;
      const circles = Array.from(svg.querySelectorAll('circle'));
      circles.forEach(c => {
        const r = parseFloat(c.getAttribute('r') || '0');
        const cy = parseFloat(c.getAttribute('cy') || '0');
        // Heuristic: the eye circles are small (r≈3) and near y≈46
        if (r <= 3.5 && cy >= 42 && cy <= 50) c.classList.add('eye');
      });
    }

    function init() { injectCss(); markEyes(); }
    return { init };
  })();

  // Arm-pointing helper: wraps arm paths, rotates toward a target
  const MascotArms = (() => {
    let cssInjected = false;
    let arms = { left: null, right: null };

    function injectCss() {
      if (cssInjected) return; cssInjected = true;
      const css = `
        #mascot .arm { transform-box: fill-box; transform-origin: left center; transition: transform .22s ease; }
        #mascot .arm-left { transform-origin: right center; }
      `;
      const st = document.createElement('style'); st.id = 'mascot-arm-style'; st.textContent = css; document.head.appendChild(st);
    }

    function markArms() {
      const root = document.getElementById('mascot'); if (!root) return;
      const svg = root.querySelector('svg'); if (!svg) return;
      if (arms.left && arms.right) return;
      const paths = Array.from(svg.querySelectorAll('path'));
      const armPaths = paths.filter(p => (p.getAttribute('fill') === 'none') && /#?E0A700/i.test(p.getAttribute('stroke')||'') && (parseFloat(p.getAttribute('stroke-width')||'0') >= 2.5));
      if (armPaths.length >= 2) {
        const [p1, p2] = armPaths;
        const px1 = parseFloat((p1.getAttribute('d')||'').match(/M(\d+(?:\.\d+)?)/)?.[1] || '0');
        const px2 = parseFloat((p2.getAttribute('d')||'').match(/M(\d+(?:\.\d+)?)/)?.[1] || '0');
        const leftPath = (px1 <= px2) ? p1 : p2;
        const rightPath = (px1 <= px2) ? p2 : p1;
        const wrap = (path, cls) => {
          if (path.parentElement && path.parentElement.tagName.toLowerCase() === 'g' && path.parentElement.classList.contains('arm')) return path.parentElement;
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.classList.add('arm', cls);
          path.parentNode.insertBefore(g, path);
          g.appendChild(path);
          return g;
        };
        arms.left = wrap(leftPath, 'arm-left');
        arms.right = wrap(rightPath, 'arm-right');
      }
    }

    function angleToTarget(target) {
      const root = document.getElementById('mascot'); if (!root) return null;
      const mr = root.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const mx = mr.left + mr.width / 2; const my = mr.top + mr.height / 2;
      const tx = tr.left + tr.width / 2; const ty = tr.top + tr.height / 2;
      const dx = tx - mx; const dy = ty - my;
      let deg = Math.atan2(dy, dx) * 180 / Math.PI; // 0=right
      return { deg, dx, dy };
    }

    function pointTo(target, ms = 1200) {
      if (!target) return;
      injectCss();
      markArms();
      if (!arms.left || !arms.right) return;
      const a = angleToTarget(target); if (!a) return;
      const useRight = a.dx >= 0;
      const active = useRight ? arms.right : arms.left;
      if (!active) return;
      if (useRight) active.style.transform = `rotate(${a.deg}deg)`;
      else active.style.transform = `rotate(${a.deg - 180}deg)`;
      const root = document.getElementById('mascot');
      root && root.classList.add('mascot-point');
      setTimeout(() => { root && root.classList.remove('mascot-point'); active.style.transform = ''; }, ms);
    }

    function init() { injectCss(); markArms(); }
    return { init, pointTo };
  })();

  // ---------- mascot progress (pips or X/Y) ----------
  const MascotProgress = (() => {
    let host = null; let cssInjected = false; let bound = false;

    function injectCss() {
      if (cssInjected) return; cssInjected = true;
      const css = `
        .mascot-progress{position:absolute;display:flex;gap:4px;align-items:center;
          padding:4px 6px;border-radius:999px;background:#ffffff; border:1px solid #e5e7eb;
          box-shadow:0 6px 18px rgba(0,0,0,.10); font-size:12px; color:#111; z-index:24}
        .mascot-progress .pip{width:7px;height:7px;border-radius:999px;background:#e5e7eb}
        .mascot-progress .pip.on{background:#60a5fa}
        .mascot-progress .badge{font-variant-numeric:tabular-nums}
      `;
      const st = document.createElement('style'); st.id = 'mascot-progress-style'; st.textContent = css; document.head.appendChild(st);
    }

    function ensure() {
      if (host && host.isConnected) return host;
      injectCss();
      const wrap = document.getElementById('lesson-wrap') || document.body;
      host = document.createElement('div');
      host.className = 'mascot-progress';
      host.style.display = 'none';
      wrap.appendChild(host);
      if (!bound) {
        bound = true;
        addEventListener('resize', position);
        addEventListener('scroll', position, true);
      }
      return host;
    }

    function anchorRects() {
      const wrap = document.getElementById('lesson-wrap');
      const anchor = __MAP__?.mascot ? document.querySelector(__MAP__.mascot) : null;
      if (!wrap || !anchor) return null;
      return { wr: wrap.getBoundingClientRect(), ar: anchor.getBoundingClientRect() };
    }

    function position() {
      if (!host || host.style.display === 'none') return;
      const r = anchorRects(); if (!r) return;
      const left = Math.round(r.ar.right - r.wr.left + 8);
      const top = Math.round(r.ar.bottom - r.wr.top - 12);
      host.style.left = left + 'px';
      host.style.top = top + 'px';
    }

    function render(total = 0, index = 0) {
      const el = ensure();
      if (!total || total < 2) { el.style.display = 'none'; return; }
      if (total <= 10) {
        const pips = Array.from({ length: total }, (_, i) => `<span class="pip ${i <= index ? 'on' : ''}"></span>`).join('');
        el.innerHTML = pips;
      } else {
        el.innerHTML = `<span class="badge">${index + 1}/${total}</span>`;
      }
      el.style.display = 'flex';
      position();
    }

    return { render, position };
  })();

  // ---------- attention cues (one-time nudges) ----------
  const AttentionCue = (() => {
    let el = null; let timer = null; let cssInjected = false; let bound = false;
    const shown = new Set();

    function injectCss() {
      if (cssInjected) return; cssInjected = true;
      const css = `
        .attention-cue{position:absolute;max-width:220px;padding:8px 10px;border-radius:10px;background:#111;color:#fff;
          border:1px solid #000;box-shadow:0 10px 24px rgba(0,0,0,.25);font-size:.9rem;line-height:1.25;z-index:1000}
        .attention-cue .arrow{position:absolute; width:0; height:0; border-style:solid}
        .attention-cue.tt-top .arrow{bottom:-8px; left:12px; border-width:8px 8px 0 8px; border-color:#111 transparent transparent transparent}
        .attention-cue.tt-bottom .arrow{top:-8px; left:12px; border-width:0 8px 8px 8px; border-color:transparent transparent #111 transparent}
      `;
      const st = document.createElement('style'); st.id = 'attention-cue-style'; st.textContent = css; document.head.appendChild(st);
    }

    function ensure() {
      if (el && el.isConnected) return el;
      injectCss();
      el = document.createElement('div');
      el.className = 'attention-cue tt-top';
      el.style.display = 'none';
      el.innerHTML = '<div class="text"></div><div class="arrow"></div>';
      document.body.appendChild(el);
      if (!bound) {
        bound = true;
        addEventListener('resize', position);
        addEventListener('scroll', position, true);
      }
      return el;
    }

    let anchorEl = null; let prefer = 'top';
    function position() {
      if (!el || !anchorEl || el.style.display === 'none') return;
      const r = anchorEl.getBoundingClientRect();
      const pad = 8;
      const yTop = window.scrollY + r.top - el.offsetHeight - pad;
      const yBottom = window.scrollY + r.bottom + pad;
      const x = window.scrollX + r.left;
      // Choose top unless there is no room
      const useBottom = (prefer === 'bottom') || (yTop < window.scrollY + 10);
      el.classList.toggle('tt-top', !useBottom);
      el.classList.toggle('tt-bottom', useBottom);
      el.style.left = Math.max(8, x) + 'px';
      el.style.top = (useBottom ? yBottom : yTop) + 'px';
    }

    function hide() {
      if (!el) return;
      el.style.display = 'none';
      if (timer) { clearTimeout(timer); timer = null; }
      anchorEl = null;
    }

    function showFor(sel, msg, { ms = 3000, place = 'top' } = {}) {
      const host = ensure();
      anchorEl = (typeof sel === 'string') ? document.querySelector(sel) : sel;
      if (!anchorEl) return false;
      prefer = place;
      host.querySelector('.text').textContent = msg || '';
      host.style.display = 'block';
      position();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => hide(), ms);
      return true;
    }

    function keyFor(k) { return `krCue:${k}`; }
    function wasShown(k) { try { return shown.has(k) || sessionStorage.getItem(keyFor(k)) === '1'; } catch { return shown.has(k); } }
    function markShown(k) { shown.add(k); try { sessionStorage.setItem(keyFor(k), '1'); } catch {} }

    function showOnce(key, sel, msg, opts) {
      if (!key || wasShown(key)) return false;
      const ok = showFor(sel, msg, opts);
      if (ok) markShown(key);
      return ok;
    }

    return { showOnce, hide };
  })();

  // ---------- mascot help (click to open quick actions) ----------
  const MascotHelp = (() => {
    let panel = null; let cssInjected = false; let bound = false;
    function injectCss() {
      if (cssInjected) return; cssInjected = true;
      const css = `
        .mascot-help{position:absolute; min-width:220px; max-width:280px; padding:8px; border-radius:10px;
          background:#fff; color:#111; border:1px solid #e5e7eb; box-shadow:0 10px 24px rgba(0,0,0,.18); z-index:1100}
        .mascot-help h4{margin:4px 6px 8px; font-size:.95rem; font-weight:600; color:#111}
        .mascot-help .row{display:flex; flex-direction:column; gap:6px}
        .mascot-help button{display:flex; align-items:center; gap:8px; width:100%; text-align:left;
          padding:6px 8px; border-radius:8px; border:1px solid #e5e7eb; background:#f9fafb}
        .mascot-help button:hover{background:#f3f4f6}
      `;
      const st = document.createElement('style'); st.id = 'mascot-help-style'; st.textContent = css; document.head.appendChild(st);
    }
    function ensure() {
      if (panel && panel.isConnected) return panel;
      injectCss();
      const host = document.getElementById('lesson-wrap') || document.body;
      panel = document.createElement('div');
      panel.className = 'mascot-help';
      panel.style.display = 'none';
      host.appendChild(panel);
      if (!bound) {
        bound = true;
        addEventListener('resize', () => position());
        addEventListener('scroll', () => position(), true);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
        document.addEventListener('click', (e) => {
          if (!panel || panel.style.display === 'none') return;
          const masc = document.getElementById('mascot');
          if (panel.contains(e.target) || masc?.contains(e.target)) return;
          hide();
        });
      }
      return panel;
    }
    function position() {
      if (!panel || panel.style.display === 'none') return;
      const wrap = document.getElementById('lesson-wrap');
      const anchor = document.getElementById('mascot');
      if (!wrap || !anchor) return;
      const wr = wrap.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      const left = Math.round(ar.right - wr.left + 10);
      const top = Math.round(ar.top - wr.top + 6);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    }
    function hide() { if (panel) panel.style.display = 'none'; }
    function show(html) {
      const el = ensure();
      el.innerHTML = html;
      el.style.display = 'block';
      position();
    }
    function toggle(html) {
      const el = ensure();
      if (el.style.display === 'none') show(html); else hide();
    }
    return { toggle, show, hide, position };
  })();

  // ---------- mascot nudge (occasional pointing + button pulse) ----------
  const MascotNudge = (() => {
    let lastStep = -1;
    function now() { return Date.now(); }
    function getTS(k, def=0){ try{ const v=sessionStorage.getItem(k); return v? Number(v): def; }catch{ return def; } }
    function setTS(k, v){ try{ sessionStorage.setItem(k, String(v)); }catch{} }
    function inc(k){ try{ const n = (Number(sessionStorage.getItem(k))||0)+1; sessionStorage.setItem(k,String(n)); return n; }catch{ return 0; } }

    function pulse(el){ if(!el) return; el.classList.add('cue-pulse'); setTimeout(()=> el.classList.remove('cue-pulse'), 1600); }

    function pointMascot(){ /* body wiggle still applied by arms module */ }

    function maybeNudge(targetSel, stepIndex, { force=false } = {}){
      const target = (typeof targetSel === 'string') ? document.querySelector(targetSel) : (targetSel || null);
      if (!target) return;
      // don't nudge while speaking
      if (window.__speaking) return;
      // avoid spamming: at most once every 60s and not on same step repeatedly
      const tNow = now();
      const last = getTS('krCue:lastNudge', 0);
      const okTime = (tNow - last) > 60000; // 60s
      const stepChanged = (stepIndex !== lastStep);
      if (!force && !okTime && !stepChanged) return;
      // Do it every 2nd step or if enough time has passed
      const count = inc('krCue:nudgeCount');
      if (!force && !okTime && (count % 2 !== 0)) return;
      setTS('krCue:lastNudge', tNow);
      lastStep = stepIndex;
      pulse(target);
      try { MascotArms.pointTo(target); } catch { mascotSet('mascot-point'); setTimeout(()=> mascotSet('mascot-idle'), 1200); }
    }

    return { maybeNudge };
  })();


  function setStatus(map, msg) { const el = q(map?.containers?.status); if (el) el.textContent = msg || ""; }
  function feedback(map, msg, ok) {
    const el = q(map?.containers?.feedback); if (!el) return;
    el.textContent = msg || "";
    const okCls = map?.classes?.ok || "ok";
    const badCls = map?.classes?.bad || "bad";
    el.classList.toggle(okCls, !!ok);
    el.classList.toggle(badCls, ok === false);
  }

  // ---------- speech (Web Speech API) ----------
  const Speech = (() => {
    function pickVoice() {
      if (!("speechSynthesis" in window)) return null;
      const voices = speechSynthesis.getVoices();
      return voices.find(v => v.lang?.toLowerCase().startsWith("ja")) || voices.find(v => /japan|ja/i.test(v.name)) || voices[0] || null;
    }
    function makeUtterance(text, opts = {}) {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || "ja-JP";
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      return u;
    }
    function speak(text, opts = {}) {
      if (!("speechSynthesis" in window)) return false;
      const u = makeUtterance(text, opts);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      return true;
    }
    function speakList(texts = [], opts = {}) {
      if (!("speechSynthesis" in window) || !texts.length) return false;
      speechSynthesis.cancel();
      let i = 0;
      const next = () => {
        if (i >= texts.length) return;
        const u = makeUtterance(texts[i++], opts);
        u.onend = next;
        speechSynthesis.speak(u);
      };
      next();
      return true;
    }
    // preload voices on some browsers
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
    return { speak, speakList };

    function speak(text, opts = {}) {
      if (!("speechSynthesis" in window)) return false;
      const u = makeUtterance(text, opts);
      u.onstart = () => mascotSet("mascot-talk");
      u.onend = () => mascotSet("mascot-idle");
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      return true;
    }
    function speakList(texts = [], opts = {}) {
      if (!("speechSynthesis" in window) || !texts.length) return false;
      speechSynthesis.cancel();
      let i = 0;
      const next = () => {
        if (i >= texts.length) { mascotSet("mascot-idle"); return; }
        const u = makeUtterance(texts[i++], opts);
        u.onstart = () => mascotSet("mascot-talk");
        u.onend = next;
        speechSynthesis.speak(u);
      };
      next();
      return true;
    }

  })();

  const padFooter = () => { if (window.__padFooter) window.__padFooter(); };


  // ---------- renderers ----------
  function renderReadListen(lesson, step, map) {
    const listEl = q(map?.containers?.list);
    if (!listEl) return;
    listEl.innerHTML = "";
    (step.item_refs || []).forEach((sid) => {
      const s = (lesson.sentences || []).find((x) => x.sid === sid);
      if (!s) return;
      const row = document.createElement("div");
      row.className = map?.classes?.item || "lesson-item";
      row.innerHTML = `
        <div class="flex items-start gap-2">
          <button type="button" class="${map?.classes?.speakBtn || "speak-btn"}" data-jp="${s.jp}">🔊</button>
          <div>
            <div class="${map?.classes?.jp || "jp"}">${s.jp || ""}</div>
            ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || "romaji"}">${s.romaji_full || ""}</div>` : ""}
            ${map?.flags?.showEnglish ? `<div class="${map?.classes?.en || "en"}">${s.en || ""}</div>` : ""}
          </div>
        </div>
      `;
      listEl.appendChild(row);
    });
    // wire per-line speak buttons
    qa(`${map?.containers?.list} .${map?.classes?.speakBtn || "speak-btn"}`)
      .forEach(btn => btn.addEventListener("click", () => {
        const txt = btn.dataset.jp || "";
        if (!txt) return;
        if (TTS && typeof TTS.cancel === 'function') TTS.cancel();
        TTS.speak({ text: txt, lang: 'ja', rate: map?.speech?.rate ?? 1 });
      }));
    setStatus(map, "Read, listen, and repeat. Use 🔊 or Speak.");
    feedback(map, "", true);
  }

  function renderCloze(lesson, step, map) {
    const listEl = q(map?.containers?.list);
    if (!listEl) return;
    listEl.innerHTML = "";
    (step.items || []).forEach((it) => {
      const s = (lesson.sentences || []).find((x) => x.sid === it.ref);
      if (!s) return;
      let jp = s.jp || "";
      (it.blanks || []).forEach((b) => {
        const hole = `<input data-answer="${b}" data-expected="${b}"
  class="${map?.classes?.input || "cloze-input"}"
  size="${Math.max(2, Math.min(12, (b || "").length))}" />`;
        jp = jp.replace(b, hole);

      });
      const block = document.createElement("div");
      block.className = map?.classes?.item || "lesson-item";
      block.innerHTML = `
      <div class="${map?.classes?.prompt || "prompt"}">${s.en || ""}</div>
      <div class="${map?.classes?.jp || "jp"}">${jp}</div>
      ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || "romaji"}">${s.romaji_full || ""}</div>` : ""}
      <div class="${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-1"></div>
    `;
      listEl.appendChild(block);

      // after: listEl.appendChild(block);
      const blanks = block.querySelectorAll('input[data-answer]');

      blanks.forEach(inp => {
        // expected answer for this blank
        const exp = inp.dataset.expected || inp.dataset.answer || "";

        // 1) make WanaKana + smart normalizer bind ONCE for this input
        ensureKanaBindings(inp);

        // 2) set the expected kana target for the normalizer
        const reading = kanjiToReading(exp);            // "お願いします" -> "おねがいします"
        inp.dataset.expectedKana = reading;

        // 3) show kana chips + next-hint using the kana reading
        attachKanaGuide(inp, exp, map, reading);

        // 3) gentle greeting fixes (こんにちは / こんばんは), if you added it
        try { inp.placeholder = `Type: ${wanakana.toRomaji(reading)}`; } catch { }
        if (typeof attachGreetingNormalizer === "function") attachGreetingNormalizer(inp, exp);
      });
      ;

    });
    setStatus(map, "Fill the blanks, then press Check.");
    feedback(map, "", true);

  }

  function renderTranslate(lesson, step, map) {
    const listEl = q(map?.containers?.list);
    if (!listEl) return;
    listEl.innerHTML = "";

    (step.item_refs || [])
      .map(sid => (lesson.sentences || []).find(x => x.sid === sid))
      .filter(Boolean)
      .forEach(s => {
        const card = document.createElement("div");
        card.className = map?.classes?.item || "lesson-item";
        card.setAttribute("data-sid", s.sid);
        card.innerHTML = `
        <div class="${map?.classes?.prompt || "prompt"}">${s.en || ""}</div>
        <input class="${map?.classes?.input || "jp-input"}"
               data-expected="${s.jp || ""}"
               placeholder="Type in Japanese…" />
        ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || "romaji"}">${s.romaji_full || ""}</div>` : ""}
        <div class="${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-1"></div>
      `;
        listEl.appendChild(card);

        // bind to the actual input we just created
        const inp = card.querySelector("input");
        const exp = s.jp || "";
        const reading = sentenceReadingHira(s);
        const readingNoP = reading.replace(PUNCT_RX, "");      // strip 。．, etc.
        try {
          const romaParts = splitMora(readingNoP).map(k => wanakana.toRomaji(k));
          inp.placeholder = `Type: ${romaParts.join(' ')}`;
        } catch { }

        ensureKanaBindings(inp);                               // once
        inp.dataset.expectedKana = readingNoP;                 // target = no punctuation
        attachKanaGuide(inp, exp, map, readingNoP);            // guide = no punctuation



        // Optional: romaji prompt in the placeholder

      });

    setStatus(map, "Type the Japanese and press Check.");
    feedback(map, "", true);
  }


  function renderTranslateSyllables(lesson, step, map) {
    const listEl = q(map?.containers?.list); if (!listEl) return;
    listEl.innerHTML = "";

    (step.item_refs || [])
      .map(id => (lesson.sentences || []).find(x => x.sid === id))
      .filter(Boolean)
      .forEach(s => {
        // Use the sentence reading so kanji like 願 become おねがい…
        const reading = sentenceReadingHira(s).replace(PUNCT_RX, "");;
        const moras = splitMora(reading);

        const card = document.createElement("div");
        card.className = map?.classes?.item || "lesson-item";
        card.innerHTML = `
        <div class="${map?.classes?.prompt || "prompt"}">${s.en || ""}</div>
        <div class="mora-row"></div>
        ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || "romaji"}">${s.romaji_full || ""}</div>` : ""}
        <div class="${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-1"></div>
      `;
        const row = card.querySelector(".mora-row");
        moras.forEach((m, idx) => {
          const inp = document.createElement("input");
          inp.className = (map?.classes?.input || "inp") + " mora text-center";
          inp.setAttribute("data-expected", m);
          inp.setAttribute("size", Math.max(1, m.length));
          inp.disabled = idx !== 0;
          row.appendChild(inp);
        });
        listEl.appendChild(card);

        const inputs = [...row.querySelectorAll("input.mora")];
        const hintEl = card.querySelector(`.${map?.classes?.hint || "hint"}`);

        inputs.forEach((inp, idx) => {
          if (window.wanakana) wanakana.bind(inp, { IMEMode: true });

          inp.addEventListener("input", () => {
            const exp = inp.dataset.expected || "";
            const kana = toHira(inp.value);
            if (kana === exp) {
              inp.value = exp;
              inp.disabled = true;
              inp.classList.add(map?.classes?.ok || "ok");
              inp.classList.remove(map?.classes?.bad || "bad");
              hintEl.textContent = "";
              const next = inputs[idx + 1];
              if (next) { next.disabled = false; next.focus(); }
            } else {
              inp.classList.remove(map?.classes?.ok || "ok");
              inp.classList.add(map?.classes?.bad || "bad");
              const romaji = window.wanakana ? wanakana.toRomaji(exp) : "";
              hintEl.textContent = `This syllable is 「${exp}」 (${romaji}).`;
            }
          });

          // Backspace on empty → reopen previous box
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && !inp.value) {
              const prev = inputs[idx - 1];
              if (prev) {
                e.preventDefault();
                prev.disabled = false;
                prev.focus();
                prev.value = "";
                prev.classList.remove(map?.classes?.ok || "ok");
              }
            }
          });
        });
      });

    setStatus(map, "Type each syllable in romaji; it converts to kana when correct.");
    feedback(map, "", true);
  }

  function renderRoleplay(lesson, step, map) {
    const listEl = q(map?.containers?.list); if (!listEl) return;
    listEl.innerHTML = '';

    // Build turns from item_refs: Sensei prompts EN, learner speaks JP
    const turns = (step.item_refs || [])
      .map(id => (lesson.sentences || []).find(s => s.sid === id))
      .filter(Boolean)
      .map(s => ({
        promptEN: s.en || '',
        expectJP: s.jp || '',
        reading: sentenceReadingHira(s) // e.g., おねがいします
      }));

    // UI
    const box = document.createElement('div');
    box.className = map?.classes?.item || 'lesson-item';
    box.innerHTML = `
    <div class="${map?.classes?.prompt || 'prompt'} mb-2"></div>
    <div class="text-sm text-gray-600 mb-2">Say it in Japanese. Click 🎤 and speak.</div>
    <div class="flex items-center gap-2 mb-2">
      <button class="btn btn-primary" data-act="speak">🔊 Play Prompt</button>
      <button class="btn btn-amber"   data-act="rec">🎤 Start</button>
      <button class="btn btn-ghost"   data-act="skip">⏭ Skip</button>
    </div>
    <div class="${map?.classes?.romaji || 'romaji'} text-gray-500 mb-1"></div>
    <div class="${map?.classes?.hint || 'hint'} text-sm text-amber-700 mb-2"></div>
    <div class="${map?.classes?.jp || 'jp'} font-medium"></div>
  `;
    listEl.appendChild(box);

    const elPrompt = box.querySelector(`.${map?.classes?.prompt || 'prompt'}`);
    const elRomaji = box.querySelector(`.${map?.classes?.romaji || 'romaji'}`);
    const elHint = box.querySelector(`.${map?.classes?.hint || 'hint'}`);
    const elHeard = box.querySelector(`.${map?.classes?.jp || 'jp'}`);

    let idx = 0, rec = null, busy = false;

    function showTurn() {
      const t = turns[idx]; if (!t) return;
      elPrompt.textContent = `Sensei: ${t.promptEN}`;
      try {
        const roma = splitMora(t.reading).map(k => wanakana.toRomaji(k)).join(' ');
        elRomaji.textContent = `Target: ${roma}`;
      } catch { elRomaji.textContent = ''; }
      elHint.textContent = '';
      elHeard.textContent = '';
    }

    function speakPrompt() {
      const t = turns[idx]; if (!t) return;
      if (t.expectJP) TTS.speak({ text: t.expectJP, lang: 'ja', rate: map?.speech?.rate ?? 1 });
    }

    async function startRec() {
      if (!hasRecognition() || busy) {
        elHint.textContent = hasRecognition()
          ? 'Recording in progress…'
          : 'Speech recognition is not supported in this browser.';
        return;
      }
      busy = true;
      elHint.textContent = 'Listening…';
      elHeard.textContent = '';

      rec = makeRecognition();
      rec.onresult = (evt) => {
        const heard = (evt.results[0][0].transcript || '').trim();
        elHeard.textContent = `You said: ${heard}`;
        const t = turns[idx];
        const score = kanaSim(heard, t.reading); // compare to reading
        const ok = score >= (step.threshold || 0.82);
        feedback(map, ok ? 'Great pronunciation!' : 'Close—try again.', ok);
        mascotPulse && mascotPulse(ok ? 'mascot-celebrate' : 'mascot-confused', ok ? 1200 : 800);
        if (ok) {
          idx = Math.min(idx + 1, turns.length);
          if (idx === turns.length) {
            setStatus(map, 'Roleplay complete!');
            elHint.textContent = 'Nice! You finished the scene.';
          } else {
            showTurn();
          }
        } else {
          // hint: show next kana to aim for
          const want = splitMora(t.reading);
          const got = splitMora(toHira(heard));
          let p = 0; while (p < want.length && p < got.length && want[p] === got[p]) p++;
          const next = want[p] || '';
          const r = next ? (wanakana ? wanakana.toRomaji(next) : '') : '';
          elHint.textContent = next ? `Aim for: ${next} (${r})` : 'Try once more.';
        }
        busy = false;
      };
      rec.onerror = () => { elHint.textContent = 'Didn’t catch that. Try again.'; busy = false; };
      rec.onend = () => { if (busy) busy = false; };
      rec.start();
    }

    // wire buttons
    box.querySelector('[data-act="speak"]').addEventListener('click', speakPrompt);
    box.querySelector('[data-act="rec"]').addEventListener('click', startRec);
    box.querySelector('[data-act="skip"]').addEventListener('click', () => {
      idx = Math.min(idx + 1, turns.length - 1); showTurn();
    });

    showTurn();
    setStatus(map, 'Roleplay: listen and speak the line.');
    feedback(map, '', true);
  }

  // ---------- phrase drill (type + alternates) ----------
  function renderPhraseDrill(lesson, step, map) {
    const listEl = q(map?.containers?.list); if (!listEl) return;
    listEl.innerHTML = "";

    // step.pairs: [{en, jp, alts?:[{jp,en?}], romaji_full?, romaji?}]
    const pairs = (step.pairs || []).map(p => {
      const readingKana = sentenceReadingHira({ jp: p.jp || "", romaji_full: p.romaji_full || p.romaji || "" }) || "";
      const romaji = (window.wanakana ? wanakana.toRomaji(readingKana) : (p.romaji || "")) || "";
      return Object.assign({ readingKana, romaji, alts: p.alts || [] }, p);
    });

    let i = 0;

    const card = document.createElement('div');
    card.className = map?.classes?.item || "lesson-item";
    card.innerHTML = `
    <div class="${map?.classes?.prompt || "prompt"} mb-1"></div>
    <input class="${map?.classes?.input || "jp-input"}" placeholder="Type in Japanese…" />
    <div class="${map?.classes?.romaji || "romaji"} text-gray-500 mb-1"></div>
    <div class="mt-2 flex items-center gap-2">
      <button class="btn btn-primary" data-act="check">Check</button>
      <button class="btn btn-amber"   data-act="speak">🔊 Speak</button>
      <button class="btn btn-ghost"   data-act="alt">↔ Variations</button>
      <button class="btn btn-dark"    data-act="next">Next ➡</button>
    </div>
    <div class="${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-2"></div>
    <div id="altBox" class="hidden mt-3 p-2 border rounded"></div>
  `;
    listEl.appendChild(card);

    const elPrompt = card.querySelector(`.${map?.classes?.prompt || "prompt"}`);
    const elInput = card.querySelector("input");
    const elRoma = card.querySelector(`.${map?.classes?.romaji || "romaji"}`);
    const elHint = card.querySelector(`.${map?.classes?.hint || "hint"}`);
    const altBox = card.querySelector('#altBox');

    // bind input helpers once
    ensureKanaBindings(elInput);

    function show() {
      const P = pairs[i] || {};

      // Reset UI
      elPrompt.textContent = P.en || "";
      elInput.value = "";
      elInput.classList.remove(map?.classes?.ok || "ok", map?.classes?.bad || "bad");
      elHint.textContent = "";

      // Safe reading (kanji → kana), punctuation stripped for guidance/compare
      const reading =
        sentenceReadingHira({
          jp: P.jp || "",
          romaji_full: P.romaji_full || P.romaji || ""
        }) || "";
      const readingNoP = reading.replace(PUNCT_RX, "");

      // Romaji guide (defensive)
      try {
        const mora = splitMora(readingNoP);
        const roma = window.wanakana ? mora.map(k => wanakana.toRomaji(k)).join(" ") : "";
        elRoma.textContent = roma;
      } catch { elRoma.textContent = ""; }

      // Tell helpers the expected kana target
      elInput.dataset.expectedKana = readingNoP;     // used by attachSmartNormalizer
      attachKanaGuide(elInput, P.jp || "", map, readingNoP);

      // Focus ready
      elInput.focus();
    }
    if (window.__padFooter) window.__padFooter();


    function doCheck() {
      const P = pairs[i] || {};
      const got = elInput.value || "";
      const want = P.jp || "";

      const gotC = canonJP(got);
      const wantC = canonJP(want);
      const readC = canonJP(sentenceReadingHira({ jp: want, romaji_full: P.romaji_full || P.romaji || "" }));

      const ok = (gotC === wantC) || (gotC === readC);

      elInput.classList.toggle(map?.classes?.ok || "ok", ok);
      elInput.classList.toggle(map?.classes?.bad || "bad", !ok);
      elHint.textContent = ok ? "" : `Hint: starts with 「${wantC.slice(0, 2)}」`;
      if (typeof feedback === "function") feedback(map, ok ? "Good!" : "Try again.", ok);
      if (typeof mascotPulse === "function") mascotPulse(ok ? "mascot-celebrate" : "mascot-confused", ok ? 1200 : 800);
    }

    if (window.__padFooter) window.__padFooter();


    function speakCurrent() {
      const P = pairs[i] || {};
      if (!P.jp) return;
      if (TTS && typeof TTS.cancel === 'function') TTS.cancel();
      TTS.speak({ text: P.jp, lang: 'ja', rate: map?.speech?.rate ?? 1 });
    }

    function toggleAlts() {
      const P = pairs[i] || {};
      if (!P.alts || !P.alts.length) {
        altBox.classList.add('hidden');
        elHint.textContent = "No variations for this one.";
        return;
      }
      altBox.classList.toggle('hidden');
      if (!altBox.classList.contains('hidden')) {
        altBox.innerHTML = P.alts.map(a => `
        <button class="btn btn-ghost block w-full text-left mb-1" data-jp="${a.jp}">
          ${a.jp}
          <span class="block text-xs text-gray-500">${wanakana ? wanakana.toRomaji(sentenceReadingHira({ jp: a.jp })) : ""
          }</span>
          ${a.en ? `<span class="block text-xs text-gray-600">${a.en}</span>` : ""}
        </button>
      `).join('');
        [...altBox.querySelectorAll('[data-jp]')].forEach(b => {
          b.addEventListener('click', () => {
            // swap target to this alternate
            const newJP = b.dataset.jp || "";
            pairs[i].jp = newJP;
            show();
            altBox.classList.add('hidden');
          });
        });
      }
    }

    // wire buttons
    card.querySelector('[data-act="check"]').addEventListener('click', doCheck);
    card.querySelector('[data-act="speak"]').addEventListener('click', speakCurrent);
    card.querySelector('[data-act="alt"]').addEventListener('click', toggleAlts);
    card.querySelector('[data-act="next"]').addEventListener('click', () => {
      i = (i + 1) % pairs.length; show();
    });

    show();
    setStatus(map, 'Type the phrase; explore variations.');
    feedback(map, '', true);
  }



  // ---------- variations (browse + quick quiz) ----------
  function renderVariations(lesson, step, map) {
    const root = q(map?.containers?.list); if (!root) return;
    root.innerHTML = "";

    // step.variations: [{jp,en,romaji?,tags?:["casual","phone",...]}]
    const items = (step.variations || []).map(v => {
      // prefer a provided romaji; otherwise compute from the kana reading
      if (!v.romaji && v.jp && window.wanakana) {
        const reading = sentenceReadingHira({ jp: v.jp, romaji_full: v.romaji });
        v.romaji = wanakana.toRomaji(reading);
      }
      v.tags = v.tags || [];
      return v;
    });


    const box = document.createElement('div');
    box.className = map?.classes?.item || 'lesson-item';
    box.innerHTML = `
    <div class="mb-2 text-sm text-gray-600">
      Explore common ways to say it. Shuffle, listen, then try the context quiz.
    </div>
    <div class="flex items-center gap-2 mb-3">
      <button class="btn btn-primary" data-act="shuffle">🔀 Shuffle</button>
      <button class="btn btn-ghost"   data-act="quiz">🧪 Quiz me</button>
      <button class="btn btn-ghost"   data-act="showall">📚 Show all</button>
    </div>
    <div id="varList" class="space-y-2"></div>
    <div id="varQuiz" class="hidden mt-4 p-3 border rounded"></div>
  `;
    root.appendChild(box);

    const list = box.querySelector('#varList');
    const quiz = box.querySelector('#varQuiz');

    function renderList(arr) {
      list.innerHTML = "";
      arr.forEach(v => {
        const line = document.createElement('div');
        line.className = `${map?.classes?.item || 'lesson-item'} p-3 rounded border border-gray-200`;
        line.innerHTML = `
        <div class="text-xs text-gray-500">${(v.tags || []).join(' • ') || 'general'}</div>
        <div class="font-medium">${stripStops(v.jp)}</div>
        <div class="text-gray-500">${stripStops(v.romaji || '')}</div>
        <div class="text-gray-600">${v.en || ''}</div>
        <div class="mt-1">
          <button class="btn btn-amber" data-jp="${v.jp}">🔊 Listen</button>
        </div>
      `;
        line.querySelector('[data-jp]')
          .addEventListener('click', () => {
            if (!v.jp) return;
            if (TTS && typeof TTS.cancel === 'function') TTS.cancel();
            TTS.speak({ text: v.jp, lang: 'ja', rate: map?.speech?.rate ?? 1 });
          });
        list.appendChild(line);
      });
    }

    function pick(arr, n) {
      const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
      return a.slice(0, n);
    }

    function startQuiz() {
      if (!items.length) return;
      quiz.classList.remove('hidden');
      list.classList.add('hidden');

      // choose a context that exists
      const tagPool = [...new Set(items.flatMap(v => v.tags || []))];
      const targetTag = (tagPool.length ? tagPool[Math.floor(Math.random() * tagPool.length)] : null);
      const correctPool = targetTag ? items.filter(v => v.tags?.includes(targetTag)) : items;
      const correct = correctPool[Math.floor(Math.random() * correctPool.length)];
      // how many choices to show in the quiz
      const OPTION_COUNT = Math.min(step.optionCount || 6, items.length);

      const distract = pick(items.filter(v => v !== correct), OPTION_COUNT - 1);
      const options = pick([correct, ...distract], OPTION_COUNT);


      quiz.innerHTML = `
      <div class="font-medium mb-2">Pick the best phrase for: <em>${targetTag || 'this situation'}</em></div>
      <div class="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
  ${options.map((o, i) => `
    <button class="btn btn-ghost text-left w-full min-h-12" data-i="${i}">
      • ${stripStops(o.jp)}
    <span class="block text-xs text-gray-500">${stripStops(o.romaji || '')}</span>
    </button>
  `).join('')}
</div>

      <div class="mt-2 text-sm text-gray-600">${correct.en || ''}</div>
    `;

      [...quiz.querySelectorAll('[data-i]')].forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.i);
          const chosen = options[idx];
          const ok = chosen === correct;
          feedback(map, ok ? 'Nice choice!' : 'Not quite—listen again and try another.', ok);
          mascotPulse && mascotPulse(ok ? 'mascot-celebrate' : 'mascot-confused', ok ? 1200 : 800);
          if (ok) setTimeout(startQuiz, 600);
        });
      });
    }

    // controls
    box.querySelector('[data-act="shuffle"]').addEventListener('click', () => {
      renderList(pick(items, Math.min(6, items.length)));
      quiz.classList.add('hidden'); list.classList.remove('hidden');
    });
    box.querySelector('[data-act="showall"]').addEventListener('click', () => {
      renderList(items);
      quiz.classList.add('hidden'); list.classList.remove('hidden');
    });
    box.querySelector('[data-act="quiz"]').addEventListener('click', startQuiz);

    renderList(pick(items, Math.min(6, items.length)));
    setStatus(map, 'Browse variations; try the quiz.');
    feedback(map, '', true);
  }


  // ---------- bilingual mini-scene (EN+JA) ----------
  function pickVoiceByLang(langCode) {
    if (!('speechSynthesis' in window)) return null;
    const want = (langCode || '').toLowerCase().slice(0, 2);
    const voices = speechSynthesis.getVoices();
    // strong match (lang starts with ja/en)
    let v = voices.find(v => v.lang?.toLowerCase().startsWith(want));
    if (v) return v;
    // soft match by name
    v = voices.find(v => new RegExp(`\\b${want}\\b`, 'i').test(v.name || ''));
    return v || voices[0] || null;
  }

  function renderBilingualScene(lesson, step, map) {
    const root = q(map?.containers?.list); if (!root) return;
    root.innerHTML = "";

    // Build segment list
    // Supports either sentence refs (sid) or inline lines
    // Each segment becomes: {speaker, lang:'ja'|'en', text, jp, en, romaji}
    const segs = (step.segments || []).map(seg => {
      let s = {};
      if (seg.ref) {
        const found = (lesson.sentences || []).find(x => x.sid === seg.ref);
        if (found) s = found;
      }
      const lang = seg.lang || (seg.jp ? 'ja' : 'en');
      const jp = seg.jp ?? s.jp ?? "";
      const en = seg.en ?? s.en ?? "";
      const text = lang === 'ja' ? (jp || "") : (en || "");
      const romaji = (lang === 'ja')
        ? (s.romaji_full || (window.wanakana ? wanakana.toRomaji(sentenceReadingHira(s || { jp })) : ""))
        : "";
      return {
        speaker: seg.speaker || 'Speaker',
        lang, text, jp, en, romaji
      };
    }).filter(x => x.text);

    // UI
    const box = document.createElement('div');
    box.className = map?.classes?.item || 'lesson-item';
    box.innerHTML = `
      <div class="mb-2 text-sm text-gray-600">Mini-scene. Browse lines; use the footer Speak to play the dialogue.</div>
    <div id="sceneList" class="space-y-2"></div>
  `;
    root.appendChild(box);

    const list = box.querySelector('#sceneList');
    
    // Render lines
    segs.forEach((g, i) => {
      const line = document.createElement('div');
      line.className = `${map?.classes?.item || 'lesson-item'} p-3 rounded border border-gray-200`;
      line.dataset.idx = String(i);
      line.innerHTML = `
      <div class="text-xs text-gray-500">${g.speaker} • ${g.lang === 'ja' ? 'Japanese' : 'English'}</div>
      <div class="font-medium ${map?.classes?.jp || 'jp'}">${g.lang === 'ja' ? (g.jp || g.text) : g.en}</div>
      ${g.lang === 'ja' && map?.flags?.showRomaji
          ? `<div class="${map?.classes?.romaji || 'romaji'} text-gray-500">${g.romaji || ''}</div>` : ''}
      ${g.lang === 'ja'
          ? `<div class="${map?.classes?.en || 'en'} text-gray-600">${g.en || ''}</div>`
          : (g.jp ? `<div class="${map?.classes?.jp || 'jp'} text-gray-600">${g.jp}</div>` : '')
        }
    `;
      list.appendChild(line);

      (() => {
  // remove any legacy toggles if some other code injected them
  document.querySelectorAll('#sceneAuto, #sceneShowRomaji')
    .forEach(i => i.closest('label')?.remove());
})();
    });

    // Inline controls removed; use footer Speak to play the full scene.

   
    // expose scene for footer Speak
    try { window.__KR_CURRENT_SCENE__ = { lines: segs.map(s => ({ jp: s.jp, en: s.en, romaji: s.romaji, lang: s.lang })) }; } catch {}

    setStatus(map, 'Browse the mini-scene. Use footer Speak to play.');
    feedback(map, '', true);
    padFooter();
  }


  // ---------- comic/manga conversation (replaces variations) ----------
  function renderComic(lesson, step, map) {
    const root = q(map?.containers?.list); if (!root) return;
    root.innerHTML = "";

    // Build script from variations: alternate speakers Ami/You
    const items = (step.variations || []).map(v => {
      if (!v.romaji && v.jp && window.wanakana) {
        const reading = sentenceReadingHira({ jp: v.jp, romaji_full: v.romaji });
        v.romaji = wanakana.toRomaji(reading);
      }
      return v;
    });

    const box = document.createElement('div');
    box.className = map?.classes?.item || 'lesson-item';
    const videoUrl = step.video || step.videoUrl || (step.media && step.media.video);
    box.innerHTML = `
      <style>
        .manga { display:grid; gap:12px; grid-template-columns: repeat(1, minmax(0,1fr)); }
        @media (min-width: 640px){ .manga { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (min-width: 1024px){ .manga { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        .panel { position:relative; background:#fff; border:2px solid #111; border-radius:6px; padding:10px; box-shadow: 2px 4px 0 #111; min-height: var(--panel-minh, 120px); overflow:hidden; }
        .panel.tone { background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 6px 6px; background-color:#fff; }
        .panel.bg { background-size: cover; background-position: center; }
        .panel.bg-contain { background-size: contain; background-repeat: no-repeat; background-position: center; }
        .panel.wide { grid-column: span 2; }
        .panel.tall { grid-row: span 2; min-height: 260px; }
        .panel.big  { grid-column: span 2; grid-row: span 2; min-height: 320px; }
        .panel video.bgvid { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.95; }
        .panel .content { position:relative; z-index:2; }
        .panel .overlays { position:absolute; inset:0; pointer-events:none; z-index:1; }
        .panel .overlays img { position:absolute; display:block; }
        .panel .pattern{ position:absolute; inset:0; pointer-events:none; opacity:.22; z-index:0 }
        .panel .pattern.speed{ background:
          repeating-conic-gradient(from 0deg, rgba(0,0,0,.2) 0 6deg, transparent 6deg 12deg);
          mask-image: radial-gradient(circle at 50% 50%, #000, transparent 65%);
        }
        .panel .pattern.hatch{ background:
          repeating-linear-gradient(45deg, rgba(0,0,0,.18) 0 2px, transparent 2px 8px);
        }
        .panel .pattern.cross{ background:
          repeating-linear-gradient(45deg, rgba(0,0,0,.14) 0 2px, transparent 2px 8px),
          repeating-linear-gradient(-45deg, rgba(0,0,0,.14) 0 2px, transparent 2px 8px);
        }
        /* Bubble variants */
        .bubble.shout{ border-width:2px; box-shadow:none; background:#fff; clip-path: polygon(5% 0, 15% 6%, 25% 1%, 35% 7%, 45% 0, 55% 6%, 65% 1%, 75% 8%, 85% 2%, 95% 6%, 95% 94%, 85% 88%, 75% 94%, 65% 88%, 55% 95%, 45% 89%, 35% 95%, 25% 90%, 15% 96%, 5% 90%);
        }
        .bubble.whisper{ border-style:dashed; opacity:.95 }
        .bubble.thought{ border-radius:18px; }
        .bubble.thought .dots{ position:absolute; width:10px; height:10px; background:#fff; border:1px solid #e5e7eb; border-radius:999px; left:-14px; bottom:6px; }
        .row.r .bubble.thought .dots{ left:auto; right:-14px; }
        .bubble.thought .dots::after{ content:""; position:absolute; width:7px; height:7px; background:#fff; border:1px solid #e5e7eb; border-radius:999px; left:-10px; bottom:-6px; }
        .row.r .bubble.thought .dots::after{ left:auto; right:-10px; }
        .panel .num { position:absolute; top:6px; right:8px; font-size:.8rem; color:#6b7280 }
        .panel .row { display:flex; align-items:flex-start; gap:8px; }
        .panel .row.r { flex-direction: row-reverse; }
        .avatar { width:32px; height:32px; border-radius:999px; background:#ffd166; border:2px solid #e0a700; display:flex; align-items:center; justify-content:center; font-weight:700; color:#333; flex:0 0 auto }
        .bubble { position:relative; max-width: 100%; padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; box-shadow:0 3px 12px rgba(0,0,0,.06); }
        .row.r .bubble { background:#f9fafb }
        .bubble .jp { font-weight:700; }
        .bubble .en { color:#374151; margin-top:2px; font-size:.92rem; }
        .tail-left::after{ content:""; position:absolute; left:-10px; top:12px; border-width:8px; border-style:solid; border-color:transparent #e5e7eb transparent transparent }
        .tail-left::before{ content:""; position:absolute; left:-9px; top:12px; border-width:8px; border-style:solid; border-color:transparent #fff transparent transparent }
        .tail-right::after{ content:""; position:absolute; right:-10px; top:12px; border-width:8px; border-style:solid; border-color:transparent transparent transparent #e5e7eb }
        .tail-right::before{ content:""; position:absolute; right:-9px; top:12px; border-width:8px; border-style:solid; border-color:transparent transparent transparent #f9fafb }
        .toolbar { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
        .sfx { position:absolute; left:8px; bottom:6px; font-weight:800; font-size:.8rem; color:#9ca3af }
        .narration { position:absolute; top:8px; left:8px; background:#111; color:#fff; padding:4px 6px; border-radius:6px; font-size:.8rem; }
        .pagebar { display:flex; align-items:center; gap:8px; margin:6px 0 12px; color:#374151 }
        .pagebar button { padding:4px 8px; border:1px solid #e5e7eb; border-radius:8px; background:#fff }
      </style>
      <div class="toolbar">
        <button class="btn btn-primary" data-act="play">🔊 Play All</button>
        <button class="btn btn-ghost" data-act="ref">📖 Reference</button>
      </div>
      ${videoUrl ? `<div class="mb-3"><video src="${videoUrl}" controls preload="metadata" class="max-w-full rounded shadow"></video></div>` : ''}
      <div class="pagebar"><button data-act="prev">Prev</button><div class="pos"></div><button data-act="next">Next</button></div>
      <div class="manga" id="comicList"></div>
      <div id="comicRef" class="hidden fixed inset-0 z-[1200]">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(92vw,720px)] max-h-[80vh] overflow-auto p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="font-semibold">Phrase Reference</div>
            <button class="btn btn-ghost" data-act="closeRef">✖</button>
          </div>
          <div id="refList" class="space-y-2"></div>
        </div>
      </div>
    `;
    root.appendChild(box);

    const list = box.querySelector('#comicList');
    const pagebar = box.querySelector('.pagebar');
    const ref = box.querySelector('#comicRef');
    const refList = box.querySelector('#refList');

    const confPageSize = Math.max(1, Number((step.manga && step.manga.pageSize) || 6));
    const confMinH = Number((step.manga && step.manga.minH) || 0);
    if (confMinH > 0) { try { list.style.setProperty('--panel-minh', `${confMinH}px`); } catch {} }
    let pageIndex = 0;

    function renderPage(idx = 0) {
      pageIndex = Math.max(0, Math.min(idx, Math.ceil(items.length / confPageSize) - 1));
      const start = pageIndex * confPageSize;
      const page = items.slice(start, start + confPageSize);
      list.innerHTML = '';
      page.forEach((v, ii) => {
        const i = start + ii;
        const who = (i % 2 ? 'You' : 'Ami');
        const panel = document.createElement('div');
        const size = (v.size || '').toLowerCase(); // 'wide' | 'tall' | 'big'
        const fitContain = (String(v.fit || '').toLowerCase() === 'contain') || !!v.noBubble; // default contain for art with baked-in bubble
        const cls = ['wide','tall','big','tone','bg'].filter(k => (size && size.includes(k)) || (k==='tone' && v.tone) || (k==='bg' && (v.img || v.video))).join(' ');
        panel.className = `panel ${cls} ${fitContain ? 'bg-contain' : ''}`;
        if (v.minH) { const mh = (typeof v.minH === 'number') ? `${v.minH}px` : String(v.minH); panel.style.minHeight = mh; }
        if (v.img) {
          panel.style.backgroundImage = `url('${v.img}')`;
          if (v.bgPos || v.imagePosition) panel.style.backgroundPosition = String(v.bgPos || v.imagePosition);
        }
        panel.innerHTML = `
          <div class="num">${i + 1}</div>
          ${v.narration ? `<div class=\"narration\">${v.narration}</div>` : ''}
          <div class="content">
            <div class="row ${i % 2 ? 'r' : ''}">
              <div class="avatar" title="${who}">${who === 'Ami' ? 'A' : 'Y'}</div>
              ${v.noBubble ? '' : `<div class=\"bubble ${i % 2 ? 'tail-right' : 'tail-left'} ${(v.bubble||'').toLowerCase()}\" data-jp=\"${v.jp || ''}\" data-en=\"${v.en || ''}\"><div class=\"jp\">${stripStops(v.jp || '')}</div><div class=\"en\">${v.en || ''}</div>${((v.bubble||'').toLowerCase()==='thought') ? '<div class=\\\"dots\\\"></div>' : ''}</div>`}
            </div>
            ${v.sfx ? `<div class=\"sfx\">${v.sfx}</div>` : ''}
          </div>
        `;
        // panel background video support
        if (v.video) {
          const vid = document.createElement('video');
          vid.className = 'bgvid';
          vid.src = v.video;
          vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true; vid.preload = 'metadata';
          panel.insertBefore(vid, panel.firstChild);
        }
        // pattern overlays
        const patternKey = (v.pattern || (v.speed && 'speed') || (v.hatch && 'hatch') || (v.cross && 'cross'));
        if (patternKey) {
          const p = document.createElement('div'); p.className = `pattern ${patternKey}`; panel.appendChild(p);
        }
        // overlay images (stickers), optional: overlays:[{src,x,y,w,h,rotate}]
        if (Array.isArray(v.overlays) && v.overlays.length) {
          const ov = document.createElement('div'); ov.className = 'overlays';
          v.overlays.forEach(o => {
            if (!o || !o.src) return;
            const img = document.createElement('img'); img.src = o.src; img.loading = 'lazy';
            const unit = (val) => (typeof val === 'number' ? `${val}px` : (val || ''));
            img.style.left = unit(o.x || 0);
            img.style.top = unit(o.y || 0);
            if (o.w) img.style.width = unit(o.w);
            if (o.h) img.style.height = unit(o.h);
            if (o.rotate) img.style.transform = `rotate(${typeof o.rotate === 'number' ? o.rotate + 'deg' : o.rotate})`;
            ov.appendChild(img);
          });
          panel.appendChild(ov);
        }
        const speakTarget = panel.querySelector('.bubble') || panel;
        speakTarget.addEventListener('click', () => {
          const txt = v.jp || '';
          if (txt) TTS.speak({ text: txt, lang: 'ja', rate: map?.speech?.rate ?? 1 });
        });
        list.appendChild(panel);
      });
      const pos = pagebar?.querySelector('.pos'); if (pos) pos.textContent = `Page ${pageIndex + 1} / ${Math.ceil(items.length / confPageSize)}`;
    }

    renderPage(0);

    // build reference list
    refList.innerHTML = items.map(v => `
      <div class="p-2 border rounded">
        <div class="font-medium">${stripStops(v.jp || '')}</div>
        ${v.romaji ? `<div class="text-gray-500">${stripStops(v.romaji)}</div>` : ''}
        <div class="text-gray-600">${v.en || ''}</div>
      </div>`).join('');

    const onPlayAll = async () => {
      const rate = map?.speech?.rate ?? 1;
      const start = pageIndex * confPageSize;
      const page = items.slice(start, start + confPageSize);
      for (const v of page) {
        const t = v.jp || '';
        if (!t) continue;
        await TTS.speak({ text: t, lang: 'ja', rate }).catch(() => {});
      }
    };

    const showRef = () => { ref.classList.remove('hidden'); document.body.classList.add('overflow-hidden'); };
    const hideRef = () => { ref.classList.add('hidden'); document.body.classList.remove('overflow-hidden'); };
    ref.addEventListener('click', (e) => { if (e.target === ref) hideRef(); });
    box.querySelector('[data-act="closeRef"]').addEventListener('click', hideRef);
    box.querySelector('[data-act="ref"]').addEventListener('click', showRef);
    box.querySelector('[data-act="play"]').addEventListener('click', onPlayAll);
    pagebar?.querySelector('[data-act="prev"]').addEventListener('click', () => renderPage(pageIndex - 1));
    pagebar?.querySelector('[data-act="next"]').addEventListener('click', () => renderPage(pageIndex + 1));

    setStatus(map, 'Watch the comic and listen. Open Reference for details.');
    feedback(map, '', true);
  }
  // Drag-and-drop tile builder for kana (replaces syllable typing)
  function renderTranslateTiles(lesson, step, map) {
    const listEl = q(map?.containers?.list); if (!listEl) return;
    listEl.innerHTML = '';

    const SND = {
      correct: new Audio('sounds/correct.wav'),
      wrong: new Audio('sounds/wrong.wav'),
      chime: new Audio('sounds/swoosh.wav'),
      // Short, arcade-y beeps using WebAudio. Falls back to sped-up WAVs.
      async beep(kind = 'correct') {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) throw new Error('No AudioContext');
          if (!this._ctx) this._ctx = new AC();
          if (this._ctx.state === 'suspended') { try { await this._ctx.resume(); } catch {} }

          const ctx = this._ctx;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          gain.gain.value = 0.0;
          osc.connect(gain).connect(ctx.destination);

          const now = ctx.currentTime;
          let dur = 0.14, f1 = 1000, f2 = 1600, a = 0.001, d = 0.04, s = 0.06, r = 0.03, peak = 0.18;

          if (kind === 'correct') {
            dur = 0.14; f1 = 1200; f2 = 2000; peak = 0.2;
          } else if (kind === 'chime') {
            dur = 0.18; f1 = 900; f2 = 1600; peak = 0.2;
          } else if (kind === 'wrong') {
            dur = 0.16; f1 = 300; f2 = 180; peak = 0.18;
          }

          // Frequency glide
          osc.frequency.setValueAtTime(f1, now);
          if (kind === 'wrong') {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), now + dur);
          } else {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), now + dur);
          }

          // Quick ADSR envelope for a snappy blip
          gain.gain.setValueAtTime(0.0, now);
          gain.gain.linearRampToValueAtTime(peak, now + a);
          gain.gain.linearRampToValueAtTime(peak * 0.7, now + a + d);
          gain.gain.linearRampToValueAtTime(peak * 0.4, now + a + d + s);
          gain.gain.linearRampToValueAtTime(0.0, now + dur + r);

          osc.start(now);
          osc.stop(now + dur + r + 0.01);
        } catch (err) {
          // Fallback: use existing WAVs but shorter/faster
          const a = kind === 'correct' ? this.correct : kind === 'chime' ? this.chime : this.wrong;
          try {
            a.pause(); a.currentTime = 0; a.playbackRate = 1.8; a.volume = 0.5; a.play();
            setTimeout(() => { try { a.pause(); a.currentTime = 0; } catch {} }, 180);
          } catch {}
        }
      },
      play(a){
        // Legacy usage: prefer short beep equivalent based on handle
        if (a === this.correct) return this.beep('correct');
        if (a === this.wrong)   return this.beep('wrong');
        if (a === this.chime)   return this.beep('chime');
        try { a.currentTime = 0; a.play(); } catch {}
      }
    };

    (step.item_refs || [])
      .map(id => (lesson.sentences || []).find(x => x.sid === id))
      .filter(Boolean)
      .forEach((s, cardIdx) => {
        const reading = sentenceReadingHira(s).replace(PUNCT_RX, '');
        const moras = splitMora(reading);
        const shuffled = moras.map((m, i) => ({ m, i })).sort(() => Math.random() - 0.5);

        const card = document.createElement('div');
        card.className = map?.classes?.item || 'lesson-item';
        card.innerHTML = `
          <div class="${map?.classes?.prompt || 'prompt'} mb-2">${s.en || ''}</div>
          <div class="mora-row mb-2" data-role="slots"></div>
          <div class="mora-row" data-role="bank"></div>
          ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || 'romaji'} text-gray-500">${s.romaji_full || ''}</div>` : ''}
          <div class="${map?.classes?.hint || 'hint'} text-sm text-amber-700 mt-1"></div>
        `;
        listEl.appendChild(card);

        const slots = card.querySelector('[data-role="slots"]');
        const bank = card.querySelector('[data-role="bank"]');
        const hintEl = card.querySelector(`.${map?.classes?.hint || 'hint'}`);

        const mkSlot = (exp) => {
          const d = document.createElement('div');
          d.className = 'mora-slot flex items-center justify-center border rounded w-10 h-10 text-lg bg-white';
          d.dataset.expected = exp;
          d.dataset.filled = '0';
          d.addEventListener('dragover', (e) => { e.preventDefault(); });
          d.addEventListener('drop', (e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            const tile = id && document.getElementById(id);
            if (!tile || d.dataset.filled === '1') return;
            const val = tile?.dataset?.mora || '';
            if (val === exp) {
              d.appendChild(tile);
              d.dataset.filled = '1';
              d.classList.add(map?.classes?.ok || 'ok');
              // Visual success styling for slot and tile
              d.classList.add('border-green-500','bg-green-50');
              tile.classList.add('bg-green-500','text-white','border-green-600');
              tile.draggable = false;
              SND.beep('correct');
              hintEl.textContent = '';
              const allFilled = [...slots.querySelectorAll('.mora-slot')].every(x => x.dataset.filled === '1');
              if (allFilled) {
                SND.beep('chime');
                feedback(map, 'Great! Phrase completed.', true);
                if (TTS && typeof TTS.speak === 'function') TTS.speak({ text: s.jp || reading, lang: 'ja', rate: map?.speech?.rate ?? 1 });
              }
            } else {
              hintEl.textContent = 'Not that one-try another tile.';
              d.classList.add(map?.classes?.bad || 'bad');
              setTimeout(() => d.classList.remove(map?.classes?.bad || 'bad'), 300);
              SND.beep('wrong');
            }
          });
          return d;
        };

        const mkTile = (m, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'mora-tile btn btn-ghost border w-10 h-10 text-lg';
          b.textContent = m;
          b.id = `tile-${cardIdx}-${i}`;
          b.draggable = true;
          b.dataset.mora = m;
          // Show romaji on hover via native tooltip
          try {
            const roma = (window.wanakana ? wanakana.toRomaji(m) : '') || '';
            b.title = roma;           // browser tooltip
            b.setAttribute('aria-label', roma);
            b.dataset.romaji = roma;  // available for any custom tooltip styling
          } catch {}
          b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', b.id); });
          return b;
        };

        moras.forEach(m => slots.appendChild(mkSlot(m)));
        shuffled.forEach(({ m }, i) => bank.appendChild(mkTile(m, i)));
      });

    setStatus(map, 'Drag each kana tile into the correct order.');
    feedback(map, '', true);
  }

  // ---------- guided conversation (GPT-led) ----------
  function renderGuidedConvo(lesson, step, map) {
    const root = q(map?.containers?.list); if (!root) return;
    root.innerHTML = '';

    const card = document.createElement('div');
    card.className = map?.classes?.item || 'lesson-item';
    card.innerHTML = `
      <div class="text-sm text-gray-600 mb-2">Guided conversation. Learn, repeat, and check understanding.</div>
      <div id="gIntro" class="mb-3 p-3 border rounded bg-amber-50 hidden"></div>
      <div id="gPhrase" class="mb-3 p-3 border rounded hidden"></div>
      <div id="gExplain" class="mb-3 p-3 border rounded hidden"></div>
      <div id="gPronounce" class="mb-3 p-3 border rounded hidden"></div>
      <div id="gBuild" class="mb-3 p-3 border rounded hidden"></div>
      <div id="gQuiz" class="mb-3 p-3 border rounded hidden"></div>
    `;
    root.appendChild(card);

    const elIntro = card.querySelector('#gIntro');
    const elPhrase = card.querySelector('#gPhrase');
    const elExplain = card.querySelector('#gExplain');
    const elPron = card.querySelector('#gPronounce');
    const elBuild = card.querySelector('#gBuild');
    const elQuiz = card.querySelector('#gQuiz');

    // Persist state so re-render doesn’t refetch
    const state = step.__gcState || { loaded: false, data: null };
    step.__gcState = state;

    function parseJSONLoose(txt) {
      try { return JSON.parse(txt); } catch {}
      // try to extract a JSON block
      const m = txt.match(/[\[{][\s\S]*[\]}]/);
      if (m) { try { return JSON.parse(m[0]); } catch {} }
      return null;
    }

    function showIntro() {
      elIntro.classList.remove('hidden');
      elIntro.textContent = 'Tutor: 今日は、基本のあいさつを練習しましょう。';
    }

    function showPhrase(d) {
      elPhrase.classList.remove('hidden');
      const jp = d.phrase_jp || d.jp || '';
      const roma = d.romaji || '';
      const en = d.english || d.en || '';
      elPhrase.innerHTML = `
        <div class="text-xs text-gray-500 mb-1">Step 1 · Phrase</div>
        <div class="text-xl font-semibold mb-1">${stripStops(jp)}</div>
        ${map?.flags?.showRomaji && roma ? `<div class="text-gray-500 mb-1">${stripStops(roma)}</div>` : ''}
        ${en ? `<div class="text-gray-700 mb-2">${en}</div>` : ''}
        <div class="flex items-center gap-2">
          <button class="btn btn-primary" data-act="say-normal">Play</button>
          <button class="btn btn-amber" data-act="say-slow">Play slow</button>
        </div>
      `;
      const btnN = elPhrase.querySelector('[data-act="say-normal"]');
      const btnS = elPhrase.querySelector('[data-act="say-slow"]');
      btnN?.addEventListener('click', () => { if (jp) TTS.speak({ text: jp, lang: 'ja', rate: map?.speech?.rate ?? 1 }); });
      btnS?.addEventListener('click', () => { if (jp) TTS.speak({ text: jp, lang: 'ja', rate: Math.max(0.7, (map?.speech?.rate ?? 1) - 0.2) }); });
    }

    function showExplain(d) {
      elExplain.classList.remove('hidden');
      const txt = d.explain || d.usage || '';
      const examples = Array.isArray(d.usage_examples) ? d.usage_examples : [];
      elExplain.innerHTML = `
        <div class="text-xs text-gray-500 mb-1">Step 2 · Meaning & when to use</div>
        <div class="text-gray-700 mb-2">${txt || 'Short explanation will appear here.'}</div>
        ${examples.length ? `<ul class="list-disc pl-5 text-sm text-gray-600">${examples.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      `;
    }

    function showPronounce(d) {
      elPron.classList.remove('hidden');
      const jp = d.phrase_jp || d.jp || '';
      const target = sentenceReadingHira({ jp, romaji_full: d.romaji || '' });
      elPron.innerHTML = `
        <div class="text-xs text-gray-500 mb-1">Step 3 · Your turn</div>
        <div class="text-gray-600 mb-2">Say it now. Click mic and speak.</div>
        <div class="flex items-center gap-2 mb-2">
          <button class="btn btn-primary" data-act="mic">🎤 Start</button>
          <button class="btn btn-ghost" data-act="hear">▶️ Play once</button>
        </div>
        <div class="text-sm text-gray-700" id="heard"></div>
        <div class="${map?.classes?.hint || 'hint'} text-sm text-amber-700 mt-1" id="pHint"></div>
      `;
      const elHeard = elPron.querySelector('#heard');
      const elHint = elPron.querySelector('#pHint');
      elPron.querySelector('[data-act="hear"]').addEventListener('click', () => {
        if (jp) TTS.speak({ text: jp, lang: 'ja', rate: Math.max(0.8, (map?.speech?.rate ?? 1) - 0.1) });
      });
      const canRec = hasRecognition();
      const btn = elPron.querySelector('[data-act="mic"]');
      btn.disabled = !canRec;
      if (canRec) {
        btn.addEventListener('click', () => {
          const r = makeRecognition();
          elHint.textContent = 'Listening...';
          r.onresult = (evt) => {
            const heard = (evt.results[0][0].transcript || '').trim();
            elHeard.textContent = `You said: ${heard}`;
            const score = kanaSim(heard, target);
            const ok = score >= 0.82;
            feedback(map, ok ? 'Great pronunciation!' : 'Close—try again.', ok);
            mascotPulse && mascotPulse(ok ? 'mascot-celebrate' : 'mascot-confused', ok ? 1200 : 800);
            if (!ok) {
              const want = splitMora(target); const got = splitMora(toHira(heard));
              let p = 0; while (p < want.length && p < got.length && want[p] === got[p]) p++;
              const next = want[p] || '';
              const rj = next ? (wanakana ? wanakana.toRomaji(next) : '') : '';
              elHint.textContent = next ? `Aim for: ${next} (${rj})` : 'Try once more.';
            } else {
              elHint.textContent = 'Nice! Move on.';
            }
          };
          r.onerror = () => { elHint.textContent = 'Didn\'t catch that. Try again.'; };
          r.start();
        });
      } else {
        elHint.textContent = 'Speech recognition not supported in this browser.';
      }
    }

    function showBuild(d) {
      elBuild.classList.remove('hidden');
      const base = d.phrase_jp || d.jp || '';
      const ext = d.build_phrase || '';
      const txt = ext || `${base}、はじめまして。`;
      elBuild.innerHTML = `
        <div class="text-xs text-gray-500 mb-1">Step 4 · Build a phrase</div>
        <div class="font-medium mb-1">${stripStops(txt)}</div>
        ${map?.flags?.showRomaji ? `<div class="text-gray-500 mb-2">${stripStops(d.build_romaji || (wanakana ? wanakana.toRomaji(sentenceReadingHira({ jp: txt })) : ''))}</div>` : ''}
        <div class="flex items-center gap-2">
          <button class="btn btn-amber" data-act="play-slow">Play slow</button>
          <button class="btn btn-ghost" data-act="play-normal">Play</button>
        </div>
      `;
      elBuild.querySelector('[data-act="play-slow"]').addEventListener('click', () => {
        TTS.speak({ text: txt, lang: 'ja', rate: Math.max(0.7, (map?.speech?.rate ?? 1) - 0.2) });
      });
      elBuild.querySelector('[data-act="play-normal"]').addEventListener('click', () => {
        TTS.speak({ text: txt, lang: 'ja', rate: map?.speech?.rate ?? 1 });
      });
    }

    function showQuiz(d) {
      elQuiz.classList.remove('hidden');
      const qs = Array.isArray(d.questions) ? d.questions.slice(0, 3) : [];
      if (!qs.length) { elQuiz.textContent = 'All set!'; return; }
      elQuiz.innerHTML = `
        <div class="text-xs text-gray-500 mb-1">Step 5 · Quick check</div>
        <div class="space-y-3"></div>
      `;
      const holder = elQuiz.querySelector('div.space-y-3');
      qs.forEach((q, qi) => {
        const box = document.createElement('div');
        box.className = 'p-2 border rounded';
        const opts = (q.options || []).map((o, i) => `<button class="btn btn-ghost mr-2 mb-1" data-i="${i}">${o}</button>`).join('');
        box.innerHTML = `
          <div class="mb-2">${q.q || ''}</div>
          <div>${opts}</div>
        `;
        box.querySelectorAll('[data-i]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.i);
            const ok = idx === (q.answer_index ?? -1);
            feedback(map, ok ? 'Correct!' : 'Not quite—try another.', ok);
            mascotPulse && mascotPulse(ok ? 'mascot-celebrate' : 'mascot-confused', ok ? 1000 : 800);
          });
        });
        holder.appendChild(box);
      });
    }

    async function ensureData() {
      if (state.loaded && state.data) return state.data;
      setStatus(map, 'Preparing lesson...');
      const topic = step.topic || 'greetings';
      const seed = step.seed || '';
      const ask = `Create a beginner-friendly Japanese guided phrase card as JSON only with keys: phrase_jp, romaji, english, explain, usage_examples (array of short EN lines), build_phrase, build_romaji, questions (array of {q, options:[...], answer_index}). Focus on ${topic}. ${seed ? 'The phrase should be ' + seed + '.' : ''}`;
      const msgs = [{ role: 'user', content: ask }];
      try {
        const txt = await Chat.send({ messages: msgs, level: step.level || 'A1', persona: 'tutor' });
        const data = parseJSONLoose(txt) || {};
        state.loaded = true; state.data = data;
        return data;
      } catch (e) {
        feedback(map, 'Could not get tutor content. Check API.', false);
        return null;
      } finally {
        setStatus(map, '');
      }
    }

    (async () => {
      showIntro();
      const data = await ensureData(); if (!data) return;
      showPhrase(data);
      showExplain(data);
      showPronounce(data);
      showBuild(data);
      showQuiz(data);
      padFooter();
    })();

    setStatus(map, 'Follow the guided steps.');
    feedback(map, '', true);
  }

  // ---------- AI Tutor (interactive JP conversation) ----------
  function renderAiTutor(lesson, step, map) {
    const root = q(map?.containers?.list); if (!root) return;
    root.innerHTML = '';

    const card = document.createElement('div');
    card.className = map?.classes?.item || 'lesson-item';
    card.innerHTML = `
      <div class="text-sm text-gray-600 mb-2">Practice a short conversation in Japanese with the tutor.</div>
      <div id="chatLog" class="space-y-2 mb-3 max-h-[50vh] overflow-auto p-2 border rounded"></div>
      <div class="flex items-center gap-2">
        <input id="chatInput" class="${map?.classes?.input || 'field'} flex-1" placeholder="Type in Japanese (or use 🎤)…" />
        <button class="btn btn-amber" data-act="mic">🎤</button>
        <button class="btn btn-primary" data-act="send">Send</button>
      </div>
    `;
    root.appendChild(card);

    const log = card.querySelector('#chatLog');
    const inp = card.querySelector('#chatInput');

    // Persist chat state across re-renders of this step\n    const state = step.__chatState || { msgs: [], seeded: false };\n    step.__chatState = state;\n    const msgs = state.msgs;
    const level = step.level || 'A1';
    const persona = step.persona || 'tutor';

    function add(role, text) {
      const line = document.createElement('div');
      line.className = `${role === 'assistant' ? 'bg-amber-50' : 'bg-gray-50'} p-2 rounded`;
      line.textContent = (role === 'assistant' ? `Tutor: ${text}` : `You: ${text}`);
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    async function reply(userText) {
      if (!userText) return;
      add('user', userText);
      msgs.push({ role: 'user', content: userText });
      setStatus(map, 'Thinking…');
      try {
        const r = await Chat.send({ messages: msgs, level, persona });
        msgs.push({ role: 'assistant', content: r });
        add('assistant', r);
        // Speak JP parts; default to ja
        if (TTS && typeof TTS.cancel === 'function') TTS.cancel();
        if (TTS && typeof TTS.speak === 'function') {
          TTS.speak({ text: r, lang: 'ja', rate: map?.speech?.rate ?? 1 });
        }
        setStatus(map, '');
      } catch (e) {
        feedback(map, 'Chat failed. Check backend/API key.', false);
      }
    }

    // Seed greeting
    (async () => { await reply(step.opening || 'こんにちは。今日は何を練習しますか？'); })();

    // Send button
    card.querySelector('[data-act="send"]').addEventListener('click', async () => {
      const v = inp.value.trim(); inp.value = '';
      await reply(v);
    });
    inp.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = inp.value.trim(); inp.value = ''; await reply(v); }
    });

    // Mic (optional Web Speech)
    const hasRec = ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
    const btnMic = card.querySelector('[data-act="mic"]');
    btnMic.disabled = !hasRec;
    if (hasRec) {
      btnMic.addEventListener('click', () => {
        const Ctor = window.webkitSpeechRecognition || window.SpeechRecognition;
        const r = new Ctor(); r.lang = 'ja-JP'; r.interimResults = false; r.maxAlternatives = 1;
        r.onresult = async (evt) => { const said = (evt.results[0][0].transcript || '').trim(); await reply(said); };
        r.onerror = () => feedback(map, 'Didn’t catch that—try again.', false);
        r.start();
      });
    }

    setStatus(map, 'Chat with the tutor in Japanese.');
    feedback(map, '', true);
    padFooter();
  }

  // ---------- checks ----------
  function collectClozeAnswers(containerSel) {
    return qa(`${containerSel} input[data-answer]`).map((inp) => ({
      expected: inp.dataset.answer || "", got: inp.value || "", el: inp
    }));
  }
  function checkCloze(map) {
    const blocks = qa(`${map?.containers?.list} .${map?.classes?.item || "lesson-item"}`);
    let allOk = true;
    let bubbleTip = "";
    blocks.forEach(block => {
      const inputs = Array.from(block.querySelectorAll('input[data-answer]'));
      const hintEl = ensureHintEl(block, map);
      let localOk = true;
      let firstHint = "";
      inputs.forEach(inp => {
        const expected = inp.dataset.answer || "";
        const got = inp.value || "";
        // Accept kana reading for 願 if typed as おねがいします
        const acceptAlt = /願/.test(expected) && H.toHira(got) === "おねがいします";
        const correct = acceptAlt || (norm(expected) === norm(got));
        inp.classList.toggle(map?.classes?.ok || "ok", correct);
        inp.classList.toggle(map?.classes?.bad || "bad", !correct);
        if (!correct) {
          localOk = false;
          if (!firstHint) firstHint = H.makeHint(expected, got);
        }
      });
      hintEl.textContent = localOk ? "" : firstHint;
      if (!localOk) { allOk = false; if (!bubbleTip && firstHint) bubbleTip = firstHint; }
    });
    feedback(map, allOk ? "Great! All blanks correct." : "Some blanks need fixing.", allOk);
    if (allOk) mascotPulse && mascotPulse("mascot-celebrate", 1200);
    else mascotPulse && mascotPulse("mascot-confused", 800);
    if (!allOk && bubbleTip) MascotTip.show(bubbleTip, { tone:'warn' }); else MascotTip.hide();
    return allOk;
  }

  function checkTranslate(lesson, step, map) {
    if (map?.flags?.syllableMode) {
      const openSlots = qa(`${map?.containers?.list} .mora-slot`).filter(x => x.dataset.filled !== '1');
      const ok = openSlots.length === 0;
      feedback(map, ok ? 'All tiles placed-nice!' : 'Place all tiles in order.', ok);
      if (typeof mascotPulse === 'function') mascotPulse(ok ? 'mascot-celebrate' : 'mascot-confused', ok ? 1200 : 800);
      return ok;
    }
    const cards = qa(`${map?.containers?.list} [data-sid]`);
    let allOk = true;
    let firstTip = "";
    cards.forEach(card => {
      const sid = card.getAttribute("data-sid");
      const s = (lesson.sentences || []).find(x => x.sid === sid) || {};
      const inp = card.querySelector("input");
      const hintEl = ensureHintEl(card, map);
      const got = (inp?.value || "").trim();

      // Accept: exact JP OR same reading (punctuation-insensitive)
      const readingKana = stripStops(sentenceReadingHira(s));     // おねがいします
      const gotKana = stripStops(H.toHira(got));
      const jpKana = stripStops(H.toHira(s.jp || ""));
      const romajiKana = s.romaji_full ? stripStops(H.toHira(s.romaji_full)) : null;
      const correct =
        norm(s.jp || "") === norm(got) ||  // also strips punctuation/spaces
        gotKana === jpKana ||
        (romajiKana && gotKana === romajiKana);


      if (inp) {
        inp.classList.toggle(map?.classes?.ok || "ok", correct);
        inp.classList.toggle(map?.classes?.bad || "bad", !correct);
      }
      const tip = correct ? "" : H.makeHint(s.jp || "", got, s);
      hintEl.textContent = tip;
      if (!correct) { allOk = false; if (!firstTip && tip) firstTip = tip; }
    });
    feedback(map, allOk ? "Nice-perfect translations!" : "Check the highlighted answers.", allOk);
    if (allOk) mascotPulse && mascotPulse("mascot-celebrate", 1200);
    else mascotPulse && mascotPulse("mascot-confused", 800);
    if (!allOk && firstTip) MascotTip.show(firstTip, { tone:'warn' }); else MascotTip.hide();
    return allOk;
  }


  // ---------- runtime ----------
  function bindOnce(el, type, handler, key = "lsBound") {
    if (!el) return;
    const tag = `${key}:${type}`;
    if (el.dataset && el.dataset[tag]) return;
    el.addEventListener(type, handler);
    if (el.dataset) el.dataset[tag] = "1";
  }

  function run(lesson, map) {
    __MAP__ = map;
    mascotSet("mascot-idle");
    if (!lesson || !lesson.steps) return;
    const state = { stepIndex: 0 };
    // Remove the cloze step (second page) per request
    const steps = (lesson.steps || []).filter(s => (s && s.type) !== 'cloze');



    // Create or update a header explaining the current page with index
    function ensureExplainer(steps, idx) {
      try {
        const wrap = document.getElementById('lesson-wrap');
        if (!wrap) return;
        let head = document.getElementById('page-explainer');
        if (!head) {
          head = document.createElement('div');
          head.id = 'page-explainer';
          head.className = 'mb-3 p-3 rounded border bg-gray-50 text-gray-800';
          // insert before the main jp list so it sits on top
          const jp = document.getElementById('jp-text');
          wrap.insertBefore(head, jp || wrap.firstChild);
        }
        const total = steps.length;
        const pos = Math.min(Math.max(idx + 1, 1), total);
        const step = steps[idx] || {};
        const label = (() => {
          // Custom label if provided on the step JSON
          if (step.title) return step.title;
          if (step.label) return step.label;
          switch (step.type) {
            case 'read_listen': return 'Introduction to Phrases';
            case 'translate_to_jp': return 'Learn Kana Through Tiles';
            case 'cloze': return 'Fill in the Blanks';
            case 'variations': return 'Comic Conversation';
            case 'phrase_drill': return 'Phrase Drill';
            case 'guided_convo': return 'Guided Conversation';
            case 'dialogue': return 'Mini Scene';
            case 'roleplay': return 'Roleplay Practice';
            case 'reflect': return 'Reflect and Review';
            default: return (step.type || 'Lesson Step').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
        })();
        const desc = (() => {
          if (step.explainer) return step.explainer;
          switch (step.type) {
            case 'read_listen': return 'Read, listen, and repeat the key phrases.';
            case 'translate_to_jp': return 'Drag kana tiles to build the phrase in order.';
            case 'cloze': return 'Type the missing parts to complete each phrase.';
            case 'variations': return 'Watch a short dialogue using key phrases.';
            case 'phrase_drill': return 'Practice with quick prompts and variations.';
            case 'guided_convo': return 'Follow a guided, beginner-friendly conversation.';
            case 'dialogue': return 'Browse a short bilingual scene and listen.';
            case 'roleplay': return 'Speak the phrase and get feedback.';
            case 'reflect': return 'Wrap up and schedule review.';
            default: return '';
          }
        })();
        head.innerHTML = `<div class="text-sm text-gray-600">Page ${pos} of ${total}</div>
                          <div class="font-medium">${label}</div>
                          ${desc ? `<div class="text-sm text-gray-700">${desc}</div>` : ''}`;
      } catch {}
    }

    const render = () => {
      const step = steps[state.stepIndex] || {};
      // tell CSS which step is active
      document.body.dataset.step = (step && step.type) || '';
      if (window.__padFooter) window.__padFooter();
      // update mascot progress indicator
      try { MascotProgress.render(steps.length, state.stepIndex); } catch {}
      // occasional mascot nudge toward Speak button
      try {
        const speakSel = map?.controls?.speak || '#lsSpeak';
        const listSel = map?.containers?.list || '#jp-text';
        const speakBtnCls = map?.classes?.speakBtn || 'speak-btn';
        const speakAnchor = document.querySelector(speakSel)
          || document.querySelector(`${listSel} .${speakBtnCls}`)
          || document.querySelector(`.${speakBtnCls}`);
        MascotNudge.maybeNudge(speakAnchor || speakSel, state.stepIndex);
      } catch {}
      // legacy attention cues (bubbles): disabled by default; can enable with flags.attentionCues=true
      try {
        if (map?.flags?.attentionCues !== false) {
          // Delay a tick so footer hoist/reflow completes before measuring
          setTimeout(() => {
            try {
              const speakSel = map?.controls?.speak || '#lsSpeak';
              const listSel = map?.containers?.list || '#jp-text';
              const speakBtnCls = map?.classes?.speakBtn || 'speak-btn';
              const speakAnchor = document.querySelector(speakSel)
                || document.querySelector(`${listSel} .${speakBtnCls}`)
                || document.querySelector(`.${speakBtnCls}`);
              const showed = AttentionCue.showOnce('speak', speakAnchor || speakSel, 'Tap Speak to hear it.', { ms: 3500, place:'top' });
              if (!showed) AttentionCue.showOnce('romaji', map?.controls?.toggleRomaji || '#lsToggleRomaji', 'Toggle Romaji view.', { ms: 3000, place:'top' });
            } catch {}
          }, 300);
        }
      } catch {}
      switch (step.type) {
        case "read_listen": renderReadListen(lesson, step, map); break;
        case "cloze": renderCloze(lesson, step, map); break;
        case "translate_to_jp": map?.flags?.syllableMode ? renderTranslateTiles(lesson, step, map)
          : renderTranslate(lesson, step, map); break;
        case "roleplay": renderRoleplay(lesson, step, map); break;
        // Replace mini-scene with interactive AI Tutor conversation
        case "dialogue": renderAiTutor(lesson, step, map); break;
        case "guided_convo": renderGuidedConvo(lesson, step, map); break;
        case "ai_tutor": renderAiTutor(lesson, step, map); break;
        case "variations": renderComic(lesson, step, map); break;
        case "phrase_drill": renderPhraseDrill(lesson, step, map); break;
        case "reflect":
          const listEl = q(map?.containers?.list);
          if (listEl) listEl.replaceChildren();
          setStatus(map, "Great work! Review will be scheduled.");
          feedback(map, "", true);
          break;
        default:
          setStatus(map, "Unknown step.");
          feedback(map, "This step type is not supported.", false);
          break;
      }

      // Update page explainer header after content is rendered
      ensureExplainer(steps, state.stepIndex);

    };

    const onNext = () => { state.stepIndex = Math.min(state.stepIndex + 1, steps.length - 1); render(); };
    const onPrev = () => { state.stepIndex = Math.max(state.stepIndex - 1, 0); render(); };
    // --- add below your other handlers inside run() ---

    // NEW: initialize slider UI to current rate
    const initSpeedUI = () => {
      const el = q(map?.controls?.speed);
      const label = q(map?.controls?.speedVal);
      const rate = Number(map?.speech?.rate ?? 1);
      if (el) el.value = String(rate);
      if (label) label.textContent = `${rate.toFixed(1)}×`;
    };

    // NEW: handle slider input
    const onSpeed = (e) => {
      const v = parseFloat(e?.target?.value);
      const rate = Number.isFinite(v) ? v : 1;
      map.speech = Object.assign({}, map.speech, { rate });
      const label = q(map?.controls?.speedVal);
      if (label) label.textContent = `${rate.toFixed(1)}×`;
    };

    // NEW: bind slider
    bindOnce(q(map?.controls?.speed), "input", onSpeed);

    // call once so UI reflects current rate
    initSpeedUI();

    render();

    const onCheck = () => {
      const step = steps[state.stepIndex] || {};
      if (step.type === "cloze") checkCloze(map);
      if (step.type === "translate_to_jp") checkTranslate(lesson, step, map);
    };

    const onReveal = () => {
      const step = steps[state.stepIndex] || {};
      // Visual cue: thinking wiggle on reveal
      try { mascotPulse && mascotPulse('mascot-think', 900); } catch {}
      if (step.type === "cloze") {
        qa(`${map?.containers?.list} input[data-answer]`).forEach(i => i.value = i.dataset.answer || "");
        feedback(map, "Answers revealed.", true);
      }
      if (step.type === "translate_to_jp") {
        qa(`${map?.containers?.list} [data-sid]`).forEach(card => {
          const sid = card.getAttribute("data-sid");
          const s = (lesson.sentences || []).find((x) => x.sid === sid) || {};
          const inp = card.querySelector("input"); if (inp) inp.value = s.jp || "";
        });
        feedback(map, "Answers revealed.", true);
      }
    };
    const onToggleRomaji = () => {
      map.flags = map.flags || {};
      map.flags.showRomaji = !map.flags.showRomaji;
      render();
    };
    const onSpeak = async () => {
      const btn = q(map?.controls?.speak);
      const disable = () => { if (btn) { btn.disabled = true; btn.classList.add('opacity-50','cursor-not-allowed'); } };
      const enable  = () => { if (btn) { btn.disabled = false; btn.classList.remove('opacity-50','cursor-not-allowed'); } };
      const rate = map?.speech?.rate ?? 1;
      try {
        disable();
        // stop any current playback so it won't overlap
        if (TTS && typeof TTS.cancel === 'function') TTS.cancel();

        const step = steps[state.stepIndex] || {};
        // Dialogue scene speaks JP+EN per segment
        if (step.type === "dialogue" && window.__KR_CURRENT_SCENE__?.lines?.length) {
          for (const seg of window.__KR_CURRENT_SCENE__.lines) {
            const lang = seg.lang || (seg.jp ? 'ja' : 'en');
            const text = lang === 'ja' ? (seg.jp || '') : (seg.en || '');
            if (text) await TTS.speak({ text, lang, rate: lang === 'ja' ? rate : 1.0 }).catch(() => {});
          }
          return;
        }

        // Collect JP texts based on step type
        let texts = [];
        if (step.type === "read_listen" || step.type === "translate_to_jp") {
          texts = (step.item_refs || [])
            .map(id => (lesson.sentences || []).find(s => s.sid === id)?.jp)
            .filter(Boolean);
        } else if (step.type === 'variations') {
          // Speak visible bubbles in the comic renderer
          const bubbles = Array.from(document.querySelectorAll('#comicList .bubble[data-jp]'))
            .filter(el => !!(el && el.closest('#comicList') && el.offsetParent !== null));
          texts = bubbles.map(b => b.dataset.jp).filter(Boolean);
        } else if (step.type === 'phrase_drill') {
          texts = (step.pairs || []).map(p => p?.jp).filter(Boolean);
        } else if (step.type === 'roleplay') {
          texts = (step.item_refs || [])
            .map(id => (lesson.sentences || []).find(s => s.sid === id)?.jp)
            .filter(Boolean);
        }

        if (texts.length) {
          // speak sequentially, with cancellation prevention handled by adapter
          for (const t of texts) await TTS.speak({ text: t, lang: 'ja', rate }).catch(() => {});
        } else {
          feedback(map, "Nothing to speak on this step.", false);
        }
      } finally { enable(); }
    };

    bindOnce(q(map?.controls?.next), "click", onNext);
    bindOnce(q(map?.controls?.prev), "click", onPrev);
    bindOnce(q(map?.controls?.check), "click", onCheck);
    bindOnce(q(map?.controls?.showAnswer), "click", onReveal);
    bindOnce(q(map?.controls?.toggleRomaji), "click", onToggleRomaji);
    bindOnce(q(map?.controls?.speak), "click", onSpeak);

    // Initialize visual tweaks once per run
    try { MascotVisuals.init(); MascotArms.init?.(); } catch {}

    // expose small debug helpers for attention cues
    try {
      window.__showCue = (key = 'speak') => {
        const msg = key === 'romaji' ? 'Toggle Romaji view.' : 'Tap Speak to hear it.';
        const sel = key === 'romaji' ? (map?.controls?.toggleRomaji || '#lsToggleRomaji') : (map?.controls?.speak || '#lsSpeak');
        AttentionCue.showOnce(`dbg:${key}`, sel, msg, { ms: 4000, place: 'top' });
      };
      // Force showing even if the once-flag is set
      window.__showCueForce = (key = 'speak') => {
        const msg = key === 'romaji' ? 'Toggle Romaji view.' : 'Tap Speak to hear it.';
        const sel = key === 'romaji' ? (map?.controls?.toggleRomaji || '#lsToggleRomaji') : (map?.controls?.speak || '#lsSpeak');
        const el = (typeof sel === 'string') ? document.querySelector(sel) : sel;
        AttentionCue.hide();
        // Use internal showFor behavior by temporarily exposing it
        const _showFor = (selector, text, opts) => {
          const host = document.querySelector('.attention-cue') || document.body; // no-op; function exists in closure
        };
        // Call via showOnce with a unique non-persistent key (random) to bypass sessionStorage caching
        const nonce = `force:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        AttentionCue.showOnce(nonce, el || sel, msg, { ms: 4000, place: 'top' });
      };
      window.__resetCues = () => {
        try {
          Object.keys(sessionStorage)
            .filter(k => k.startsWith('krCue:'))
            .forEach(k => sessionStorage.removeItem(k));
        } catch {}
      };
    } catch {}

    // Dev nudge loop (configure with map.flags.nudgeMs)
    let __nudgeTimer = null;
    const startNudgeLoop = () => {
      const ms = Number(map?.flags?.nudgeMs || 0);
      if (ms > 0 && !__nudgeTimer) {
        __nudgeTimer = setInterval(() => {
          try {
            const speakSel = map?.controls?.speak || '#lsSpeak';
            const listSel = map?.containers?.list || '#jp-text';
            const speakBtnCls = map?.classes?.speakBtn || 'speak-btn';
            const speakAnchor = document.querySelector(speakSel)
              || document.querySelector(`${listSel} .${speakBtnCls}`)
              || document.querySelector(`.${speakBtnCls}`);
            MascotNudge.maybeNudge(speakAnchor || speakSel, state.stepIndex, { force:true });
          } catch {}
        }, ms);
      }
    };

    startNudgeLoop();

    // Mascot help: build and toggle on mascot click
    const buildHelpHtml = () => {
      const romajiOn = !!(map?.flags?.showRomaji);
      const docked = (() => { try { return sessionStorage.getItem('krCue:mascotDocked') === '1'; } catch { return false; } })();
      return `
        <h4>Need a hand?</h4>
        <div class="row">
          <button data-act="speak">🔊 Speak this page</button>
          <button data-act="romaji">${romajiOn ? '🅁 Hide Romaji' : '🅁 Show Romaji'}</button>
          <button data-act="dock">${docked ? '📍 Undock Mascot' : '📍 Dock Mascot Near Controls'}</button>
          <button data-act="hint">💡 Get a hint</button>
          <button data-act="close">✖ Close</button>
        </div>`;
    };

    const onHelpClick = (e) => {
      const t = e.target.closest('button[data-act]'); if (!t) return;
      const act = t.getAttribute('data-act');
      if (act === 'close') { MascotHelp.hide(); return; }
      if (act === 'speak') {
        const btn = q(map?.controls?.speak || '#lsSpeak');
        if (btn) btn.click();
        MascotHelp.hide();
        return;
      }
      if (act === 'romaji') {
        const btn = q(map?.controls?.toggleRomaji || '#lsToggleRomaji');
        if (btn) btn.click();
        // re-render help content to reflect new label
        setTimeout(() => MascotHelp.show(buildHelpHtml()), 10);
        return;
      }
      if (act === 'hint') {
        // Try to compute a context hint based on step
        const step = steps[state.stepIndex] || {};
        let tip = '';
        if (step.type === 'translate_to_jp' && !map?.flags?.syllableMode) {
          const cards = qa(`${map?.containers?.list} [data-sid]`);
          for (const card of cards) {
            const sid = card.getAttribute('data-sid');
            const s = (lesson.sentences || []).find(x => x.sid === sid) || {};
            const inp = card.querySelector('input');
            const got = (inp?.value || '').trim();
            const jp = s.jp || '';
            const candidate = H.makeHint(jp, got, s);
            if (got !== jp) { tip = candidate; break; }
          }
        } else if (step.type === 'cloze') {
          const blocks = qa(`${map?.containers?.list} [data-block]`);
          for (const block of blocks) {
            const inputs = Array.from(block.querySelectorAll('input[data-answer]'));
            for (const inp of inputs) {
              const expected = inp.dataset.answer || '';
              const got = inp.value || '';
              if ((norm(expected) !== norm(got))) { tip = H.makeHint(expected, got); break; }
            }
            if (tip) break;
          }
        }
        if (!tip) tip = 'Try Speak to hear the phrase and repeat.';
        MascotHelp.hide();
        MascotTip.show(tip, { tone: 'warn', ms: 3200 });
        return;
      }
      if (act === 'dock') {
        const masc = document.getElementById('mascot');
        const wrap = document.getElementById('lesson-wrap');
        const speak = q(map?.controls?.speak || '#lsSpeak');
        if (!masc || !wrap || !speak) return;
        const docked = (() => { try { return sessionStorage.getItem('krCue:mascotDocked') === '1'; } catch { return false; } })();
        const wr = wrap.getBoundingClientRect();
        const sr = speak.getBoundingClientRect();
        if (!docked) {
          // store original position once
          if (!masc.dataset.origLeft) masc.dataset.origLeft = masc.style.left || '';
          if (!masc.dataset.origTop) masc.dataset.origTop = masc.style.top || '';
          // Size
          const mw = masc.offsetWidth || 64; const mh = masc.offsetHeight || 80;
          // place above-left of the Speak button
          let left = Math.round(sr.left - wr.left - mw - 8);
          let top = Math.round(sr.top - wr.top - mh - 8);
          // clamp inside wrap
          const maxL = Math.max(0, (wr.width - mw));
          const maxT = Math.max(0, (wr.height - mh));
          left = Math.min(Math.max(0, left), maxL);
          top = Math.min(Math.max(0, top), maxT);
          masc.style.position = 'absolute';
          masc.style.left = left + 'px';
          masc.style.top = top + 'px';
          try { sessionStorage.setItem('krCue:mascotDocked', '1'); } catch {}
        } else {
          // restore
          if (masc.dataset.origLeft) masc.style.left = masc.dataset.origLeft;
          if (masc.dataset.origTop) masc.style.top = masc.dataset.origTop;
          try { sessionStorage.removeItem('krCue:mascotDocked'); } catch {}
        }
        // re-open panel with updated label
        setTimeout(() => MascotHelp.show(buildHelpHtml()), 10);
        return;
      }
    };

    const toggleHelp = () => {
      const html = buildHelpHtml();
      MascotHelp.toggle(html);
      // bind actions each time it opens
      const panel = document.querySelector('.mascot-help');
      panel?.removeEventListener('click', onHelpClick);
      panel?.addEventListener('click', onHelpClick);
    };

    bindOnce(document.getElementById('mascot'), 'click', toggleHelp, 'lsHelp');

    render();
  }

  return { start: run };
})();






