from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
idx = text.find('const sweepRadius = baseRadius + activeSlicePad')
print(text[idx-60:idx+160])
