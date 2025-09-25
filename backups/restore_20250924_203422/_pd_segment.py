from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
start = text.find('canvas.addEventListener("pointerdown"')
end = text.index('canvas.addEventListener(\'pointermove\'', start)
print(text[start:end])
