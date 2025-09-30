from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
start = text.index("const radius = t.radius")
end = text.index("if (t.type === 'bomb') {", start)
print(text[start:end])
