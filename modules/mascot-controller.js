// modules/mascot-controller.js
// Simple drag for #mascot inside #lesson-wrap. No external deps.
(() => {
  const el = document.getElementById('mascot');
  const wrap = document.getElementById('lesson-wrap');
  if (!el || !wrap) return;

  let dragging = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;

  const getOffsets = () => {
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    return { left: r.left - w.left, top: r.top - w.top };
  };

  el.style.position = 'absolute'; // ensure absolute
  el.style.touchAction = 'none';  // allow pointer events

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture?.(e.pointerId);
    const { left, top } = getOffsets();
    baseLeft = left; baseTop = top;
    startX = e.clientX; startY = e.clientY;
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = `${Math.round(baseLeft + dx)}px`;
    el.style.top  = `${Math.round(baseTop  + dy)}px`;
  });

  window.addEventListener('pointerup', () => { dragging = false; });
})();
