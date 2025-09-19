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
    statsElId,
    phrase = "",
    romaji = "",
    english = "",
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
  const BOMB_HIT_RADIUS = 28;
  const KANA_HIT_RADIUS = 28;
  const HIT_INFLATE = 1.15;
  const HIT_COOLDOWN_MS = 80;
  const NEAR_MISS_RADIUS = 52;
  const NEAR_MISS_COOLDOWN = 400;
  const NEAR_MISS_HITSTOP = 140;
  const COMBO_FLASH_MIN = 2;
  const COMBO_HITSTOP = 90;

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
  const statsEl = statsElId ? document.getElementById(statsElId) : null;
  const overPanel = config.gameOverId ? document.getElementById(config.gameOverId) : null;
  const tryBtn = config.tryBtnId ? document.getElementById(config.tryBtnId) : null;
  const finishBtn = config.finishBtnId ? document.getElementById(config.finishBtnId) : null;
  const bubblesToggle = config.bubblesToggleId ? document.getElementById(config.bubblesToggleId) : null;
  const progressEl = config.progressElId ? document.getElementById(config.progressElId) : null;
  const progressBar = config.progressBarId ? document.getElementById(config.progressBarId) : null;

  // Tunables (fallbacks)
  const launchBoost = Number((config && config.launchBoost) ?? 1.0);
  const gravity = Number((config && config.gravity) ?? 0.02);


  // Combo badge
  const comboBadge = document.getElementById('slice-combo');
  let comboHideTimer = null;
  function flashCombo(){
    if (!comboBadge) return;
    comboBadge.textContent = `x${combo}`;
    comboBadge.style.opacity = '1';
    comboBadge.style.transform = 'scale(1.15)';
    requestAnimationFrame(() => { if (comboBadge) comboBadge.style.transform = 'scale(1)'; });
    clearTimeout(comboHideTimer);
    comboHideTimer = setTimeout(()=>{ comboBadge.style.opacity = '0'; }, 500);
  }
  function resetComboBadge(){ if (comboBadge) { comboBadge.style.opacity = '0'; comboBadge.style.transform = 'scale(1)'; } }
  if (!overlay || !container || !canvas || !ctx || !closeBtn
    || !scoreEl || !timerEl || !kanaEl || !romajiEl || !englishEl) {
    console.warn("initNinjaSlice: missing DOM nodes");
    return;
  }

  const holder = canvas.parentElement || container;

  const swordCursor = 'url("images/slice-cursor.svg") 6 6, auto';
  const cursorTargets = [canvas, holder, overlay];
  const originalCursors = cursorTargets.map(el => (el && el.style ? el.style.cursor || '' : ''));
  function applySwordCursor(){
    cursorTargets.forEach(el => { if (el && el.style) el.style.cursor = swordCursor; });
  }
  function resetSwordCursor(){
    cursorTargets.forEach((el, idx) => { if (el && el.style) el.style.cursor = originalCursors[idx]; });
  }

  // populate text areas
  const chars = Array.from(phrase);
  function buildKanaDisplay(){
    try{
      kanaEl.innerHTML = chars.map((ch, i) => {
        const done = sliced && sliced.has ? sliced.has(i) : false;
        const cls = done ? 'text-emerald-600 font-semibold underline' : '';
        return `<span data-idx="${i}" class="kana-ch ${cls}" style="transition:color .2s">${ch}</span>`;
      }).join('');
    }catch{ kanaEl.textContent = phrase; }
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
  let bubblesOn = true;
  if (bubblesToggle) {
    bubblesOn = !!bubblesToggle.checked;
    bubblesToggle.addEventListener('change', ()=>{ bubblesOn = !!bubblesToggle.checked; romaBubble.style.opacity = '0'; });
  }
  function showRomaForGroup(indices){
    if (!bubblesOn) return;
    try{
      const anchorIdx = indices[indices.length-1];
      const span = kanaEl.querySelector(`[data-idx="${anchorIdx}"]`);
      if (!span) return;
      const text = indices.map(i=>chars[i]).join('');
      const roma = toRomaStr(text);
      const r1 = span.getBoundingClientRect();
      const r0 = holder.getBoundingClientRect();
      romaBubble.textContent = roma;
      romaBubble.style.left = (r1.left - r0.left + r1.width/2) + 'px';
      romaBubble.style.top  = (r1.top - r0.top - 18) + 'px';
      romaBubble.style.opacity = '1';
      setTimeout(()=>{ romaBubble.style.opacity = '0'; }, 700);
    }catch{}
  }

  const nearMissBadge = document.createElement('div');
  nearMissBadge.className = 'pointer-events-none absolute left-1/2 -translate-x-1/2 top-16 text-sm font-semibold text-amber-200 drop-shadow opacity-0 transition-opacity';
  holder.appendChild(nearMissBadge);
  let nearMissHideTimer = null;
  function flashNearMiss(message = 'Bomb dodged!'){
    nearMissBadge.textContent = message;
    nearMissBadge.style.opacity = '1';
    clearTimeout(nearMissHideTimer);
    nearMissHideTimer = window.setTimeout(()=>{ nearMissBadge.style.opacity = '0'; }, 420);
  }

  buildKanaDisplay();
  romajiEl.textContent = romaji;
  englishEl.textContent = english;

  // create a second "trail" canvas on top, aligned with the game canvas
  const trailCanvas = document.createElement("canvas");
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
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='sawtooth'; o.frequency.value = 880; g.gain.value = 0.06;
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.08);
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
  const original = chars.map((c, i) => ({ char: c, index: i }));
  let tiles = [];
  let sliced = new Set();
  let score = 0;
  let timer = roundSeconds;
  let spawnHandle = null, animateId = null, timerInterval = null;
  let lastSliceAt = 0;
  let combo = 0;
  let maxCombo = 0;
  let totalSlices = 0;
  let nearMisses = 0;
  let lastSliceLabel = '';
  let comboDecayTimer = null;
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

  function updateScoreHud(){
    if (!scoreEl) return;
    const comboPart = combo > 1 ? `  (x${combo})` : '';
    scoreEl.textContent = `Score: ${score}${comboPart}`;
  }

  function scheduleComboDecay(){
    clearTimeout(comboDecayTimer);
    if (combo <= 1) return;
    comboDecayTimer = window.setTimeout(() => {
      combo = 0;
      updateScoreHud();
      resetComboBadge();
    }, comboWindowMs);
  }

  function updateProgressUI(){
    try {
      if (progressEl) {
        const base = `(${sliced.size}/${chars.length})`;
        const extra = nearMisses > 0 ? ` | Near misses: ${nearMisses}` : '';
        const prefix = lastSliceLabel ? `${lastSliceLabel}  ` : '';
        progressEl.textContent = prefix + base + extra;
      }
      if (progressBar) {
        const pct = Math.max(0, Math.min(100, Math.round((sliced.size/Math.max(1,chars.length))*100)));
        progressBar.style.width = pct + '%';
      }
    } catch {}
  }

  // draw loop
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let t of tiles) {
      // integrate
      t.x += t.vx * timeScale;
      t.y += t.vy * timeScale;
      t.vy += gravity * timeScale; // gravity
      if (t.spin) t.rot += t.spin;

      // bounce off walls slightly
      if (t.x < 0 || t.x > viewW) t.vx *= -0.98;

      if (t._halo && t._halo > 0.01) {
        const haloAlpha = Math.min(0.55, t._halo);
        ctx.save();
        ctx.globalAlpha = haloAlpha;
        ctx.fillStyle = 'rgba(251,191,36,0.6)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, BOMB_HIT_RADIUS * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        t._halo *= 0.9;
      } else if (t._halo) {
        t._halo = 0;
      }

      // draw
      ctx.save();
      ctx.translate(t.x, t.y);
      if (t.rot) ctx.rotate(t.rot);
      if (t.type === 'bomb') {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '16px system-ui'; ctx.fillText('×', 0, 1);
      } else {
        ctx.fillStyle = '#111';
        ctx.fillText(t.char, 0, 0);
      }
      ctx.restore();
    }
    animateId = requestAnimationFrame(draw);
  }

  // console.debug('Slice tiles:', original.length);

  // spawn a new tile (kana or bomb)
  function spawn() {
    const wantBomb = Math.random() < bombChance;
    if (wantBomb) {
      tiles.push({ type:'bomb', _lastHitAt: 0, _lastNearMiss: 0, _halo: 0, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
      return;
    }
    // pick an unsliced kana index
    const candidates = original.filter(o => !sliced.has(o.index));
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    if (!pick) return;
    tiles.push({ type:'kana', _lastHitAt: 0, char: pick.char, index: pick.index, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
  }


  // handle slicing
  function sliceKana(t) {
    if (t.type === 'kana') {
      const group = groupForIndex(t.index);
      group.forEach(i=>sliced.add(i));
      totalSlices += group.length;
      const now = performance.now();
      combo = (now - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
      lastSliceAt = now;
      maxCombo = Math.max(maxCombo, combo);
      score += 100 * combo;
      updateScoreHud();
      if (combo >= COMBO_FLASH_MIN) {
        flashCombo();
        hitStop(COMBO_HITSTOP + Math.min(120, combo * 12));
      } else {
        resetComboBadge();
      }
      scheduleComboDecay();
      try { SFX('slice'); } catch {}
      // highlight sliced kana(s) and show combined romaji bubble
      try { group.forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s) s.classList.add('text-emerald-600','font-semibold','underline'); }); } catch {}
      showRomaForGroup(group);
      // remove partner tile(s) if present
      for (let j = tiles.length - 1; j >= 0; j--) {
        if (group.includes(tiles[j].index) && tiles[j].index !== t.index) {
          tiles.splice(j,1);
        }
      }
      // persistent progress: show last romaji + count and update bar
      const text = group.map(i=>chars[i]).join('');
      const roma = toRomaStr(text) || text;
      lastSliceLabel = roma;
      updateProgressUI();
      if (sliced.size === original.length) endGame('clear');
    } else if (t.type === 'bomb') {
      combo = 0;
      clearTimeout(comboDecayTimer);
      resetComboBadge();
      try { SFX('bomb'); } catch {}
      scoreEl.textContent = `BOOM!`;
      endGame('bomb');
    }
  }

  // segment-circle intersection
  function hitSegmentCircle(x1,y1,x2,y2,cx,cy,r){
    const dx=x2-x1, dy=y2-y1; const l2 = dx*dx+dy*dy; if (l2===0) return Math.hypot(cx-x1,cy-y1)<=r;
    let t=((cx-x1)*dx+(cy-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); const px=x1+t*dx, py=y1+t*dy; return Math.hypot(px-cx,py-cy)<=r;
  }

  function segmentDistance(x1,y1,x2,y2,cx,cy){
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(cx - x1, cy - y1);
    let t = ((cx - x1) * dx + (cy - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function handleNearMiss(tile){
    nearMisses++;
    tile._halo = Math.max(tile._halo || 0, 1.1);
    hitStop(NEAR_MISS_HITSTOP);
    flashNearMiss();
    try { SFX('swish'); } catch {}
    updateProgressUI();
  }

  // trail drawing
  const FADE_DURATION = 1000; // milliseconds (how long trails last)
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
}




  canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", e => {
  if (canvas.setPointerCapture) {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  trails.push([{ x, y, time: Date.now() }]);
  try {
    if (_ac && _ac.state === 'suspended') { _ac.resume(); }
    else if (AudioCtx && !_ac) { _ac = new AudioCtx(); }
  } catch {}
  const now = performance.now();
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    const radius = (t.type === 'bomb' ? BOMB_HIT_RADIUS : KANA_HIT_RADIUS) * HIT_INFLATE;
    if (Math.hypot(t.x - x, t.y - y) < radius) {
      if (t._lastHitAt && (now - t._lastHitAt) < HIT_COOLDOWN_MS) continue;
      t._lastHitAt = now;
      tiles.splice(i,1);
      sliceKana(t);
      break;
    }
  }
});

  canvas.addEventListener('pointermove', e => {
  if (e.buttons === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top );
  if (!trails.length) return; // guard if move occurs before down
  const current = trails[trails.length - 1];
  current.push({ x, y, time: Date.now() });
  // Slice detection along latest segment
  const p0 = current[current.length-2];
  const p1 = current[current.length-1];
  if (p0 && p1){
    // quick swish depending on stroke speed
    const dx = p1.x - p0.x, dy = p1.y - p0.y; if ((dx*dx + dy*dy) > 80) { try { SFX('swish'); } catch {} }
    const now = performance.now();
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      const radius = (t.type === 'bomb' ? BOMB_HIT_RADIUS : KANA_HIT_RADIUS) * HIT_INFLATE;
      if (hitSegmentCircle(p0.x,p0.y,p1.x,p1.y,t.x,t.y,radius)) {
        if (t._lastHitAt && (now - t._lastHitAt) < HIT_COOLDOWN_MS) continue;
        t._lastHitAt = now;
        tiles.splice(i,1);
        sliceKana(t);
        continue;
      }
      if (t.type === 'bomb') {
        const dist = segmentDistance(p0.x,p0.y,p1.x,p1.y,t.x,t.y);
        if (dist < NEAR_MISS_RADIUS && dist > (BOMB_HIT_RADIUS + 4)) {
          if (!t._lastNearMiss || (now - t._lastNearMiss) > NEAR_MISS_COOLDOWN) {
            t._lastNearMiss = now;
            handleNearMiss(t);
          }
        }
      }
    }
  }
  drawTrails();
});

// clear everything on pointerup so no ghost trails remain
canvas.addEventListener('pointerup', e => {
  if (canvas.releasePointerCapture) {
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  }
  trails.length = 0;
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
});
canvas.addEventListener('pointercancel', e => {
  if (canvas.releasePointerCapture) {
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  }
  trails.length = 0;
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
});

  // start the round
  function startRound() {
    tiles = [];
    sliced.clear();
    score = 0;
    combo = 0;
    maxCombo = 0;
    totalSlices = 0;
    nearMisses = 0;
    lastSliceLabel = '';
    lastSliceAt = 0;
    timeScale = 1;
    clearTimeout(comboDecayTimer);
    comboDecayTimer = null;
    updateScoreHud();
    resetComboBadge();
    applySwordCursor();
    timer = roundSeconds;
    timerEl.textContent = timer;
    try { nearMissBadge.style.opacity = '0'; } catch {}
    try { romaBubble.style.opacity = '0'; } catch {}
    if (statsEl) statsEl.innerHTML = '';
    updateProgressUI();
    buildKanaDisplay();
    try {
      const help = document.getElementById('slice-instructions');
      if (help) { help.style.opacity = '1'; setTimeout(()=>help.style.opacity='0', 3000); }
    } catch {}

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
    clearTimeout(comboDecayTimer);
    comboDecayTimer = null;
    timeScale = 1;
    if (reason !== 'bomb') {
      combo = 0;
      updateScoreHud();
    } else {
      combo = 0;
    }
    resetComboBadge();
    resetSwordCursor();
    try { nearMissBadge.style.opacity = '0'; } catch {}
    if (statsEl) {
      let displayScore = `${score}`;
      try { displayScore = score.toLocaleString(); } catch {}
      const cleared = `${sliced.size}/${original.length}`;
      const accuracy = original.length ? Math.round((sliced.size / original.length) * 100) : 0;
      statsEl.innerHTML = `Score: ${displayScore}<br>Max combo: x${Math.max(1, maxCombo)}<br>Sliced tiles: ${totalSlices}<br>Near misses: ${nearMisses}<br>Progress: ${cleared} (${accuracy}%)`;
    }
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
  closeBtn.addEventListener("click", () => {
    clearTimeout(spawnHandle);
    clearInterval(timerInterval);
    cancelAnimationFrame(animateId);
    resetSwordCursor();
    overlay.classList.add('hidden');
  });

  // show modal & kick off — ensure sizing runs after it becomes visible
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => { resize(); startRound(); });
}










