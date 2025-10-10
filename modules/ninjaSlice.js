﻿﻿﻿﻿﻿export function initNinjaSlice(config) {
  const {
    containerId,
    canvasId,
    closeBtnId,
    overlayId,

    scoreElId,
    timerElId,
    kanaContainerId,
    romajiContainerId,
    englishContainerId,
    phrase = "",
    romaji = "",
    english = "",
    phrases = [],
    // Tunables
    heightRatio = 0.5,              // canvas height relative to container
    spawnMsStart = 800,              // initial spawn interval
    spawnMsEnd = 350,                // faster over time
    roundSeconds = 60,               // total round time
    bombChance = 0.15,               // probability a spawn is a bomb
    speedMin = 1.2,
    speedMax = 2.4,
    comboWindowMs = 600,             // max gap between slices to continue combo
  } = config;

  // grab elements
  const overlay = document.getElementById(overlayId);
  const container = document.getElementById(containerId);
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const closeBtn = document.getElementById(closeBtnId);
  const scoreEl = document.getElementById(scoreElId);
  const timerEl = document.getElementById(timerElId);
  const kanaEl = document.getElementById(kanaContainerId);
  const romajiEl = document.getElementById(romajiContainerId);
  const englishEl = document.getElementById(englishContainerId);
  const overPanel = config.gameOverId ? document.getElementById(config.gameOverId) : null;
  const tryBtn = config.tryBtnId ? document.getElementById(config.tryBtnId) : null;
  const finishBtn = config.finishBtnId ? document.getElementById(config.finishBtnId) : null;
  const bubblesToggle = config.bubblesToggleId ? document.getElementById(config.bubblesToggleId) : null;
  const progressEl = config.progressElId ? document.getElementById(config.progressElId) : null;
  const progressBar = config.progressBarId ? document.getElementById(config.progressBarId) : null;
  // Speak toggle
  const speakCtl = document.getElementById("slice-speak");
  let speakOnSlice = speakCtl ? !!speakCtl.checked : true;
  if (speakCtl) speakCtl.addEventListener("change", ()=>{ speakOnSlice = !!speakCtl.checked; });
  const comboMeter = document.getElementById('slice-combo-meter');
  const comboMeterFill = comboMeter ? document.getElementById('slice-combo-meter-fill') : null;
  const feverLabel = document.getElementById('slice-fever-label');
  const holder = canvas.parentElement || container;
  if (holder && holder.style && (!holder.style.position || holder.style.position === '')) {
    holder.style.position = 'relative';
  }
  // Intro shading disabled as per request — keep a no-op spotlight helper
  const introDim = null;
  function updateIntroSpotlight(){
    try {
      if (!container || !introDim) return; // no-op
      const wrap = container.getBoundingClientRect();
      const els = [];
      // Prefer spotlight targets in this order
      const elHelp = document.getElementById('slice-instructions');
      if (elHelp) els.push(elHelp);
      // Stage reveal overlay (large phrase at start)
      const prebanner = document.getElementById('slice-prebanner-phrase');
      if (prebanner) els.push(prebanner);
      // Memory cue wrap (flipping tiles before stage)
      const memWrap = document.getElementById('slice-memory-wrap');
      if (memWrap) els.push(memWrap);
      // Fallback to the static bottom kana row if nothing else
      const bottomKana = document.getElementById('slice-kana');
      if (els.length === 0 && bottomKana) els.push(bottomKana);
      const holes = [];
      els.forEach(el => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const padX = 10, padY = 10; // breathing room around highlights
        const x = Math.max(0, (r.left - wrap.left) - padX);
        const y = Math.max(0, (r.top  - wrap.top)  - padY);
        const w = Math.min(wrap.width,  r.width  + padX*2);
        const h = Math.min(wrap.height, r.height + padY*2);
        holes.push({ x, y, w, h, rx: 12, ry: 12 });
      });
      const W = Math.max(1, Math.round(wrap.width));
      const H = Math.max(1, Math.round(wrap.height));
      const rects = holes.map(h => `<rect x="${Math.max(0, Math.round(h.x))}" y="${Math.max(0, Math.round(h.y))}" width="${Math.max(1, Math.round(h.w))}" height="${Math.max(1, Math.round(h.h))}" rx="${h.rx}" ry="${h.ry}" fill="black"/>`).join('');
      const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
  <defs>
    <mask id="introMask">
      <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
      ${rects}
    </mask>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="#000" opacity="0.80" mask="url(#introMask)"/>
</svg>`;
      // no-op: shading removed
    } catch {}
  }
  // No shading; listener retained but function is no-op
  try { window.addEventListener('resize', updateIntroSpotlight, { passive:true }); } catch {}
  // Ensure key elements render above overlays without changing layout
  try {
    const helpEl = document.getElementById('slice-instructions');
    if (helpEl) { helpEl.style.zIndex = '70'; /* keep CSS positioning (absolute) */ }
    const kanaElTop = document.getElementById('slice-kana');
    if (kanaElTop) { kanaElTop.style.zIndex = '70'; }
  } catch {}
  function computeUiScale(){
    try{
      const r = holder.getBoundingClientRect();
      const w = Math.max(0, Math.floor(r.width || window.innerWidth || 0));
      if (w <= 360) return 0.62;
      if (w <= 420) return 0.7;
      if (w <= 520) return 0.8;
      if (w <= 768) return 0.9;
      return 1.0;
    }catch{ return 1.0; }
  }
  let uiScale = computeUiScale();
  let KANA_RADIUS = Math.round(42 * uiScale);
  let BOMB_RADIUS = Math.round(32 * uiScale);
  let stageIndex = 0;
  let stageData = [];
  let roundActive = false;
  let spawnStartTime = 0;
  let spawnScheduledAt = 0;
  let nextSpawnDelay = spawnMsStart;
  let isPaused = false;
  let pauseTimeoutId = null;
  let currentPauseState = null;
  let scheduleNext = () => {};

  // Tunables (fallbacks)
  const launchBoost = Number((config && config.launchBoost) ?? 1.0);
  const gravity = Number((config && config.gravity) ?? 0.02);
  // Bubble spin behavior
  const bubbleSpinStyle = (config && config.bubbleSpinStyle) ? String(config.bubbleSpinStyle) : 'upright'; // 'upright' | 'flip' | 'none'
  const bubbleSpinSpeed = Math.max(0, Number((config && config.bubbleSpinSpeed) ?? 1.0));
  // Quiz Burst config
  const quizMode = !!(config && config.quizMode);
  const quizShowPrompt = (config && Object.prototype.hasOwnProperty.call(config,'quizShowPrompt')) ? !!config.quizShowPrompt : true;
  const quizChoices = Math.max(2, Math.min(6, Number((config && config.quizChoices) ?? 4)));
  // Memory mode (speak + flipping tiles before stage)
  const memoryCue = !!(config && config.memoryCue);
  // Sequence mode (target one kana at a time, in order)
  const sequenceMode = !!(config && config.sequenceMode);
  // Free-for-All (coin bonus) config
  const ffaEnabled = !!(config && config.freeForAllEnabled);
  const ffaSeconds = Math.max(1, Number((config && config.ffaSeconds) ?? 5));
  const ffaSpawnRateBoost = Math.max(1, Number((config && config.ffaSpawnRateBoost) ?? 2.0));
  const ffaBombs = !!(config && config.ffaBombs);
  const coinPerKana = Math.max(0, Number((config && config.coinPerKana) ?? 1));
  // Face styles
  const bubbleFaceStyle = String(((config && config.bubbleFaceStyle) || 'embossed')).toLowerCase(); // flat|embossed|engraved
  const coinFaceStyle = String(((config && config.coinFaceStyle) || 'embossed')).toLowerCase();
  // FFA coin face style (uses same `coinFaceStyle` for now)
  // Slice showcase (zoom/spin + coin swoop) toggle
  const sliceShowcaseEnabled = (config && config.sliceShowcaseEnabled) !== false; // default on
  const sliceShowcasePronounceRomaji = !!(config && config.sliceShowcasePronounceRomaji); // default off
  const sliceShowcaseDurationMs = Math.max(400, Number((config && config.sliceShowcaseDurationMs) ?? 900));
  // Stage banner cascade reveal
  const stageCascadeRevealEnabled = (config && config.stageCascadeRevealEnabled) !== false; // default on
  const stageCascadeStepMs = Math.max(20, Number((config && config.stageCascadeStepMs) ?? 60));
  // Normal-mode distractors (noise) — increase challenge without quiz mode
  const noiseSpawnChance = Math.max(0, Math.min(0.6, Number((config && config.noiseSpawnChance) ?? 0.12)));
  const noisePenalty = Math.max(0, Number((config && config.noisePenalty) ?? 50));
  const NOISE_KANA = (config && Array.isArray(config.noiseKana) && config.noiseKana.length)
    ? config.noiseKana
    : ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ','た','ち','つ','て','と','な','に','ぬ','ね','の','は','ひ','ふ','へ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん'];
  // Power-ups (Stage 4)
  const powerUpsEnabled = (config && config.powerUpsEnabled) !== false;
  const powerSpawnChance = Math.max(0, Math.min(0.4, Number((config && config.powerSpawnChance) ?? 0.07)));
  let powerFreezeMs = Math.max(1000, Number((config && config.powerFreezeMs) ?? 6000));
  const powerDoubleMs = Math.max(1000, Number((config && config.powerDoubleMs) ?? 8000));
  const powerWeights = Object.assign({ freeze: 1, shield: 1, double: 1 }, (config && config.powerWeights) || {});
  // Timer + failure handling
  const timerPerStage = !!(config && config.timerPerStage);
  const bombEndsRound = !!(config && config.bombEndsRound);

  // ---- Free-for-All (FFA) game state ----
  const MODE_NORMAL = 'normal';
  const MODE_FFA = 'freeForAll';
  let mode = MODE_NORMAL;        // current round mode
  let coinCount = 0;             // coins collected (incremented during FFA)
  let ffaEndsAt = 0;             // timestamp when FFA ends
  let ffaReadyAt = 0;            // until this time, input is gated
  // Power-up effect timers
  let freezeUntil = 0;           // slow gravity/spawns until
  let doubleUntil = 0;           // double points until
  let shieldCount = 0;           // number of shield charges
  const coinFx = [];             // coin particles (rendered later via fxCanvas)
  const sliceFx = [];            // sliced-kana showcase animations
  let lastFFAAward = 0;          // used for stage banner summary
  // Wallet-driven upgrades
  let coinMultiplier = 1;
  try {
    fetch('/api/wallet', { cache:'no-store' })
      .then(r=>r.json())
      .then(j=>{
        const owned = (j && j.owned) || {};
        if (owned['upgrade-coin-boost']) coinMultiplier = 2;
        if (owned['upgrade-freeze-plus']) powerFreezeMs = Math.round(powerFreezeMs * 1.5);
        if (owned['upgrade-shield-start']) shieldCount = Math.max(shieldCount|0, 1);
      }).catch(()=>{});
  } catch {}
  // Persistent coin bank across rounds (page-level)
  let coinBank = 0;
  try { const saved = Number(localStorage.getItem('sliceCoinBank') || '0'); coinBank = isFinite(saved) ? Math.max(0, Math.floor(saved)) : 0; } catch {}
  // Simple bonus overlay (text only for the wiring step)
  const bonusOverlay = document.createElement('div');
  bonusOverlay.style.position = 'absolute';
  bonusOverlay.style.inset = '0';
  bonusOverlay.style.display = 'none';
  bonusOverlay.style.alignItems = 'center';
  bonusOverlay.style.justifyContent = 'center';
  bonusOverlay.style.pointerEvents = 'none';
  bonusOverlay.style.zIndex = '80';
  bonusOverlay.style.background = 'rgba(0,0,0,0.35)';
  bonusOverlay.innerHTML = '<div style="color:#fff; font:700 20px system-ui, sans-serif; background:rgba(0,0,0,0.35); padding:8px 12px; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,0.35)">Collect all the coins!</div>';
  holder.appendChild(bonusOverlay);
  // Coin counter + countdown inside the status bar if present
  const statusBar = document.getElementById('slice-status');
  // Persistent bank display (matches Score/Time styling)
  const bankEl = document.createElement('div');
  bankEl.id = 'slice-coin-bank';
  bankEl.style.display = '';
  bankEl.style.background = 'transparent';
  bankEl.style.padding = '0';
  bankEl.style.border = 'none';
  bankEl.innerHTML = '<div class="flex flex-col gap-1">\
    <span class="text-[11px] uppercase tracking-wide text-amber-900/70">Coins</span>\
    <span id="slice-coin-bank-val" class="font-semibold text-lg tracking-wide">0</span>\
  </div>';
  const coinCounterEl = document.createElement('div');
  coinCounterEl.id = 'slice-coin-counter';
  coinCounterEl.style.display = 'none';
  coinCounterEl.style.padding = '4px 8px';
  coinCounterEl.style.borderRadius = '10px';
  coinCounterEl.style.background = 'rgba(255,255,255,0.9)';
  coinCounterEl.style.border = '1px solid rgba(245,158,11,0.4)';
  coinCounterEl.style.color = '#111827';
  coinCounterEl.style.font = '600 13px system-ui, sans-serif';
  coinCounterEl.textContent = 'Coins: 0';
  const countdownEl = document.createElement('div');
  countdownEl.id = 'slice-ffa-countdown';
  countdownEl.style.display = 'none';
  countdownEl.style.padding = '4px 8px';
  countdownEl.style.borderRadius = '10px';
  countdownEl.style.background = 'rgba(255,255,255,0.9)';
  countdownEl.style.border = '1px solid rgba(245,158,11,0.4)';
  countdownEl.style.color = '#92400e';
  countdownEl.style.font = '700 13px system-ui, sans-serif';
  countdownEl.textContent = String(ffaSeconds);
  try {
    if (statusBar) {
      // layout: score | time | combo | bank | coins | countdown
      statusBar.appendChild(bankEl);
      statusBar.appendChild(coinCounterEl);
      statusBar.appendChild(countdownEl);
      // Power-up badges
      const badge = (id, text, bg, color) => {
        const el = document.createElement('div');
        el.id = id; el.textContent = text; el.className = 'slice-badge';
        el.style.padding = '2px 8px'; el.style.borderRadius = '9999px';
        el.style.marginLeft = '6px'; el.style.font = '700 11px system-ui, sans-serif';
        el.style.background = bg; el.style.color = color; el.style.border = '1px solid rgba(0,0,0,0.1)';
        el.style.display = 'none'; return el;
      };
      window.__freezeBadge = badge('slice-freeze-badge', 'Freeze', '#e0f2fe', '#0c4a6e');
      // Remove x2 badge text; keep element hidden for layout safety
      window.__doubleBadge = badge('slice-double-badge', '', '#fee2e2', '#7f1d1d');
      window.__doubleBadge.style.display = 'none';
      window.__shieldBadge = badge('slice-shield-badge', 'Shield', '#dcfce7', '#064e3b');
      statusBar.appendChild(window.__freezeBadge);
      statusBar.appendChild(window.__doubleBadge);
      statusBar.appendChild(window.__shieldBadge);
    } else {
      // fallback: pin to top-left in holder
      bankEl.style.position = 'absolute';
      bankEl.style.left = '12px';
      bankEl.style.top = '8px';
      coinCounterEl.style.position = 'absolute';
      coinCounterEl.style.left = '12px';
      coinCounterEl.style.top = '38px';
      countdownEl.style.position = 'absolute';
      countdownEl.style.right = '12px';
      countdownEl.style.top = '8px';
      holder.appendChild(bankEl);
      holder.appendChild(coinCounterEl);
      holder.appendChild(countdownEl);
      // badges fallback top-left
      const place = (el, x, y) => { el.style.position='absolute'; el.style.left=x; el.style.top=y; holder.appendChild(el); };
      window.__freezeBadge = document.createElement('div'); window.__freezeBadge.textContent='Freeze'; place(window.__freezeBadge,'12px','58px');
      window.__doubleBadge = document.createElement('div'); window.__doubleBadge.textContent=''; place(window.__doubleBadge,'80px','58px'); window.__doubleBadge.style.display='none';
      window.__shieldBadge = document.createElement('div'); window.__shieldBadge.textContent='Shield'; place(window.__shieldBadge,'110px','58px');
      [window.__freezeBadge, window.__doubleBadge, window.__shieldBadge].forEach(el=>{ el.style.display='none'; el.style.padding='2px 8px'; el.style.border='1px solid rgba(0,0,0,0.1)'; el.style.borderRadius='9999px'; el.style.background='#fff'; el.style.font='700 11px system-ui, sans-serif'; });
    }
  } catch {}

  function updateCoinBankUI(){
    try { const v = document.getElementById('slice-coin-bank-val'); if (v) v.textContent = String(coinBank); } catch {}
    try { localStorage.setItem('sliceCoinBank', String(Math.max(0, coinBank|0))); } catch {}
    try {
      fetch('/api/wallet/sync', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ coins: Math.max(0, coinBank|0) }) }).catch(()=>{});
    } catch {}
  }
  // Hook reset action from menu when present
  try {
    const menuReset = document.getElementById('slice-bank-reset');
    menuReset?.addEventListener('click', () => {
      try {
        const ok = window.confirm ? window.confirm('Reset total coins?') : true;
        if (!ok) return;
      } catch {}
      coinBank = 0; updateCoinBankUI();
    });
  } catch {}
  function startFreeForAll(){
    try {
      if (!ffaEnabled || mode === MODE_FFA) { if (typeof flashFullMapping === 'function') flashFullMapping(); completeStage(); return; }
      mode = MODE_FFA;
    coinCount = 0;
    ffaEndsAt = performance.now() + (ffaSeconds * 1000);
    ffaReadyAt = performance.now() + 1000; // wait 1s before accepting input
    // Purge any non-FFA tiles (e.g., leftover kana/noise/power) to avoid stray interactions
    try {
      for (let i = tiles.length - 1; i >= 0; i--) {
        const tt = tiles[i];
        if (!tt) continue;
        if (!tt.ffa) tiles.splice(i, 1);
      }
    } catch {} // wait 1s before accepting input
      // Remove any existing bombs from the board to avoid interference
      try { for (let i = tiles.length - 1; i >= 0; i--) { if (tiles[i] && tiles[i].type === 'bomb') tiles.splice(i, 1); } } catch {}
      bonusOverlay.style.display = 'flex';
      coinCounterEl.style.display = '';
      countdownEl.style.display = '';
      // Hide message after the short intro gate
      setTimeout(() => { try { if (mode === MODE_FFA) bonusOverlay.style.display = 'none'; } catch {} }, 1000);
      setTimeout(() => finishFreeForAll(), Math.max(500, ffaSeconds * 1000));
    } catch { completeStage(); }
  }
  function launchCoinSwoop(award, onDone){
    try {
      const now = performance.now();
      const awardSafe = Math.max(0, Math.floor(award || 0));
      const n = Math.min(12, Math.max(6, Math.round(Math.min(awardSafe, 30) / 2)));
      const tx = Math.max(24, viewW - 36);
      const ty = 24;
      for (let i = 0; i < n; i++) {
        const delay = i * 60;
        const startAt = now + delay;
        coinFx.push({ mode:'swoop', sx: Math.random()*viewW, sy: (viewH*0.5) + Math.random()*(viewH*0.5), tx, ty, born: startAt, dur: 600 });
      }
      setTimeout(()=>{ try { SFX('coin'); } catch {}; onDone && onDone(); }, Math.round((n*60) + 620));
    } catch { onDone && onDone(); }
  }
  function finishFreeForAll(){
    try {
      mode = MODE_NORMAL;
      bonusOverlay.style.display = 'none';
      countdownEl.style.display = 'none';
      // Keep coin counter visible until after swoop completes
      // Clear any remaining FFA tiles by mutating the array (preserve reference)
      try {
        for (let i = tiles.length - 1; i >= 0; i--) {
          if (!tiles[i]) continue;
          if (tiles[i].ffa || tiles[i].type === 'bomb') tiles.splice(i, 1);
        }
      } catch {}
    } catch {}
    // Run a quick swoop animation to the top-right, then tally + stage banner
    const award = Math.max(0, Math.floor(coinCount * coinMultiplier));
    lastFFAAward = award;
    launchCoinSwoop(award, () => {
      try { coinCounterEl.style.display = 'none'; } catch {}
      // add to persistent bank and update UI
      try { coinBank = Math.max(0, (coinBank|0) + award); } catch { coinBank += award; }
      updateCoinBankUI();
      coinCount = 0; // avoid double-adding if finish is called again by any guard
      if (typeof flashFullMapping === 'function') flashFullMapping();
      completeStage();
    });
  }
  // ---- Quiz helpers ----
  let quizActive = false;
  let quizGroups = [];
  let quizIndex = 0;
  let quizWaveId = 0;
  // Speed/Difficulty controls
  const speedCtl = document.getElementById('slice-speed');
  const diffCtl = document.getElementById('slice-diff');
  let speedScale = 1.0;
  let difficulty = 'normal';
  function readSpeed() {
    const v = parseFloat(speedCtl?.value || '1');
    speedScale = isFinite(v) && v > 0 ? v : 1.0;
  }
  function readDifficulty() {
    const v = (diffCtl?.value || 'normal').toLowerCase();
    difficulty = (v === 'easy' || v === 'hard') ? v : 'normal';
  }
  function getCueHoldMs(){
    // Longer hold for slower speeds, shorter for faster
    // Base ~1600ms at Normal; clamp between 600ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“2400ms
    const base = 1600;
    const hold = Math.round(base / Math.max(0.5, speedScale));
    return Math.max(600, Math.min(2400, hold));
  }
  function diffVyBoost(){ return difficulty === 'easy' ? 0.95 : (difficulty === 'hard' ? 1.25 : 1.0); }
  function diffSpawnExtra(){ return (!quizMode && difficulty === 'hard'); }
  function getQuizChoices(){
    if (!quizMode) return 0;
    if (difficulty === 'easy') return Math.max(2, Math.min(6, 3));
    if (difficulty === 'hard') return Math.max(2, Math.min(6, 5));
    return Math.max(2, Math.min(6, quizChoices));
  }
  try { readSpeed(); readDifficulty(); speedCtl?.addEventListener('change', readSpeed); diffCtl?.addEventListener('change', readDifficulty); } catch {}


  // Progress UI updater
  function updateProgressUI(){
    try {
      if (progressEl) {
        const total = Math.max(1, (chars && chars.length) ? chars.length : 0);
        // Show only per-stage progress to avoid duplicate fractions with the stage banner
        progressEl.textContent = `(${sliced.size}/${total})`;
      }
      if (progressBar) {
        const total = Math.max(1, (chars && chars.length) ? chars.length : 0);
        const pct = Math.max(0, Math.min(100, Math.round((sliced.size/total)*100)));
        progressBar.style.width = pct + '%';
      }
    } catch {}
  }
  // Combo badge
  const comboBadge = document.getElementById('slice-combo');
  if (comboBadge) comboBadge.classList.add('opacity-0');
  let comboHideTimer = null;
  function flashCombo(){
    if (!comboBadge) return;
    comboBadge.textContent = `x${combo}`;
    comboBadge.classList.remove('opacity-0');
    comboBadge.style.opacity = '1';
    clearTimeout(comboHideTimer);
    comboHideTimer = setTimeout(()=>{ comboBadge.style.opacity = '0'; }, 500);
  }
  function resetComboBadge(){ if (comboBadge) { comboBadge.style.opacity = '0'; comboBadge.classList.add('opacity-0'); } }
  if (!overlay || !container || !canvas || !ctx || !closeBtn
    || !scoreEl || !timerEl || !kanaEl || !romajiEl || !englishEl) {
    console.warn("initNinjaSlice: missing DOM nodes");
    return;
  }

  // populate text areas
  let chars = [];
  let original = [];
  let sliced = new Set();
  function buildKanaDisplay(){
    try{
      kanaEl.innerHTML = chars.map((ch, i) => {
        // map item
        const done = sliced && sliced.has ? sliced.has(i) : false;
        const cls = done ? "text-emerald-600 font-semibold underline" : "";
        const content = done ? ch : "_";
        return `<span data-idx="${i}" class="kana-ch ${cls}" style="display:inline-block; min-width:1.6em; text-align:center; border:1px solid #e5e7eb; border-radius:6px; padding:2px 4px; margin:0 2px; transition: all .18s">${content}</span>`;
      }).join("");
    }catch{ kanaEl.textContent = chars.join(""); }
  }
  // Simple TTS helper (pronounce kana using ja-JP voice if available)
  function speakKana(text) {
    try {
      if (!window.speechSynthesis || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 1.0;
      u.pitch = 1.0;
      try { window.speechSynthesis.cancel(); } catch {}
      window.speechSynthesis.speak(u);
    } catch {}
  }
  // Briefly emphasize the full mapping (romaji + English) with a glow/scale
  function flashFullMapping(holdMs = 1500){
    try {
      const els = [romajiEl, englishEl].filter(Boolean);
      els.forEach(el => {
        el.style.willChange = 'transform, opacity, background-color, box-shadow, filter';
        el.style.transition = 'transform .35s ease, opacity .35s ease, background-color .35s ease, box-shadow .35s ease, filter .35s ease';
        el.style.opacity = '1';
        el.style.background = 'rgba(255, 248, 196, 0.8)';
        el.style.padding = '2px 6px';
        el.style.borderRadius = '6px';
        el.style.boxShadow = '0 0 0px rgba(0,0,0,0), 0 0 18px rgba(255,215,0,0.65)';
        el.style.filter = 'brightness(1.05)';
        el.style.transform = 'scale(1.15)';
        if (!el.style.position) el.style.position = 'relative';
        el.style.zIndex = '2000';
      });
      setTimeout(()=>{
        els.forEach(el => {
          el.style.transform = 'scale(1)';
          el.style.background = '';
          el.style.boxShadow = '';
          el.style.filter = '';
          el.style.zIndex = '';
        });
      }, holdMs);
    } catch {}
  }
    function toRomaStr(s){ try { return (window.wanakana ? wanakana.toRomaji(s) : ''); } catch { return ''; } }
  const SMALL_YOON = new Set(["\u3083","\u3085","\u3087","\u30E3","\u30E5","\u30E7"]);
function groupForIndex(idx){
    const c = chars[idx];
    const prev = chars[idx-1];
    const next = chars[idx+1];
    if (SMALL_YOON.has(c) && idx>0) return [idx-1, idx];
    if (SMALL_YOON.has(next)) return [idx, idx+1];
    return [idx];
  }
  // Build mora groups for the current phrase (ordered, no duplicates)
  function buildMoraGroups(){
    const groups = [];
    const seen = new Set();
    for (let i = 0; i < chars.length; i++) {
      if (seen.has(i)) continue;
      const g = groupForIndex(i);
      g.forEach(ix => seen.add(ix));
      groups.push(g);
    }
    return groups;
  }
  // Sequence mode state and helpers
  let seqIndex = 0;
  let seqMistake = false;
  let seqStreak = 0;
  function targetGroup(){ try { return (quizGroups && quizGroups[seqIndex]) || []; } catch { return []; } }
  function targetText(){ try { return (targetGroup()||[]).map(i => (chars[i] || '')).join(''); } catch { return ''; } }
  function ensurePromptForSequence(){ try { const tg = targetText(); if (tg){ setQuizPrompt(`Slice: ${toRomaStr(tg) || tg}`); } } catch {} }
  // Bottom-row target pulse styling
  let targetPulseStyleAdded = false;
  function addTargetPulseCss(){
    if (targetPulseStyleAdded) return;
    try {
      const style = document.createElement('style');
      style.textContent = `@keyframes slicePulse{0%,100%{box-shadow:0 0 0 rgba(0,0,0,0)}50%{box-shadow:0 0 16px rgba(255,215,0,0.9)}} .slice-target-pulse{animation:slicePulse .6s linear infinite}`;
      (document.head || holder || document.body).appendChild(style);
      targetPulseStyleAdded = true;
    } catch {}
  }
  function updateBottomTargetHighlight(){
    try{
      const spans = kanaEl.querySelectorAll('.kana-ch');
      spans.forEach(s => s.classList && s.classList.remove('slice-target-pulse'));
      if (!sequenceMode) return;
      const tg = (typeof targetGroup === 'function') ? (targetGroup() || []) : [];
      if (!Array.isArray(tg) || !tg.length) return;
      addTargetPulseCss();
      tg.forEach(i => {
        const span = kanaEl.querySelector(`[data-idx="${i}"]`);
        if (span && span.classList) span.classList.add('slice-target-pulse');
      });
    }catch{}
  }
  // Extend prompt to also update highlight
  const _ensurePromptOrig = ensurePromptForSequence;
  ensurePromptForSequence = function(){ try { _ensurePromptOrig && _ensurePromptOrig(); } catch {} updateBottomTargetHighlight(); };
  // Small floating romaji bubble
  const romaBubble = document.createElement('div');
  romaBubble.className = 'absolute pointer-events-none bg-black text-white text-xs px-2 py-1 rounded opacity-0 transition-opacity duration-300';
  holder.appendChild(romaBubble);
  function showRomaAt(x, y, text) {
    try {
      if (!bubblesOn) return;
      const rCanvas = canvas.getBoundingClientRect();
      const rHolder = holder.getBoundingClientRect();
      romaBubble.textContent = text || '';
      const left = (rCanvas.left - rHolder.left) + x;
      const top = (rCanvas.top - rHolder.top) + y;
      romaBubble.style.left = left + 'px';
      romaBubble.style.top = top + 'px';
      romaBubble.style.opacity = '1';
      setTimeout(()=>{ romaBubble.style.opacity = '0'; }, 800);
    } catch {}
  }
  const pauseOverlay = document.createElement('div');
  pauseOverlay.style.position = 'absolute';
  pauseOverlay.style.inset = '0';
  pauseOverlay.style.display = 'flex';
  pauseOverlay.style.alignItems = 'center';
  pauseOverlay.style.justifyContent = 'center';
  pauseOverlay.style.pointerEvents = 'none';
  pauseOverlay.style.background = 'rgba(0, 0, 0, 0.35)';
  pauseOverlay.style.color = '#fff';
  pauseOverlay.style.fontSize = '2.4rem';
  pauseOverlay.style.fontWeight = '600';
  pauseOverlay.style.letterSpacing = '0.08em';
  pauseOverlay.style.textShadow = '0 4px 12px rgba(0,0,0,0.55)';
  pauseOverlay.style.transition = 'opacity 0.2s ease';
  pauseOverlay.style.opacity = '0';
  pauseOverlay.style.zIndex = '30';
  pauseOverlay.textContent = '';
  holder.appendChild(pauseOverlay);

  // Prompt UI (top-center) for quiz/sequence targets
  let quizPromptEl = document.getElementById('slice-quiz-prompt') || document.createElement('div');
  quizPromptEl.id = 'slice-quiz-prompt';
  // Inline pill, placed in the header row (left side)
  quizPromptEl.style.position = 'static';
  // Constrain so it sits neatly to the left of the icons
  quizPromptEl.style.maxWidth = 'calc(100% - 88px)'; // ~ two 36px icons + gaps
  quizPromptEl.style.whiteSpace = 'nowrap';
  quizPromptEl.style.overflow = 'hidden';
  quizPromptEl.style.textOverflow = 'ellipsis';
  quizPromptEl.style.background = 'rgba(255,255,255,0.92)';
  quizPromptEl.style.color = '#111827';
  quizPromptEl.style.padding = '6px 10px';
  quizPromptEl.style.borderRadius = '10px';
  quizPromptEl.style.border = '1px solid rgba(245,158,11,0.5)';
  quizPromptEl.style.boxShadow = '0 6px 16px rgba(0,0,0,0.14)';
  quizPromptEl.style.font = '700 14px system-ui, sans-serif';
  quizPromptEl.style.letterSpacing = '.02em';
  quizPromptEl.style.pointerEvents = 'none';
  quizPromptEl.textContent = '';
  // Attach to header if present, else fallback to holder
  try {
    const host = document.getElementById('slice-header') || document.getElementById('slice-quiz-prompt-host');
    if (host && !quizPromptEl.parentElement) {
      host.insertBefore(quizPromptEl, host.firstChild || null);
    } else if (!quizPromptEl.parentElement) {
      holder.appendChild(quizPromptEl);
    }
  } catch { if (!quizPromptEl.parentElement) holder.appendChild(quizPromptEl); }

  // Add a subtle pulse animation for extra prominence
  (function addPromptPulse(){
    try{
      const style = document.createElement('style');
      style.textContent = `@keyframes promptPulse{0%{transform:translateX(-50%) scale(1); box-shadow:0 6px 20px rgba(0,0,0,0.18)}50%{transform:translateX(-50%) scale(1.03); box-shadow:0 10px 26px rgba(0,0,0,0.22)}100%{transform:translateX(-50%) scale(1); box-shadow:0 6px 20px rgba(0,0,0,0.18)}}`;
      (document.head||holder||document.body).appendChild(style);
    }catch{}
  })();

  function positionQuizPrompt(){ /* no-op: prompt is inline with header */ }

  function positionInstructions(){
    try{
      const el = document.getElementById('slice-instructions');
      if (!el) return;
      const rHolder = holder.getBoundingClientRect();
      const status = document.getElementById('slice-status');
      const closeBtn = document.getElementById('slice-close');
      const controlsWrap = closeBtn ? closeBtn.parentElement : null;
      let bottom = 0;
      if (status){ const r1 = status.getBoundingClientRect(); bottom = Math.max(bottom, r1.bottom); }
      if (controlsWrap){ const r2 = controlsWrap.getBoundingClientRect(); bottom = Math.max(bottom, r2.bottom); }
      const pad = 36; // push well below bars/prompt for visibility
      if (bottom > 0){
        const y = Math.max(48, Math.round(bottom - rHolder.top + pad));
        el.style.top = y + 'px';
        el.style.zIndex = '60'; // above prompt (30) and below fever toast (70)
        el.style.pointerEvents = 'none';
      }
    }catch{}
  }

  // Fever toast (Stage 2)
  let feverToast = document.getElementById('slice-fever-toast') || document.createElement('div');
  feverToast.id = 'slice-fever-toast';
  feverToast.style.position = 'absolute';
  feverToast.style.left = '50%';
  feverToast.style.top = '96px';
  feverToast.style.transform = 'translateX(-50%)';
  feverToast.style.padding = '10px 16px';
  feverToast.style.borderRadius = '9999px';
  feverToast.style.background = 'linear-gradient(90deg,#f59e0b,#f43f5e)';
  feverToast.style.color = '#fff';
  feverToast.style.font = '800 18px system-ui, sans-serif';
  feverToast.style.letterSpacing = '.03em';
  feverToast.style.boxShadow = '0 10px 28px rgba(0,0,0,0.25)';
  feverToast.style.opacity = '0';
  feverToast.style.pointerEvents = 'none';
  feverToast.textContent = 'FEVER';
  feverToast.style.zIndex = '70';
  if (!feverToast.parentElement) holder.appendChild(feverToast);
  (function addFeverToastAnim(){ try{ const st=document.createElement('style'); st.textContent='@keyframes feverPop{0%{opacity:0;transform:translateX(-50%) scale(.9)}15%{opacity:1;transform:translateX(-50%) scale(1.05)}60%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) scale(1)} }'; (document.head||holder||document.body).appendChild(st);}catch{}})();
  let feverToastTimer=null;
  function showFeverToast(){
    try{
      clearTimeout(feverToastTimer);
      feverToast.style.opacity='1';
      feverToast.style.animation='feverPop 1200ms ease-out 1';
      feverToastTimer=setTimeout(()=>{feverToast.style.opacity='0'; feverToast.style.animation='';}, 1200);
    }catch{}
  }

  // Stage-complete overlay (medallion banner)
  const stageOverlay = document.createElement('div');
  stageOverlay.style.position = 'absolute';
  stageOverlay.style.inset = '0';
  stageOverlay.style.display = 'none';
  stageOverlay.style.alignItems = 'center';
  stageOverlay.style.justifyContent = 'center';
  stageOverlay.style.background = 'rgba(0,0,0,0.45)';
  stageOverlay.style.zIndex = '60';
  stageOverlay.style.pointerEvents = 'auto';
  stageOverlay.innerHTML = `
    <div id="slice-stage-medallion" style="display:flex;flex-direction:column;align-items:center;gap:.5rem;">
      <div style="width:220px;height:220px;border-radius:50%;background:radial-gradient(circle at 30% 30%, #fff7d6, #f5c86b 60%, #b7791f);box-shadow:0 12px 28px rgba(0,0,0,.35), inset 0 6px 12px rgba(255,255,255,.6); border: 4px solid rgba(180, 83, 9, .85); display:flex;align-items:center;justify-content:center;">
        <div style="text-align:center;color:#7c2d12;text-shadow:0 2px 0 rgba(255,255,255,.5);font-weight:800;">
          <div id="slice-stage-title" style="font-size:18px;letter-spacing:.05em;margin-bottom:.1rem;">You completed phrase</div>
          <div id="slice-stage-number" style="font-size:42px;letter-spacing:.03em;">1</div>
        </div>
      </div>
      <div id="slice-stage-phrase" style="font-size:22px;font-weight:700;color:#fff; text-shadow:0 2px 8px rgba(0,0,0,.6);"></div>
      <div id="slice-stage-romaji" style="font-size:16px;color:#fde68a; text-shadow:0 1px 6px rgba(0,0,0,.6);"></div>
      <div id="slice-stage-en" style="font-size:15px;color:#e5e7eb; text-shadow:0 1px 6px rgba(0,0,0,.6);"></div>
      <div id="slice-stage-coins" style="font-size:15px;color:#fde68a; text-shadow:0 1px 6px rgba(0,0,0,.6);"></div>
      <div id="slice-stage-stats" style="font-size:14px;color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.65);"></div>
      <button id="slice-stage-next" class="btn btn-primary" style="margin-top:.25rem;">Continue</button>
    </div>`;
  holder.appendChild(stageOverlay);
  
  // Pre-banner phrase reveal overlay (full-screen blackout + big cascading phrase)
  const revealOverlay = document.createElement('div');
  revealOverlay.id = 'slice-reveal-ov';
  revealOverlay.style.position = 'absolute';
  revealOverlay.style.inset = '0';
  revealOverlay.style.display = 'none';
  revealOverlay.style.alignItems = 'center';
  revealOverlay.style.justifyContent = 'center';
  revealOverlay.style.background = 'radial-gradient(circle at center, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.95) 100%)';
  revealOverlay.style.zIndex = '65';
  revealOverlay.style.pointerEvents = 'auto';
  holder.appendChild(revealOverlay);

  function presentStageReveal(phraseText, romajiText, onDone) {
    try {
      const phrase = (phraseText || '').toString().trim().replace(/[\u3002\uFF0E\.]+/g, '');
      if (!phrase) { onDone && onDone(); return; }
      revealOverlay.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.textAlign = 'center';
      // Slight vignette card for contrast
      wrap.style.padding = Math.round(12 * Math.max(0.7, uiScale)) + 'px ' + Math.round(16 * Math.max(0.7, uiScale)) + 'px';
      wrap.style.borderRadius = '14px';
      wrap.style.background = 'rgba(0,0,0,0.15)';
      wrap.style.boxShadow = '0 14px 40px rgba(0,0,0,0.45), inset 0 4px 12px rgba(255,255,255,0.05)';
      revealOverlay.appendChild(wrap);

      const phraseEl = document.createElement('div');
      phraseEl.id = 'slice-prebanner-phrase';
      phraseEl.style.color = '#ffffff';
      phraseEl.style.fontWeight = '900';
      phraseEl.style.letterSpacing = '.02em';
      phraseEl.style.textShadow = '0 6px 22px rgba(0,0,0,0.6)';
      phraseEl.style.fontSize = 'clamp(42px, 9vw, 112px)';
      phraseEl.style.lineHeight = '1.05';

      const romaEl = document.createElement('div');
      romaEl.id = 'slice-prebanner-romaji';
      romaEl.style.marginTop = '10px';
      romaEl.style.color = '#fde68a';
      romaEl.style.fontWeight = '700';
      romaEl.style.textShadow = '0 4px 14px rgba(0,0,0,0.55)';
      romaEl.style.fontSize = 'clamp(18px, 2.6vw, 34px)';

      wrap.appendChild(phraseEl);
      wrap.appendChild(romaEl);

      const cascade = (el, text, stepMs) => {
        if (!el) return 0;
        const t = (text || '').toString().replace(/[\u3002\uFF0E\.]+/g, '');
        // If disabled, just set text and return minimal time
        if (!stageCascadeRevealEnabled || !t) { el.textContent = t; return 300; }
        el.textContent = '';
        const frag = document.createDocumentFragment();
        const chars = Array.from(t);
        for (let i = 0; i < chars.length; i++) {
          const span = document.createElement('span');
          span.textContent = chars[i];
          span.style.opacity = '0';
          span.style.display = 'inline-block';
          span.style.transform = 'translateY(14px)';
          span.style.transition = 'opacity 320ms ease, transform 320ms ease';
          span.style.transitionDelay = String(i * Math.max(10, stepMs)) + 'ms';
          frag.appendChild(span);
        }
        el.appendChild(frag);
        requestAnimationFrame(() => {
          const spans = el.querySelectorAll('span');
          spans.forEach(s => { s.style.opacity = '1'; s.style.transform = 'translateY(0)'; });
        });
        return (chars.length ? (chars.length - 1) * Math.max(10, stepMs) + 380 : 300);
      };

      revealOverlay.style.display = 'flex';
      try { updateIntroSpotlight(); } catch {}
      const romaText = (romajiText || '').toString();
      const tPhrase = cascade(phraseEl, phrase, Math.round(stageCascadeStepMs * 1.1));
      const tRoma = cascade(romaEl, romaText, Math.round(stageCascadeStepMs * 0.9));

      // Start speech while revealing
      try { speakJA(phrase).catch(()=>{}); } catch {}

      const hold = 600; // short hold after reveal completes
      const total = Math.max(tPhrase, tRoma) + hold;
      setTimeout(() => { revealOverlay.style.display = 'none'; onDone && onDone(); }, total);
    } catch { onDone && onDone(); }
  }
  function showStageBanner(number, phraseText, romajiText, englishText){
    try{
      const numEl = stageOverlay.querySelector('#slice-stage-number');
      const phEl = stageOverlay.querySelector('#slice-stage-phrase');
      const roEl = stageOverlay.querySelector('#slice-stage-romaji');
      const enEl = stageOverlay.querySelector('#slice-stage-en');
      const coEl = stageOverlay.querySelector('#slice-stage-coins');
      const stEl = stageOverlay.querySelector('#slice-stage-stats');
      if (numEl) numEl.textContent = String(number);
      // Cascading reveal for phrase/romaji
      const cascade = (el, text, stepMs) => {
        if (!el) return;
        const t = (text || '').toString().replace(/[\u3002\uFF0E\.]+/g, '');
        if (!stageCascadeRevealEnabled || !t) { el.textContent = t; return; }
        el.textContent = '';
        const frag = document.createDocumentFragment();
        const chars = Array.from(t);
        for (let i = 0; i < chars.length; i++) {
          const span = document.createElement('span');
          span.textContent = chars[i];
          span.style.opacity = '0';
          span.style.display = 'inline-block';
          span.style.transform = 'translateY(8px)';
          span.style.transition = 'opacity 260ms ease, transform 260ms ease';
          span.style.transitionDelay = String(i * Math.max(10, stepMs)) + 'ms';
          frag.appendChild(span);
        }
        el.appendChild(frag);
        requestAnimationFrame(() => {
          const spans = el.querySelectorAll('span');
          spans.forEach(s => { s.style.opacity = '1'; s.style.transform = 'translateY(0)'; });
        });
      };
      cascade(phEl, phraseText || '', stageCascadeStepMs);
      cascade(roEl, romajiText || '', Math.round(stageCascadeStepMs * 0.8));
      if (enEl) enEl.textContent = englishText || '';
      if (coEl) coEl.textContent = lastFFAAward > 0 ? `Coins +${lastFFAAward}` : '';
      if (stEl) {
        const tLeft = Math.max(0, Math.floor(timer));
        const feverTxt = feverSeen ? 'Fever ✓' : '';
        const comboTxt = maxCombo > 1 ? `Best Combo x${maxCombo}` : 'Best Combo x1';
        stEl.textContent = `${comboTxt} • Time Left ${tLeft}s${feverTxt?` • ${feverTxt}`:''}`;
      }
      stageOverlay.style.display = 'flex';
    }catch{}
  }
  function hideStageBanner(){
    try { stageOverlay.style.display = 'none'; } catch {}
  }
  // Memory cue overlay (shows tiles flipping the phrase)
  const memoryOverlay = document.createElement('div');
  memoryOverlay.id = 'slice-memory-ov';
  memoryOverlay.style.position = 'absolute';
  memoryOverlay.style.inset = '0';
  memoryOverlay.style.display = 'none';
  memoryOverlay.style.alignItems = 'center';
  memoryOverlay.style.justifyContent = 'center';
  // Darken the memory intro backdrop so the tiles stand out
  memoryOverlay.style.background = 'rgba(0,0,0,0.80)';
  memoryOverlay.style.zIndex = '50';
  holder.appendChild(memoryOverlay);
  function presentMemoryCue(onDone){
    try{
      const phraseText = (chars || []).join('');
      if (!phraseText) { onDone && onDone(); return; }
      // Build tiles container
      memoryOverlay.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.id = 'slice-memory-wrap';
      wrap.style.display = 'flex';
      wrap.style.gap = Math.round(10 * Math.max(0.7, uiScale)).toString() + 'px';
      wrap.style.padding = Math.round(12 * Math.max(0.7, uiScale)) + 'px ' + Math.round(16 * Math.max(0.7, uiScale)) + 'px';
      wrap.style.borderRadius = '12px';
      wrap.style.background = 'rgba(255,255,255,0.9)';
      wrap.style.boxShadow = '0 12px 30px rgba(0,0,0,0.25)';
      memoryOverlay.appendChild(wrap);
      const tiles = [];
      const s = Math.max(0.6, Math.min(1.0, uiScale * 0.95));
      const tw = Math.round(42 * s) + 'px';
      const th = Math.round(56 * s) + 'px';
      const tf = Math.round(28 * s) + 'px';
      for (let i = 0; i < chars.length; i++) {
        const tile = document.createElement('div');
        tile.textContent = chars[i];
        tile.style.width = tw; tile.style.height = th;
        tile.style.display = 'flex'; tile.style.alignItems = 'center'; tile.style.justifyContent = 'center';
        tile.style.font = `700 ${tf} system-ui, sans-serif`; tile.style.color = '#111827';
        tile.style.background = '#fde68a'; tile.style.border = '2px solid #b45309'; tile.style.borderRadius = '10px';
        tile.style.transform = 'scale(0.6) rotateX(90deg)'; tile.style.opacity = '0';
        tile.style.transition = 'transform 220ms ease, opacity 220ms ease';
        wrap.appendChild(tile); tiles.push(tile);
      }
      memoryOverlay.style.display = 'flex';
      try { updateIntroSpotlight(); } catch {}
      // Speak full phrase; start flipping tiles in sequence
      speakJA(phraseText).catch(()=>{});
      const step = 140; // ms between flips
      tiles.forEach((tile, idx) => {
        setTimeout(() => {
          tile.style.opacity = '1';
          tile.style.transform = 'scale(1) rotateX(0deg)';
        }, idx * step);
      });
      // Hold on the full phrase; duration tied to Speed control
      const hold = getCueHoldMs();
      const total = tiles.length ? (tiles.length - 1) * step + 450 + hold : 350 + hold;
      setTimeout(() => { memoryOverlay.style.display = 'none'; onDone && onDone(); }, total);
    } catch { onDone && onDone(); }
  }

  function speakJA(text, opts={}){
    return new Promise((resolve) => {
      try{
        if (!text || !window.speechSynthesis){ resolve(); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = 1.0; u.pitch = 1.0;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        try { window.speechSynthesis.cancel(); } catch {}
        window.speechSynthesis.speak(u);
        // Fallback timeout in case onend never fires
        setTimeout(()=>resolve(), Math.min(6000, Math.max(1500, (text||'').length*90)));
      }catch{ resolve(); }
    });
  }
  // Handle stage completion: pre-reveal + banner + advance or end
  function completeStage(){
    // Guard if already not active
    const completedStage = stageData[stageIndex] || { phrase: '', romaji: '', english: '' };
    const thisStageNumber = stageIndex + 1;
    pauseForStage();
    // Show pre-banner phrase reveal in the center, then banner
    setTimeout(() => {
      presentStageReveal(completedStage.phrase || '', (completedStage.romaji || ''), () => {
        showStageBanner(thisStageNumber, completedStage.phrase || '', (completedStage.romaji || ''), (completedStage.english || ''));
      });
    }, 200);
    let advanced = false;
    const proceed = () => {
      if (advanced) return; advanced = true;
      hideStageBanner();
      if (stageData && stageIndex < stageData.length - 1) {
        setStage(stageIndex + 1);
        if (memoryCue) {
          // Keep paused; present cue, then resume and start next stage
          presentMemoryCue(() => {
            resumeFromPause();
            if (quizMode) startQuiz();
          });
        } else {
          resumeFromPause();
          if (quizMode) startQuiz();
        }
      } else {
        resumeFromPause({ skipResume: true });
        endGame('clear');
      }
    };
    const btn = stageOverlay.querySelector('#slice-stage-next');
    if (btn) {
      btn.onclick = () => { try { window.speechSynthesis?.cancel(); } catch{} proceed(); };
    }
    // speech is handled during pre-banner reveal
  }
  let bubblesOn = true;
  if (bubblesToggle) {
    bubblesOn = !!bubblesToggle.checked;
    bubblesToggle.addEventListener('change', ()=>{ bubblesOn = !!bubblesToggle.checked; romaBubble.style.opacity = '0'; });
  }
  function showRomaForGroup(indices){
    const result = { romajiText: '', kanaText: '' };
    if (!Array.isArray(indices) || !indices.length) return result;
    try{
      result.kanaText = indices.map(i => (typeof i === 'number' && chars[i] !== undefined) ? chars[i] : '').join('');
      result.romajiText = toRomaStr(result.kanaText) || '';
      if (bubblesOn) {
        const anchorIdx = indices[indices.length - 1];
        const span = kanaEl.querySelector(`[data-idx="${anchorIdx}"]`);
        if (!span) return result;
        const r1 = span.getBoundingClientRect();
        const r0 = holder.getBoundingClientRect();
        const bubbleText = result.romajiText || result.kanaText;
        romaBubble.textContent = bubbleText;
        romaBubble.style.left = (r1.left - r0.left + r1.width / 2) + 'px';
        romaBubble.style.top = (r1.top - r0.top - 18) + 'px';
        romaBubble.style.opacity = '1';
        setTimeout(()=>{ romaBubble.style.opacity = '0'; }, 700);
      }
    }catch{}
    return result;
  }
  const normalizeStage = (entry = {}) => {
    const raw = (entry.phrase || entry.jp || '').trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½.]+$/u, '');
    const phraseClean = cleaned || raw;
    let romajiText = (entry.romaji || entry.romaji_full || entry.romajiFull || '').trim();
    if (!romajiText && typeof window !== 'undefined' && window.wanakana) {
      try { romajiText = window.wanakana.toRomaji(raw) || ''; } catch {}
    }
    const englishText = (entry.english || entry.en || '').trim();
    return { phrase: phraseClean, romaji: romajiText, english: englishText };
  };

  const stageListRaw = Array.isArray(phrases) ? phrases : [];
  stageData = [];
  const seenStages = new Set();
  const addStage = (entry) => {
    const normalized = normalizeStage(entry);
    if (normalized && !seenStages.has(normalized.phrase)) {
      seenStages.add(normalized.phrase);
      stageData.push(normalized);
    }
  };
  stageListRaw.forEach(addStage);
  addStage({ phrase, romaji, english });
  stageData = stageData.filter(stage => stage && stage.phrase);
  if (!stageData.length && (phrase || '').trim()) {
    const fallbackStage = normalizeStage({ phrase, romaji, english });
    if (fallbackStage) stageData.push(fallbackStage);
  }

  function setStage(index) {
    if (!stageData.length) return;
    stageIndex = Math.max(0, Math.min(index, stageData.length - 1));
    const stage = stageData[stageIndex] || { phrase: '', romaji: '', english: '' };
    const phraseText = (stage.phrase || '').toString();
    // Strip full stops (Japanese/ASCII) from phrase used for slicing to avoid blocking progression
    const phraseForPlay = phraseText.replace(/[\u3002\uFF0E\.]/g, '');
    chars = Array.from(phraseForPlay);
    original = chars.map((ch, i) => ({ char: ch, index: i }));
    sliced = new Set();
    if (typeof tiles !== 'undefined') { tiles.length = 0; }
    if (typeof popFx !== 'undefined') { popFx.length = 0; }
    buildKanaDisplay();
    maxCombo = 0; feverSeen = false; // reset per-stage stats
    const romajiText = stage.romaji || ((typeof window !== 'undefined' && window.wanakana && phraseForPlay) ? window.wanakana.toRomaji(phraseForPlay) : '');
    romajiEl.textContent = romajiText || '';
    englishEl.textContent = stage.english || '';
    if (progressBar) progressBar.style.width = '0%';
    combo = 0;
    lastSliceAt = 0;
    if (scoreEl) scoreEl.textContent = `${score}`;
    if (timerPerStage) { try { timer = roundSeconds|0; timerEl.textContent = String(timer); } catch {} }
    stopComboMeter();
    resetComboBadge();
    updateProgressUI();
    // Rebuild quiz groups for the new stage
    if (quizMode || sequenceMode) {
      quizGroups = buildMoraGroups();
      quizGroups = buildMoraGroups();
      // Reset sequence state for new stage
      seqIndex = 0; seqMistake = false; seqStreak = 0;
      ensurePromptForSequence();
      quizIndex = 0;
    }
    // Apply initial phrase visibility based on control
    try {
      const showCtl = document.getElementById('slice-showphrase');
      const show = !!(showCtl && showCtl.checked);
      const ids = ['slice-kana','slice-romaji','slice-en'];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.visibility = show ? 'visible' : 'hidden'; });
      showCtl?.addEventListener('change', () => {
        const showNow = !!showCtl.checked; ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.visibility = showNow ? 'visible' : 'hidden'; });
      });
    } catch {}
  }

  // create a second "trail" canvas on top, aligned with the game canvas

  const swordCursorData = 'data:image/svg+xml;base64,77u/PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmxhZGUiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2Y4ZjlmYiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNjZmQ2ZTYiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxnIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+CiAgICA8cGF0aCBkPSJNNCAyIEwxNSAxMyBMMTMgMTUgTDIgNCBaIiBmaWxsPSJ1cmwoI2JsYWRlKSIgc3Ryb2tlPSIjZGFkZmU5IiBzdHJva2Utd2lkdGg9IjEiLz4KICAgIDxwYXRoIGQ9Ik0xMyAxNSBMMTkgMjEiIHN0cm9rZT0iIzkwOTZhNiIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgICA8cGF0aCBkPSJNMTkgMjEgTDIyIDI0IiBzdHJva2U9IiNkNGIyNmEiIHN0cm9rZS13aWR0aD0iNCIvPgogICAgPHBhdGggZD0iTTIyIDI0IEwyNiAyOCIgc3Ryb2tlPSIjN2Y0MzFkIiBzdHJva2Utd2lkdGg9IjQiLz4KICAgIDxjaXJjbGUgY3g9IjI2IiBjeT0iMjgiIHI9IjIiIGZpbGw9IiM1ZTMxMTMiIHN0cm9rZT0iIzJmMTYwOCIgc3Ryb2tlLXdpZHRoPSIxIi8+CiAgPC9nPgo8L3N2Zz4NCg==';
  const swordCursor = 'url("' + swordCursorData + '") 10 4, auto';
  const cursorTargets = [canvas, holder, overlay];
  if (typeof document !== "undefined" && document.body) cursorTargets.push(document.body);
  const originalCursors = cursorTargets.map(el => (el && el.style ? el.style.cursor || '' : ''));
  function applySwordCursor(){
    cursorTargets.forEach(el => { if (el && el.style) el.style.cursor = swordCursor; });
  }
  function resetSwordCursor(){
    cursorTargets.forEach((el, idx) => { if (el && el.style) el.style.cursor = originalCursors[idx]; });
  }
  const trailCanvas = document.createElement("canvas");
  cursorTargets.push(trailCanvas);
  originalCursors.push(trailCanvas.style.cursor || '');
  trailCanvas.style.position = "absolute";
  trailCanvas.style.top = "0";
  trailCanvas.style.left = "0";
  trailCanvas.style.pointerEvents = "none";
  holder.appendChild(trailCanvas);
  const trailCtx = trailCanvas.getContext("2d");
  // Lightweight SFX helper (no external assets)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let _ac = null, _lastSwish = 0;
  function SFX(type){
    try{
      _ac = _ac || new AudioCtx();
      const ctx = _ac;
      if (type === 'slice'){
        const len = 0.18;
        const sr = ctx.sampleRate || 44100;
        const buffer = ctx.createBuffer(1, Math.floor(sr * len), sr);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const t = i / sr;
          const env = Math.pow(Math.max(0, 1 - t / len), 3);
          const wobble = 1 + Math.sin(t * Math.PI * 10) * 0.2;
          data[i] = (Math.random() * 2 - 1) * env * wobble;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1700;
        filter.Q.value = 0.9;
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + len);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
        noise.stop(now + len);

        const osc = ctx.createOscillator();
        const popGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + len);
        popGain.gain.setValueAtTime(0.24, now);
        popGain.gain.exponentialRampToValueAtTime(0.002, now + len);
        osc.connect(popGain);
        popGain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + len);
      } else if (type === 'swish'){
        const now = ctx.currentTime; if (now - _lastSwish < 0.05) return; _lastSwish = now;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='triangle'; o.frequency.value = 520; g.gain.value = 0.03;
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(now + 0.05);
      } else if (type === 'bomb'){
        const len = 0.25; const sr = 44100; const buf = ctx.createBuffer(1, sr*len, sr);
        const data = buf.getChannelData(0); for(let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * Math.exp(-i/(sr*0.1)); }
        const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.12;
        src.connect(g); g.connect(ctx.destination); src.start();
      } else if (type === 'coin'){
        const now = ctx.currentTime;
        const o1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        o1.type = 'square';
        o1.frequency.setValueAtTime(880, now);
        o1.frequency.exponentialRampToValueAtTime(1760, now + 0.08);
        g1.gain.setValueAtTime(0.06, now);
        g1.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
        o1.connect(g1); g1.connect(ctx.destination);
        o1.start(now); o1.stop(now + 0.12);
      } else if (type === 'fever'){
        const now = ctx.currentTime;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='sawtooth'; o.frequency.setValueAtTime(440, now);
        g.gain.setValueAtTime(0.04, now);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 0.25);
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(now + 0.25);
      } else if (type === 'power'){
        const now = ctx.currentTime; const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='triangle'; o.frequency.setValueAtTime(660, now); g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.0009, now + 0.18); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(now + 0.18);
      }
    }catch{}
  }
  //canvas.style.border = '2px solid red'; // Add this line for the main canvas
  //trailCanvas.style.border = '2px solid green'; // Add this line for the trail canvas

  // sizing helper (use CSS pixel space for simplicity)
  let viewW = 0, viewH = 0;
  function resize() {
    const rect = (holder.getBoundingClientRect ? holder.getBoundingClientRect() : container.getBoundingClientRect());
    const w = Math.max(320, Math.floor(rect.width));
    const hCss = Math.floor(rect.height || 0);
    const h = Math.max(200, hCss > 0 ? hCss : Math.floor(w * heightRatio));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w;
    canvas.height = h;
    // Recompute UI scale and radii for mobile sizing
    uiScale = computeUiScale();
    KANA_RADIUS = Math.round(42 * uiScale);
    BOMB_RADIUS = Math.round(32 * uiScale);
    trailCanvas.style.width = w + 'px';
    trailCanvas.style.height = h + 'px';
    trailCanvas.width = w;
    trailCanvas.height = h;
    viewW = w;
    viewH = h;
    alignTrail();
  }

  function alignTrail(){
    try{
      const rC = canvas.getBoundingClientRect();
      const rH = holder.getBoundingClientRect();
      const dx = Math.round(rC.left - rH.left);
      const dy = Math.round(rC.top - rH.top);
      trailCanvas.style.left = dx + 'px';
      trailCanvas.style.top  = dy + 'px';
    }catch{}
  }




  window.addEventListener("resize", resize);
  try { if ('ResizeObserver' in window) new ResizeObserver(()=>resize()).observe(holder); } catch {}
  // Keep prompt positioned after layout changes
  try {
    // Inline prompt doesn't need positioning, but keep a cheap call
    setTimeout(positionQuizPrompt, 0);
    window.addEventListener('resize', positionInstructions);
    if ('ResizeObserver' in window) new ResizeObserver(()=>positionInstructions()).observe(holder);
    setTimeout(positionInstructions, 0);
  } catch {}
  resize();

  // prepare tiles
  let tiles = [];
  const popFx = [];
  const POP_DURATION = 220;
  let score = 0;
  let timer = roundSeconds;
  let spawnHandle = null, animateId = null, timerInterval = null;
  let lastSliceAt = 0, combo = 0;
  let maxCombo = 0;               // per-stage best combo
  // Track swipe vigor for perfect effects
  let lastSwipeDist = 0;
  // Fever meter (Stage 2)
  const feverEnabled = (config && config.feverEnabled) !== false; // default on
  let fever = 0;                 // 0..1 charge
  let feverActive = false;
  let feverEndsAt = 0;
  let feverSeen = false;          // per-stage: whether fever was triggered
  const FEVER_DURATION_MS = Number((config && config.feverDurationMs) ?? 8000);
  const FEVER_MULTIPLIER = Number((config && config.feverMultiplier) ?? 2.0);
  const FEVER_DECAY_PER_SEC = Number((config && config.feverDecayPerSec) ?? 0.12); // slower decay by default
  const FEVER_CHARGE_SLICE = Number((config && config.feverChargeSlice) ?? 0.18);
  const FEVER_SEQ_CHARGE_BOOST = Number((config && config.feverSeqChargeBoost) ?? 1.6);
  let lastFrameAt = performance.now();
  function clamp01(x){ return Math.max(0, Math.min(1, x)); }
  function setFever(v){ fever = clamp01(v); updateFeverUI(); }
  function addFever(d){ if (!feverEnabled || feverActive) return; setFever(fever + d); if (fever >= 1) startFever(); }
  function startFever(){
    if (!feverEnabled) return;
    feverActive = true; feverEndsAt = performance.now() + FEVER_DURATION_MS;
    try { SFX('fever'); } catch {}
    showFeverToast();
    try { feverSeen = true; } catch{}
    updateFeverUI(true);
  }
  function endFever(){ feverActive = false; if (feverEnabled) setFever(0.35); updateFeverUI(false); }
  function updateFeverTick(now){
    const dt = Math.max(0, (now - lastFrameAt) / 1000);
    if (feverEnabled && !feverActive && fever > 0){ setFever(fever - FEVER_DECAY_PER_SEC * dt); }
    if (feverActive && now >= feverEndsAt) { endFever(); }
    lastFrameAt = now;
  }

  let comboDecayHandle = null;

  function setComboMeter(value) {
    if (!comboMeter || !comboMeterFill) return;
    const clamped = Math.max(0, Math.min(1, value));
    comboMeterFill.style.width = `${Math.round(clamped * 100)}%`;
    comboMeter.classList.remove('opacity-0');
  }

  function stopComboMeter() {
    if (!comboMeter || !comboMeterFill) return;
    if (comboDecayHandle) {
      cancelAnimationFrame(comboDecayHandle);
      comboDecayHandle = null;
    }
    comboMeterFill.style.width = '0%';
    comboMeter.classList.add('opacity-0');
  }

  function tickComboMeter() {
    if (!comboMeterFill) return;
    // During FEVER we keep the bar under FEVER control
    if (feverActive) { updateFeverUI(); return; }
    const windowMs = Math.max(1, comboWindowMs || 1);
    const progress = 1 - ((performance.now() - lastSliceAt) / windowMs);
    if (progress <= 0 || combo <= 1) {
      stopComboMeter();
      return;
    }
    setComboMeter(progress);
    comboDecayHandle = requestAnimationFrame(tickComboMeter);
  }
  // Fever UI
  function updateFeverUI(isStart){
    if (!comboMeter || !comboMeterFill) return;
    if (!feverEnabled) { comboMeterFill.style.background = '#10b981'; return; }
    try {
      comboMeter.classList.remove('opacity-0');
      const pct = feverActive ? 100 : Math.round((fever||0)*100);
      comboMeterFill.style.width = pct + '%';
      comboMeterFill.style.background = feverActive ? '#f43f5e' /*rose-500*/ : '#f59e0b' /*amber-500*/;
      comboMeter.style.opacity = '1';
      if (feverLabel){
        if (feverActive) {
          feverLabel.textContent = 'Fever';
          feverLabel.classList.remove('hidden');
          feverLabel.style.color = '#be123c'; // rose-700
        } else if (fever > 0.01) {
          feverLabel.textContent = 'Fever';
          feverLabel.classList.remove('hidden');
          feverLabel.style.color = '#b45309'; // amber-700
        } else {
          feverLabel.classList.add('hidden');
        }
      }
    } catch {}
  }

  function updatePowerUI(nowTs){
    try{
      const now = nowTs || performance.now();
      // Freeze
      if (freezeUntil > now){ window.__freezeBadge.style.display=''; window.__freezeBadge.textContent = `Freeze ${Math.ceil((freezeUntil-now)/1000)}s`; }
      else if (window.__freezeBadge){ window.__freezeBadge.style.display='none'; }
      // Double
      if (doubleUntil > now){ /* suppress x2 badge */ window.__doubleBadge.style.display='none'; }
      else if (window.__doubleBadge){ window.__doubleBadge.style.display='none'; }
      // Shield
      if (shieldCount > 0){ window.__shieldBadge.style.display=''; window.__shieldBadge.textContent = `Shield x${shieldCount}`; }
      else if (window.__shieldBadge){ window.__shieldBadge.style.display='none'; }
    }catch{}
  }

  function primeComboMeter() {
    if (!comboMeterFill) return;
    setComboMeter(1);
    if (!comboDecayHandle) comboDecayHandle = requestAnimationFrame(tickComboMeter);
  }

  stopComboMeter();

  // simple time scale for hit-stop (scoped to game loop)
  let timeScale = 1;
  let hitStopTimer = null;
  function hitStop(ms){
    try{
      timeScale = 0.25;
      clearTimeout(hitStopTimer);
      hitStopTimer = setTimeout(()=>{ timeScale = 1; }, Math.max(40, ms||80));
    }catch{}
  }

  const SLICE_PAUSE_MS = 1000;

  function startTimerTicker() {
    if (timerInterval) { try { clearInterval(timerInterval); } catch {} }
    timerInterval = setInterval(() => {
      try {
        timer = Math.max(0, (timer|0) - 1);
        timerEl.textContent = String(timer);
        if (timer <= 0) { endGame(); }
      } catch {
        // Best effort to stop runaway interval
        try { clearInterval(timerInterval); } catch {}
        timerInterval = null;
      }
    }, 1000);
  }

  function resumeFromPause(options = {}) {
    if (!isPaused || !currentPauseState) return;
    const { skipCallbacks = false, skipResume = false } = options || {};
    if (pauseTimeoutId) {
      clearTimeout(pauseTimeoutId);
      pauseTimeoutId = null;
    }
    const state = currentPauseState;
    currentPauseState = null;
    isPaused = false;
    pauseOverlay.style.opacity = '0';
    setTimeout(() => { if (!isPaused) pauseOverlay.textContent = ''; }, 220);
    const resumedAt = performance.now();
    const pausedDuration = Math.max(0, resumedAt - state.startedAt);
    spawnStartTime += pausedDuration;
    if (lastSliceAt) lastSliceAt += pausedDuration;
    for (const fx of popFx) {
      fx.created = Math.min(fx.created + pausedDuration, resumedAt - 1);
    }
    if (!skipResume && state.roundActive && roundActive) {
      if (state.timerWasRunning) startTimerTicker();
      const delay = state.spawnRemainingDelay != null ? Math.max(0, state.spawnRemainingDelay) : 0;
      spawnScheduledAt = performance.now();
      nextSpawnDelay = delay || nextSpawnDelay;
      spawnHandle = setTimeout(scheduleNext, delay);
      if (state.comboShouldResume && combo > 1) {
        if (!comboDecayHandle) comboDecayHandle = requestAnimationFrame(tickComboMeter);
      }
      if (!animateId) draw();
    }
    if (!skipCallbacks && typeof state.afterPause === 'function') {
      try { state.afterPause(); } catch (err) { console.error(err); }
    }
  }

  function cancelActivePause(options = {}) {
    if (!isPaused) return;
    const opts = Object.assign({ skipCallbacks: true, skipResume: true }, options || {});
    resumeFromPause(opts);
  }

  function pauseSliceMoment(displayText, afterPause) {
    if (!roundActive || isPaused) {
      if (typeof afterPause === 'function' && !isPaused) {
        afterPause();
      }
      return;
    }
    const now = performance.now();
    const text = (displayText || '').trim();
    pauseOverlay.textContent = text;
    pauseOverlay.style.opacity = text ? '1' : '0.6';
    pointerIsDown = false;
    clearTrails();
    const state = {
      startedAt: now,
      afterPause: typeof afterPause === 'function' ? afterPause : null,
      timerWasRunning: !!timerInterval,
      comboShouldResume: combo > 1 && !!lastSliceAt,
      spawnRemainingDelay: 0,
      roundActive
    };
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (comboDecayHandle) {
      cancelAnimationFrame(comboDecayHandle);
      comboDecayHandle = null;
    }
    if (spawnHandle) {
      const elapsed = Math.max(0, now - spawnScheduledAt);
      state.spawnRemainingDelay = Math.max(0, nextSpawnDelay - elapsed);
      clearTimeout(spawnHandle);
      spawnHandle = null;
    } else {
      state.spawnRemainingDelay = Math.max(0, nextSpawnDelay);
    }
    if (animateId) {
      cancelAnimationFrame(animateId);
      animateId = null;
    }
    if (pauseTimeoutId) {
      clearTimeout(pauseTimeoutId);
      pauseTimeoutId = null;
    }
    isPaused = true;
    currentPauseState = state;
    pauseTimeoutId = setTimeout(() => resumeFromPause(), SLICE_PAUSE_MS);
  }

  // Pause without auto-resume (used for stage-complete banner)
  function pauseForStage() {
    if (!roundActive || isPaused) return;
    const now = performance.now();
    pointerIsDown = false;
    clearTrails();
    const state = {
      startedAt: now,
      afterPause: null,
      timerWasRunning: !!timerInterval,
      comboShouldResume: combo > 1 && !!lastSliceAt,
      spawnRemainingDelay: 0,
      roundActive
    };
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (comboDecayHandle) { cancelAnimationFrame(comboDecayHandle); comboDecayHandle = null; }
    if (spawnHandle) {
      const elapsed = Math.max(0, now - spawnScheduledAt);
      state.spawnRemainingDelay = Math.max(0, nextSpawnDelay - elapsed);
      clearTimeout(spawnHandle); spawnHandle = null;
    } else {
      state.spawnRemainingDelay = Math.max(0, nextSpawnDelay);
    }
    if (animateId) { cancelAnimationFrame(animateId); animateId = null; }
    if (pauseTimeoutId) { clearTimeout(pauseTimeoutId); pauseTimeoutId = null; }
    isPaused = true;
    currentPauseState = state;
  }

  // micro-shake (Stage 2)
  let shakeUntil = 0, shakeMag = 0, shakeDur = 0;
  function triggerShake(ms=90, mag=4){
    const now = performance.now(); shakeUntil = now + Math.max(10, ms); shakeMag = Math.max(0, mag); shakeDur = Math.max(1, ms);
  }
  function applyShake(now){
    if (now >= shakeUntil) { canvas.style.transform = ''; trailCanvas.style.transform = ''; return; }
    const t = (shakeUntil - now) / shakeDur;
    const m = shakeMag * t;
    const dx = (Math.random()*2-1) * m;
    const dy = (Math.random()*2-1) * m;
    canvas.style.transform = `translate(${dx}px, ${dy}px)`;
    trailCanvas.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function draw() {
    const now = performance.now();
    updateFeverTick(now);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyShake(now);
    updatePowerUI(now);
    // FFA countdown UI and guard
    if (mode === MODE_FFA && ffaEndsAt > 0) {
      const msLeft = Math.max(0, Math.floor(ffaEndsAt - now));
      const sec = Math.max(0, Math.ceil(msLeft / 1000));
      try { countdownEl.textContent = String(sec); } catch {}
    }
    for (let t of tiles) {
      // integrate
      t.x += t.vx * timeScale;
      t.y += t.vy * timeScale;
      const freezeScale = (freezeUntil > now) ? 0.4 : 1;
      t.vy += gravity * timeScale * freezeScale; // gravity (freeze slows)
      if (t.spin) t.rot += t.spin * Math.max(0, bubbleSpinSpeed || 0);

      // bounce off walls slightly
      if (t.x < 0 || t.x > viewW) t.vx *= -0.98;

      // draw
      ctx.save();
      ctx.translate(t.x, t.y);
      if (t.rot) ctx.rotate(t.rot);
      if (t.type === 'bomb') {
        ctx.save();
        const r = (t.radius || BOMB_RADIUS) * 0.9;
        // Bomb body (dark gradient circle)
        const g = ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.2,0,0,r);
        g.addColorStop(0,'#4b5563'); // gray-600
        g.addColorStop(1,'#111827'); // gray-900
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
        // Specular highlight
        ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,0.16)';
        ctx.ellipse(-r*0.3,-r*0.3,r*0.35,r*0.22,-0.4,0,Math.PI*2); ctx.fill();
        // Fuse (curved) + glow and animated ember
        const p0x = r*0.25, p0y = -r*0.75;
        const p1x = r*0.65, p1y = -r*1.05;
        const p2x = r*0.95, p2y = -r*1.25;
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = Math.max(2, r*0.12);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.quadraticCurveTo(p1x, p1y, p2x, p2y);
        ctx.stroke();
        // Glow pass
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(251,191,36,0.6)'; // amber-300
        ctx.lineWidth = Math.max(2, r*0.22);
        ctx.beginPath();
        ctx.moveTo(p0x, p0y);
        ctx.quadraticCurveTo(p1x, p1y, p2x, p2y);
        ctx.stroke();
        ctx.restore();
        // animated ember traveling along the fuse towards the tip
        try {
          const tt = ((now % 700) / 700); // 0..1 looping
          const t2 = tt*tt; const omt = 1-tt; const omt2 = omt*omt;
          const ex = omt2*p0x + 2*omt*tt*p1x + t2*p2x;
          const ey = omt2*p0y + 2*omt*tt*p1y + t2*p2y;
          ctx.save();
          ctx.fillStyle = '#fbbf24'; // amber-300 core
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = r*0.25;
          ctx.beginPath(); ctx.arc(ex, ey, r*0.12, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        } catch {}
        // Spark at fuse tip (flicker)
        ctx.save();
        const sx = p2x, sy = p2y;
        const flicker = 0.7 + 0.3 * Math.sin((now % 400)/400 * Math.PI*2);
        ctx.translate(sx, sy);
        ctx.fillStyle = '#f59e0b'; // amber
        ctx.globalAlpha = flicker;
        ctx.beginPath(); ctx.arc(0,0,r*0.18,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fbbf24'; // amber-300
        ctx.lineWidth = r*0.06;
        for (let i=0;i<8;i++){ ctx.rotate(Math.PI/4); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(r*0.3,0); ctx.stroke(); }
        ctx.restore();
        ctx.restore();
      } else if (t.type === 'power') {
        const radius = t.radius || KANA_RADIUS;
        // power bubble background
        ctx.save();
        let base = '#e0f2fe', edge='#0284c7';
        if (t.kind==='shield'){ base='#dcfce7'; edge='#059669'; }
        if (t.kind==='double'){ base='#fee2e2'; edge='#e11d48'; }
        const bubbleGradient = ctx.createRadialGradient(0, -radius * 0.25, radius * 0.1, 0, 0, radius);
        bubbleGradient.addColorStop(0, base);
        bubbleGradient.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.beginPath(); ctx.fillStyle = bubbleGradient; ctx.arc(0,0,radius,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.lineWidth=2.4; ctx.strokeStyle=edge; ctx.arc(0,0,radius-1,0,Math.PI*2); ctx.stroke();
        // icon
        ctx.fillStyle = edge; ctx.strokeStyle=edge;
        if (t.kind==='freeze'){
          // snowflake
          ctx.lineWidth=2; for(let i=0;i<6;i++){ ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,radius*0.55); ctx.stroke(); ctx.rotate(Math.PI/3); }
        } else if (t.kind==='shield'){
          ctx.beginPath(); ctx.moveTo(0,-radius*0.5); ctx.quadraticCurveTo(radius*0.65,-radius*0.2,0,radius*0.6); ctx.quadraticCurveTo(-radius*0.65,-radius*0.2,0,-radius*0.5); ctx.fill();
        } else { // double
        // Suppress ×2 overlay text on coin face
        ctx.font = `${Math.round(radius*0.7)}px system-ui, sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; /* no text */
        }
        ctx.restore();
      } else if (t.type === 'noise') {
        const radius = t.radius || KANA_RADIUS;
        const bubbleGradient = ctx.createRadialGradient(0, -radius * 0.25, radius * 0.1, 0, 0, radius);
        bubbleGradient.addColorStop(0, 'rgba(241, 245, 249, 0.95)'); // slate-100
        bubbleGradient.addColorStop(1, 'rgba(148, 163, 184, 0.25)'); // slate-400
        ctx.beginPath(); ctx.fillStyle = bubbleGradient; ctx.arc(0,0,radius,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.lineWidth=2.2; ctx.strokeStyle='rgba(100,116,139,0.85)'; ctx.arc(0,0,radius-1,0,Math.PI*2); ctx.stroke();
        // glyph
        ctx.save(); ctx.fillStyle='#1f2937'; ctx.font = "56px \"Noto Sans JP\", \"Yu Gothic UI\", system-ui, sans-serif"; ctx.textAlign='center'; ctx.textBaseline='middle';
        const g = (typeof t.char==='string'&&t.char.trim())?t.char:''; if (g) ctx.fillText(g,0,radius*0.06);
        ctx.restore();
      } else {
        const radius = t.radius || KANA_RADIUS;
        // Less translucent, shinier gold background (coin-like)
        const bubbleGradient = ctx.createRadialGradient(0, -radius * 0.30, Math.max(1, radius * 0.08), 0, 0, radius);
        bubbleGradient.addColorStop(0, '#fff8cc');
        bubbleGradient.addColorStop(0.55, '#f7bf3c');
        bubbleGradient.addColorStop(1, '#e59e0b');
        ctx.beginPath();
        ctx.fillStyle = bubbleGradient;
        ctx.arc(0, 0, radius, 0, Math.PI*2); ctx.fill();

        // Darker, crisper rim for a metallic edge
        ctx.beginPath();
        ctx.strokeStyle = '#9a5b0e';
        ctx.lineWidth = 2.6;
        ctx.arc(0, 0, radius-1, 0, Math.PI*2); ctx.stroke();

        // Glow effect during fever or streaks
        if (feverActive) {
          ctx.save();
          ctx.shadowColor = 'rgba(245, 158, 11, 0.85)';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(0, 0, radius+2, 0, Math.PI*2);
          ctx.strokeStyle = 'rgba(245,158,11,0.8)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        } else if (typeof glowUntil === 'number' && performance.now() < glowUntil) {
          ctx.save();
          ctx.shadowColor = 'rgba(255,215,0,0.85)';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(0, 0, radius+1.5, 0, Math.PI*2);
          ctx.strokeStyle = 'rgba(255,215,0,0.8)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }

        // Pulse target highlight (Sequence mode)
        if (sequenceMode) {
          try {
            const tg = (typeof targetGroup === 'function') ? (targetGroup() || []) : [];
            const want = (tg || []).map(i => (chars[i] || '')).join('');
            const got = (Array.isArray(t.indices) && t.indices.length) ? t.indices.map(i => (chars[i]||'')).join('') : (typeof t.char === 'string' ? t.char : '');
            if (want && got === want) {
              const pulse = (Math.sin(now * 0.02) + 1) * 0.5; // 0..1
              ctx.save();
              ctx.shadowColor = 'rgba(255,215,0,0.95)';
              ctx.shadowBlur = 10 + pulse * 24;
              ctx.beginPath();
              ctx.arc(0, 0, radius + 2 + pulse * 2, 0, Math.PI*2);
              ctx.strokeStyle = 'rgba(255,215,0,' + (0.7 + 0.25*pulse) + ')';
              ctx.lineWidth = 2.5 + pulse * 2;
              ctx.stroke();
              ctx.restore();
            }
          } catch {}
        }

        // Moving highlight based on rotation for a shinier look
        const ang = (t.rot || 0);
        const hx = -radius * (0.4 * Math.cos(ang)) - radius * 0.1;
        const hy = -radius * (0.45 * Math.sin(ang)) - radius * 0.1;
        const highlightGradient = ctx.createRadialGradient(hx, hy, radius * 0.05, hx, hy, radius * 0.35);
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.fillStyle = highlightGradient;
        ctx.arc(hx, hy, radius*0.32, Math.PI*1.1, Math.PI*1.9, false);
        ctx.fill();
        // Small specular dot
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(hx + radius*0.12, hy + radius*0.08, Math.max(1.8, radius*0.06), 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Draw glyph upright regardless of bubble spin
        ctx.save();
        if (bubbleSpinStyle === 'upright' && !(mode === MODE_FFA && t && t.ffa)) {
          // cancel current rotation so text is upright
          ctx.rotate(- (t.rot || 0));
        }
        // Draw glyph or a stylized coin during FFA
        if (mode === MODE_FFA && t && t.ffa) {
          // Vertical-axis spin illusion by scaling X with cos(rot)
          const cr = Math.max(6, radius * 0.46);
          const rot = (t.rot || 0);
          const sx = Math.max(0.28, 0.28 + 0.72 * Math.abs(Math.cos(rot))); // 0.28..1.0

          // Body
          ctx.save();
          ctx.scale(sx, 1);
          const bodyGrad = ctx.createRadialGradient(0, -cr*0.3, cr*0.1, 0, 0, cr);
          bodyGrad.addColorStop(0, '#fff8cc');
          bodyGrad.addColorStop(0.55, '#f7bf3c');
          bodyGrad.addColorStop(1, '#e59e0b');
          ctx.beginPath();
          ctx.fillStyle = bodyGrad;
          ctx.arc(0, 0, cr, 0, Math.PI*2);
          ctx.fill();
          // Rim
          ctx.lineWidth = Math.max(1.2, 2.2 * (0.5 + 0.5*sx));
          ctx.strokeStyle = '#9a5b0e';
          ctx.beginPath();
          ctx.arc(0, 0, cr-1, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();

          // Edge shading (darker edges when turned) — clipped to ellipse
          const edgeAlpha = Math.max(0, 0.6 - sx*0.6);
          if (edgeAlpha > 0.01) {
            ctx.save();
            // Clip to coin ellipse
            ctx.save(); ctx.scale(sx, 1); ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI*2); ctx.restore(); ctx.clip();
            ctx.globalAlpha = edgeAlpha;
            // Left edge gradient
            let lgL = ctx.createLinearGradient(-cr, 0, -cr*0.5, 0);
            lgL.addColorStop(0, 'rgba(154,91,14,0.55)');
            lgL.addColorStop(1, 'rgba(154,91,14,0.0)');
            ctx.fillStyle = lgL; ctx.fillRect(-cr, -cr, cr*0.6, cr*2);
            // Right edge gradient
            let lgR = ctx.createLinearGradient(cr*0.5, 0, cr, 0);
            lgR.addColorStop(0, 'rgba(154,91,14,0.0)');
            lgR.addColorStop(1, 'rgba(154,91,14,0.55)');
            ctx.fillStyle = lgR; ctx.fillRect(cr*0.4, -cr, cr*0.6, cr*2);
            ctx.restore();
          }

          // Sparkle/glint sweeping across the face
          const sparkle = Math.max(0, (sx - 0.85) / 0.15); // only near face-on
          if (sparkle > 0) {
            ctx.save();
            const glintR = cr * (0.25 + 0.1 * sparkle);
            ctx.globalAlpha = 0.5 + 0.5 * sparkle;
            const gx = -cr * 0.25;
            const gy = -cr * 0.15;
            const gl = ctx.createRadialGradient(gx, gy, 0.1, gx, gy, glintR);
            gl.addColorStop(0, 'rgba(255,255,255,0.95)');
            gl.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gl;
            ctx.beginPath();
            ctx.arc(gx, gy, glintR, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();

            // Rainbow sheen overlay (screen blend) across the coin when face-on
            ctx.save();
            // Clip to ellipse so the sweep never looks rectangular
            ctx.save(); ctx.scale(sx, 1); ctx.beginPath(); ctx.arc(0, 0, cr*0.98, 0, Math.PI*2); ctx.restore(); ctx.clip();
            ctx.globalAlpha = 0.28 + 0.22 * sparkle;
            const prevOp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'screen';
            // Tie sweep to rotation; also angle a bit with rotation
            const phase = Math.sin((t.rot || 0) * 2);
            const off = cr * 0.8 * phase;
            ctx.save();
            ctx.rotate((t.rot || 0) * 0.25);
            const lg = ctx.createLinearGradient(-cr + off, 0, cr + off, 0);
            lg.addColorStop(0.00, 'hsl(0, 85%, 60%)');    // red
            lg.addColorStop(0.20, 'hsl(30, 85%, 60%)');   // orange
            lg.addColorStop(0.36, 'hsl(60, 85%, 60%)');   // yellow
            lg.addColorStop(0.52, 'hsl(120, 70%, 55%)');  // green
            lg.addColorStop(0.68, 'hsl(200, 80%, 60%)');  // cyan/blue
            lg.addColorStop(0.84, 'hsl(260, 80%, 62%)');  // indigo
            lg.addColorStop(1.00, 'hsl(300, 80%, 65%)');  // violet
            ctx.fillStyle = lg;
            // Fill a band across the coin; clip ensures circular result
            ctx.fillRect(-cr, -cr, cr*2, cr*2);
            ctx.restore();
            ctx.globalCompositeOperation = prevOp;
            ctx.restore();
          }

          // Kana face (embossed/engraved) scaled with sx
          const face = (typeof t.char === 'string' && t.char.trim()) ? t.char : '';
          if (face) {
            ctx.save();
            ctx.scale(sx, 1);
            const fontSize = Math.max(10, cr * 0.95);
            ctx.font = `${Math.round(fontSize)}px "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            // Base
            ctx.fillStyle = '#7c3e0a'; ctx.globalAlpha = 0.9; ctx.fillText(face, 0, 0);
            const light = 'rgba(255,255,255,0.8)';
            const dark = 'rgba(0,0,0,0.35)';
            if (coinFaceStyle === 'engraved') {
              ctx.save(); ctx.shadowColor = dark; ctx.shadowOffsetX = -1.5; ctx.shadowOffsetY = -1.5; ctx.shadowBlur = 0; ctx.fillStyle = '#7c3e0a'; ctx.globalAlpha = 0.95; ctx.fillText(face, 0, 0); ctx.restore();
              ctx.save(); ctx.shadowColor = light; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 1.5; ctx.shadowBlur = 0; ctx.fillStyle = '#7c3e0a'; ctx.globalAlpha = 0.85; ctx.fillText(face, 0, 0); ctx.restore();
            } else {
              // Embossed: stronger, wider bevels for readability
              ctx.save(); ctx.shadowColor = light; ctx.shadowOffsetX = -2.6; ctx.shadowOffsetY = -2.6; ctx.shadowBlur = 0; ctx.fillStyle = '#8b5a12'; ctx.globalAlpha = 0.98; ctx.fillText(face, 0, 0); ctx.restore();
              ctx.save(); ctx.shadowColor = dark; ctx.shadowOffsetX = 2.6; ctx.shadowOffsetY = 2.6; ctx.shadowBlur = 0; ctx.fillStyle = '#8b5a12'; ctx.globalAlpha = 0.94; ctx.fillText(face, 0, 0); ctx.restore();
            }
            ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.globalAlpha = 0.7; ctx.strokeText(face, 0, 0);
            ctx.restore();
          }
        } else {
          // Normal mode bubble glyph face style: flat | embossed | engraved
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const bubbleGlyph = (typeof t.char === 'string' && t.char.trim()) ? t.char : '';
          const bubbleYOffset = radius * 0.06;
          const fontSize = Math.max(10, radius * 0.95);
          ctx.font = `${Math.round(fontSize)}px "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif`;
          if (bubbleGlyph) {
            if (bubbleFaceStyle === 'engraved') {
              // Inset look (engraved)
              const light = 'rgba(255,255,255,0.85)';
              const dark = 'rgba(0,0,0,0.45)';
              ctx.save(); ctx.shadowColor = dark; ctx.shadowOffsetX = -1.5; ctx.shadowOffsetY = -1.5; ctx.shadowBlur = 0; ctx.fillStyle = '#7c3e0a'; ctx.globalAlpha = 0.95; ctx.fillText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
              ctx.save(); ctx.shadowColor = light; ctx.shadowOffsetX = 1.5; ctx.shadowOffsetY = 1.5; ctx.shadowBlur = 0; ctx.fillStyle = '#7c3e0a'; ctx.globalAlpha = 0.85; ctx.fillText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
              // Subtle outline for readability
              ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.globalAlpha = 0.7; ctx.strokeText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
            } else if (bubbleFaceStyle === 'embossed') {
              // Raised look (embossed) similar to FFA coin faces
              const light = 'rgba(255,255,255,0.85)';
              const dark = 'rgba(0,0,0,0.45)';
              // Base
              ctx.save(); ctx.fillStyle = '#6b3a09'; ctx.globalAlpha = 0.92; ctx.fillText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
              // Bevel highlights/shadows
              ctx.save(); ctx.shadowColor = light; ctx.shadowOffsetX = -2.4; ctx.shadowOffsetY = -2.4; ctx.shadowBlur = 0; ctx.fillStyle = '#8b5a12'; ctx.globalAlpha = 0.98; ctx.fillText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
              ctx.save(); ctx.shadowColor = dark; ctx.shadowOffsetX = 2.4; ctx.shadowOffsetY = 2.4; ctx.shadowBlur = 0; ctx.fillStyle = '#8b5a12'; ctx.globalAlpha = 0.94; ctx.fillText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
              // Subtle outline for readability
              ctx.save(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.globalAlpha = 0.75; ctx.strokeText(bubbleGlyph, 0, bubbleYOffset); ctx.restore();
            } else {
              // Flat
              ctx.fillStyle = '#111';
              ctx.fillText(bubbleGlyph, 0, bubbleYOffset);
            }
          }
        }

        if (difficulty === 'easy') {
          try {
            const roma = toRomaStr(bubbleGlyph) || '';
            if (roma) {
              ctx.font = '12px system-ui, sans-serif';
              ctx.fillStyle = '#334155';
              ctx.textBaseline = 'top';
              ctx.fillText(roma, 0, radius * 0.55);
            }
          } catch {}
        }
        ctx.restore();
      }
      ctx.restore();
    }

    for (let i = popFx.length - 1; i >= 0; i--) {
      const fx = popFx[i];
      const age = now - fx.created;
      if (age < 0) { continue; } // guard against clock drift during pause/resume
      if (age > POP_DURATION) {
        popFx.splice(i, 1);
        continue;
      }
      const pct = age / POP_DURATION;
      const baseRadius = Math.max(0, fx.radius || KANA_RADIUS);
      const ringRadius = Math.max(0.1, baseRadius + pct * 16);
      ctx.save();
      const alpha = fx.isBomb ? Math.max(0, 0.9 - pct) : Math.max(0, 0.8 - pct * 0.8);
      ctx.globalAlpha = alpha;
      // ring styling
      if (fx.kind === 'perfect') {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)'; // amber-400
      } else if (fx.kind === 'coinring') {
        ctx.lineWidth = 3.2;
        // Gold-orange outer with inner white shimmer
        const grad = ctx.createRadialGradient(fx.x, fx.y, Math.max(0.1, ringRadius-6), fx.x, fx.y, ringRadius+1);
        grad.addColorStop(0, 'rgba(255,255,255,0.85)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0.95)');
        ctx.strokeStyle = grad;
      } else {
        ctx.lineWidth = fx.isBomb ? 3 : 2;
        ctx.strokeStyle = fx.isBomb ? '#f87171' : '#a5f3fc';
      }
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, ringRadius, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw and advance coin particles (on main canvas layer)
    for (let i = coinFx.length - 1; i >= 0; i--) {
      const fx = coinFx[i];
      // Swoop coins: parametric animation from sx,sy -> tx,ty
      if (fx && fx.mode === 'swoop') {
        const start = fx.born || now;
        const dur = Math.max(1, fx.dur || 600);
        const elapsed = now - start;
        if (elapsed < 0) continue; // not started yet
        const t01 = Math.min(1, elapsed / dur);
        const ease = (p) => 1 - Math.pow(1 - p, 3);
        const u = ease(t01);
        const x = (fx.sx || 0) + (fx.tx - (fx.sx || 0)) * u;
        const y = (fx.sy || 0) + (fx.ty - (fx.sy || 0)) * u;
        const alpha = Math.max(0, 1 - (t01 * 0.1));
        const r = 8;
        ctx.save();
        ctx.globalAlpha = 0.9 * alpha;
        const g = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r*0.2, x, y, r);
        g.addColorStop(0, '#fff8c4');
        g.addColorStop(1, '#fbbf24');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(x, y, r-1, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
        if (t01 >= 1) { coinFx.splice(i, 1); }
        continue;
      }
      const age = now - (fx.born || now);
      const life = Math.max(1, fx.life || 600);
      if (age >= life) { coinFx.splice(i, 1); continue; }
      fx.x = (typeof fx.x === 'number') ? fx.x + (fx.vx || 0) * timeScale : (fx.x || 0);
      fx.y = (typeof fx.y === 'number') ? fx.y + (fx.vy || 0) * timeScale : (fx.y || 0);
      // mild gravity during float
      fx.vy = (fx.vy || 0) + (0.012 * timeScale);
      const alpha = Math.max(0, 1 - (age / life));
      const r = 8;
      ctx.save();
      ctx.globalAlpha = 0.9 * alpha;
      const g = ctx.createRadialGradient((fx.x||0) - r*0.3, (fx.y||0) - r*0.3, r*0.2, (fx.x||0), (fx.y||0), r);
      g.addColorStop(0, '#fff8c4');
      g.addColorStop(1, '#fbbf24');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc((fx.x||0), (fx.y||0), r, 0, Math.PI*2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#b45309';
      ctx.beginPath();
      ctx.arc((fx.x||0), (fx.y||0), r-1, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw sliced-kana showcase FX (zoom -> settle -> spin/fade)
    for (let i = sliceFx.length - 1; i >= 0; i--) {
      const fx = sliceFx[i];
      const start = fx.start || now;
      const dur = Math.max(1, fx.dur || sliceShowcaseDurationMs);
      const t = now - start;
      if (t < 0) continue;
      const p = Math.min(1, t / dur);
      const easeOut = (v) => 1 - Math.pow(1 - v, 3);
      const easeInOut = (v) => (v < 0.5) ? (2*v*v) : (1 - Math.pow(-2*v + 2, 2) / 2);
      let x = fx.sx || 0, y = fx.sy || 0, s = 1, rot = 0, alpha = 1;
      const cx = (typeof fx.cx === 'number') ? fx.cx : (viewW * 0.5);
      const cy = (typeof fx.cy === 'number') ? fx.cy : (viewH * 0.45);
      // 3-segment timeline
      const a = 0.35, b = 0.55; // end of zoom-in, end of settle
      const maxScale = 2.4;     // make it bigger during showcase
      if (p < a) {
        const u = easeOut(p / a);
        x = (fx.sx || 0) + (cx - (fx.sx || 0)) * u;
        y = (fx.sy || 0) + (cy - (fx.sy || 0)) * u;
        s = 1 + (maxScale - 1) * u; // 1 -> maxScale
      } else if (p < b) {
        const u = easeInOut((p - a) / (b - a));
        x = cx; y = cy;
        s = maxScale + (1.2 - maxScale) * u; // maxScale -> 1.2
      } else {
        const u = easeInOut((p - b) / (1 - b));
        x = cx; y = cy;
        // Keep enlarged size; do not shrink or spin, just fade out
        s = 1.2;
        rot = 0;
        alpha = 1 - 0.92 * u;
      }

      // Speak once when we finish the settle phase
      if (!fx.spoken && p >= b) {
        fx.spoken = true;
        try {
          if (speakOnSlice) {
            if (sliceShowcasePronounceRomaji) {
              const r = (fx.romaji || (typeof toRomaStr === 'function' ? (toRomaStr(fx.char || '') || '') : ''));
              if (r) speakJA(r);
            } else {
              if (fx.char) speakKana(fx.char);
            }
          }
        } catch {}
      }

      // Draw background disc (white) so nothing shows behind enlarged glyph
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(x, y);
        if (rot) ctx.rotate(rot);
      ctx.scale(s, s);
      const baseR = Math.max(10, (KANA_RADIUS || 24));
      const fontSize = Math.round(baseR * 2.4);
      // Solid white disc to mask background while zoomed
      const discR = Math.max(fontSize * 0.85, baseR * 2.2);
      // Drop shadow for depth
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, discR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // crisp rim to keep a coin-like edge
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#9a5b0e';
      ctx.beginPath(); ctx.arc(0, 0, discR, 0, Math.PI*2); ctx.stroke();
      // subtle glint sweep
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, discR, 0, Math.PI*2); ctx.clip();
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.rotate(-0.25);
      const lg = ctx.createLinearGradient(-discR, -discR*0.3, discR, -discR*0.3);
      lg.addColorStop(0.00, 'rgba(255,255,255,0.0)');
      lg.addColorStop(0.20, 'rgba(255,255,255,0.6)');
      lg.addColorStop(0.50, 'rgba(255,255,255,0.0)');
      lg.addColorStop(0.80, 'rgba(255,255,255,0.5)');
      lg.addColorStop(1.00, 'rgba(255,255,255,0.0)');
      ctx.fillStyle = lg;
      ctx.fillRect(-discR, -discR, discR*2, discR*2);
      ctx.globalCompositeOperation = prevOp;
      ctx.restore();
      ctx.restore();

      // Draw glyph with bevel similar to embossed style
      ctx.font = `${fontSize}px "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const g = (typeof fx.char === 'string' ? fx.char : '');
      if (g) {
        const light = 'rgba(255,255,255,0.85)';
        const dark = 'rgba(0,0,0,0.45)';
        ctx.save(); ctx.fillStyle = '#6b3a09'; ctx.globalAlpha = 0.92; ctx.fillText(g, 0, 0); ctx.restore();
        ctx.save(); ctx.shadowColor = light; ctx.shadowOffsetX = -3.0; ctx.shadowOffsetY = -3.0; ctx.shadowBlur = 0; ctx.fillStyle = '#8b5a12'; ctx.globalAlpha = 0.98; ctx.fillText(g, 0, 0); ctx.restore();
        ctx.save(); ctx.shadowColor = dark; ctx.shadowOffsetX = 3.0; ctx.shadowOffsetY = 3.0; ctx.shadowBlur = 0; ctx.fillStyle = '#8b5a12'; ctx.globalAlpha = 0.95; ctx.fillText(g, 0, 0); ctx.restore();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.globalAlpha = 0.8; ctx.strokeText(g, 0, 0);
      }
      ctx.restore();

      if (p >= 1) { sliceFx.splice(i, 1); }
    }

    // End FFA if time has elapsed (extra guard)
    if (mode === MODE_FFA && ffaEndsAt && now >= ffaEndsAt) {
      try { finishFreeForAll(); } catch {}
    }

    animateId = requestAnimationFrame(draw);
  }

  // console.debug('Slice tiles:', original.length);

  // ---------- Quiz Burst helpers ----------
  function setQuizPrompt(text){
    if (!quizPromptEl) return;
    if (!quizShowPrompt) { quizPromptEl.textContent = ''; quizPromptEl.style.animation = ''; return; }
    const t = (text || '').trim();
    quizPromptEl.textContent = t;
    // Pulse when visible
    if (t) {
      quizPromptEl.style.animation = 'promptPulse 900ms ease-in-out infinite';
      positionQuizPrompt();
    } else {
      quizPromptEl.style.animation = '';
    }
  }
  const KANA_FALLBACKS = ['ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¹Ãƒâ€¦Ã¢â‚¬Å“','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â®','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦','ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨'];
  function unique(arr){ return Array.from(new Set(arr)); }
  function groupToText(g){ return (g || []).map(i => chars[i] || '').join(''); }
  function otherGroupTexts(excludeText){
    const texts = quizGroups.map(g => groupToText(g)).filter(t => t && t !== excludeText);
    return unique(texts);
  }
  function spawnQuizWave(){
    // Clear any existing quiz tiles before spawning
    for (let i = tiles.length - 1; i >= 0; i--) {
      if (tiles[i] && tiles[i].waveId != null) tiles.splice(i, 1);
    }
    const targetG = quizGroups[quizIndex] || [];
    const kanaText = groupToText(targetG);
    const romajiText = toRomaStr(kanaText) || '';
    if (quizShowPrompt) setQuizPrompt(`Slice: ${romajiText || kanaText}`); else setQuizPrompt('');
    // Speak the kana once per wave
    // Speak the kana once per wave
    if (speakOnSlice && kanaText) speakKana(kanaText);
    const options = [];
    const waveId = ++quizWaveId;
    // Target first
    options.push({ text: kanaText, indices: targetG.slice(0), isCorrect: true });
    // Distractors from other groups
    let distractors = otherGroupTexts(kanaText);
    // Fill up with fallbacks if needed
    let di = 0;
    const wantChoices = getQuizChoices();
    while (options.length < wantChoices) {
      let pick = distractors[di++] || KANA_FALLBACKS[Math.floor(Math.random()*KANA_FALLBACKS.length)];
      if (!pick || pick === kanaText || options.some(o => o.text === pick)) continue;
      options.push({ text: pick, indices: [], isCorrect: false });
    }
    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    // Spawn across width
    const cols = options.length + 1;
    options.forEach((opt, idx) => {
      const x = Math.floor((viewW / cols) * (idx + 1));
      const y = viewH + 20;
      tiles.push({ type:'kana', char: opt.text, index: (opt.isCorrect && opt.indices.length ? opt.indices[0] : -1), indices: opt.indices, isCorrect: !!opt.isCorrect, radius: KANA_RADIUS, x, y, vx:(Math.random()*2-1) * (0.8 * Math.max(1, speedScale)), vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(0.8, launchBoost*0.9) * Math.max(1, speedScale) * diffVyBoost(), rot:0, spin:(Math.random()*2-1)*0.05, waveId });
    });
  }
  function scheduleNextQuizWave(prevWaveId){
    // Move to next group or finish
    quizIndex++;
    if (sliced.size === original.length || quizIndex >= quizGroups.length) {
      // Completed this phrase in quiz mode
      if (ffaEnabled) { startFreeForAll(); }
      else { completeStage(); }
      return;
    }
    const baseDelay = Math.max(300, SLICE_PAUSE_MS - 100);
    const delay = Math.max(100, Math.round(baseDelay / Math.max(0.5, speedScale)));
    setTimeout(() => spawnQuizWave(), delay);
  }
  function startQuiz(){
    quizActive = true;
    quizGroups = buildMoraGroups();
    quizIndex = 0;
    setQuizPrompt('');
    spawnQuizWave();
  }

  // spawn a new tile (kana or bomb). During FFA: kana-only, marked as FFA.
  function spawn() {
    // Free-for-All spawns: kana-only, denser, slightly higher launch
    if (mode === MODE_FFA) {
      if (!Array.isArray(chars) || chars.length === 0) return;
      const ch = '$';
      tiles.push({
        type:'kana', char: ch, index: -1, ffa: true, radius: KANA_RADIUS,
        x: Math.random()*viewW, y: viewH+20,
        vx:(Math.random()*2-1) * (1.6 * Math.max(1, speedScale)),
        vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1.15, launchBoost*1.1) * Math.max(1, speedScale) * diffVyBoost(),
        rot:0, spin:(Math.random()*2-1)*0.18
      });
      return;
    }
    // Normal mode: occasional power-ups
    if (powerUpsEnabled && Math.random() < powerSpawnChance) {
      const totalW = (powerWeights.freeze||0)+(powerWeights.shield||0)+(powerWeights.double||0); const r = Math.random()*Math.max(1,totalW);
      let pick='freeze'; let acc=powerWeights.freeze||0; if (r>acc){ acc+=powerWeights.shield||0; pick = (r<=acc)?'shield':'double'; }
      tiles.push({ type:'power', kind: pick, radius: KANA_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost) * diffVyBoost(), rot:0, spin:(Math.random()*2-1)*0.06 });
      return;
    }
    // Normal mode: distractor kana that do not advance progress
    if (noiseSpawnChance > 0 && Math.random() < noiseSpawnChance) {
      // Prefer a kana not in current phrase
      let pool = NOISE_KANA.filter(k => !chars.includes(k));
      if (!pool.length) pool = NOISE_KANA.slice(0);
      const ch = pool[Math.floor(Math.random()*pool.length)] || 'あ';
      tiles.push({ type:'noise', char: ch, radius: KANA_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost) * diffVyBoost(), rot:0, spin:(Math.random()*2-1)*0.05 });
      return;
    }
    const wantBomb = Math.random() < bombChance;
    if (wantBomb && !(mode === MODE_FFA && !ffaBombs)) {
      tiles.push({ type:'bomb', radius: BOMB_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1) * (1.2 * Math.max(1, speedScale)), vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost) * Math.max(1, speedScale) * diffVyBoost(), rot:0, spin:(Math.random()*2-1)*0.05 });
      return;
    }
    // pick an unsliced kana index
    const candidates = original.filter(o => !sliced.has(o.index));
    if (!candidates.length) return;
    if (sequenceMode && quizGroups.length) {
      // Ensure the current target appears frequently; force one if none exists
      const tg = targetGroup();
      const tText = groupToText(tg);
      const haveTarget = tiles.some(t => t && t.type==='kana' && (t.char === tText) && t.isTarget);
      const forceTarget = !haveTarget || Math.random() < 0.45;
      if (forceTarget) {
        tiles.push({ type:'kana', char: tText, index: tg[0] ?? -1, indices: tg.slice(0), isTarget: true, radius: KANA_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1) * (1.2 * Math.max(1, speedScale)), vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost) * Math.max(1, speedScale) * diffVyBoost(), rot:0, spin:(Math.random()*2-1)*0.05 });
        return;
      }
    }
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    if (!pick) return;
    tiles.push({ type:'kana', char: pick.char, index: pick.index, indices: [pick.index], radius: KANA_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1) * (1.2 * Math.max(1, speedScale)), vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost) * Math.max(1, speedScale) * diffVyBoost(), rot:0, spin:(Math.random()*2-1)*0.05 });
  }


  // handle slicing
  function sliceKana(t) {
    if (mode === MODE_FFA && performance.now() < ffaReadyAt) { return; }
    // Bonus Free-for-All: collect coins only, no quiz/sequence checks
    if (mode === MODE_FFA && t && t.type !== 'bomb') {
      try {
        // Chain multiplier for rapid coins
        const CHAIN_WINDOW = 450;
        const nowC = performance.now();
        window.__ffaChain = window.__ffaChain || { n:1, last:0 };
        if (nowC - (window.__ffaChain.last||0) <= CHAIN_WINDOW) { window.__ffaChain.n = Math.min(9, (window.__ffaChain.n||1) + 1); }
        else { window.__ffaChain.n = 1; }
        window.__ffaChain.last = nowC;
        const mult = Math.max(1, window.__ffaChain.n||1);
        coinCount += Math.max(0, coinPerKana * mult);
        coinCounterEl.textContent = `Coins: ${coinCount}`;
        // coin particle
        coinFx.push({
          kind: 'coin',
          x: t.x || 0,
          y: t.y || 0,
          vx: (Math.random()*2-1) * 0.8,
          vy: - (1.8 + Math.random()*0.6),
          born: performance.now(),
          life: 650
        });
        // bright gold ring highlight tied to coin slice
        popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || KANA_RADIUS) + 8, kind: 'coinring' });
        try { SFX('coin'); } catch {}
      } catch {}
      return;
    }
    if (t.type === 'kana') {
      // Sequence Mode: only accept the current target, advance prompt after correct
      if (sequenceMode) {
        try {
          const wantG = (typeof targetGroup === 'function') ? (targetGroup() || []) : [];
          const want = (wantG || []).map(i => (chars[i] || '')).join('');
          const got = (t.indices && t.indices.length)
            ? t.indices.map(i => (chars[i] || '')).join('')
            : (typeof t.char === 'string' ? t.char : '');
          if (want) {
            if (got !== want) { if (quizShowPrompt) setQuizPrompt(`Slice: ${toRomaStr(want) || want}`); return; }
            // correct: mark sliced, show hint bubble, advance index
            (wantG || []).forEach(i => { if (typeof i === 'number') sliced.add(i); });
            try { buildKanaDisplay(); } catch {}
            const yHint = (t.y || 0) - ((t.radius || KANA_RADIUS) + 16);
            const rTxt = toRomaStr(want) || want;
            showRomaAt(t.x || 0, yHint, rTxt);
            if (sliceShowcaseEnabled) {
              // Launch showcase FX for the sliced kana
              const tx = viewW * 0.5, ty = viewH * 0.45;
              coinFx.push({ mode:'swoop', sx: t.x || 0, sy: t.y || 0, tx, ty, born: performance.now(), dur: 500 });
              popFx.push({ x: tx, y: ty, created: performance.now() + 500, radius: (t.radius || KANA_RADIUS) + 10, kind: 'coinring' });
              sliceFx.push({ kind:'show', char: want, romaji: rTxt, sx: t.x || 0, sy: t.y || 0, cx: tx, cy: ty, start: performance.now(), dur: sliceShowcaseDurationMs, spin: false, spoken: false });
            } else {
              if (speakOnSlice && want) speakKana(want);
            }

            // Sequence-mode scoring + feedback + fever charge
            try { popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: t.radius || KANA_RADIUS }); } catch {}
            try { SFX('slice'); } catch {}
            const nowS = performance.now();
            combo = (nowS - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
            lastSliceAt = nowS;
            const baseS = 100 * combo;
            score += Math.round(baseS * ((feverEnabled && feverActive) ? FEVER_MULTIPLIER : 1));
            scoreEl.textContent = `${score}${combo > 1 ? ` x${combo}` : ''}`;
            if (combo > 1) { flashCombo(); primeComboMeter(); } else { resetComboBadge(); stopComboMeter(); }
            const seqCharge = (FEVER_CHARGE_SLICE + Math.min(0.08, (lastSwipeDist-60) * 0.0015)) * FEVER_SEQ_CHARGE_BOOST;
            addFever(seqCharge);

            seqIndex = (typeof seqIndex === 'number') ? (seqIndex + 1) : 1;
            updateProgressUI();
            ensurePromptForSequence && ensurePromptForSequence();
            if (sliced.size === original.length) {
              if (ffaEnabled) { startFreeForAll(); }
              else { try { if (typeof flashFullMapping === 'function') flashFullMapping(); } catch {} completeStage(); }
            }
            return;
          }
        } catch {}
      }
      // Quiz Burst handling: multiple-option wave tiles carry indices + isCorrect
      if (quizMode && t && Array.isArray(t.indices)) {
        popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: t.radius || KANA_RADIUS });
        const isCorrect = !!t.isCorrect;
        if (isCorrect) {
          (t.indices || []).forEach(i => { if (typeof i === 'number' && i >= 0) sliced.add(i); });
          try { buildKanaDisplay(); } catch {}
          const kanaTextQ = (t.kanaText || (t.indices || []).map(i => chars[i]).join('')) || '';
          const romajiTextQ = toRomaStr(kanaTextQ) || '';
          const yAboveQ = t.y - ((t.radius || KANA_RADIUS) + 16);
          showRomaAt(t.x, yAboveQ, romajiTextQ || kanaTextQ);
          if (sliceShowcaseEnabled) {
            const tx = viewW * 0.5, ty = viewH * 0.45;
            coinFx.push({ mode:'swoop', sx: t.x || 0, sy: t.y || 0, tx, ty, born: performance.now(), dur: 500 });
            popFx.push({ x: tx, y: ty, created: performance.now() + 500, radius: (t.radius || KANA_RADIUS) + 10, kind: 'coinring' });
            sliceFx.push({ kind:'show', char: kanaTextQ, romaji: romajiTextQ, sx: t.x || 0, sy: t.y || 0, cx: tx, cy: ty, start: performance.now(), dur: sliceShowcaseDurationMs, spin: false, spoken: false });
          } else {
            if (speakOnSlice && kanaTextQ) speakKana(kanaTextQ);
          }
          const nowQ = performance.now();
          combo = (nowQ - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
          lastSliceAt = nowQ;
          const baseQ = 200 * Math.max(1, combo);
          score += Math.round(baseQ * ((feverEnabled && feverActive) ? FEVER_MULTIPLIER : 1));
          scoreEl.textContent = `${score}${combo > 1 ? ` x${combo}` : ''}`;
          if (combo > 1) { flashCombo(); primeComboMeter(); } else { resetComboBadge(); stopComboMeter(); }
          if (combo > maxCombo) maxCombo = combo;
          // Charge fever more with higher combos; boost in sequence mode
          const chargeQ = (FEVER_CHARGE_SLICE + Math.min(0.1, (combo-1)*0.03)) * (sequenceMode ? FEVER_SEQ_CHARGE_BOOST : 1);
          addFever(chargeQ);
          try { (t.indices || []).forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s){ s.textContent = chars[i] || ''; s.classList.add('text-emerald-600','font-semibold','underline'); } }); } catch {}
          // remove the whole wave
          const waveId = t.waveId;
          for (let j = tiles.length - 1; j >= 0; j--) { if (tiles[j] && tiles[j].waveId === waveId) tiles.splice(j, 1); }
          updateProgressUI();
          if (sliced.size === original.length) { if (ffaEnabled) { startFreeForAll(); } else { flashFullMapping(); completeStage(); }
          } else {
            if (!sliceShowcaseEnabled) pauseSliceMoment('', null);
            scheduleNextQuizWave(waveId);
          }
        } else {
          score = Math.max(0, score - 50);
          scoreEl.textContent = `${score}`;
        }
        return;
      }
      // Base hit ring
      popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: t.radius || KANA_RADIUS });
      // Perfect slice ring if swipe was vigorous
      if (lastSwipeDist > 80) {
        popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || KANA_RADIUS) + 6, kind: 'perfect' });
        try { triggerShake(80, 3); } catch {}
      }
      const group = groupForIndex(t.index);
      group.forEach(i=>sliced.add(i));
      try { buildKanaDisplay(); } catch {}
      const now = performance.now();
      combo = (now - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
      lastSliceAt = now;
      const base = 100 * combo;
      score += Math.round(base * ((feverEnabled && feverActive) ? FEVER_MULTIPLIER : 1));
      const comboSuffix = combo > 1 ? ` x${combo}` : '';
      scoreEl.textContent = `${score}${comboSuffix}`;
      if (combo > 1) {
        flashCombo();
        primeComboMeter();
      } else {
        resetComboBadge();
        stopComboMeter();
      }
      if (combo > maxCombo) maxCombo = combo;
      try { SFX('slice'); } catch {}
      // Fever charge: base plus small bonus for fast swipes; boost in sequence mode
      const charge = (FEVER_CHARGE_SLICE + Math.min(0.08, (lastSwipeDist-60) * 0.0015)) * (sequenceMode ? FEVER_SEQ_CHARGE_BOOST : 1);
      addFever(charge);
      // highlight sliced kana(s) and show combined romaji bubble near the sliced tile
      try { group.forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s){ s.textContent = chars[i] || ''; s.classList.add('text-emerald-600','font-semibold','underline'); } }); } catch {}
      const kanaText = group.map(i => (typeof i === 'number' && chars[i] !== undefined) ? chars[i] : '').join('');
      const romajiText = toRomaStr(kanaText) || '';
      // place bubble slightly above the sliced tile position
      const yAbove = t.y - ((t.radius || KANA_RADIUS) + 16);
      showRomaAt(t.x, yAbove, romajiText || kanaText);

      if (sliceShowcaseEnabled) {
        const tx = viewW * 0.5, ty = viewH * 0.45;
        coinFx.push({ mode:'swoop', sx: t.x || 0, sy: t.y || 0, tx, ty, born: performance.now(), dur: 500 });
        popFx.push({ x: tx, y: ty, created: performance.now() + 500, radius: (t.radius || KANA_RADIUS) + 10, kind: 'coinring' });
        sliceFx.push({ kind:'show', char: kanaText, romaji: romajiText, sx: t.x || 0, sy: t.y || 0, cx: tx, cy: ty, start: performance.now(), dur: sliceShowcaseDurationMs, spin: false, spoken: false });
      } else {
        if (speakOnSlice && kanaText) speakKana(kanaText);
        pauseSliceMoment('', null);
      }
      // remove partner tile(s) if present
      for (let j = tiles.length - 1; j >= 0; j--) { if (group.includes(tiles[j].index) && tiles[j].index !== t.index) { tiles.splice(j,1); } }
      // persistent progress: show last romaji + count and update bar      updateProgressUI();
      if (sliced.size === original.length) { if (ffaEnabled) { startFreeForAll(); } else { flashFullMapping(); completeStage(); }
      }
    } else if (t.type === 'bomb') {
      // During FFA, bombs are inert: remove and ignore
      if (mode === MODE_FFA) { try { /* visual pop without penalty */ popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || BOMB_RADIUS) + 4, isBomb: false }); } catch {} return; }
      if (shieldCount > 0) { shieldCount = Math.max(0, shieldCount - 1); updatePowerUI(); try { triggerShake(80,4); } catch {} return; }
      popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || BOMB_RADIUS) + 6, isBomb: true });
      // penalty: end game or restart stage
      scoreEl.textContent = `BOOM!`;
      try { SFX('bomb'); } catch {}
      try { triggerShake(140, 6); } catch {}
      if (bombEndsRound) {
        endGame('bomb');
      } else {
        // restart current stage, optionally resetting the timer if configured
        const msg = timerPerStage ? 'Bomb! Restarting stage and timer…' : 'Bomb! Restarting stage…';
        pauseSliceMoment(msg, () => {
          try { setStage(stageIndex); } catch {}
          // Timer will restart on resumeFromPause via startTimerTicker if it was running when paused
        });
      }
    } else if (t.type === 'power') {
      // Apply power-up effects
      try { SFX('slice'); } catch {}
      if (t.kind === 'freeze') { freezeUntil = Math.max(freezeUntil, performance.now() + powerFreezeMs); }
      else if (t.kind === 'double') { doubleUntil = Math.max(doubleUntil, performance.now() + powerDoubleMs); }
      else if (t.kind === 'shield') { shieldCount = Math.min(3, shieldCount + 1); }
      updatePowerUI();
      return;
    } else if (t.type === 'noise') {
      // Distractor: remove and apply small score penalty
      popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: t.radius || KANA_RADIUS });
      score = Math.max(0, score - noisePenalty);
      scoreEl.textContent = `${score}`;
      return;
    }
  }

  // segment-circle intersection
  function hitSegmentCircle(x1,y1,x2,y2,cx,cy,r){
    const dx=x2-x1, dy=y2-y1; const l2 = dx*dx+dy*dy; if (l2===0) return Math.hypot(cx-x1,cy-y1)<=r;
    let t=((cx-x1)*dx+(cy-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); const px=x1+t*dx, py=y1+t*dy; return Math.hypot(px-cx,py-cy)<=r;
  }

  // trail drawing
  const FADE_DURATION = 220; // milliseconds (how long trails last)
const trails = [];
function drawTrails() {
  const now = Date.now();
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

  // Go backwards so splice works safely
  for (let i = trails.length - 1; i >= 0; i--) {
    const segment = trails[i];

    // Draw each little segment in this trail
    for (let j = 0; j < segment.length - 1; j++) {
      const p0 = segment[j];
      const p1 = segment[j + 1];
      const age = (now - p0.time) / FADE_DURATION;
      if (age >= 1) continue; // faded, skip

      // Fade out as it ages
      trailCtx.strokeStyle = `rgba(0,255,0,${1 - age})`;
      trailCtx.lineWidth = 4;
      trailCtx.beginPath();
      trailCtx.moveTo(p0.x, p0.y);
      trailCtx.lineTo(p1.x, p1.y);
      trailCtx.stroke();
    }

    // Remove trail if last point is old
    if (now - segment[segment.length - 1].time > FADE_DURATION) {
      trails.splice(i, 1);
    }
  }
}




  canvas.style.touchAction = "none";
  const SLICE_PAD = 14;
  const CLICK_PAD = 9;
  let pointerIsDown = false;
  let activeSlicePad = SLICE_PAD;
  let activeClickPad = CLICK_PAD;

  const clearTrails = () => {
    trails.length = 0;
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
  };

canvas.addEventListener("pointerdown", e => {
  if (mode === MODE_FFA && performance.now() < ffaReadyAt) { return; }
  pointerIsDown = true;
  const pointerType = (e.pointerType || '').toLowerCase();
  if (pointerType === 'mouse') {
    activeClickPad = CLICK_PAD + 18;
    activeSlicePad = SLICE_PAD + 28;
  } else if (pointerType === 'pen') {
    activeClickPad = CLICK_PAD + 8;
    activeSlicePad = SLICE_PAD + 18;
  } else {
    activeClickPad = CLICK_PAD + 6;
    activeSlicePad = SLICE_PAD + 14;
  }
  if (canvas.setPointerCapture) {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  clearTrails();
  const now = Date.now();
  trails.push([{ x, y, time: now }]);
  try {
    if (_ac && _ac.state === 'suspended') { _ac.resume(); }
    else if (AudioCtx && !_ac) { _ac = new AudioCtx(); }
  } catch {}

  // click slice point
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (!t) continue;
    const baseRadius = (typeof t.radius === 'number') ? t.radius : (t.type === 'bomb' ? BOMB_RADIUS : KANA_RADIUS);
    const clickRadius = baseRadius + activeClickPad + 8;
    if (Math.hypot(t.x - x, t.y - y) < clickRadius) { tiles.splice(i,1); sliceKana(t); break; }
  }
});

  canvas.addEventListener('pointermove', e => {
  if (mode === MODE_FFA && performance.now() < ffaReadyAt) return;
  if (!pointerIsDown && e.buttons === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top );
  // Gentle magnet during FFA toward pointer
  if (mode === MODE_FFA) {
    try {
      for (let i = 0; i < tiles.length; i++) {
        const tt = tiles[i];
        if (!tt || !tt.ffa) continue;
        const dxm = x - tt.x, dym = y - tt.y; const dm = Math.hypot(dxm, dym);
        if (dm < 140) { tt.vx += (dxm / Math.max(1, dm)) * 0.8; tt.vy += (dym / Math.max(1, dm)) * 0.8; }
      }
    } catch {}
  }
  if (!trails.length) return; // guard if move occurs before down
  const current = trails[trails.length - 1];
  const now = Date.now();
  const lastPoint = current[current.length - 1];
  if (!lastPoint || (now - lastPoint.time) > 18) {
    current.push({ x, y, time: now });
    if (current.length > 6) {
      current.splice(0, current.length - 6);
    }
  }
  // Slice detection along latest segment
  const p0 = current[current.length-2];
  const p1 = current[current.length-1];
  const hasSegment = !!(p0 && p1);
  let speedBoost = 0;
  if (hasSegment){
    const dxSeg = p1.x - p0.x;
    const dySeg = p1.y - p0.y;
    const distSeg = Math.hypot(dxSeg, dySeg);
    if (distSeg > 60) { try { SFX('swish'); } catch {} }
    speedBoost = Math.min(32, distSeg * 0.7);
    lastSwipeDist = distSeg;
  }
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (!t) continue;
    const baseRadius = (typeof t.radius === 'number') ? t.radius : (t.type === 'bomb' ? BOMB_RADIUS : KANA_RADIUS);
    const sweepRadius = baseRadius + activeSlicePad + speedBoost;
    const pointerRadius = sweepRadius + 6;
    let hit = Math.hypot(t.x - x, t.y - y) < pointerRadius;
    if (!hit && hasSegment){
      const maxSegments = Math.min(current.length - 1, 4);
      for (let s = 0; s < maxSegments; s++) {
        const idx2 = current.length - 1 - s;
        const idx1 = idx2 - 1;
        if (idx1 < 0) break;
        const segStart = current[idx1];
        const segEnd = current[idx2];
        if (!segStart || !segEnd) break;
        if (hitSegmentCircle(segStart.x,segStart.y,segEnd.x,segEnd.y,t.x,t.y,sweepRadius + 8)) { hit = true; break; }
      }
    }
    if (hit) {
      tiles.splice(i,1);
      sliceKana(t);
      continue;
    }
  }
  drawTrails();
});

  const endPointer = e => {
    pointerIsDown = false;
    clearTrails();
    activeClickPad = CLICK_PAD;
    activeSlicePad = SLICE_PAD;
    trails.length = 0;
    if (canvas.releasePointerCapture && e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
    }
  };



// clear everything on pointerup so no ghost trails remain
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', endPointer);
canvas.addEventListener('pointerout', endPointer);

  // start the round
  function startRound() {
    tiles = [];
    popFx.length = 0;
    score = 0; combo = 0; lastSliceAt = 0; mode = MODE_NORMAL; coinCount = 0; ffaEndsAt = 0; coinFx.length = 0;
    // Reset FFA state at the beginning of a round
    mode = MODE_NORMAL; coinCount = 0; ffaEndsAt = 0; coinFx.length = 0;
    try { coinCounterEl.textContent = 'Coins: 0'; coinCounterEl.style.display = 'none'; countdownEl.style.display = 'none'; } catch {}
    updateCoinBankUI();
    // Reset fever state at round start
    feverActive = false; fever = 0; updateFeverUI(false);
    scoreEl.textContent = '0';
    stageIndex = 0;
    setStage(stageIndex);
    timer = roundSeconds;
    timerEl.textContent = timer;
    roundActive = true;
    applySwordCursor();
    try {
    const help = document.getElementById('slice-instructions');
    if (help) {
      help.textContent = 'Slice kana. Bombs explode - avoid them. Swipe for combos.';
      help.style.opacity = '1';
        // Shading removed; just show/hide help text
        updateIntroSpotlight();
        setTimeout(()=>{ help.style.opacity='0'; }, 3000);
      }
    } catch {}

    draw();
    const kick = () => {
      // dynamic spawn rate over time (track timing for pause/resume) or Quiz mode
      if (!quizMode) {
        spawnStartTime = performance.now();
        scheduleNext = function(){
          const now = performance.now();
          const t = Math.min(1, (now-spawnStartTime)/(roundSeconds*1000));
          const msBase = Math.round(spawnMsStart + (spawnMsEnd - spawnMsStart) * t);
          const rateBoost = (mode === MODE_FFA) ? Math.max(1, ffaSpawnRateBoost) : 1;
          const freezeSlow = (freezeUntil > now) ? 1.6 : 1; // Freeze slows cadence a bit
          const ms = Math.max(40, Math.round(msBase / rateBoost * freezeSlow));
          // Spawn density
          if (mode === MODE_FFA) {
            spawn();
            // Keep density high during bonus
            if (Math.random() < 0.8) spawn();
          } else {
            spawn();
            if (diffSpawnExtra() && Math.random() < 0.5) spawn();
          }
          nextSpawnDelay = ms;
          spawnScheduledAt = now;
          spawnHandle = setTimeout(scheduleNext, ms);
        };
        scheduleNext();
      } else {
        startQuiz();
      }
      startTimerTicker();
    };
    if (memoryCue) {
      pauseForStage();
      presentMemoryCue(() => { resumeFromPause(); kick(); });
    } else {
      kick();
    }
  }

  // clean up and show game-over panel or close
  function endGame(reason = 'timeout') {
    clearTimeout(spawnHandle);
    clearInterval(timerInterval);
    cancelAnimationFrame(animateId);
    stopComboMeter();
    resetComboBadge();
    resetSwordCursor();
    popFx.length = 0;
    clearTrails();
    roundActive = false;
    // Ensure no pending pause resumes after ending
    cancelActivePause({ skipResume: true, skipCallbacks: true });
    if (quizMode) setQuizPrompt('');
    if (overPanel) {
      const t = document.getElementById('slice-over-title');
      const r = document.getElementById('slice-over-reason');
      if (t) t.textContent = (reason === 'clear') ? 'All Done!' : 'Game Over';
      if (r) r.textContent = (reason === 'bomb') ? 'You hit a bomb' : (reason === 'timeout' ? 'Time up' : 'Great job!');
      overPanel.classList.remove('hidden');
      if (tryBtn) tryBtn.onclick = () => { overPanel.classList.add('hidden'); startRound(); };
      if (finishBtn) finishBtn.onclick = () => { overPanel.classList.add('hidden'); overlay.classList.add('hidden'); try{ document.documentElement.style.overflow=''; document.body.style.overflow=''; document.body.style.touchAction=''; }catch{} };
    } else {
      overlay.classList.add('hidden'); try{ document.documentElement.style.overflow=''; document.body.style.overflow=''; document.body.style.touchAction=''; }catch{}
    }
    // persist bank on game end
    updateCoinBankUI();
  }
  closeBtn.addEventListener("click", () => { clearTimeout(spawnHandle); clearInterval(timerInterval); cancelAnimationFrame(animateId); stopComboMeter(); resetComboBadge(); resetSwordCursor(); popFx.length = 0; clearTrails(); roundActive = false; cancelActivePause({ skipResume: true, skipCallbacks: true }); if (quizMode) setQuizPrompt(''); updateCoinBankUI(); overlay.classList.add('hidden'); try{ document.documentElement.style.overflow=''; document.body.style.overflow=''; document.body.style.touchAction=''; }catch{} });

  // show modal & kick off ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ensure sizing runs after it becomes visible
  overlay.classList.remove('hidden'); try{ document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'; document.body.style.touchAction='none'; }catch{}
  requestAnimationFrame(() => { resize(); startRound(); });
}















































