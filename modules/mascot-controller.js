function enableMascotMoveAndResize() {
  const mascot = document.getElementById('mascot');
  const wrap = mascot?.parentElement;
  if (!mascot || !wrap) return;

  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;
  let dragging = false;
  let scale = 1;

  // ensure the mascot can be positioned via left/top
  const wrapRect = wrap.getBoundingClientRect();
  const rect = mascot.getBoundingClientRect();
  mascot.style.position = 'absolute';
  mascot.style.left = `${rect.left - wrapRect.left}px`;
  mascot.style.top = `${rect.top - wrapRect.top}px`;
  mascot.style.right = 'auto';

  mascot.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseFloat(mascot.style.left) || 0;
    startTop = parseFloat(mascot.style.top) || 0;
    mascot.setPointerCapture(e.pointerId);
  });

  mascot.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    mascot.style.left = `${startLeft + dx}px`;
    mascot.style.top = `${startTop + dy}px`;
  });

  function endDrag(e) {
    dragging = false;
    mascot.releasePointerCapture?.(e.pointerId);
  }

  mascot.addEventListener('pointerup', endDrag);
  mascot.addEventListener('pointercancel', endDrag);

  mascot.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale += e.deltaY < 0 ? 0.1 : -0.1;
    scale = Math.min(Math.max(scale, 0.5), 2);
    mascot.style.transform = `scale(${scale})`;
  });
}

document.addEventListener('DOMContentLoaded', enableMascotMoveAndResize);
