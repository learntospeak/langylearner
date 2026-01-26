from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8').splitlines()
for i,line in enumerate(text[:260],1):
    if 240 <= i <= 320:
        print(f"{i:4}: {line}")
