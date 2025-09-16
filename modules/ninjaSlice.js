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
  let tiles = [];
  const original = Array.from(phrase).map((c, i) => ({ char: c, index: i }));
  let sliced = new Set();
  let score = 0;
  let timer = roundSeconds;
  let spawnHandle = null, animateId = null, timerInterval = null;
  let lastSliceAt = 0, combo = 0, bestCombo = 0;
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

  // particles (slice sparks / bomb shards)
  const particles = [];
  function spawnSliceSparks(x, y, count=12) {
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const sp = 2 + Math.random()*2.5;
      particles.push({
        kind:'spark',
        x, y,
        vx: Math.cos(a)*sp,
        vy: Math.sin(a)*sp - 0.5,
        life: 320 + Math.random()*200,
        size: 2 + Math.random()*2,
        color: (Math.random()<0.5 ? '#f59e0b' : '#facc15') // amber/yellow
      });
    }
  }
  function spawnBombShards(x, y, count=36) {
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const sp = 2.5 + Math.random()*3.5;
      particles.push({
        kind:'shard',
        x, y,
        vx: Math.cos(a)*sp,
        vy: Math.sin(a)*sp - 1.0,
        life: 600 + Math.random()*300,
        size: 3 + Math.random()*3,
        rot: Math.random()*Math.PI,
        spin: (Math.random()*2-1)*0.2,
        color: '#ef4444' // red
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

  // draw loop
  let _lastFrameAt = performance.now();
  function draw() {
    const now = performance.now();
    const dt = Math.min(32, now - _lastFrameAt); // clamp for stability
    _lastFrameAt = now;
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

    // fx layer
    drawParticles(dt);

    animateId = requestAnimationFrame(draw);
  }

  // console.debug('Slice tiles:', original.length);

  // spawn a new tile (kana or bomb)
  function spawn() {
    const wantBomb = Math.random() < bombChance;
    if (wantBomb) {
      tiles.push({ type:'bomb', x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
      return;
    }
    // pick an unsliced kana index
    const candidates = original.filter(o => !sliced.has(o.index));
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    if (!pick) return;
    tiles.push({ type:'kana', char: pick.char, index: pick.index, x: Math.random()*viewW, y: viewH+20, vx:(Math.random()*2-1)*1.2, vy: - (speedMin + Math.random()*(speedMax-speedMin)) * Math.max(1, launchBoost), rot:0, spin:(Math.random()*2-1)*0.05 });
  }


  // handle slicing
  let pendingEndAt = 0; let pendingReason = null;
  function sliceKana(t) {
    if (t.type === 'kana') {
      const group = groupForIndex(t.index);
      group.forEach(i=>sliced.add(i));
      const now = performance.now();
      combo = (now - lastSliceAt <= comboWindowMs) ? (combo + 1) : 1;
      bestCombo = Math.max(bestCombo, combo);
      lastSliceAt = now;
      score += 100 * combo;
      scoreEl.textContent = `Score: ${score}  (x${combo})`;
      try { SFX('slice'); } catch {}
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
      scoreEl.textContent = `BOOM!`;
      try { SFX('bomb'); } catch {}
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




  canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", e => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  trails.push([{ x, y, time: Date.now() }]);
  try { if (_ac && _ac.state === 'suspended') { _ac.resume(); } else if (AudioCtx && !_ac) { _ac = new AudioCtx(); } } catch {}

  // click slice point
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (Math.hypot(t.x - x, t.y - y) < 32) { tiles.splice(i,1); sliceKana(t); break; }
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
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      if (hitSegmentCircle(p0.x,p0.y,p1.x,p1.y,t.x,t.y,28)) { tiles.splice(i,1); sliceKana(t); }
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
    scoreEl.textContent = "Score: 0";
    resetComboBadge();
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
    resetComboBadge();
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











