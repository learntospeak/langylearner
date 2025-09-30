from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
start = text.find('const baseRadius = (t && typeof t.radius ===')
print(text[start:start+120])
