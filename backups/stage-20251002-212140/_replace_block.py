from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
with Path('_romablock.txt').open('r', encoding='utf-8') as f:
    old_block = f.read()
if old_block not in text:
    raise SystemExit('romaji bubble block missing')
new_block = "  let romajiGroups = [];\n  let romajiVisible = true;\n  const applyRomajiVisibility = () => {\n    if (!romajiEl) return;\n    romajiEl.classList.toggle('hidden', !romajiVisible);\n  };\n  if (bubblesToggle) {\n    romajiVisible = !!bubblesToggle.checked;\n    applyRomajiVisibility();\n    bubblesToggle.addEventListener('change', () => {\n      romajiVisible = !!bubblesToggle.checked;\n      applyRomajiVisibility();\n    });\n  } else {\n    romajiVisible = true;\n    applyRomajiVisibility();\n  }\n  function showRomaForGroup(indices){\n    updateRomajiHighlight(indices);\n  }\n\n"
text = text.replace(old_block, new_block, 1)
Path('modules/ninjaSlice.js').write_text(text, encoding='utf-8')
