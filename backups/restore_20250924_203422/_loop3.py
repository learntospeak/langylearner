from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
start = text.find('for (let i = tiles.length - 1; i >= 0; i--) {', text.find('pointermove'))
print(text[start:start+200])
