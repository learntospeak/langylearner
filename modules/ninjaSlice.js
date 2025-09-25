export function initNinjaSlice(config) {
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
  const holder = canvas.parentElement || container;
  if (holder && holder.style && (!holder.style.position || holder.style.position === '')) {
    holder.style.position = 'relative';
  }
  const KANA_RADIUS = 42;
  const BOMB_RADIUS = 32;
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
  const coinFx = [];             // coin particles (rendered later via fxCanvas)
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
  // Persistent bank display
  const bankEl = document.createElement('div');
  bankEl.id = 'slice-coin-bank';
  bankEl.style.display = '';
  bankEl.style.padding = '4px 8px';
  bankEl.style.borderRadius = '10px';
  bankEl.style.background = 'rgba(255,255,255,0.9)';
  bankEl.style.border = '1px solid rgba(16,185,129,0.35)';
  bankEl.style.color = '#065f46';
  bankEl.style.font = '700 13px system-ui, sans-serif';
  bankEl.textContent = 'Total: 0';
  const bankReset = document.createElement('button');
  bankReset.type = 'button';
  bankReset.textContent = 'Reset';
  bankReset.style.marginLeft = '6px';
  bankReset.style.font = '600 11px system-ui, sans-serif';
  bankReset.style.padding = '2px 6px';
  bankReset.style.borderRadius = '8px';
  bankReset.style.border = '1px solid rgba(16,185,129,0.35)';
  bankReset.style.background = 'rgba(236,253,245,0.9)';
  bankReset.style.color = '#047857';
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
      // layout: score | time | combo | total | coins | countdown
      const bankWrap = document.createElement('div');
      bankWrap.style.display = 'flex';
      bankWrap.style.alignItems = 'center';
      bankWrap.appendChild(bankEl);
      bankWrap.appendChild(bankReset);
      statusBar.appendChild(bankWrap);
      statusBar.appendChild(coinCounterEl);
      statusBar.appendChild(countdownEl);
    } else {
      // fallback: pin to top-left in holder
      bankEl.style.position = 'absolute';
      bankEl.style.left = '12px';
      bankEl.style.top = '8px';
      bankReset.style.position = 'absolute';
      bankReset.style.left = '90px';
      bankReset.style.top = '8px';
      coinCounterEl.style.position = 'absolute';
      coinCounterEl.style.left = '12px';
      coinCounterEl.style.top = '38px';
      countdownEl.style.position = 'absolute';
      countdownEl.style.right = '12px';
      countdownEl.style.top = '8px';
      holder.appendChild(bankEl);
      holder.appendChild(bankReset);
      holder.appendChild(coinCounterEl);
      holder.appendChild(countdownEl);
    }
  } catch {}

  function updateCoinBankUI(){
    try { bankEl.textContent = `Total: ${coinBank}`; } catch {}
    try { localStorage.setItem('sliceCoinBank', String(Math.max(0, coinBank|0))); } catch {}
  }
  try {
    bankReset.addEventListener('click', () => {
      try {
        const ok = window.confirm ? window.confirm('Reset total coins?') : true;
        if (!ok) return;
      } catch {}
      coinBank = 0;
      updateCoinBankUI();
    });
  } catch {}
  function startFreeForAll(){
    try {
      if (!ffaEnabled || mode === MODE_FFA) { if (typeof flashFullMapping === 'function') flashFullMapping(); completeStage(); return; }
      mode = MODE_FFA;
      coinCount = 0;
      ffaEndsAt = performance.now() + (ffaSeconds * 1000);
      ffaReadyAt = performance.now() + 1000; // wait 1s before accepting input
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
    const award = Math.max(0, Math.floor(coinCount));
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
  let quizPromptEl = document.createElement('div');
  quizPromptEl.style.position = 'absolute';
  // Position centrally; dynamic Y computed below to avoid overlapping the top bar
  quizPromptEl.style.top = '72px';
  quizPromptEl.style.left = '50%';
  quizPromptEl.style.transform = 'translateX(-50%)';
  quizPromptEl.style.background = 'rgba(255,255,255,0.92)';
  quizPromptEl.style.color = '#111827';
  quizPromptEl.style.padding = '10px 16px';
  quizPromptEl.style.borderRadius = '12px';
  quizPromptEl.style.border = '1px solid rgba(245,158,11,0.5)';
  quizPromptEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
  quizPromptEl.style.font = '700 18px system-ui, sans-serif';
  quizPromptEl.style.letterSpacing = '.02em';
  quizPromptEl.style.zIndex = '10';
  quizPromptEl.style.pointerEvents = 'none';
  quizPromptEl.textContent = '';
  holder.appendChild(quizPromptEl);

  // Add a subtle pulse animation for extra prominence
  (function addPromptPulse(){
    try{
      const style = document.createElement('style');
      style.textContent = `@keyframes promptPulse{0%{transform:translateX(-50%) scale(1); box-shadow:0 6px 20px rgba(0,0,0,0.18)}50%{transform:translateX(-50%) scale(1.03); box-shadow:0 10px 26px rgba(0,0,0,0.22)}100%{transform:translateX(-50%) scale(1); box-shadow:0 6px 20px rgba(0,0,0,0.18)}}`;
      (document.head||holder||document.body).appendChild(style);
    }catch{}
  })();

  function positionQuizPrompt(){
    try{
      const rHolder = holder.getBoundingClientRect();
      const status = document.getElementById('slice-status');
      const closeBtn = document.getElementById('slice-close');
      const controlsWrap = closeBtn ? closeBtn.parentElement : null;
      let bottom = 0;
      if (status){ const r1 = status.getBoundingClientRect(); bottom = Math.max(bottom, r1.bottom); }
      if (controlsWrap){ const r2 = controlsWrap.getBoundingClientRect(); bottom = Math.max(bottom, r2.bottom); }
      const pad = 8;
      if (bottom > 0){
        const y = Math.max(40, Math.round(bottom - rHolder.top + pad));
        quizPromptEl.style.top = y + 'px';
      }
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
      <button id="slice-stage-next" class="btn btn-primary" style="margin-top:.25rem;">Continue</button>
    </div>`;
  holder.appendChild(stageOverlay);
  function showStageBanner(number, phraseText, romajiText, englishText){
    try{
      const numEl = stageOverlay.querySelector('#slice-stage-number');
      const phEl = stageOverlay.querySelector('#slice-stage-phrase');
      const roEl = stageOverlay.querySelector('#slice-stage-romaji');
      const enEl = stageOverlay.querySelector('#slice-stage-en');
      if (numEl) numEl.textContent = String(number);
      if (phEl) phEl.textContent = phraseText || '';
      if (roEl) roEl.textContent = romajiText || '';
      if (enEl) enEl.textContent = englishText || '';
      stageOverlay.style.display = 'flex';
    }catch{}
  }
  function hideStageBanner(){
    try { stageOverlay.style.display = 'none'; } catch {}
  }
  // Memory cue overlay (shows tiles flipping the phrase)
  const memoryOverlay = document.createElement('div');
  memoryOverlay.style.position = 'absolute';
  memoryOverlay.style.inset = '0';
  memoryOverlay.style.display = 'none';
  memoryOverlay.style.alignItems = 'center';
  memoryOverlay.style.justifyContent = 'center';
  memoryOverlay.style.background = 'rgba(0,0,0,0.35)';
  memoryOverlay.style.zIndex = '50';
  holder.appendChild(memoryOverlay);
  function presentMemoryCue(onDone){
    try{
      const phraseText = (chars || []).join('');
      if (!phraseText) { onDone && onDone(); return; }
      // Build tiles container
      memoryOverlay.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '10px';
      wrap.style.padding = '12px 16px';
      wrap.style.borderRadius = '12px';
      wrap.style.background = 'rgba(255,255,255,0.9)';
      wrap.style.boxShadow = '0 12px 30px rgba(0,0,0,0.25)';
      memoryOverlay.appendChild(wrap);
      const tiles = [];
      for (let i = 0; i < chars.length; i++) {
        const tile = document.createElement('div');
        tile.textContent = chars[i];
        tile.style.width = '42px'; tile.style.height = '56px';
        tile.style.display = 'flex'; tile.style.alignItems = 'center'; tile.style.justifyContent = 'center';
        tile.style.font = '700 28px system-ui, sans-serif'; tile.style.color = '#111827';
        tile.style.background = '#fde68a'; tile.style.border = '2px solid #b45309'; tile.style.borderRadius = '10px';
        tile.style.transform = 'scale(0.6) rotateX(90deg)'; tile.style.opacity = '0';
        tile.style.transition = 'transform 220ms ease, opacity 220ms ease';
        wrap.appendChild(tile); tiles.push(tile);
      }
      memoryOverlay.style.display = 'flex';
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
  // Handle stage completion: banner + speech + advance or end
  function completeStage(){
    // Guard if already not active
    const completedStage = stageData[stageIndex] || { phrase: '', romaji: '', english: '' };
    const thisStageNumber = stageIndex + 1;
    pauseForStage();
    setTimeout(() => showStageBanner(thisStageNumber, completedStage.phrase || '', (completedStage.romaji || ''), (completedStage.english || '')), 1000);
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
    speakJA(completedStage.phrase || '');
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
    window.addEventListener('resize', positionQuizPrompt);
    if ('ResizeObserver' in window) new ResizeObserver(()=>positionQuizPrompt()).observe(holder);
    setTimeout(positionQuizPrompt, 0);
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
  // Track swipe vigor for perfect effects
  let lastSwipeDist = 0;

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
    const windowMs = Math.max(1, comboWindowMs || 1);
    const progress = 1 - ((performance.now() - lastSliceAt) / windowMs);
    if (progress <= 0 || combo <= 1) {
      stopComboMeter();
      return;
    }
    setComboMeter(progress);
    comboDecayHandle = requestAnimationFrame(tickComboMeter);
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

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      t.vy += gravity * timeScale; // gravity
      if (t.spin) t.rot += t.spin * Math.max(0, bubbleSpinSpeed || 0);

      // bounce off walls slightly
      if (t.x < 0 || t.x > viewW) t.vx *= -0.98;

      // draw
      ctx.save();
      ctx.translate(t.x, t.y);
      if (t.rot) ctx.rotate(t.rot);
      if (t.type === 'bomb') {
        ctx.save();
        const bodyRadius = (t.radius || BOMB_RADIUS) * 0.9;
        const bodyGradient = ctx.createLinearGradient(0, -bodyRadius, 0, bodyRadius * 1.2);
        bodyGradient.addColorStop(0, '#fde7d9');
        bodyGradient.addColorStop(1, '#f2b190');
        ctx.beginPath();
        ctx.fillStyle = bodyGradient;
        ctx.ellipse(0, bodyRadius * 0.1, bodyRadius * 0.95, bodyRadius * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.ellipse(0, bodyRadius * 0.32, bodyRadius * 0.55, bodyRadius * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111827';
        ctx.fillRect(-bodyRadius * 0.95, bodyRadius * 0.12, bodyRadius * 1.9, bodyRadius * 0.48);
        ctx.fillRect(-bodyRadius * 0.28, bodyRadius * 0.12, bodyRadius * 0.56, bodyRadius * 0.88);

        const clothGradient = ctx.createLinearGradient(0, bodyRadius * 0.12, 0, bodyRadius * 0.9);
        clothGradient.addColorStop(0, 'rgba(255,255,255,0.2)');
        clothGradient.addColorStop(1, 'rgba(17,24,39,0.65)');
        ctx.fillStyle = clothGradient;
        ctx.fillRect(-bodyRadius * 0.25, bodyRadius * 0.16, bodyRadius * 0.5, bodyRadius * 0.7);

        const headRadius = bodyRadius * 0.44;
        const headGradient = ctx.createLinearGradient(0, -bodyRadius * 1.35, 0, -bodyRadius * 0.4);
        headGradient.addColorStop(0, '#fdd9c2');
        headGradient.addColorStop(1, '#f4b28c');
        ctx.beginPath();
        ctx.fillStyle = headGradient;
        ctx.arc(0, -bodyRadius * 0.92, headRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#111827';
        ctx.arc(0, -bodyRadius * 1.08, headRadius * 0.78, Math.PI * 0.95, Math.PI * 2.05);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -bodyRadius * 1.24, headRadius * 0.36, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = '#111';
        ctx.arc(-headRadius * 0.36, -bodyRadius * 0.95, headRadius * 0.14, 0, Math.PI * 2);
        ctx.arc(headRadius * 0.36, -bodyRadius * 0.95, headRadius * 0.14, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = headRadius * 0.18;
        ctx.lineCap = 'round';
        ctx.arc(0, -bodyRadius * 0.74, headRadius * 0.48, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();

        const armColor = '#f3b48f';
        ctx.beginPath();
        ctx.strokeStyle = armColor;
        ctx.lineWidth = bodyRadius * 0.32;
        ctx.lineCap = 'round';
        ctx.moveTo(-bodyRadius * 0.92, -bodyRadius * 0.08);
        ctx.lineTo(-bodyRadius * 0.38, bodyRadius * 0.46);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bodyRadius * 0.92, -bodyRadius * 0.08);
        ctx.lineTo(bodyRadius * 0.38, bodyRadius * 0.46);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = armColor;
        ctx.arc(-bodyRadius * 0.78, bodyRadius * 0.68, bodyRadius * 0.22, 0, Math.PI * 2);
        ctx.arc(bodyRadius * 0.78, bodyRadius * 0.68, bodyRadius * 0.22, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.fillStyle = '#111';
        ctx.font = "52px \"Noto Sans JP\", \"Yu Gothic UI\", system-ui, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const sumoGlyph = (typeof t.char === 'string' && t.char.trim()) ? t.char : '';
        const sumoYOffset = bodyRadius * 0.18;
        if (sumoGlyph) ctx.fillText(sumoGlyph, 0, sumoYOffset);
        ctx.restore();

        ctx.restore();
      } else {
        const radius = t.radius || KANA_RADIUS;
        const bubbleGradient = ctx.createRadialGradient(0, -radius * 0.25, radius * 0.1, 0, 0, radius);
        bubbleGradient.addColorStop(0, 'rgba(255, 249, 196, 0.95)');
        bubbleGradient.addColorStop(0.55, 'rgba(253, 224, 141, 0.4)');
        bubbleGradient.addColorStop(1, 'rgba(217, 119, 6, 0.22)');
        ctx.beginPath();
        ctx.fillStyle = bubbleGradient;
        ctx.arc(0, 0, radius, 0, Math.PI*2); ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.85)';
        ctx.lineWidth = 2.4;
        ctx.arc(0, 0, radius-1, 0, Math.PI*2); ctx.stroke();

        // Glow effect when streak is active
        if (typeof glowUntil === 'number' && performance.now() < glowUntil) {
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
        ctx.fillStyle = '#111';
        ctx.font = "56px \"Noto Sans JP\", \"Yu Gothic UI\", system-ui, sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const bubbleGlyph = (typeof t.char === 'string' && t.char.trim()) ? t.char : '';
        const bubbleYOffset = radius * 0.06;
        if (bubbleGlyph) ctx.fillText(bubbleGlyph, 0, bubbleYOffset);

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
      // perfect ring styling
      if (fx.kind === 'perfect') {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)'; // amber-400
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
    setQuizPrompt(`Slice: ${romajiText || kanaText}`);
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
        rot:0, spin:(Math.random()*2-1)*0.06
      });
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
    if (mode === MODE_FFA && t && t.type === 'kana') {
      try {
        coinCount += Math.max(0, coinPerKana);
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
            if (got !== want) { setQuizPrompt(`Slice: ${toRomaStr(want) || want}`); return; }
            // correct: mark sliced, show hint bubble, advance index
            (wantG || []).forEach(i => { if (typeof i === 'number') sliced.add(i); });
            try { buildKanaDisplay(); } catch {}
            const yHint = (t.y || 0) - ((t.radius || KANA_RADIUS) + 16);
            const rTxt = toRomaStr(want) || want;
            showRomaAt(t.x || 0, yHint, rTxt);
            if (speakOnSlice && want) speakKana(want);
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

          if (speakOnSlice && kanaTextQ) speakKana(kanaTextQ);
          const nowQ = performance.now();
          combo = (nowQ - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
          lastSliceAt = nowQ;
          score += 200 * Math.max(1, combo);
          scoreEl.textContent = `${score}${combo > 1 ? ` x${combo}` : ''}`;
          if (combo > 1) { flashCombo(); primeComboMeter(); } else { resetComboBadge(); stopComboMeter(); }
          try { (t.indices || []).forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s){ s.textContent = chars[i] || ''; s.classList.add('text-emerald-600','font-semibold','underline'); } }); } catch {}
          // remove the whole wave
          const waveId = t.waveId;
          for (let j = tiles.length - 1; j >= 0; j--) { if (tiles[j] && tiles[j].waveId === waveId) tiles.splice(j, 1); }
          updateProgressUI();
          if (sliced.size === original.length) { if (ffaEnabled) { startFreeForAll(); } else { flashFullMapping(); completeStage(); }
          } else {
            pauseSliceMoment('', null);
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
      }
      const group = groupForIndex(t.index);
      group.forEach(i=>sliced.add(i));
      try { buildKanaDisplay(); } catch {}
      const now = performance.now();
      combo = (now - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
      lastSliceAt = now;
      score += 100 * combo;
      const comboSuffix = combo > 1 ? ` x${combo}` : '';
      scoreEl.textContent = `${score}${comboSuffix}`;
      if (combo > 1) {
        flashCombo();
        primeComboMeter();
      } else {
        resetComboBadge();
        stopComboMeter();
      }
      try { SFX('slice'); } catch {}
      // highlight sliced kana(s) and show combined romaji bubble near the sliced tile
      try { group.forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s){ s.textContent = chars[i] || ''; s.classList.add('text-emerald-600','font-semibold','underline'); } }); } catch {}
      const kanaText = group.map(i => (typeof i === 'number' && chars[i] !== undefined) ? chars[i] : '').join('');
      const romajiText = toRomaStr(kanaText) || '';
      // place bubble slightly above the sliced tile position
      const yAbove = t.y - ((t.radius || KANA_RADIUS) + 16);
      showRomaAt(t.x, yAbove, romajiText || kanaText);

      if (speakOnSlice && kanaText) speakKana(kanaText);
      pauseSliceMoment('', null);
      // remove partner tile(s) if present
      for (let j = tiles.length - 1; j >= 0; j--) { if (group.includes(tiles[j].index) && tiles[j].index !== t.index) { tiles.splice(j,1); } }
      // persistent progress: show last romaji + count and update bar      updateProgressUI();
      if (sliced.size === original.length) { if (ffaEnabled) { startFreeForAll(); } else { flashFullMapping(); completeStage(); }
      }
    } else if (t.type === 'bomb') {
      // During FFA, bombs are inert: remove and ignore
      if (mode === MODE_FFA) { try { /* visual pop without penalty */ popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || BOMB_RADIUS) + 4, isBomb: false }); } catch {} return; }
      popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || BOMB_RADIUS) + 6, isBomb: true });
      // penalty: end game or restart stage
      scoreEl.textContent = `BOOM!`;
      try { SFX('bomb'); } catch {}
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
    scoreEl.textContent = '0';
    stageIndex = 0;
    setStage(stageIndex);
    timer = roundSeconds;
    timerEl.textContent = timer;
    roundActive = true;
    applySwordCursor();
    try { const help = document.getElementById('slice-instructions'); if (help) { help.textContent = 'Slice kana. Red circles are bombs — avoid them. Swipe for combos.'; help.style.opacity = '1'; setTimeout(()=>help.style.opacity='0', 3000); } } catch {}

    draw();
    const kick = () => {
      // dynamic spawn rate over time (track timing for pause/resume) or Quiz mode
      if (!quizMode) {
        spawnStartTime = performance.now();
        scheduleNext = function(){
          const t = Math.min(1, (performance.now()-spawnStartTime)/(roundSeconds*1000));
          const msBase = Math.round(spawnMsStart + (spawnMsEnd - spawnMsStart) * t);
          const rateBoost = (mode === MODE_FFA) ? Math.max(1, ffaSpawnRateBoost) : 1;
          // Speed toggle should affect bubble motion/dispersion, not the timer cadence
          const ms = Math.max(40, Math.round(msBase / rateBoost));
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
          spawnScheduledAt = performance.now();
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
      if (r) r.textContent = (reason === 'bomb') ? 'You hit a bomb.' : (reason === 'timeout' ? 'Time up.' : 'Great job!');
      overPanel.classList.remove('hidden');
      if (tryBtn) tryBtn.onclick = () => { overPanel.classList.add('hidden'); startRound(); };
      if (finishBtn) finishBtn.onclick = () => { overPanel.classList.add('hidden'); overlay.classList.add('hidden'); };
    } else {
      overlay.classList.add('hidden');
    }
    // persist bank on game end
    updateCoinBankUI();
  }
  closeBtn.addEventListener("click", () => { clearTimeout(spawnHandle); clearInterval(timerInterval); cancelAnimationFrame(animateId); stopComboMeter(); resetComboBadge(); resetSwordCursor(); popFx.length = 0; clearTrails(); roundActive = false; cancelActivePause({ skipResume: true, skipCallbacks: true }); if (quizMode) setQuizPrompt(''); updateCoinBankUI(); overlay.classList.add('hidden'); });

  // show modal & kick off ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ensure sizing runs after it becomes visible
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => { resize(); startRound(); });
}















































