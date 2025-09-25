from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8')
old = "  // draw loop\r\n  const now = performance.now();"
new = "  // draw loop\r\n  function draw() {\r\n    const now = performance.now();"
if old not in text:
    raise SystemExit('draw loop signature not found')
text = text.replace(old, new, 1)
Path('modules/ninjaSlice.js').write_text(text, encoding='utf-8')
