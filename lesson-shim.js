// lesson-shim.js ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â with Pronounce + Romaji toggle
window.LessonShim = (() => {
  // ---------- utils ----------
  // Normalize strings for loose comparisons (strip punctuation/space, NFKC normalize, lowercase)
  const norm = (s) => (s || "")
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
  const q = (sel) => (sel ? document.querySelector(sel) : null);
  const qa = (sel) => (sel ? Array.from(document.querySelectorAll(sel)) : []);

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


  // --- HINT HELPERS ---

  const H = {
    toHira: (s) => (window.wanakana ? wanakana.toHiragana(s || "") : (s || "")),
    firstDiff(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; },
    makeHint(expectedJP, gotRaw, sentence) {
      const got = H.toHira(gotRaw || "");
      const exp = sentence?.romaji_full ? H.toHira(sentence.romaji_full) : H.toHira(expectedJP || "");
      if (!got) {
        const start = exp.slice(0, 2);
        return `Type your answer. Hint: starts with ${start}`;
      }
      const i = H.firstDiff(got, exp);
      if (i === -1) return "";
      const next = exp[i] || "";
      const roma = (window.wanakana && next) ? wanakana.toRomaji(next) : "";
      return next ? `Check this kana: ${next}${roma ? ` (${roma})` : ""}` : "";
    }
  };
  // --- MORA HELPERS ---
  const SMALL_KANA = "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â®";
  function splitMora(str = "") {
    const a = [...str]; const out = [];
    for (let i = 0; i < a.length; i++) {
      const c = a[i], n = a[i + 1];
      if (c === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£" || c === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢" || c === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼") { out.push(c); continue; }
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
    inp._guideTarget = toHira(readingOverride || targetJP || "");
    inp._guideProgress = inp._guideProgress || 0;
    inp._guideComp = !!inp._guideComp;

    const kanaOnly = s => /^[\p{sc=Hiragana}\p{sc=Katakana}ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼]+$/u.test(s || "");

    const draw = (p) => {
      const moras = splitMora(inp._guideTarget);
      row.innerHTML = moras.map((m, i) => {
        const cls = i < p ? 'done' : (i === p ? 'next' : 'todo');
        return `<span class="chip ${cls}">${m}</span>`;
      }).join('');
      const next = splitMora(inp._guideTarget)[p] || '';
      const r = next ? (window.wanakana ? wanakana.toRomaji(next) : '') : '';
      foot.textContent = next ? `Next: ${next} (${r})` : 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ Complete';
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
    "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢",
    "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢",
    "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾",
    "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾"
    // add more as neededÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦
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
    const clean = s => toHira((s || "").replace(/[^\p{sc=Hiragana}\p{sc=Katakana}ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼]+/gu, ""));
    const t = splitMora(clean(typedRaw));
    const e = splitMora(clean(expectedRaw));

    const out = [];
    let i = 0, j = 0;

    const bigOf = { "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â " };

    while (i < e.length && j < t.length) {
      const em = e[i], tm = t[j];

      if (tm === em) { out.push(tm); i++; j++; continue; }

      // Particles: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ typed as ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â /ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â 
      if ((em === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯" && tm === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â") || (em === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸" && tm === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ") || (em === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢" && tm === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ")) {
        out.push(em); i++; j++; continue;
      }

      // Small ya/yu/yo: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â + ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ (when expected has small)
      const m = em.match(/^([ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â´ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ])([ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡])$/);
      if (m && tm === m[1] && t[j + 1] === bigOf[m[2]]) {
        out.push(em); i++; j += 2; continue;
      }

      // N-ambiguity: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ + ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â« ; ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ + (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â /ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡
      if (em === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«" && tm === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“" && t[j + 1] === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾") {
        out.push("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«"); i++; j += 2; continue;
      }
      if (["ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡"].includes(em) && tm === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“" && ["ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â "].includes(t[j + 1])) {
        const want = { "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ", "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡": "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Â¹ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â " }[em];
        if (t[j + 1] === want) { out.push(em); i++; j += 2; continue; }
      }

      // Small ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ missing: if expected has ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ and next typed mora matches next expected
      if (em === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£" && t[j] === e[i + 1]) {
        out.push("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£"); i++; continue;
      }

      // Long vowel normalization: ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â  vs ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â  (follow expected)
      if (em === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â " && out[out.length - 1] === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â " && tm === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ") {
        out.push("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â "); i++; j++; continue;
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
    const kanaOnly = s => /^[\p{sc=Hiragana}\p{sc=Katakana}ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼]+$/u.test(s || "");
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
  // Convert romaji -> ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª and fix greeting edge cases on each keystroke
  // Convert romaji -> ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª and fix greeting edge cases per keystroke

  // After WanaKana converts, gently fix greeting edge cases only.
  function attachGreetingNormalizer(inp, expectedJP = "") {
    inp.addEventListener("input", () => {
      const before = inp.value;
      let after = before;

      // safe global fixes
      after = after.replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯");
      after = after.replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯");

      // enforce ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ only when that phrase is expected
      if (expectedJP.includes("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯")) after = after.replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯");
      if (expectedJP.includes("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯")) after = after.replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯");

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
    const active = /ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯/.test(expectedJP || "");
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
    if (expectedJP.includes("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯")) v = v.replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â|ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯");
    if (expectedJP.includes("ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯")) v = v.replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â/g, "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯");
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
          <button type="button" class="${map?.classes?.speakBtn || "speak-btn"}" data-jp="${s.jp}">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â </button>
          <div>
            <div class="${map?.classes?.jp || "jp"}">${s.jp || ""}</div>
            ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || "romaji"}">${s.romaji_full || ""}</div>` : ""}
            ${map?.flags?.showEnglish ? `<div class="${map?.classes?.en || "en"}">${s.en || ""}</div>` : ""}
          </div>
        </div>
      `;
      listEl.appendChild(row);
      try { const cls = map?.classes?.speakBtn || "speak-btn"; const btn = row.querySelector('.' + cls); if (btn) btn.textContent = 'Speak'; } catch {}
    });
    // wire per-line speak buttons
    qa(`${map?.containers?.list} .${map?.classes?.speakBtn || "speak-btn"}`)
      .forEach(btn => btn.addEventListener("click", () => Speech.speak(btn.dataset.jp || "", map?.speech || {})));
    setStatus(map, "Read, listen, and repeat. Use Speak.");
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
        const reading = kanjiToReading(exp);            // "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢" -> "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢"
        inp.dataset.expectedKana = reading;

        // 3) show kana chips + next-hint using the kana reading
        attachKanaGuide(inp, exp, map, reading);

        // 3) gentle greeting fixes (ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ / ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯), if you added it
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
               placeholder="Type in Japanese" />
        ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || "romaji"}">${s.romaji_full || ""}</div>` : ""}
        <div class="${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-1"></div>
      `;
        listEl.appendChild(card);

        // bind to the actual input we just created
        const inp = card.querySelector("input");
        const exp = s.jp || "";
        const reading = sentenceReadingHira(s);
        try {
          inp.placeholder = `Type: ${splitMora(reading).map(k => wanakana.toRomaji(k)).join(' ')}`;
        } catch { }



        ensureKanaBindings(inp);          // once
        inp.dataset.expectedKana = reading;
        attachKanaGuide(inp, exp, map, reading);



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
        // Use the sentence reading so kanji like ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ become ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦
        const reading = sentenceReadingHira(s);
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
              hintEl.textContent = `This syllable is ${exp} (${romaji}).`;
            }
          });

          // Backspace on empty ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ reopen previous box
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
        reading: sentenceReadingHira(s) // e.g., ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢
      }));

    // UI
    const box = document.createElement('div');
    box.className = map?.classes?.item || 'lesson-item';
    box.innerHTML = `
    <div class="${map?.classes?.prompt || 'prompt'} mb-2"></div>
    <div class="text-sm text-gray-600 mb-2">Say it in Japanese. Click Start and speak.</div>
    <div class="flex items-center gap-2 mb-2">
      <button class="btn btn-primary" data-act="speak">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â  Play Prompt</button>
      <button class="btn btn-amber"   data-act="rec">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ Start</button>
      <button class="btn btn-ghost"   data-act="skip">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ Skip</button>
    </div>
    <div class="${map?.classes?.romaji || 'romaji'} text-gray-500 mb-1"></div>
    <div class="${map?.classes?.hint || 'hint'} text-sm text-amber-700 mb-2"></div>
    <div class="${map?.classes?.jp || 'jp'} font-medium"></div>
  `;
    listEl.appendChild(box);
    // Sanitize button labels and helper text
    try {
      const set = (sel, txt) => { const el = box.querySelector(sel); if (el) el.textContent = txt; };
      set('[data-act="speak"]', 'Play Prompt');
      set('[data-act="rec"]', 'Start');
      set('[data-act="skip"]', 'Skip');
      const info = box.querySelector('.text-sm.text-gray-600.mb-2');
      if (info) info.textContent = 'Say it in Japanese. Click Start and speak.';
      rec.onerror = () => { elHint.textContent = "Didn't catch that. Try again."; busy = false; };
      rec.onend = () => { if (busy) busy = false; };
      rec.start();
    } catch {}

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
    <input class="${map?.classes?.input || "jp-input"}" placeholder="Type in Japanese" />
    <div class="${map?.classes?.romaji || "romaji"} text-gray-500 mb-1"></div>
    <div class="mt-2 flex items-center gap-2">
      <button class="btn btn-primary" data-act="check">Check</button>
      <button class="btn btn-amber"   data-act="speak">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â  Speak</button>
      <button class="btn btn-ghost"   data-act="alt">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Variations</button>
      <button class="btn btn-dark"    data-act="next">Next ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡</button>
    </div>
    <div class="${map?.classes?.hint || "hint"} text-sm text-amber-700 mt-2"></div>
    <div id="altBox" class="hidden mt-3 p-2 border rounded"></div>
  `;
    listEl.appendChild(card);
    try { const s=card.querySelector('[data-act="speak"]'); if (s) s.textContent='Speak'; const v=card.querySelector('[data-act="alt"]'); if (v) v.textContent='Variations'; const n=card.querySelector('[data-act="next"]'); if (n) n.textContent='Next >'; } catch {}

    const elPrompt = card.querySelector(`.${map?.classes?.prompt || "prompt"}`);
    const elInput = card.querySelector("input");
    const elRoma = card.querySelector(`.${map?.classes?.romaji || "romaji"}`);
    const elHint = card.querySelector(`.${map?.classes?.hint || "hint"}`);
    const altBox = card.querySelector('#altBox');

    // bind input (reuse your tools)
    try { if (elInput) elInput.placeholder = 'Type in Japanese'; } catch {}
    ensureKanaBindings(elInput); // once

    function show() {
      const P = pairs[i];
      elPrompt.textContent = P.en || "";
      elInput.value = "";
      elInput.classList.remove(map?.classes?.ok || "ok", map?.classes?.bad || "bad");
      // Ensure placeholder stays clean each time
      try { elInput.placeholder = 'Type in Japanese'; } catch {}

      const reading = sentenceReadingHira({ jp: P.jp, romaji_full: P.romaji });
      elRoma.textContent = splitMora(reading).map(k => wanakana.toRomaji(k)).join(' ');

      // set dynamic targets for the existing handlers
      elInput.dataset.expectedKana = reading;          // <-- for attachSmartNormalizer
      attachKanaGuide(elInput, P.jp, map, reading);    // <-- bind-once version; safe to call again

      elHint.textContent = "";
      elInput.focus();
    }


    function doCheck() {
      const P = pairs[i];
      const got = elInput.value || "";
      const want = P.jp || "";
      const ok = toHira(got) === toHira(want) ||
        toHira(got) === sentenceReadingHira({ jp: want });
      elInput.classList.toggle(map?.classes?.ok || "ok", ok);
      elInput.classList.toggle(map?.classes?.bad || "bad", !ok);
      elHint.textContent = ok ? "" : `Hint: starts with ${toHira(want).slice(0, 2)}`;
      feedback(map, ok ? "Good!" : "Try again.", ok);
      mascotPulse && mascotPulse(ok ? "mascot-celebrate" : "mascot-confused", ok ? 1200 : 800);
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
      // Fallback: if JP text looks corrupted, rebuild from romaji
      try {
        const isJP = (s) => /[\u3040-\u30FF\u4E00-\u9FFF]/.test(s || "");
        if (!isJP(v.jp) && v.romaji && window.wanakana) {
          v.jp = wanakana.toHiragana(v.romaji || "");
        }
      } catch {}
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
      <button class="btn btn-primary" data-act="shuffle">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Shuffle</button>
      <button class="btn btn-ghost"   data-act="quiz">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª Quiz me</button>
      <button class="btn btn-ghost"   data-act="showall">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ Show all</button>
    </div>
    <div id="varList" class="space-y-2"></div>
    <div id="varQuiz" class="hidden mt-4 p-3 border rounded"></div>
  `;
    root.appendChild(box);
    // Clean any stray encoding artifacts in control labels
    try {
      const setText = (sel, txt) => { const el = box.querySelector(sel); if (el) el.textContent = txt; };
      setText('[data-act="play"]', 'Play');
      setText('[data-act="pause"]', 'Pause');
      setText('[data-act="prev"]', 'Prev');
      setText('[data-act="next"]', 'Next');
    } catch {}
    // Ensure toolbar labels are clean on initial render
    try {
      const s = box.querySelector('[data-act="shuffle"]'); if (s) s.textContent = 'Shuffle';
      const qz = box.querySelector('[data-act="quiz"]'); if (qz) qz.textContent = 'Quiz me';
      const all = box.querySelector('[data-act="showall"]'); if (all) all.textContent = 'Show all';
    } catch {}
    function __sanitizeVariationsUI() {
      try {
        const box = q(map?.containers?.list)?.querySelector('.lesson-item');
        if (!box) return;
        const sh = box.querySelector('[data-act="shuffle"]'); if (sh) sh.textContent = 'Shuffle';
        const qz = box.querySelector('[data-act="quiz"]'); if (qz) qz.textContent = 'Quiz me';
        const sa = box.querySelector('[data-act="showall"]'); if (sa) sa.textContent = 'Show all';
        (box.querySelectorAll('button[data-jp]') || []).forEach(b => { b.textContent = 'Listen'; });
        // Clean quiz option labels to ASCII prefix
        (q(map?.containers?.list)?.querySelectorAll('#varQuiz button[data-i]') || []).forEach(btn => {
          const span = btn.querySelector('span'); const roma = span ? span.textContent : '';
          let jp = (btn.textContent || '').replace(roma,'').trim();
          const m = jp && jp.match(/[\u3040-\u30FF\u4E00-\u9FFF].*/);
          if (m) jp = m[0];
          if (span) { const spanHTML = span.outerHTML; btn.innerHTML = `- ${jp}${spanHTML}`; }
          else { btn.textContent = `- ${jp}`; }
        });
      } catch {}
    }

    const list = box.querySelector('#varList');
    const quiz = box.querySelector('#varQuiz');
    // Keep button labels clean inside variations list
    const sanitizeList = () => {
      try { (list?.querySelectorAll('[data-jp]') || []).forEach(b => b.textContent = 'Listen'); } catch {}
    };
    try { sanitizeList(); new MutationObserver(sanitizeList).observe(list, { childList: true, subtree: true }); } catch {}

    function renderList(arr) {
      list.innerHTML = "";
      arr.forEach(v => {
        const line = document.createElement('div');
        line.className = "p-3 rounded border border-gray-200";
        line.innerHTML = `
        <div class="text-xs text-gray-500">${(v.tags || []).join(' ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ') || 'general'}</div>
        <div class="font-medium">${v.jp}</div>
        <div class="text-gray-500">${v.romaji || ''}</div>
        <div class="text-gray-600">${v.en || ''}</div>
        <div class="mt-1">
          <button class="btn btn-amber" data-jp="${v.jp}">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â  Listen</button>
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
      const distract = pick(items.filter(v => v !== correct), 2);
      const options = pick([correct, ...distract], 3);

      quiz.innerHTML = `
      <div class="font-medium mb-2">Pick the best phrase for: <em>${targetTag || 'this situation'}</em></div>
      <div class="grid gap-2">
        ${options.map((o, i) => `
          <button class="btn btn-ghost text-left" data-i="${i}">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${o.jp}
            <span class="block text-xs text-gray-500">${o.romaji || ''}</span>
          </button>`).join('')}
      </div>
      <div class="mt-2 text-sm text-gray-600">${correct.en || ''}</div>
    `;
      // Sanitize option labels
      try {
        const sanitizeQuiz = () => {
          [...quiz.querySelectorAll('button[data-i]')].forEach(btn => {
            const span = btn.querySelector('span'); const roma = span ? span.textContent : '';
            let jp = (btn.textContent || '').replace(roma,'').trim();
            const m = jp && jp.match(/[\u3040-\u30FF\u4E00-\u9FFF].*/);
            if (m) jp = m[0];
            if (span) { const spanHTML = span.outerHTML; btn.innerHTML = `- ${jp}${spanHTML}`; } else { btn.textContent = `- ${jp}`; }
          });
        };
        sanitizeQuiz(); new MutationObserver(sanitizeQuiz).observe(quiz, { childList: true, subtree: true });
      } catch {}

      [...quiz.querySelectorAll('[data-i]')].forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.i);
          const chosen = options[idx];
          const ok = chosen === correct;
          feedback(map, ok ? 'Nice choice!' : 'Not quite — listen again and try another.', ok);
          mascotPulse && mascotPulse(ok ? 'mascot-celebrate' : 'mascot-confused', ok ? 1200 : 800);
          if (ok) setTimeout(startQuiz, 600);
        });
      });
    }

    // controls
    const pageSize = Math.max(1, Math.floor(step?.manga?.pageSize ?? 6));
    box.querySelector('[data-act="shuffle"]').addEventListener('click', () => {
      renderList(pick(items, Math.min(pageSize, items.length)));
      quiz.classList.add('hidden'); list.classList.remove('hidden');
    });
    box.querySelector('[data-act="showall"]').addEventListener('click', () => {
      renderList(items);
      quiz.classList.add('hidden'); list.classList.remove('hidden');
    });
    box.querySelector('[data-act="quiz"]').addEventListener('click', startQuiz);

    renderList(pick(items, Math.min(pageSize, items.length)));
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
      <button class="btn btn-primary" data-act="play">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¶ Play</button>
      <button class="btn btn-ghost"   data-act="pause">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ Pause</button>
      <button class="btn btn-ghost"   data-act="prev">ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Prev</button>
      <button class="btn btn-dark"    data-act="next">Next ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡</button>
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
    function __sanitizeVariationsUI() {
      try {
        const box = q(map?.containers?.list)?.querySelector('.lesson-item');
        if (!box) return;
        const sh = box.querySelector('[data-act="shuffle"]'); if (sh) sh.textContent = 'Shuffle';
        const qz = box.querySelector('[data-act="quiz"]'); if (qz) qz.textContent = 'Quiz me';
        const sa = box.querySelector('[data-act="showall"]'); if (sa) sa.textContent = 'Show all';
        (box.querySelectorAll('button[data-jp]') || []).forEach(b => { b.textContent = 'Listen'; });
        // Clean quiz option labels to ASCII prefix
        (q(map?.containers?.list)?.querySelectorAll('#varQuiz button[data-i]') || []).forEach(btn => {
          const span = btn.querySelector('span'); const roma = span ? span.textContent : '';
          let jp = (btn.textContent || '').replace(roma,'').trim();
          const m = jp && jp.match(/[\u3040-\u30FF\u4E00-\u9FFF].*/);
          if (m) jp = m[0];
          if (span) { const spanHTML = span.outerHTML; btn.innerHTML = `- ${jp}${spanHTML}`; }
          else { btn.textContent = `- ${jp}`; }
        });
      } catch {}
    }

    const list = box.querySelector('#sceneList');
    const auto = box.querySelector('#sceneAuto');
    const showR = box.querySelector('#sceneShowRomaji');

    // Render lines
    segs.forEach((g, i) => {
      const line = document.createElement('div');
      line.className = "p-3 rounded border border-gray-200";
      line.dataset.idx = String(i);
      line.innerHTML = `
      <div class="text-xs text-gray-500">${g.speaker} ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ${g.lang === 'ja' ? 'Japanese' : 'English'}</div>
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

    setStatus(map, 'Guided conversation: try a short reply.');
    box.innerHTML = `
      <div class="mb-2 text-sm text-gray-600">Guided conversation: practice a short exchange.</div>
      <div class="text-sm text-gray-700 mb-2">${topic ? `Topic: ${topic}` : ''} ${level ? `(${level})` : ''}</div>
      ${seedJP ? `
      <div class="mb-3">
        <div class="${map?.classes?.jp || 'jp'}">${seedJP}</div>
        ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || 'romaji'}">${seedRomaji}</div>` : ``}
        <div class="mt-2 flex items-center gap-2">
          <button class="btn btn-ghost" data-act="speak-seed">Speak</button>
          <button class="btn btn-ghost" data-act="use-seed">Use as my reply</button>
        </div>
      </div>` : ''}
      <div class="mb-2">
        <label class="block text-sm text-gray-600 mb-1">Your reply</label>
        <textarea id="gcInput" class="field w-full min-h-[90px]" placeholder="Type a short reply in Japanese or English..."></textarea>
      </div>
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-primary" data-act="speak-mine">Speak my reply</button>
        <button class="btn btn-ghost" data-act="clear">Clear</button>
      </div>
      ${suggestions.length ? `
      <div class="mt-2">
        <div class="text-sm text-gray-600 mb-1">Quick ideas</div>
        <div id="gcIdeas" class="space-y-1">
          ${suggestions.map(s => `
          <button class="btn btn-ghost w-full text-left" data-jp="${s.jp}">
            <div class="${map?.classes?.jp || 'jp'}">${s.jp}</div>
            ${map?.flags?.showRomaji && s.romaji ? `<div class="${map?.classes?.romaji || 'romaji'}">${s.romaji}</div>` : ``}
            ${s.en ? `<div class="${map?.classes?.en || 'en'} text-gray-600">${s.en}</div>` : ``}
          </button>`).join('')}
        </div>
      </div>` : ''}
      <div class="${map?.classes?.hint || 'hint'} text-sm text-gray-600 mt-2">Write a short reply. Press Next when ready.</div>
    `;
    root.appendChild(box);

    const input = box.querySelector('#gcInput');
    const seedSpeakBtn = box.querySelector('[data-act="speak-seed"]');
    const useSeedBtn = box.querySelector('[data-act="use-seed"]');
    const speakMineBtn = box.querySelector('[data-act="speak-mine"]');
    const clearBtn = box.querySelector('[data-act="clear"]');

    if (seedSpeakBtn && seedJP) seedSpeakBtn.addEventListener('click', () => Speech.speak(seedJP, map?.speech || {}));
    if (useSeedBtn && input) useSeedBtn.addEventListener('click', () => { input.value = seedJP || seedRomaji; input.focus(); });
    if (speakMineBtn && input) speakMineBtn.addEventListener('click', () => {
      const text = input.value || '';
      if (!text.trim()) { feedback(map, 'Type a reply first.', false); return; }
      let toSpeak = text;
      try { if (window.wanakana && /^[\x20-\x7E]+$/.test(text)) toSpeak = wanakana.toHiragana(text); } catch {}
      Speech.speak(toSpeak, map?.speech || {});
      feedback(map, 'Speaking your reply…', true);
    });
    if (clearBtn && input) clearBtn.addEventListener('click', () => { input.value = ''; input.focus(); });

    box.querySelectorAll('#gcIdeas [data-jp]').forEach(btn => {
      btn.addEventListener('click', () => {
        const jp = btn.getAttribute('data-jp') || '';
        if (input) { input.value = jp; input.focus(); }
        Speech.speak(jp, map?.speech || {});
      });
    });

    setStatus(map, 'Guided conversation: try a short reply.');
    feedback(map, '', true);
    document.dispatchEvent(new Event('lesson:rendered'));
  }

  // ---------- cloze as tile-drag game ----------
  function renderClozeTiles(lesson, step, map) {
    const listEl = q(map?.containers?.list);
    if (!listEl) return;
    listEl.innerHTML = "";

    // Pool of possible tiles (for decoys)
    const poolBlanks = Array.from(new Set((step.items || []).flatMap(x => x.blanks || [])));

    (step.items || []).forEach((it) => {
      const s = (lesson.sentences || []).find((x) => x.sid === it.ref);
      if (!s) return;
      let jp = s.jp || "";
      (it.blanks || []).forEach((b) => {
        const hole = `<span class="drop inline-flex items-center min-w-[4rem] px-2 py-1 border-2 border-dashed rounded align-middle mr-1" data-answer="${b}">
  <input type="hidden" data-answer="${b}" />
  <span class="placeholder opacity-50">____</span>
</span>`;
        jp = jp.replace(b, hole);
      });

      const block = document.createElement('div');
      block.className = map?.classes?.item || 'lesson-item';
      block.innerHTML = `
        <div class="${map?.classes?.prompt || 'prompt'}">${s.en || ''}</div>
        <div class="${map?.classes?.jp || 'jp'}">${jp}</div>
        ${map?.flags?.showRomaji ? `<div class="${map?.classes?.romaji || 'romaji'}">${s.romaji_full || ''}</div>` : ''}
        <div class="${map?.classes?.hint || 'hint'} text-sm text-amber-700 mt-1"></div>
        <div class="mt-2 flex items-center gap-3 text-sm text-gray-600" data-ui="hud">
          <span>Moves: <b data-ui="moves"></b></span>
          <span>Score: <b data-ui="score"></b></span>
          <span class="text-amber-600" data-ui="combo"></span>
          <span class="ml-auto"></span>
          <button class="btn btn-ghost btn-sm" data-act="shuffle">Shuffle</button>
          <button class="btn btn-ghost btn-sm" data-act="hint">Hint</button>
          <button class="btn btn-ghost btn-sm" data-act="reset">Reset</button>
        </div>
      `;
      listEl.appendChild(block);

      const drops = Array.from(block.querySelectorAll('.drop[data-answer]'));
      const rack = document.createElement('div');
      rack.className = 'mt-2 flex flex-wrap gap-2';
      block.appendChild(rack);

      // Make a tile set: all answers for this sentence plus a few decoys
      const tileSet = new Set(drops.map(d => d.dataset.answer));
      const decoys = poolBlanks.filter(x => !tileSet.has(x));
      while (tileSet.size < Math.max(drops.length + 2, drops.length) && decoys.length) {
        const j = Math.floor(Math.random() * decoys.length);
        tileSet.add(decoys.splice(j,1)[0]);
      }
      const tiles = Array.from(tileSet);
      for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }

      const toRoma = (txt) => { try { const r = sentenceReadingHira({ jp: txt }); return window.wanakana ? wanakana.toRomaji(r) : ''; } catch { return ''; } };
      // Simple SFX helper
      const SFX = (type) => { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const ctx = SFX._ctx || (SFX._ctx = new AC()); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); g.gain.value = 0.05; o.type = 'sine'; o.frequency.value = type==='ok' ? 880 : 220; const now = ctx.currentTime; o.start(now); o.stop(now + 0.12); } catch {} };

      // HUD state
      let moves = Math.max(drops.length + 2, drops.length);
      let score = 0;
      let combo = 0;
      const elMoves = block.querySelector('[data-ui="moves"]');
      const elScore = block.querySelector('[data-ui="score"]');
      const elCombo = block.querySelector('[data-ui="combo"]');
      const hintEl = block.querySelector(`.${map?.classes?.hint || 'hint'}`);
      const updateHud = () => {
        if (elMoves) elMoves.textContent = String(moves);
        if (elScore) elScore.textContent = String(score);
        if (elCombo) elCombo.textContent = combo > 1 ? `Combo x${combo}` : '';
      };
      updateHud();

      const allFilled = () => drops.every(d => d.classList.contains('filled'));

      const place = (dz, text, sourceBtn) => {
        const ans = dz.dataset.answer || '';
        const ok = text === ans;
        if (ok) {
          dz.textContent = text;
          dz.classList.add('border-green-400','filled');
          const hidden = dz.querySelector('input[data-answer]'); if (hidden) hidden.value = text;
          if (sourceBtn) sourceBtn.disabled = true;
          combo += 1; score += 100 * (combo); SFX('ok'); updateHud();
          feedback(map, 'Nice!', true);
          if (allFilled()) {
            feedback(map, 'Sentence complete!', true);
          }
        } else {
          moves = Math.max(0, moves - 1); combo = 0; updateHud(); SFX('bad');
          dz.classList.add('animate-pulse'); setTimeout(()=>dz.classList.remove('animate-pulse'), 400);
          feedback(map, moves ? 'Not yet — try another tile.' : 'Out of moves! Press Reset or use Hint.', false);
        }
      };

      tiles.forEach(txt => {
        const b = document.createElement('button');
        b.className = 'btn btn-ghost tile';
        b.textContent = txt;
        b.setAttribute('draggable','true');
        b.dataset.jp = txt;
        const roma = toRoma(txt); if (roma) b.title = roma; // hover shows romaji
        b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', txt); e.dataTransfer.effectAllowed='move'; b.classList.add('opacity-60'); });
        b.addEventListener('dragend', () => b.classList.remove('opacity-60'));
        b.addEventListener('click', () => { const dz = drops.find(d => !d.classList.contains('filled')); if (dz) place(dz, txt, b); });
        rack.appendChild(b);
      });

      drops.forEach(dz => {
        dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('bg-amber-50'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('bg-amber-50'));
        dz.addEventListener('drop', (e) => {
          e.preventDefault(); dz.classList.remove('bg-amber-50');
          const text = e.dataTransfer.getData('text/plain');
          const btn = Array.from(rack.querySelectorAll('button.tile')).find(b => (b.dataset.jp||'')===text);
          place(dz, text, btn);
        });
      });

      // HUD actions
      const reshuffle = () => {
        const items = Array.from(rack.children);
        for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); rack.insertBefore(items[j], items[i]); const tmp = items[i]; items[i] = items[j]; items[j] = tmp; }
      };
      const showHint = () => {
        const dz = drops.find(d => !d.classList.contains('filled'));
        if (!dz) return;
        dz.classList.add('ring-2','ring-amber-400'); setTimeout(()=>dz.classList.remove('ring-2','ring-amber-400'), 800);
        const k = dz.dataset.answer || '';
        const roma = toRoma(k);
        if (hintEl) hintEl.textContent = roma ? `Hint: ${k} (${roma})` : `Hint: ${k}`;
      };
      const resetBlock = () => {
        drops.forEach(d => { d.textContent = '____'; d.classList.remove('filled','border-green-400'); const h=d.querySelector('input[data-answer]'); if (h) h.value=''; });
        rack.querySelectorAll('button.tile').forEach(b => b.disabled = false);
        moves = Math.max(drops.length + 2, drops.length); combo = 0; updateHud();
        if (hintEl) hintEl.textContent='';
      };
      const btnShuffle = block.querySelector('[data-act="shuffle"]'); if (btnShuffle) btnShuffle.addEventListener('click', reshuffle);
      const btnHint = block.querySelector('[data-act="hint"]'); if (btnHint) btnHint.addEventListener('click', showHint);
      const btnReset = block.querySelector('[data-act="reset"]'); if (btnReset) btnReset.addEventListener('click', resetBlock);
    });

    setStatus(map, 'Drag tiles into the blanks. Hover a tile to see its romaji.');
    feedback(map, '', true);
  }

  // ---------- guided conversation ----------
  function renderGuidedConvo(lesson, step, map) {
    const root = q(map?.containers?.list); if (!root) return;
    root.innerHTML = "";

    const topic = step?.topic || "";
    const level = step?.level ? String(step.level).toUpperCase() : "";
    const seed = step?.seed || "";
    let seedJP = seed;
    try { if (window.wanakana && seed && /^[\x20-\x7E]+$/.test(seed)) seedJP = wanakana.toHiragana(seed); } catch {}

    const suggestions = (lesson?.sentences || []).slice(0, 3).map(s => {
      const reading = sentenceReadingHira(s);
      const romaji = (window.wanakana && reading) ? wanakana.toRomaji(reading) : "";
      return { jp: s?.jp || "", en: s?.en || "", romaji };
    });

    const box = document.createElement('div');
    box.className = map?.classes?.item || 'lesson-item';
    box.innerHTML = `
      <div class="mb-2 text-sm text-gray-600">Guided conversation</div>
      <div class="text-sm text-gray-700 mb-2">${topic ? `Topic: ${topic}` : ''} ${level ? `(${level})` : ''}</div>
      ${seedJP ? `
      <div class="mb-3">
        <div class="${map?.classes?.jp || 'jp'}">${seedJP}</div>
        <div class="mt-2 flex items-center gap-2">
          <button class="btn btn-ghost" data-act="speak-seed">Speak</button>
          <button class="btn btn-ghost" data-act="use-seed">Use as my reply</button>
        </div>
      </div>` : ''}
      <div class="mb-2">
        <label class="block text-sm text-gray-600 mb-1">Your reply</label>
        <textarea id="gcInput" class="field w-full min-h-[90px]" placeholder="Type a short reply in Japanese or English..."></textarea>
      </div>
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-primary" data-act="speak-mine">Speak my reply</button>
        <button class="btn btn-ghost" data-act="clear">Clear</button>
      </div>
      ${suggestions.length ? `
      <div class="mt-2">
        <div class="text-sm text-gray-600 mb-1">Quick ideas</div>
        <div id="gcIdeas" class="space-y-1">
          ${suggestions.map(s => `
          <button class="btn btn-ghost w-full text-left" data-jp="${s.jp}">
            <div class="${map?.classes?.jp || 'jp'}">${s.jp}</div>
            ${s.romaji ? `<div class="${map?.classes?.romaji || 'romaji'}">${s.romaji}</div>` : ``}
            ${s.en ? `<div class="${map?.classes?.en || 'en'} text-gray-600">${s.en}</div>` : ``}
          </button>`).join('')}
        </div>
      </div>` : ''}
      <div class="${map?.classes?.hint || 'hint'} text-sm text-gray-600 mt-2">Write a short reply. Press Next when ready.</div>
    `;
    root.appendChild(box);

    const input = box.querySelector('#gcInput');
    const seedSpeakBtn = box.querySelector('[data-act="speak-seed"]');
    const useSeedBtn = box.querySelector('[data-act="use-seed"]');
    const speakMineBtn = box.querySelector('[data-act="speak-mine"]');
    const clearBtn = box.querySelector('[data-act="clear"]');

    if (seedSpeakBtn && seedJP) seedSpeakBtn.addEventListener('click', () => Speech.speak(seedJP, map?.speech || {}));
    if (useSeedBtn && input) useSeedBtn.addEventListener('click', () => { input.value = seedJP || seed; input.focus(); });
    if (speakMineBtn && input) speakMineBtn.addEventListener('click', () => {
      const text = input.value || '';
      if (!text.trim()) { feedback(map, 'Type a reply first.', false); return; }
      let toSpeak = text;
      try { if (window.wanakana && /^[\x20-\x7E]+$/.test(text)) toSpeak = wanakana.toHiragana(text); } catch {}
      Speech.speak(toSpeak, map?.speech || {});
      feedback(map, 'Speaking your reply…', true);
    });
    if (clearBtn && input) clearBtn.addEventListener('click', () => { input.value = ''; input.focus(); });

    box.querySelectorAll('#gcIdeas [data-jp]').forEach(btn => {
      btn.addEventListener('click', () => {
        const jp = btn.getAttribute('data-jp') || '';
        if (input) { input.value = jp; input.focus(); }
        Speech.speak(jp, map?.speech || {});
      });
    });

    setStatus(map, 'Guided conversation: try a short reply.');
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
        // Accept kana reading for ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“ if typed as ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢
        const acceptAlt = /ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“/.test(expected) && H.toHira(got) === "ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢";
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

      // Accept: exact JP OR same reading as sentence romaji
      const readingKana = sentenceReadingHira(s); // e.g., ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢
      const correct =
        norm(s.jp || "") === norm(got) ||
        H.toHira(got) === readingKana ||
        (s.romaji_full && H.toHira(s.romaji_full) === H.toHira(got));


      if (inp) {
        inp.classList.toggle(map?.classes?.ok || "ok", correct);
        inp.classList.toggle(map?.classes?.bad || "bad", !correct);
      }
      hintEl.textContent = correct ? "" : H.makeHint(s.jp || "", got, s);
      if (!correct) allOk = false;
    });
    feedback(map, allOk ? "Nice — perfect translations!" : "Check the highlighted answers.", allOk);
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
    // Remove disabled/duplicate pages (e.g., variations_disabled)
    const steps = (lesson.steps || []).filter(s => s && s.type !== 'variations_disabled');

    const sentences = Array.isArray(lesson?.sentences) ? lesson.sentences : [];
    const findSentence = (sid) => sentences.find((x) => x.sid === sid);
    const toRomajiSafe = (text) => {
      if (!text) return '';
      try { return (window.wanakana && text) ? wanakana.toRomaji(text) : ''; } catch { return ''; }
    };
    const fromSentence = (entry) => entry ? {
      phrase: entry.jp || '',
      romaji: entry.romaji_full || toRomajiSafe(entry.jp || ''),
      english: entry.en || ''
    } : null;
    const fromVariant = (entry = {}) => {
      const phrase = entry.jp || entry.phrase || '';
      if (!phrase) return null;
      return {
        phrase,
        romaji: entry.romaji || toRomajiSafe(phrase),
        english: entry.en || entry.english || ''
      };
    };
    const collectStageStages = () => {
      const seen = new Set();
      const stages = [];
      const pushSentence = (sid) => {
        if (!sid) return;
        const entry = findSentence(sid);
        const data = fromSentence(entry);
        if (data && data.phrase && !seen.has(data.phrase)) {
          seen.add(data.phrase);
          stages.push(data);
        }
      };
      const pushVariantStage = (entry) => {
        const data = fromVariant(entry);
        if (data && data.phrase && !seen.has(data.phrase)) {
          seen.add(data.phrase);
          stages.push(data);
        }
      };
      const firstStep = steps[0] || {};
      if (Array.isArray(firstStep.item_refs)) firstStep.item_refs.forEach(pushSentence);
      if (Array.isArray(firstStep.items)) firstStep.items.forEach(item => pushSentence(item && item.ref));
      if (Array.isArray(firstStep.pairs)) firstStep.pairs.forEach(pushVariantStage);
      if (Array.isArray(firstStep.variations)) firstStep.variations.forEach(pushVariantStage);
      if (!stages.length) {
        (sentences || []).forEach(entry => {
          const data = fromSentence(entry);
          if (data && data.phrase && !seen.has(data.phrase)) {
            seen.add(data.phrase);
            stages.push(data);
          }
        });
      }
      return stages;
    };

    function updateSliceContext() {
      let data = null;
      const step = steps[state.stepIndex] || {};
      if (Array.isArray(step.item_refs) && step.item_refs.length) {
        data = fromSentence(findSentence(step.item_refs[0]));
      } else if (Array.isArray(step.items) && step.items.length) {
        const first = step.items[0];
        data = fromSentence(findSentence(first && first.ref));
      } else if (Array.isArray(step.pairs) && step.pairs.length) {
        data = fromVariant(step.pairs[0]);
      } else if (Array.isArray(step.variations) && step.variations.length) {
        data = fromVariant(step.variations[0]);
      } else if (step.seed) {
        data = {
          phrase: step.seed,
          romaji: toRomajiSafe(step.seed),
          english: step.topic || ''
        };
      }
      if (!data || !data.phrase) {
        data = fromSentence(sentences[0]) || data;
      }
      if ((!data || !data.phrase) && typeof document !== 'undefined') {
        const fallback = document.querySelector('#jp-text .jp');
        if (fallback) {
          const phrase = fallback.textContent.trim();
          const englishEl = document.querySelector('#jp-text .en');
          const english = englishEl ? englishEl.textContent.trim() : '';
          data = {
            phrase,
            romaji: toRomajiSafe(phrase),
            english
          };
        }
      }
      const valid = (data && typeof data.phrase === 'string' && data.phrase.trim()) ? data : null;
      const stages = collectStageStages();
      let payload = null;
      if (valid) {
        payload = Object.assign({}, valid, { stages });
      } else if (stages.length) {
        payload = Object.assign({}, stages[0], { stages });
      } else {
        payload = valid;
      }
      try { window.__kanaSliceSource = payload; } catch { window.__kanaSliceSource = payload; }
    }
    try { window.__kanaSliceSource = null; } catch {}

    const render = () => {
      const step = steps[state.stepIndex] || {};
      // Update step header (page title per step)
      try {
        const header = q('#stepHeader');
        if (header) {
          const names = {
            read_listen: 'Read & Listen',
            cloze: 'Cloze',
            translate_to_jp: 'Translate to Japanese',
            variations: 'Variations',
            variations_disabled: 'Variations',
            phrase_drill: 'Phrase Drill',
            dialogue: 'Mini-scene',
            roleplay: 'Roleplay',
            guided_convo: 'Guided Convo',
            reflect: 'Reflect'
          };
          const key = step.type || '';
          const title = (step.title || names[key] || key || 'Step');
          const i = state.stepIndex + 1;
          header.textContent = `Page ${i}/${steps.length} — ${title}`;
        }
      } catch {}
      switch (step.type) {
        case "read_listen": renderReadListen(lesson, step, map); break;
        case "cloze": renderClozeTiles(lesson, step, map); break;
        case "translate_to_jp": map?.flags?.syllableMode ? renderTranslateSyllables(lesson, step, map)
          : renderTranslate(lesson, step, map); break;
        case "roleplay": renderRoleplay(lesson, step, map); break;
        case "dialogue": renderBilingualScene(lesson, step, map); break;
        case "variations": renderVariations(lesson, step, map); break;
        case "guided_convo": renderGuidedConvo(lesson, step, map); break;
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
      updateSliceContext();

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
      if (label) label.textContent = `${rate.toFixed(1)}x`;
    };

    // NEW: handle slider input
    const onSpeed = (e) => {
      const v = parseFloat(e?.target?.value);
      const rate = Number.isFinite(v) ? v : 1;
      map.speech = Object.assign({}, map.speech, { rate });
      const label = q(map?.controls?.speedVal);
      if (label) label.textContent = `${rate.toFixed(1)}x`;
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










