from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
start = text.index('canvas.addEventListener("pointerdown"')
end = text.index('});\r\n\r\n  canvas.addEventListener(\'pointermove\'', start) + len('});\r\n')
print(repr(text[start:end]))
