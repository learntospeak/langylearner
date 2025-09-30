from pathlib import Path
import re
path = Path('modules/ninjaSlice.js')
text = path.read_text()
pm_pattern = r"canvas\.addEventListener\('pointermove', e => \{\n[\s\S]*?\n\}\);"
pm_repl = """canvas.addEventListener('pointermove', e => {\n    if (e.buttons === 0) return;\n    const rect = canvas.getBoundingClientRect();\n    const x = (e.clientX - rect.left);\n    const y = (e.clientY - rect.top );\n    if (!trails.length) return; // guard if move occurs before down\n    const current = trails[trails.length - 1];\n    current.push({ x, y, time: Date.now() });\n    const p0 = current[current.length-2];\n    const p1 = current[current.length-1];\n    if (p0 && p1){\n      const dx = p1.x - p0.x, dy = p1.y - p0.y;\n      if ((dx*dx + dy*dy) > 80) { try { SFX('swish'); } catch {} }\n      const now = performance.now();\n      for (let i = tiles.length - 1; i >= 0; i--) {\n        const t = tiles[i];\n        const radius = (t.type === 'bomb' ? BOMB_HIT_RADIUS : KANA_HIT_RADIUS) * HIT_INFLATE;\n        if (hitSegmentCircle(p0.x,p0.y,p1.x,p1.y,t.x,t.y,radius)) {\n          if (t._lastHitAt && (now - t._lastHitAt) < HIT_COOLDOWN_MS) continue;\n          t._lastHitAt = now;\n          tiles.splice(i,1);\n          sliceKana(t);\n        }\n      }\n    }\n    drawTrails();\n  });"""
new, n = re.subn(pm_pattern, pm_repl, text, count=1)
if n == 0:
    raise SystemExit('pointermove pattern not found')
path.write_text(new)
