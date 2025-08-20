export function initNinjaSlice(config) {
  const {
    containerId,
    canvasId,
    startBtnId,
    closeBtnId,
    overlayId,
    scoreElId,
    timerElId,
    kanaContainerId,
    romajiContainerId,
    englishContainerId,
  } = config;

  const container = document.getElementById(containerId);
  const gameCanvas = document.getElementById(canvasId);
  console.log('canvas rect:', gameCanvas.getBoundingClientRect());
  console.log('canvas size:', gameCanvas.width, gameCanvas.height);
  const ctx = gameCanvas.getContext('2d');
  const startBtn = document.getElementById(startBtnId);
  const closeBtn = document.getElementById(closeBtnId);
  const overlay = document.getElementById(overlayId);
  const scoreEl = document.getElementById(scoreElId);
  const timerEl = document.getElementById(timerElId);
  const kanaEl = document.getElementById(kanaContainerId);
  const romajiEl = document.getElementById(romajiContainerId);
  const englishEl = document.getElementById(englishContainerId);
  const correctSound = new Audio('/sounds/swoosh.wav');
  //const wrongSound = new Audio('/sounds/wrong.wav');
  const swooshSound = new Audio('/sounds/swoosh.wav');



  if (!container || !gameCanvas || !startBtn || !closeBtn || !overlay ||
    !scoreEl || !timerEl || !kanaEl || !romajiEl || !englishEl) {
    console.error('initNinjaSlice: Missing element(s)', {
      container, gameCanvas, startBtn, closeBtn, overlay,
      scoreEl, timerEl, kanaEl, romajiEl, englishEl
    });
    return;
  }

  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  ctx.font = '64px sans-serif';
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const trailCanvas = document.createElement('canvas');
  trailCanvas.style.position = 'absolute';
  trailCanvas.style.top = '0';
  trailCanvas.style.left = '0';
  trailCanvas.style.zIndex = '10';
  trailCanvas.style.pointerEvents = 'none';
  trailCanvas.width = gameCanvas.width;
  trailCanvas.height = gameCanvas.height;
  container.appendChild(trailCanvas);
  const trailCtx = trailCanvas.getContext('2d');
  //trailCanvas.style.backgroundColor = 'rgba(255,0,0,0.2)';


  // --- Simple Web Audio API feedback ---
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playTone(type = 'sine', freq = 440, duration = 0.1) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.2;

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }


  let tiles = [];
  let originalPhrase = [];
  const slicedIndices = new Set();
  let slicedCount = 0;
  let sliceInterval, sliceAnimId, timerInterval;
  const trails = [];

  function drawTrails() {
    const now = Date.now();
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    for (let i = trails.length - 1; i >= 0; i--) {
      const segment = trails[i];
      const head = segment[segment.length - 1];  // Last point
      trailCtx.beginPath();
      trailCtx.arc(head.x, head.y, 4, 0, 2 * Math.PI);
      trailCtx.fillStyle = 'red';
      trailCtx.fill();

      for (let j = 0; j < segment.length - 1; j++) {
        const p0 = segment[j];
        const p1 = segment[j + 1];
        const age = (now - p0.time) / 500;
        if (age > 1) continue;
        trailCtx.strokeStyle = `rgba(0,0,255,${1 - age})`;
        trailCtx.lineWidth = 4;
        trailCtx.moveTo(p0.x, p0.y);
        trailCtx.lineTo(p1.x, p1.y);
      }
      trailCtx.stroke();
      if (now - segment[segment.length - 1].time > 500) trails.splice(i, 1);
    }
  }

  function drawFrame() {
    ctx.font = '64px sans-serif';
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    tiles.forEach((t, i) => {
      t.y += t.vy;
      ctx.fillText(t.char, t.x, t.y);
      if (t.y > gameCanvas.height + 50) tiles.splice(i, 1);
    });
    drawTrails();
    sliceAnimId = requestAnimationFrame(drawFrame);
  }

  function spawnTile() {
    const { char, index } = originalPhrase[
      Math.floor(Math.random() * originalPhrase.length)
    ];
    tiles.push({
      char,
      index,
      x: Math.random() * gameCanvas.width,
      y: -30,
      vy: 0.6 + Math.random() * 0.6,
      size: 64
    });
  }

  function startSpawning() {
    clearInterval(sliceInterval);
    tiles = [];

    // 🧩 Sync canvas resolution with display size (pixel-perfect)
    const rect = gameCanvas.getBoundingClientRect();
    gameCanvas.width = rect.width;
    gameCanvas.height = rect.height;
    trailCanvas.width = rect.width;
    trailCanvas.height = rect.height;
    trailCanvas.style.width = `${rect.width}px`;
    trailCanvas.style.height = `${rect.height}px`;

    drawFrame();
    sliceInterval = setInterval(spawnTile, 400);
  }


  function stopSpawning() {
    clearInterval(sliceInterval);
    cancelAnimationFrame(sliceAnimId);
  }

  function safeHighlight(i) {
    ['slice-kana', 'slice-romaji', 'slice-english'].forEach(prefix => {
      const el = document.getElementById(`${prefix}-${i}`);
      if (el) el.classList.add('highlight');
    });
  }

  function endGame() {
    stopSpawning();
    clearInterval(timerInterval);
    gameCanvas.style.pointerEvents = 'none';
    scoreEl.textContent = 'Subarashii!';
  }

  function handleSlice(e) {
    const rect = gameCanvas.getBoundingClientRect();
    const scaleX = gameCanvas.width / rect.width;
    const scaleY = gameCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let hit = false;
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      const half = t.size / 2;
      const margin = 40; // Increase this value for more forgiving hit box
      if (
        x >= t.x - margin &&
        x <= t.x + margin &&
        y >= t.y - margin &&
        y <= t.y + margin
      ) {
        tiles.splice(i, 1);
        slicedIndices.add(t.index);
        slicedCount++;
        scoreEl.textContent = `Score: ${slicedCount}`;
        try {
          correctSound.currentTime = 0;
          correctSound.play();
          speechSynthesis.speak(new SpeechSynthesisUtterance(t.char));
        } catch (err) {
          console.warn('Audio or speech error:', err);
        }

        safeHighlight(t.index);
        hit = true;
        break;
      }
    }
    if (!hit) {
      gameCanvas.classList.add('wrong');
      setTimeout(() => gameCanvas.classList.remove('wrong'), 150);
      playTone('sawtooth', 220, 0.15); // ❌ incorrect slice
      try {
        //wrongSound.currentTime = 0;
        //wrongSound.play();
      } catch (err) {
        console.warn('Wrong sound error:', err);
      }


    }
    if (slicedIndices.size === originalPhrase.length) endGame();
  }

  gameCanvas.style.touchAction = 'none';
  function getPointerPosition(e) {
    const rect = trailCanvas.getBoundingClientRect(); // not gameCanvas
    const scaleX = trailCanvas.width / rect.width;
    const scaleY = trailCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  gameCanvas.addEventListener('pointerdown', e => {
    const rect = trailCanvas.getBoundingClientRect(); // ✅ Use trailCanvas
    const scaleX = trailCanvas.width / rect.width;
    const scaleY = trailCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    try {
    swooshSound.currentTime = 0;
    swooshSound.play();
  } catch (err) {
    console.warn('Swoosh sound failed:', err);
  }

    handleSlice(e); // Still slices based on gameCanvas, which is okay for hit logic
    trails.push([{ x, y, time: Date.now() }]);
  });

  gameCanvas.addEventListener('pointermove', e => {
    if (e.buttons === 0) return;
    const rect = trailCanvas.getBoundingClientRect(); // ✅ Use trailCanvas
    const scaleX = trailCanvas.width / rect.width;
    const scaleY = trailCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const current = trails[trails.length - 1];
    if (current) current.push({ x, y, time: Date.now() });
  });



  function resizeCanvasesToContainer() {
    const bounds = container.getBoundingClientRect();
    gameCanvas.width = bounds.width;
    gameCanvas.height = bounds.height / 2; // or any desired height
    trailCanvas.width = gameCanvas.width;
    trailCanvas.height = gameCanvas.height;

    console.log('Resized canvas to:', gameCanvas.width, gameCanvas.height);
  }




  startBtn.addEventListener('click', () => {
    const line = window.storyData?.[window.currentLine];
    if (!line) return;
    const phrase = Array.isArray(line.jp) ? line.jp.join('') : line.jp;
    originalPhrase = Array.from(phrase).map((c, i) => ({ char: c, index: i }));
    slicedIndices.clear();
    slicedCount = 0;

    kanaEl.innerHTML = originalPhrase.map((o, i) =>
      `<span id="slice-kana-${i}" class="slice-span">${o.char}</span>`
    ).join('');
    romajiEl.innerHTML = (line.romaji_full || '').split(/(\s+)/).map((r, i) =>
      `<span id="slice-romaji-${i}" class="slice-span">${r}</span>`
    ).join('');
    englishEl.innerHTML = (line.en || '').split(/(\s+)/).map((w, i) =>
      `<span id="slice-english-${i}" class="slice-span">${w}</span>`
    ).join('');

    scoreEl.textContent = 'Score: 0';
    overlay.classList.replace('hidden', 'flex');
    setTimeout(() => {
      resizeCanvasesToContainer();
    }, 50); // Give it a short delay to ensure DOM has updated
    gameCanvas.style.pointerEvents = 'auto';


    // ✅ Wait for modal to be visible before sizing canvases
    requestAnimationFrame(() => {
      const rect = gameCanvas.getBoundingClientRect();
      gameCanvas.width = rect.width;
      gameCanvas.height = rect.height;
      trailCanvas.width = rect.width;
      trailCanvas.height = rect.height;
      console.log('Canvas resized after modal open:', rect);



      let timeLeft = 60;
      timerEl.textContent = timeLeft;
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        if (--timeLeft <= 0) endGame();
        timerEl.textContent = timeLeft;
      }, 1000);

      requestAnimationFrame(() => {
        const rect = gameCanvas.getBoundingClientRect();
        gameCanvas.width = rect.width;
        gameCanvas.height = rect.height;

        trailCanvas.width = rect.width;
        trailCanvas.height = rect.height;
        trailCanvas.style.width = `${rect.width}px`;
        trailCanvas.style.height = `${rect.height}px`;
        trailCanvas.style.left = `${gameCanvas.offsetLeft}px`;
        trailCanvas.style.top = `${gameCanvas.offsetTop}px`;

        console.log('Canvas resized after modal open:', rect);

        startSpawning();
      });

      startSpawning();
    });
  });

  window.addEventListener('resize', () => {
    const rect = gameCanvas.getBoundingClientRect();
    trailCanvas.width = rect.width;
    trailCanvas.height = rect.height;
    trailCanvas.style.width = `${rect.width}px`;
    trailCanvas.style.height = `${rect.height}px`;
    trailCanvas.style.left = `${gameCanvas.offsetLeft}px`;
    trailCanvas.style.top = `${gameCanvas.offsetTop}px`;

    console.log('Resized trail canvas to match game canvas:', rect);
  });



  closeBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    stopSpawning();
    overlay.classList.replace('flex', 'hidden');
    gameCanvas.style.pointerEvents = 'none';
  });
}
