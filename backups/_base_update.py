from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
old_down = "  for (let i = tiles.length - 1; i >= 0; i--) {\n    const t = tiles[i];\n    if (!t) continue;\n    const baseRadius = t.radius || (t.type === 'bomb' ? BOMB_RADIUS : KANA_RADIUS);\n"
new_down = "  for (let i = tiles.length - 1; i >= 0; i--) {\n    const t = tiles[i];\n    if (!t) continue;\n    const baseRadius = (typeof t.radius === 'number') ? t.radius : (t.type === 'bomb' ? BOMB_RADIUS : KANA_RADIUS);\n"
if old_down not in text:
    raise SystemExit('pointerdown block not matched')
text = text.replace(old_down, new_down, 1)
old_move = "  for (let i = tiles.length - 1; i >= 0; i--) {\n    const t = tiles[i];\n    const baseRadius = t.radius || (t.type === 'bomb' ? BOMB_RADIUS : KANA_RADIUS);\n"
new_move = "  for (let i = tiles.length - 1; i >= 0; i--) {\n    const t = tiles[i];\n    if (!t) continue;\n    const baseRadius = (typeof t.radius === 'number') ? t.radius : (t.type === 'bomb' ? BOMB_RADIUS : KANA_RADIUS);\n"
if old_move not in text:
    raise SystemExit('pointermove block not matched')
text = text.replace(old_move, new_move, 1)
Path('modules/ninjaSlice.js').write_text(text, encoding='utf-8')
