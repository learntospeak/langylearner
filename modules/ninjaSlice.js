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
    english = ""
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

  if (!overlay || !container || !canvas || !ctx || !closeBtn
    || !scoreEl || !timerEl || !kanaEl || !romajiEl || !englishEl) {
    console.warn("initNinjaSlice: missing DOM nodes");
    return;
  }

  // populate text areas
  kanaEl.textContent = phrase;
  romajiEl.textContent = romaji;
  englishEl.textContent = english;

  // create a second “trail” canvas on top
  const trailCanvas = document.createElement("canvas");
  trailCanvas.style.position = "absolute";
  trailCanvas.style.top = "0";
  trailCanvas.style.left = "0";
  trailCanvas.style.pointerEvents = "none";
  container.appendChild(trailCanvas);
  const trailCtx = trailCanvas.getContext("2d");
  //canvas.style.border = '2px solid red'; // Add this line for the main canvas
  //trailCanvas.style.border = '2px solid green'; // Add this line for the trail canvas

  // sizing helper
  function resize() {
  const { width, height } = container.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height * 0.5;  // Adjust to your desired height ratio
  trailCanvas.width = canvas.width;
  trailCanvas.height = canvas.height;

  // Align trail canvas with game canvas (ensuring no offset or scaling issues)
  trailCanvas.style.position = 'absolute';
  trailCanvas.style.left = `${canvas.offsetLeft}px`;
  trailCanvas.style.top = `${canvas.offsetTop}px`;

  // If there are any additional offsets or scaling, account for them:
  trailCanvas.style.width = `${canvas.offsetWidth}px`;
  trailCanvas.style.height = `${canvas.offsetHeight}px`;
}




  window.addEventListener("resize", resize);
  resize();

  // prepare tiles
  let tiles = [];
  const original = Array.from(phrase).map((c, i) => ({ char: c, index: i }));
  let sliced = new Set();
  let score = 0;
  let timer = 60;
  let spawnInterval, animateId, timerInterval;

  // draw loop
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let t of tiles) {
      t.y += t.vy;
      ctx.fillText(t.char, t.x, t.y);
      ctx.font = '64px sans-serif';
    }
    animateId = requestAnimationFrame(draw);
  }

  console.log('Original array:', original);

  // spawn a new tile
  function spawn() {
    const randomIndex = Math.floor(Math.random() * original.length);

    // Check if the index is valid and the object at that index exists
    const tileData = original[randomIndex];
    const tileSize = 64;

    if (!tileData) {
      console.warn('Unable to spawn tile: Invalid data at index', randomIndex);
      return; // Exit the function if no valid tile data is found
    }

    const { char, index } = tileData;

    // Push the tile to the tiles array
    tiles.push({
      char,
      index,
      x: Math.random() * canvas.width,
      y: -20,
      vy: 1 + Math.random() * 1,
      size: tileSize
    });
  }


  // handle slicing
  function sliceAt(x, y) {
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      if (Math.hypot(t.x - x, t.y - y) < 30) {
        tiles.splice(i, 1);
        sliced.add(t.index);
        scoreEl.textContent = `Score: ${sliced.size}`;
        if (sliced.size === original.length) endGame();
        return;
      }
    }
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
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  trails.push([{ x, y, time: Date.now() }]);
  sliceAt(x, y); // <- you probably have this

  // --- SLASH HIT DETECTION ---
  let hit = false;
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    const half = t.size ? t.size/2 : 32; // default fallback size
    const margin = 40; // more forgiving hit box
    if (
      x >= t.x - margin &&
      x <= t.x + margin &&
      y >= t.y - margin &&
      y <= t.y + margin
    ) {
      // Remove this tile
      tiles.splice(i, 1);
      hit = true;
      // Play sound, increase score, etc:
      score++;
      scoreEl.textContent = `Score: ${score}`;
      // (Optional) Highlight or animate
      break; // Only one per click
    }
  }
  if (!hit) {
    // Optionally: flash red, play 'miss' sound, etc
  }
});

  canvas.addEventListener('pointermove', e => {
  if (e.buttons === 0) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top ) * (canvas.height / rect.height);
  const current = trails[trails.length - 1];
  current.push({ x, y, time: Date.now() });
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
    scoreEl.textContent = "Score: 0";
    timerEl.textContent = timer;

    draw();
    spawnInterval = setInterval(spawn, 500);

    timerInterval = setInterval(() => {
      timerEl.textContent = --timer;
      if (timer <= 0) endGame();
    }, 1000);
  }

  // clean up and close
  function endGame() {
    clearInterval(spawnInterval);
    clearInterval(timerInterval);
    cancelAnimationFrame(animateId);
    overlay.classList.add("hidden");
  }
  closeBtn.addEventListener("click", endGame);

  // show modal & kick off
  overlay.classList.remove("hidden");
  startRound();
}
