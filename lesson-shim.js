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

      if (!gotRaw || !gotRaw.trim())
        return `Type your answer. Hint: starts with 「${exp.slice(0, 2)}」`;

      // Common pitfalls
      if (expectedJP.includes("こんにちは") && got.includes("こんにちわ"))
        return "Use 「は」 (ha) not 「わ」 in こんにちは.";

      if (/願/.test(expectedJP) && got === "おねがいします")
        return ""; // accept kana reading for 願

      if (exp.includes("っ") && !got.includes("っ")) {
        const idx = exp.indexOf("っ"), next = exp[idx + 1] || "";
        return `Add a small 「っ」 before 「${next}」.`;
      }

      if (got.length !== exp.length)
        return got.length < exp.length
          ? `You're missing ${exp.length - got.length} character(s).`
          : `You have ${got.length - exp.length} extra character(s).`;

      const i = H.firstDiff(got, exp);
      if (i >= 0) return `Check character ${i + 1}: should be 「${exp[i]}」.`;

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
    root.classList.remove("mascot-idle", "mascot-talk", "mascot-celebrate", "mascot-confused");
    if (state) root.classList.add(state);
  }
  function mascotPulse(state, ms = 900) {
    mascotSet(state);
    setTimeout(() => mascotSet("mascot-idle"), ms);
  }


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
      .forEach(btn => btn.addEventListener("click", () => Speech.speak(btn.dataset.jp || "", map?.speech || {})));
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
      Speech.speak(t.expectJP, map?.speech || {});
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

    // step.pairs: [{en, jp, alts?:[{jp,en?}]}]
    const pairs = (step.pairs || []).map(p => {
      const reading = kanjiToReading(p.jp || "");
      const romaji = window.wanakana ? wanakana.toRomaji(reading) : "";
      return Object.assign({ reading, romaji, alts: p.alts || [] }, p);
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

    // bind input (reuse your tools)
    ensureKanaBindings(elInput); // once

    function show() {
      const P = pairs[i];
      elPrompt.textContent = P.en || "";
      elInput.value = "";
      elInput.classList.remove(map?.classes?.ok || "ok", map?.classes?.bad || "bad");
      const readingNoP = reading.replace(PUNCT_RX, "");
      elRoma.textContent = splitMora(readingNoP).map(k => wanakana.toRomaji(k)).join(' ');
      // set dynamic targets for the existing handlers
      elInput.dataset.expectedKana = readingNoP;       // no punctuation required
      attachKanaGuide(elInput, P.jp, map, readingNoP); // guide without the dot

      elHint.textContent = "";
      elInput.focus();
    }


    function doCheck() {
      const P = pairs[i];
      const got = elInput.value || "";
      const want = P.jp || "";

      const gotC = canonJP(got);
      const wantC = canonJP(want);
      const readC = canonJP(sentenceReadingHira({ jp: want, romaji_full: P.romaji }));

      const ok = (gotC === wantC) || (gotC === readC);

      elInput.classList.toggle(map?.classes?.ok || "ok", ok);
      elInput.classList.toggle(map?.classes?.bad || "bad", !ok);
      elHint.textContent = ok ? "" : `Hint: starts with 「${wantC.slice(0, 2)}」`;
      if (typeof feedback === "function") feedback(map, ok ? "Good!" : "Try again.", ok);
      if (typeof mascotPulse === "function") mascotPulse(ok ? "mascot-celebrate" : "mascot-confused", ok ? 1200 : 800);
    }


    function speakCurrent() {
      const P = pairs[i]; Speech.speak(P.jp || "", map?.speech || {});
    }

    function toggleAlts() {
      const P = pairs[i];
      if (!P.alts || !P.alts.length) { altBox.classList.add('hidden'); elHint.textContent = "No variations for this one."; return; }
      altBox.classList.toggle('hidden');
      if (!altBox.classList.contains('hidden')) {
        altBox.innerHTML = P.alts.map(a => `
        <button class="btn btn-ghost block w-full text-left mb-1" data-jp="${a.jp}">
          ${a.jp}<span class="block text-xs text-gray-500">${wanakana ? wanakana.toRomaji(kanjiToReading(a.jp)) : ""}
</span>
          ${a.en ? `<span class="block text-xs text-gray-600">${a.en}</span>` : ""}
        </button>`).join('');
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
        line.className = "p-3 rounded border border-gray-200";
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
          .addEventListener('click', () => Speech.speak(v.jp, map?.speech || {}));
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
    <div class="mb-2 text-sm text-gray-600">Mini-scene: listen to a short dialogue that mixes English and Japanese.</div>
    <div class="flex items-center gap-2 mb-3">
      <button class="btn btn-primary" data-act="play">▶ Play</button>
      <button class="btn btn-ghost"   data-act="pause">⏸ Pause</button>
      <button class="btn btn-ghost"   data-act="prev">⬅ Prev</button>
      <button class="btn btn-dark"    data-act="next">Next ➡</button>
      <label class="ml-2 text-sm flex items-center gap-2">
        <input type="checkbox" id="sceneAuto" class="accent-amber-500" checked />
        Autoplay
      </label>
      <label class="ml-2 text-sm flex items-center gap-2">
        <input type="checkbox" id="sceneShowRomaji" class="accent-teal-600" ${map?.flags?.showRomaji ? 'checked' : ''}/>
        Romaji
      </label>
    </div>
    <div id="sceneList" class="space-y-2"></div>
  `;
    root.appendChild(box);

    const list = box.querySelector('#sceneList');
    const auto = box.querySelector('#sceneAuto');
    const showR = box.querySelector('#sceneShowRomaji');

    // Render lines
    segs.forEach((g, i) => {
      const line = document.createElement('div');
      line.className = "p-3 rounded border border-gray-200";
      line.dataset.idx = String(i);
      line.innerHTML = `
      <div class="text-xs text-gray-500">${g.speaker} • ${g.lang === 'ja' ? 'Japanese' : 'English'}</div>
      <div class="font-medium ${map?.classes?.jp || 'jp'}">${g.lang === 'ja' ? (g.jp || g.text) : g.en}</div>
      ${g.lang === 'ja' && (map?.flags?.showRomaji || showR.checked)
          ? `<div class="${map?.classes?.romaji || 'romaji'} text-gray-500">${g.romaji || ''}</div>` : ''}
      ${g.lang === 'ja'
          ? `<div class="${map?.classes?.en || 'en'} text-gray-600">${g.en || ''}</div>`
          : (g.jp ? `<div class="${map?.classes?.jp || 'jp'} text-gray-600">${g.jp}</div>` : '')
        }
    `;
      list.appendChild(line);
    });

    // Highlight helper
    function highlight(idx) {
      list.querySelectorAll('[data-idx]').forEach(el => {
        const on = Number(el.dataset.idx) === idx;
        el.classList.toggle('ring-2', on);
        el.classList.toggle('ring-amber-400', on);
        el.classList.toggle('bg-amber-50', on);
      });
      // keep current line in view
      const el = list.querySelector(`[data-idx="${idx}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Speech sequence
    let i = 0, playing = false, currentUtt = null;

    function speakIndex(k) {
      if (!('speechSynthesis' in window)) { feedback(map, 'TTS not supported in this browser.', false); return; }
      if (k < 0 || k >= segs.length) return;
      i = k;
      const seg = segs[i];
      const u = new SpeechSynthesisUtterance(seg.text);
      const lang = seg.lang === 'ja' ? 'ja-JP' : 'en-US';
      u.lang = lang;
      const v = pickVoiceByLang(seg.lang);
      if (v) u.voice = v;
      u.rate = seg.lang === 'ja' ? (map?.speech?.rate ?? 1) : 1.0; // keep EN natural
      u.onstart = () => { playing = true; currentUtt = u; mascotSet && mascotSet('mascot-talk'); highlight(i); };
      u.onend = () => {
        playing = false; currentUtt = null; mascotSet && mascotSet('mascot-idle');
        if (auto.checked && i < segs.length - 1) speakIndex(i + 1);
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }

    // Controls
    box.querySelector('[data-act="play"]').addEventListener('click', () => {
      if (playing) { /* already playing current */ return; }
      speakIndex(i);
    });
    box.querySelector('[data-act="pause"]').addEventListener('click', () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      playing = false; currentUtt = null; mascotSet && mascotSet('mascot-idle');
    });
    box.querySelector('[data-act="prev"]').addEventListener('click', () => {
      if (i > 0) i--;
      speakIndex(i);
    });
    box.querySelector('[data-act="next"]').addEventListener('click', () => {
      if (i < segs.length - 1) i++;
      speakIndex(i);
    });

    // React to Romaji toggle
    showR.addEventListener('change', () => {
      map.flags = map.flags || {};
      map.flags.showRomaji = showR.checked;
      // re-render lines to show/hide romaji
      renderBilingualScene(lesson, step, map);
    });

    // preload voices (Chrome sometimes async)
    if ('speechSynthesis' in window) speechSynthesis.getVoices();

    setStatus(map, 'Listen through the mini-scene. Use ▶ or Autoplay.');
    feedback(map, '', true);
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
      if (!localOk) allOk = false;
    });
    feedback(map, allOk ? "Great! All blanks correct." : "Some blanks need fixing.", allOk);
    if (allOk) mascotPulse && mascotPulse("mascot-celebrate", 1200);
    else mascotPulse && mascotPulse("mascot-confused", 800);
    return allOk;
  }

  function checkTranslate(lesson, step, map) {
    if (map?.flags?.syllableMode) {
      const open = qa(`${map?.containers?.list} input.mora:not([disabled])`);
      const bad = qa(`${map?.containers?.list} input.mora.${map?.classes?.bad || "bad"}`);
      const ok = open.length === 0 && bad.length === 0;
      feedback(map, ok ? "All syllables correct!" : "Finish each syllable in order.", ok);
      if (typeof mascotPulse === "function") mascotPulse(ok ? "mascot-celebrate" : "mascot-confused", ok ? 1200 : 800);
      return ok;
    }
    const cards = qa(`${map?.containers?.list} [data-sid]`);
    let allOk = true;
    cards.forEach(card => {
      const sid = card.getAttribute("data-sid");
      const s = (lesson.sentences || []).find(x => x.sid === sid) || {};
      const inp = card.querySelector("input");
      const hintEl = ensureHintEl(card, map);
      const got = (inp?.value || "").trim();

      // Accept: exact JP OR same reading (punctuation-insensitive)
      const readingKana = stripStops(sentenceReadingHira(s));     // おねがいします
      const gotKana     = stripStops(H.toHira(got));
      const jpKana      = stripStops(H.toHira(s.jp || ""));
      const romajiKana  = s.romaji_full ? stripStops(H.toHira(s.romaji_full)) : null;
      const correct =
      norm(s.jp || "") === norm(got) ||  // also strips punctuation/spaces
      gotKana === jpKana ||
      (romajiKana && gotKana === romajiKana);


      if (inp) {
        inp.classList.toggle(map?.classes?.ok || "ok", correct);
        inp.classList.toggle(map?.classes?.bad || "bad", !correct);
      }
      hintEl.textContent = correct ? "" : H.makeHint(s.jp || "", got, s);
      if (!correct) allOk = false;
    });
    feedback(map, allOk ? "Nice—perfect translations!" : "Check the highlighted answers.", allOk);
    if (allOk) mascotPulse && mascotPulse("mascot-celebrate", 1200);
    else mascotPulse && mascotPulse("mascot-confused", 800);
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
    const steps = lesson.steps;

    const render = () => {
      const step = steps[state.stepIndex] || {};
      switch (step.type) {
        case "read_listen": renderReadListen(lesson, step, map); break;
        case "cloze": renderCloze(lesson, step, map); break;
        case "translate_to_jp": map?.flags?.syllableMode ? renderTranslateSyllables(lesson, step, map)
          : renderTranslate(lesson, step, map); break;
        case "roleplay": renderRoleplay(lesson, step, map); break;
        case "dialogue": renderBilingualScene(lesson, step, map); break;
        case "variations": renderVariations(lesson, step, map); break;
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
    const onSpeak = () => {
      const step = steps[state.stepIndex] || {};
      let texts = [];
      if (step.type === "read_listen") {
        texts = (step.item_refs || [])
          .map(id => (lesson.sentences || []).find(s => s.sid === id)?.jp)
          .filter(Boolean);
      } else if (step.type === "translate_to_jp") {
        texts = (step.item_refs || [])
          .map(id => (lesson.sentences || []).find(s => s.sid === id)?.jp)
          .filter(Boolean);
      }
      if (texts.length) Speech.speakList(texts, map?.speech || {});
      else feedback(map, "Nothing to speak on this step.", false);
    };

    bindOnce(q(map?.controls?.next), "click", onNext);
    bindOnce(q(map?.controls?.prev), "click", onPrev);
    bindOnce(q(map?.controls?.check), "click", onCheck);
    bindOnce(q(map?.controls?.showAnswer), "click", onReveal);
    bindOnce(q(map?.controls?.toggleRomaji), "click", onToggleRomaji);
    bindOnce(q(map?.controls?.speak), "click", onSpeak);

    render();
  }

  return { start: run };
})();
