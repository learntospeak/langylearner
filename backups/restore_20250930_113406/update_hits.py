from pathlib import Path
import re
path = Path('modules/ninjaSlice.js')
text = path.read_text()

def sub(pattern, repl, *, count=1):
    new, n = re.subn(pattern, repl, text, count=count, flags=re.DOTALL)
    if n == 0:
        raise SystemExit(f'pattern not found: {pattern!r}')
    return new

# pointerdown block
pd_pattern = r"canvas\.addEventListener\(\"pointerdown\", e => \{\n[\s\S]*?\n\}\);"
pd_repl = """canvas.addEventListener(\"pointerdown\", e => {\n  if (canvas.setPointerCapture) {\n    try { canvas.setPointerCapture(e.pointerId); } catch {}\n  }\n  const rect = canvas.getBoundingClientRect();\n  const x = (e.clientX - rect.left);\n  const y = (e.clientY - rect.top);\n  trails.push([{ x, y, time: Date.now() }]);\n  try {\n    if (_ac && _ac.state === 'suspended') { _ac.resume(); }\n    else if (AudioCtx && !_ac) { _ac = new AudioCtx(); }\n  } catch {}\n  const now = performance.now();\n  for (let i = tiles.length - 1; i >= 0; i--) {\n    const t = tiles[i];\n    const radius = (t.type === 'bomb' ? BOMB_HIT_RADIUS : KANA_HIT_RADIUS) * HIT_INFLATE;\n    if (Math.hypot(t.x - x, t.y - y) < radius) {\n      if (t._lastHitAt && (now - t._lastHitAt) < HIT_COOLDOWN_MS) continue;\n      t._lastHitAt = now;\n      tiles.splice(i,1);\n      sliceKana(t);\n      break;\n    }\n  }\n});"""
text = sub(pd_pattern, pd_repl)

pm_pattern = r"canvas\.addEventListener\('pointermove', e => \{\n[\s\S]*?\n\}\);"
pm_repl = """canvas.addEventListener('pointermove', e => {\n  if (e.buttons === 0) return;\n  const rect = canvas.getBoundingClientRect();\n  const x = (e.clientX - rect.left);\n  const y = (e.clientY - rect.top );\n  if (!trails.length) return; // guard if move occurs before down\n  const current = trails[trails.length - 1];\n  current.push({ x, y, time: Date.now() });\n  const p0 = current[current.length-2];\n  const p1 = current[current.length-1];\n  if (p0 && p1){\n    const dx = p1.x - p0.x, dy = p1.y - p0.y;\n    if ((dx*dx + dy*dy) > 80) { try { SFX('swish'); } catch {} }\n    const now = performance.now();\n    for (let i = tiles.length - 1; i >= 0; i--) {\n      const t = tiles[i];\n      const radius = (t.type === 'bomb' ? BOMB_HIT_RADIUS : KANA_HIT_RADIUS) * HIT_INFLATE;\n      if (hitSegmentCircle(p0.x,p0.y,p1.x,p1.y,t.x,t.y,radius)) {\n        if (t._lastHitAt && (now - t._lastHitAt) < HIT_COOLDOWN_MS) continue;\n        t._lastHitAt = now;\n        tiles.splice(i,1);\n        sliceKana(t);\n        continue;\n      }\n      if (t.type === 'bomb') {\n        const dist = segmentDistance(p0.x,p0.y,p1.x,p1.y,t.x,t.y);\n        if (dist < NEAR_MISS_RADIUS && dist > BOMB_HIT_RADIUS + 4) {\n          if (!t._lastNearMiss || (now - t._lastNearMiss) > NEAR_MISS_COOLDOWN) {\n            t._lastNearMiss = now;\n            handleNearMiss(t);\n          }\n        }\n      }\n    }\n  }\n  drawTrails();\n});"""
text = sub(pm_pattern, pm_repl)

if "pointercancel" not in text:
    insert = "canvas.addEventListener('pointercancel', () => {\n  trails.length = 0;\n  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);\n});\n"
    text = text.replace("canvas.addEventListener('pointerup', () => {\n  trails.length = 0;\n  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);\n});\n", "canvas.addEventListener('pointerup', () => {\n  trails.length = 0;\n  trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);\n});\n" + insert)

path.write_text(text)
