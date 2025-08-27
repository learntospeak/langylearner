diff --git a//dev/null b/modules/mascot-controller.js
index 0000000000000000000000000000000000000000..3cdbf8ee6e8f3494ff944e1ab84183a44a9025b7 100644
--- a//dev/null
+++ b/modules/mascot-controller.js
@@ -0,0 +1,47 @@
+function enableMascotMoveAndResize() {
+  const mascot = document.getElementById('mascot');
+  const wrap = mascot?.parentElement;
+  if (!mascot || !wrap) return;
+
+  let startX = 0, startY = 0;
+  let startLeft = 0, startTop = 0;
+  let dragging = false;
+  let scale = 1;
+
+  mascot.addEventListener('pointerdown', (e) => {
+    dragging = true;
+    const wrapRect = wrap.getBoundingClientRect();
+    const rect = mascot.getBoundingClientRect();
+    startX = e.clientX;
+    startY = e.clientY;
+    startLeft = rect.left - wrapRect.left;
+    startTop = rect.top - wrapRect.top;
+    mascot.style.right = 'auto';
+    mascot.setPointerCapture(e.pointerId);
+  });
+
+  mascot.addEventListener('pointermove', (e) => {
+    if (!dragging) return;
+    const dx = e.clientX - startX;
+    const dy = e.clientY - startY;
+    mascot.style.left = `${startLeft + dx}px`;
+    mascot.style.top = `${startTop + dy}px`;
+  });
+
+  function endDrag(e) {
+    dragging = false;
+    mascot.releasePointerCapture?.(e.pointerId);
+  }
+
+  mascot.addEventListener('pointerup', endDrag);
+  mascot.addEventListener('pointercancel', endDrag);
+
+  mascot.addEventListener('wheel', (e) => {
+    e.preventDefault();
+    scale += e.deltaY < 0 ? 0.1 : -0.1;
+    scale = Math.min(Math.max(scale, 0.5), 2);
+    mascot.style.transform = `scale(${scale})`;
+  });
+}
+
+document.addEventListener('DOMContentLoaded', enableMascotMoveAndResize);
