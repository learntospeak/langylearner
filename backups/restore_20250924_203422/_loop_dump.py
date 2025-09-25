from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
idx = text.find('for (let i = tiles.length - 1; i >= 0; i--) {')
print(text[idx:idx+200])
