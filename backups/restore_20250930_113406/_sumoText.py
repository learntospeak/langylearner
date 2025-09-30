from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
start = text.index("const sumoGlyph")
end = text.index("ctx.restore();", start) + len("ctx.restore();")
print(text[start:end])
