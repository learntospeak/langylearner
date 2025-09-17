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
  const NEAR_MISS_RADIUS = 64;
  const NEAR_MISS_COOLDOWN = 600;

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
  let comboEnergy = 0;
  const COMBO_DECAY_MS = 4500;
  let comboMeterFill = null;

  const hudRow = scoreEl ? scoreEl.parentElement : null;
  if (hudRow && !document.getElementById('slice-combo-meter')) {
    const wrap = document.createElement('div');
    wrap.id = 'slice-combo-meter';
    wrap.className = 'flex flex-col items-start text-[11px] leading-snug text-emerald-600';
    const label = document.createElement('span');
    label.textContent = 'Combo';
    label.style.opacity = '0.8';
    const bar = document.createElement('div');
    bar.style.width = '96px';
    bar.style.height = '4px';
    bar.style.background = 'rgba(16,185,129,0.25)';
    bar.style.borderRadius = '9999px';
    bar.style.overflow = 'hidden';
    const fill = document.createElement('div');
    fill.style.height = '100%';
    fill.style.width = '0%';
    fill.style.background = 'linear-gradient(90deg, #34d399, #10b981)';
    fill.style.transition = 'width 0.12s ease, opacity 0.2s ease';
    bar.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(bar);
    hudRow.appendChild(wrap);
    comboMeterFill = fill;
  }

  function updateComboMeter(){
    if (!comboMeterFill) return;
    const pct = Math.max(0, Math.min(1, comboEnergy));
    comboMeterFill.style.width = Math.round(pct * 100) + '%';
    comboMeterFill.style.opacity = pct > 0 ? '1' : '0';
  }
  const statsEl = config.statsElId ? document.getElementById(config.statsElId) : null;

  // Tunables (fallbacks)
  const launchBoost = Number((config && config.launchBoost) ?? 1.0);
  const gravity = Number((config && config.gravity) ?? 0.02);


  // Progress UI updater
  function updateProgressUI(){
    try {
      if (progressEl) {
        progressEl.textContent = `(${sliced.size}/${chars.length})`;
      }
      if (progressBar) {
        const pct = Math.max(0, Math.min(100, Math.round((sliced.size/Math.max(1,chars.length))*100)));
        progressBar.style.width = pct + '%';
      }
    } catch {}
  }

  // Combo badge
  const comboBadge = document.getElementById('slice-combo');
  let comboHideTimer = null;
  function flashCombo(){
    if (!comboBadge) return;
    comboBadge.textContent = `x${combo}`;
    comboBadge.style.opacity = '1';
    clearTimeout(comboHideTimer);
    comboHideTimer = setTimeout(()=>{ comboBadge.style.opacity = '0'; }, 500);
  }
  function resetComboBadge(){ if (comboBadge) comboBadge.style.opacity = '0'; }
  if (!overlay || !container || !canvas || !ctx || !closeBtn
    || !scoreEl || !timerEl || !kanaEl || !romajiEl || !englishEl) {
    console.warn("initNinjaSlice: missing DOM nodes");
    return;
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
  (canvas.parentElement||holder).appendChild(romaBubble);
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
      const r0 = (canvas.parentElement||holder).getBoundingClientRect();
      romaBubble.textContent = roma;
      romaBubble.style.left = (r1.left - r0.left + r1.width/2) + 'px';
      romaBubble.style.top  = (r1.top - r0.top - 18) + 'px';
      romaBubble.style.opacity = '1';
      setTimeout(()=>{ romaBubble.style.opacity = '0'; }, 700);
    }catch{}
  }
  buildKanaDisplay();
  romajiEl.textContent = romaji;
  englishEl.textContent = english;

  // create a second "trail" canvas on top, aligned with the game canvas
  const holder = canvas.parentElement || container;
  const trailCanvas = document.createElement("canvas");
  if (window.getComputedStyle && window.getComputedStyle(holder).position === 'static') { holder.style.position = 'relative'; }
  trailCanvas.style.position = "absolute";
  trailCanvas.style.top = "0";
  trailCanvas.style.left = "0";
  trailCanvas.style.pointerEvents = "none";
  holder.appendChild(trailCanvas);
  const trailCtx = trailCanvas.getContext("2d");
  trailCanvas.style.zIndex = '2';
  const bombVignette = document.createElement('div');
  bombVignette.style.position = 'absolute';
  bombVignette.style.inset = '0';
  bombVignette.style.pointerEvents = 'none';
  bombVignette.style.background = 'radial-gradient(circle at center, rgba(239,68,68,0.55) 30%, rgba(0,0,0,0.6) 80%)';
  bombVignette.style.opacity = '0';
  bombVignette.style.transition = 'opacity 0.3s ease';
  bombVignette.style.zIndex = '6';
  holder.appendChild(bombVignette);
  // Lightweight SFX helper (no external assets)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let _ac = null, _lastSwish = 0;
  function SFX(type, opts = {}){
    try{
      _ac = _ac || new AudioCtx();
      const ctx = _ac;
      const pitch = Number(opts.pitch || 1);
      const volume = Number(opts.volume || 1);
      if (type === 'slice'){
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='sawtooth'; o.frequency.value = 880 * pitch; g.gain.value = 0.06 * volume;
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.08);
      } else if (type === 'swish'){
        const now = ctx.currentTime; if (now - _lastSwish < 0.05) return; _lastSwish = now;
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='triangle'; o.frequency.value = 520 * pitch; g.gain.value = 0.03 * volume;
        o.connect(g); g.connect(ctx.destination); o.start(); o.stop(now + 0.05);
      } else if (type === 'bomb'){
        const len = 0.25; const sr = 44100; const buf = ctx.createBuffer(1, sr*len, sr);
        const data = buf.getChannelData(0); for(let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * Math.exp(-i/(sr*0.1)); }
        const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.12 * volume;
        src.connect(g); g.connect(ctx.destination); src.start();
      } else if (type === 'near'){
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='sine'; o.frequency.value = 660 * pitch; g.gain.value = 0.05 * volume;
        o.connect(g); g.connect(ctx.destination); const now = ctx.currentTime; o.start(now); o.stop(now + 0.12);
      }
    }catch{}
  }        const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 0.12;
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
  const original = Array.from(phrase).map((c, i) => ({ char: c, index: i }));
  if (!original.length) { console.warn('initNinjaSlice: no characters to slice'); overlay.classList.add('hidden'); return; }
  let sliced = new Set();
  let score = 0;
  function refreshScoreLabel(){
    if (!scoreEl) return;
    scoreEl.textContent = combo > 1 ? `Score: ${score}  (x${combo})` : `Score: ${score}`;
  }
  let timer = roundSeconds;
  let spawnHandle = null, animateId = null, timerInterval = null;
  let lastSliceAt = 0, combo = 0, bestCombo = 0;
  // simple time scale for hit-stop (scoped to game loop)
  let timeScale = 1;
  let hitStopTimer = null;
  function hitStop(ms, scale = 0.25){
    try{
      timeScale = Math.max(0.05, Math.min(1, scale));
      clearTimeout(hitStopTimer);
      hitStopTimer = setTimeout(()=>{ timeScale = 1; }, Math.max(40, ms||80));
    }catch{}
  let shakeStart = 0, shakeDuration = 0, shakeStrength = 0;
  function triggerShake(strength = 12, duration = 400){
    shakeStrength = strength;
    shakeDuration = duration;
    shakeStart = performance.now();
  }
  function flashVignette(){
    try {
      bombVignette.style.opacity = '0.75';
      setTimeout(()=>{ bombVignette.style.opacity = '0'; }, 240);
    } catch {}
  }
  function updateShake(){
    if (!shakeStart) { holder.style.transform = ''; return; }
    const now = performance.now();
    const elapsed = now - shakeStart;
    if (elapsed >= shakeDuration) {
      shakeStart = 0;
      holder.style.transform = '';
      return;
    }
    const t = 1 - (elapsed / shakeDuration);
    const magnitude = shakeStrength * t;
    const dx = (Math.random()*2 - 1) * magnitude;
    const dy = (Math.random()*2 - 1) * magnitude;
    holder.style.transform = 	ranslate(px, px);
  }
  }  }
  function spawnHitFlash(x, y, color = 'rgba(255,255,255,0.75)') {
    hitFlashes.push({ x, y, life: 200, color });
  });
    }
  }
  function drawParticles(dtMs){
    for (let i=particles.length-1; i>=0; i--) {
      const p = particles[i];
      // integrate
      p.x += p.vx * timeScale;
      p.y += p.vy * timeScale;
      p.vy += gravity * 0.6 * timeScale; // lighter gravity for fx
      if (p.spin) p.rot += p.spin * timeScale;
      p.life -= dtMs * timeScale;
      // draw
      const alpha = Math.max(0, Math.min(1, p.life / 400));
      if (alpha <= 0) { particles.splice(i,1); continue; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(0,0,p.size,0,Math.PI*2); ctx.fill();
      } else { // shard
        ctx.rotate(p.rot||0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size*0.6, p.size*2, p.size*1.2);
      }
      ctx.restore();
    }
  }

function drawHitFlashes(dtMs){
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const f = hitFlashes[i];
      f.life -= dtMs;
      const alpha = Math.max(0, f.life / 200);
      if (alpha <= 0) { hitFlashes.splice(i,1); continue; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      const radius = 80 * (1 - alpha * 0.4);
      ctx.beginPath();
      ctx.arc(f.x, f.y, radius, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
  // draw loop
  let _lastFrameAt = performance.now();
  function draw() {
    const now = performance.now();
    const dt = Math.min(32, now - _lastFrameAt); // clamp for stability
    _lastFrameAt = now;
    comboEnergy = Math.max(0, comboEnergy - (dt / COMBO_DECAY_MS));
    updateComboMeter();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateShake();
    ctx.font = '64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let t of tiles) {
      t.x += t.vx * timeScale;
      t.y += t.vy * timeScale;
      t.vy += gravity * timeScale; // gravity
      if (t.spin) t.rot += t.spin;
      if (t.x < 0 || t.x > viewW) t.vx *= -0.98;

      ctx.save();
      ctx.translate(t.x, t.y);
      if (t.rot) ctx.rotate(t.rot);
      if (t.type === 'bomb') {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '16px system-ui'; ctx.fillText('x', 0, 1);
      } else {
        ctx.fillStyle = '#111';
        ctx.fillText(t.char, 0, 0);
      }
      ctx.restore();
    }

    drawParticles(dt);
    drawHitFlashes(dt);

    animateId = requestAnimationFrame(draw);
  }

  // console.debug('Slice tiles:', original.length);

  // spawn a new tile (kana or bomb)
  function spawn() {
    const wantBomb = Math.random() < bombChance;
    if (wantBomb) {
      tiles.push({ type:'bomb', _lastNearMiss: 0, _lastHitAt: 0, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
      return;
    }
    // pick an unsliced kana index
    const candidates = original.filter(o => !sliced.has(o.index));
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    if (!pick) return;
    tiles.push({ type:'kana', _lastHitAt: 0, char: pick.char, index: pick.index, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
  }


  // handle slicing
  let pendingEndAt = 0; let pendingReason = null;
  function handleNearMiss(tile){
    try { SFX('near', { pitch: 1.1 }); } catch {}
    spawnHitFlash(tile.x, tile.y, 'rgba(20,184,166,0.6)');
    spawnSliceSparks(tile.x, tile.y, 6);
    triggerShake(6, 220);
    hitStop(220, 0.5);
    comboEnergy = Math.min(1, comboEnergy + 0.18);
    score += 25;
    refreshScoreLabel();
    updateComboMeter();
  }
  function sliceKana(t) {
    if (t.type === 'kana') {
      const group = groupForIndex(t.index);
      group.forEach(i=>sliced.add(i));
      const now = performance.now();
      combo = (now - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
      bestCombo = Math.max(bestCombo, combo);
      lastSliceAt = now;
      score += 100 * combo;
      refreshScoreLabel();
      const slicePitch = 1 + Math.max(0, Math.min(combo - 1, 8)) * 0.08;
      try { SFX('slice', { pitch: slicePitch }); } catch {}
      try { flashCombo(); } catch {}
      // sparks at kana position
      spawnSliceSparks(t.x, t.y, 10 + Math.min(20, combo*2));
      // highlight sliced kana(s) and show combined romaji bubble
      try { group.forEach(i=>{ const s = kanaEl.querySelector(`[data-idx="${i}"]`); if (s) s.classList.add('text-emerald-600','font-semibold','underline'); }); } catch {}
      showRomaForGroup(group);
      // remove partner tile(s) if present
      for (let j = tiles.length - 1; j >= 0; j--) { if (group.includes(tiles[j].index) && tiles[j].index !== t.index) { tiles.splice(j,1); } }
      // persistent progress: show last romaji + count and update bar
      try { if (progressEl) { const text = group.map(i=>chars[i]).join(''); const roma = toRomaStr(text); progressEl.textContent = `${roma}  (${sliced.size}/${chars.length})`; } } catch {}
      updateProgressUI();
      if (sliced.size === original.length) endGame('clear');
    } else if (t.type === 'bomb') {
      // bomb fx then end shortly after
      scoreEl.textContent = `BOOM!`; comboEnergy = 0; updateComboMeter();
      try { SFX('bomb'); } catch {}
      spawnHitFlash(t.x, t.y, 'rgba(248,113,113,0.75)');
      flashVignette();
      triggerShake(18, 480);
      spawnBombShards(t.x, t.y, 42);
      hitStop(120);
      // stop further spawns quickly
      try { clearTimeout(spawnHandle); } catch {}
      pendingReason = 'bomb';
      pendingEndAt = performance.now() + 420; // let shards show briefly
    }
  }

  function renderStats(reason) {
    if (!statsEl) return;
    const total = original.length;
    const slicedCount = sliced.size;
    const remaining = Math.max(0, total - slicedCount);
    const longest = bestCombo > 0 ? bestCombo : (combo > 0 ? combo : 0);
    const timeLeft = Math.max(0, timer);
    const timeSpent = Math.min(roundSeconds, Math.max(0, roundSeconds - timeLeft));
    const lines = [
      `<div><strong>Score:</strong> ${score}</div>`,
      `<div><strong>Kana sliced:</strong> ${slicedCount}/${total}</div>`,
      `<div><strong>Longest combo:</strong> x${longest}</div>`,
      `<div><strong>Time left:</strong> ${timeLeft}s</div>`
    ];
    if (reason === 'timeout' && remaining > 0) {
      lines.push(`<div>Remaining kana: ${remaining}</div>`);
    }
    if (reason === 'bomb') {
      lines.push('<div>Bomb detonated!</div>');
    }
    if (reason === 'clear') {
      lines.push(`<div>Cleared in ${timeSpent}s!</div>`);
    }
    statsEl.innerHTML = lines.join('');
  }
  // segment-circle intersection
  function hitSegmentCircle(x1,y1,x2,y2,cx,cy,r){
    const dx=x2-x1, dy=y2-y1; const l2 = dx*dx+dy*dy; if (l2===0) return Math.hypot(cx-x1,cy-y1)<=r;
    let t=((cx-x1)*dx+(cy-y1)*dy)/l2; t=Math.max(0,Math.min(1,t)); const px=x1+t*dx, py=y1+t*dy; return Math.hypot(px-cx,py-cy)<=r;
  }
  function segmentDistance(x1,y1,x2,y2,cx,cy){
    const dx=x2-x1, dy=y2-y1; const l2 = dx*dx+dy*dy;
    if (l2 === 0) return Math.hypot(cx-x1, cy-y1);
    let t=((cx-x1)*dx+(cy-y1)*dy)/l2;
    t=Math.max(0,Math.min(1,t));
    const px=x1+t*dx, py=y1+t*dy;
    return Math.hypot(px-cx,py-cy);
  }
  const FADE_DURATION = 320; // milliseconds (how long trails last)
  const trails = [];
  function drawTrails() {
    const now = Date.now();
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    for (let i = trails.length - 1; i >= 0; i--) {
      const segment = trails[i];
      for (let j = 0; j < segment.length - 1; j++) {
        const p0 = segment[j];
        const p1 = segment[j + 1];
        const age = (now - p0.time) / FADE_DURATION;
        if (age >= 1) continue;
        const alpha = 1 - age;
        const width = 6 * alpha + 1.5;
        const grad = trailCtx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        grad.addColorStop(0, `rgba(125,255,205,${alpha})`);
        grad.addColorStop(1, `rgba(16,185,129,${alpha * 0.6})`);
        trailCtx.strokeStyle = grad;
        trailCtx.lineWidth = width;
        trailCtx.lineCap = 'round';
        trailCtx.beginPath();
        trailCtx.moveTo(p0.x, p0.y);
        trailCtx.lineTo(p1.x, p1.y);
        trailCtx.stroke();
      }
      if (now - segment[segment.length - 1].time > FADE_DURATION) {
        trails.splice(i, 1);
      }
    }
  }
    if (now - segment[segment.length - 1].time > FADE_DURATION) {
      trails.splice(i, 1);
    }
  }
}




  canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", e => {
  if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch {} }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  trails.push([{ x, y, time: Date.now() }]);
  try { if (_ac && _ac.state === 'suspended') { _ac.resume(); } else if (AudioCtx && !_ac) { _ac = new AudioCtx(); } } catch {}
  const now = performance.now();
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    const radius = (t.type === 'bomb' ? BOMB_HIT_RADIUS : KANA_HIT_RADIUS) * HIT_INFLATE;
    if (Math.hypot(t.x - x, t.y - y) < radius) {
      if (t._lastHitAt && (now - t._lastHitAt) < 80) continue;
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
  const p0 = current[current.length-2];
  const p1 = current[current.length-1];
  if (p0 && p1){
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    if ((dx*dx + dy*dy) > 80) { try { SFX('swish'); } catch {} }
    const now = performance.now();
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      if (hitSegmentCircle(p0.x,p0.y,p1.x,p1.y,t.x,t.y,BOMB_HIT_RADIUS)) {
        tiles.splice(i,1);
        sliceKana(t);
        continue;
      }
      if (t.type === 'bomb') {
        const dist = segmentDistance(p0.x,p0.y,p1.x,p1.y,t.x,t.y);
        if (dist < NEAR_MISS_RADIUS && dist > BOMB_HIT_RADIUS + 4) {
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
canvas.addEventListener('pointerup', () => {
  trails.length = 0;
  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
});

  // start the round
  function startRound() {
    tiles = [];
    sliced.clear();
    score = 0; combo = 0; bestCombo = 0; lastSliceAt = 0;
    refreshScoreLabel();
    resetComboBadge();
    comboEnergy = 0;
    updateComboMeter();
    shakeStart = 0;
    holder.style.transform = '';
    bombVignette.style.opacity = '0';
    if (statsEl) statsEl.textContent = "";
    timer = roundSeconds;
    timerEl.textContent = timer;
    try { if (progressEl) progressEl.textContent = `(${sliced.size}/${chars.length})`; } catch {}
    buildKanaDisplay();
    updateProgressUI();
    try {
      const help = document.getElementById('slice-instructions');
      if (help) { help.style.opacity = '1'; setTimeout(()=>help.style.opacity='0', 3000); }
    } catch {}

    draw();
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
    resetComboBadge();
    comboEnergy = 0;
    updateComboMeter();
    shakeStart = 0;
    holder.style.transform = '';
    bombVignette.style.opacity = '0';
    renderStats(reason);
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
    resetComboBadge();
    comboEnergy = 0;
    updateComboMeter();
    shakeStart = 0;
    holder.style.transform = '';
    bombVignette.style.opacity = '0';
    if (statsEl) statsEl.textContent = "";
    overlay.classList.add('hidden');
  });

  // show modal & kick off - ensure sizing runs after it becomes visible
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => { resize(); startRound(); });

  // drive a finalize check alongside draw loop
  (function checkFinalize(){
    if (pendingEndAt && performance.now() >= pendingEndAt) {
      pendingEndAt = 0;
      endGame(pendingReason||'bomb');
      return; // stop this checker; endGame cancels draw
    }
    requestAnimationFrame(checkFinalize);
  })();
}











