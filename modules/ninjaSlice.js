// modules/ninjaSlice.js

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


  // Progress UI updater
  function updateProgressUI(){
    try {
      if (progressEl) {
        const total = Math.max(1, (chars && chars.length) ? chars.length : 0);
        const stageLabel = (stageData && stageData.length > 1) ? `Stage ${stageIndex + 1}/${stageData.length} ` : '';
        progressEl.textContent = `${stageLabel}(${sliced.size}/${total})`;
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
        const done = sliced && sliced.has ? sliced.has(i) : false;
        const cls = done ? 'text-emerald-600 font-semibold underline' : '';
        return `<span data-idx="${i}" class="kana-ch ${cls}" style="transition:color .2s">${ch}</span>`;
      }).join('');
    }catch{ kanaEl.textContent = chars.join(''); }
  }
  function toRomaStr(s){ try { return (window.wanakana ? wanakana.toRomaji(s) : ''); } catch { return ''; } }
  const SMALL_YOON = new Set(['\u3083','\u3085','\u3087','\u30E3','\u30E5','\u30E7']);
  function groupForIndex(idx){
    const c = chars[idx];
    const prev = chars[idx-1];
    const next = chars[idx+1];
    if (SMALL_YOON.has(c) && idx>0) return [idx-1, idx];
    if (SMALL_YOON.has(next)) return [idx, idx+1];
    return [idx];
  }
  // Small floating romaji bubble near the sliced kana
  const romaBubble = document.createElement('div');
  romaBubble.className = 'absolute pointer-events-none bg-black text-white text-xs px-2 py-1 rounded opacity-0 transition-opacity duration-300';
  holder.appendChild(romaBubble);
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
    const cleaned = raw.replace(/[。．.]+$/u, '');
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
    chars = Array.from(phraseText);
    original = chars.map((ch, i) => ({ char: ch, index: i }));
    sliced = new Set();
    if (typeof tiles !== 'undefined') { tiles.length = 0; }
    if (typeof popFx !== 'undefined') { popFx.length = 0; }
    buildKanaDisplay();
    const romajiText = stage.romaji || ((typeof window !== 'undefined' && window.wanakana && phraseText) ? window.wanakana.toRomaji(phraseText) : '');
    romajiEl.textContent = romajiText || '';
    englishEl.textContent = stage.english || '';
    if (progressBar) progressBar.style.width = '0%';
    combo = 0;
    lastSliceAt = 0;
    if (scoreEl) scoreEl.textContent = `${score}`;
    stopComboMeter();
    resetComboBadge();
    updateProgressUI();
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
  resize();

  // prepare tiles
  let tiles = [];
  const popFx = [];
  const POP_DURATION = 220;
  let score = 0;
  let timer = roundSeconds;
  let spawnHandle = null, animateId = null, timerInterval = null;
  let lastSliceAt = 0, combo = 0;

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
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerEl.textContent = --timer;
      if (timer <= 0) endGame();
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
      fx.created += pausedDuration;
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

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let t of tiles) {
      // integrate
      t.x += t.vx * timeScale;
      t.y += t.vy * timeScale;
      t.vy += gravity * timeScale; // gravity
      if (t.spin) t.rot += t.spin;

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
        ctx.font = '52px system-ui, sans-serif';
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

        const highlightGradient = ctx.createRadialGradient(-radius * 0.4, -radius * 0.45, radius * 0.05, -radius * 0.4, -radius * 0.45, radius * 0.35);
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.fillStyle = highlightGradient;
        ctx.arc(-radius*0.35, -radius*0.35, radius*0.32, Math.PI*1.1, Math.PI*1.9, false);
        ctx.fill();

        ctx.save();
        ctx.fillStyle = '#111';
        ctx.font = '56px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const bubbleGlyph = (typeof t.char === 'string' && t.char.trim()) ? t.char : '';
        const bubbleYOffset = radius * 0.06;
        if (bubbleGlyph) ctx.fillText(bubbleGlyph, 0, bubbleYOffset);
        ctx.restore();
      }
      ctx.restore();
    }

    for (let i = popFx.length - 1; i >= 0; i--) {
      const fx = popFx[i];
      const age = now - fx.created;
      if (age > POP_DURATION) {
        popFx.splice(i, 1);
        continue;
      }
      const pct = age / POP_DURATION;
      const baseRadius = fx.radius || KANA_RADIUS;
      const ringRadius = baseRadius + pct * 16;
      ctx.save();
      const alpha = fx.isBomb ? Math.max(0, 0.9 - pct) : Math.max(0, 0.7 - pct * 0.7);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = fx.isBomb ? 3 : 2;
      ctx.strokeStyle = fx.isBomb ? '#f87171' : '#a5f3fc';
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, ringRadius, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    animateId = requestAnimationFrame(draw);
  }

  // console.debug('Slice tiles:', original.length);

  // spawn a new tile (kana or bomb)
  function spawn() {
    const wantBomb = Math.random() < bombChance;
    if (wantBomb) {
      tiles.push({ type:'bomb', radius: BOMB_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
      return;
    }
    // pick an unsliced kana index
    const candidates = original.filter(o => !sliced.has(o.index));
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    if (!pick) return;
    tiles.push({ type:'kana', char: pick.char, index: pick.index, radius: KANA_RADIUS, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
  }


  // handle slicing
  function sliceKana(t) {
    if (t.type === 'kana') {
      popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: t.radius || KANA_RADIUS });
      const group = groupForIndex(t.index);
      group.forEach(i=>sliced.add(i));
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
      // highlight sliced kana(s) and show combined romaji bubble
      try { group.forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s) s.classList.add('text-emerald-600','font-semibold','underline'); }); } catch {}
      showRomaForGroup(group);
      // remove partner tile(s) if present
      for (let j = tiles.length - 1; j >= 0; j--) { if (group.includes(tiles[j].index) && tiles[j].index !== t.index) { tiles.splice(j,1); } }
      // persistent progress: show last romaji + count and update bar      updateProgressUI();
      if (sliced.size === original.length) {
        if (stageData && stageIndex < stageData.length - 1) {
          setStage(stageIndex + 1);
          return;
        }
        endGame('clear');
      }
    } else if (t.type === 'bomb') {
      popFx.push({ x: t.x, y: t.y, created: performance.now(), radius: (t.radius || BOMB_RADIUS) + 6, isBomb: true });
      // penalty: end game or big score drop
      scoreEl.textContent = `BOOM!`;
      try { SFX('bomb'); } catch {}
      endGame('bomb');
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
    score = 0; combo = 0; lastSliceAt = 0;
    scoreEl.textContent = '0';
    stageIndex = 0;
    setStage(stageIndex);
    timer = roundSeconds;
    timerEl.textContent = timer;
    applySwordCursor();
    try { const help = document.getElementById('slice-instructions'); if (help) { help.style.opacity = '1'; setTimeout(()=>help.style.opacity='0', 3000); } } catch {}

    draw();
    // dynamic spawn rate over time
    const start = performance.now();
    function scheduleNext(){
      const t = Math.min(1, (performance.now()-start)/(roundSeconds*1000));
      const ms = Math.round(spawnMsStart + (spawnMsEnd-spawnMsStart)*t);
      spawn();
      spawnHandle = setTimeout(scheduleNext, ms);
    }
    scheduleNext();

    timerInterval = setInterval(() => {
      timerEl.textContent = --timer;
      if (timer <= 0) endGame();
    }, 1000);
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
  }
  closeBtn.addEventListener("click", () => { clearTimeout(spawnHandle); clearInterval(timerInterval); cancelAnimationFrame(animateId); stopComboMeter(); resetComboBadge(); resetSwordCursor(); popFx.length = 0; clearTrails(); overlay.classList.add('hidden'); });

  // show modal & kick off — ensure sizing runs after it becomes visible
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => { resize(); startRound(); });
}



































