from pathlib import Path
import re
path = Path('modules/ninjaSlice.js')
text = path.read_text(encoding='utf-8')
# Update kana bubble block
pattern_bubble = r"        ctx.fillStyle = '#111';\r?\n        ctx.font = '56px system-ui, sans-serif';\r?\n        ctx.fillText\(t.char, 0, 2\);\r?\n      }"
replacement_bubble = "        ctx.save();\n        ctx.fillStyle = '#111';\n        ctx.font = '56px system-ui, sans-serif';\n        ctx.textAlign = 'center';\n        ctx.textBaseline = 'middle';\n        const bubbleYOffset = radius * 0.06;\n        ctx.fillText(t.char, 0, bubbleYOffset);\n        ctx.restore();\n      }"
if pattern_bubble not in text:
    raise SystemExit('Bubble text block not found')
text = re.sub(pattern_bubble, replacement_bubble, text, count=1)
# Update bomb block to add centered text before ctx.restore()
pattern_bomb = r"        const armColor = '#f3b48f';[\s\S]*?ctx.fillStyle = armColor;\r?\n        ctx.arc\(-bodyRadius \* 0.78, bodyRadius \* 0.68, bodyRadius \* 0.22, 0, Math\.PI \* 2\);\r?\n        ctx.arc\(bodyRadius \* 0.78, bodyRadius \* 0.68, bodyRadius \* 0.22, 0, Math\.PI \* 2\);\r?\n        ctx.fill\(\);\r?\n\r?\n        ctx.restore\(\);"
replacement_bomb = "        const armColor = '#f3b48f';\n        ctx.beginPath();\n        ctx.strokeStyle = armColor;\n        ctx.lineWidth = bodyRadius * 0.32;\n        ctx.lineCap = 'round';\n        ctx.moveTo(-bodyRadius * 0.92, -bodyRadius * 0.08);\n        ctx.lineTo(-bodyRadius * 0.38, bodyRadius * 0.46);\n        ctx.stroke();\n        ctx.beginPath();\n        ctx.moveTo(bodyRadius * 0.92, -bodyRadius * 0.08);\n        ctx.lineTo(bodyRadius * 0.38, bodyRadius * 0.46);\n        ctx.stroke();\n\n        ctx.beginPath();\n        ctx.fillStyle = armColor;\n        ctx.arc(-bodyRadius * 0.78, bodyRadius * 0.68, bodyRadius * 0.22, 0, Math.PI * 2);\n        ctx.arc(bodyRadius * 0.78, bodyRadius * 0.68, bodyRadius * 0.22, 0, Math.PI * 2);\n        ctx.fill();\n\n        ctx.save();\n        ctx.fillStyle = '#111';\n        ctx.font = '52px system-ui, sans-serif';\n        ctx.textAlign = 'center';\n        ctx.textBaseline = 'middle';\n        const sumoYOffset = bodyRadius * 0.18;\n        ctx.fillText(t.char, 0, sumoYOffset);\n        ctx.restore();\n\n        ctx.restore();"
if re.search(pattern_bomb, text) is None:
    raise SystemExit('Bomb block not found')
text = re.sub(pattern_bomb, replacement_bomb, text, count=1)
# Update normalizeStage to strip trailing periods
pattern_norm = r"  const normalizeStage = \(entry = {}\) => {\r?\n    const raw = \(entry\.phrase \|\| entry\.jp \|\| ''\)\.trim\(\);\r?\n    if \(!raw\) return null;\r?\n    let romajiText = \(entry\.romaji \|\| entry\.romaji_full \|\| entry\.romajiFull \|\| ''\)\.trim\(\);"
replacement_norm = "  const normalizeStage = (entry = {}) => {\n    const raw = (entry.phrase || entry.jp || '').trim();\n    if (!raw) return null;\n    const cleaned = raw.replace(/[?.\.]+$/u, '');\n    const phraseClean = cleaned || raw;\n    let romajiText = (entry.romaji || entry.romaji_full || entry.romajiFull || '').trim();"
if re.search(pattern_norm, text) is None:
    raise SystemExit('normalizeStage pattern not found')
text = re.sub(pattern_norm, replacement_norm, text, count=1)
# ensure sanitized phrase used
text = text.replace('return { phrase: raw, romaji: romajiText, english: englishText };', '    return { phrase: phraseClean, romaji: romajiText, english: englishText };')
# When fallback stage created
text = text.replace('    const fallbackStage = normalizeStage({ phrase, romaji, english });', '    const fallbackStage = normalizeStage({ phrase, romaji, english });')
path.write_text(text, encoding='utf-8')
