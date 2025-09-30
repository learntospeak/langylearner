from pathlib import Path
text = Path('modules/ninjaSlice.js').read_text(encoding='utf-8').splitlines()
for i,line in enumerate(text,1):
    if 680 <= i <= 710:
        print(f"{i:4}: {line}")
