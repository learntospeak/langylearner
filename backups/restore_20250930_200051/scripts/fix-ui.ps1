$path = 'lesson-shim.js'
$content = Get-Content -Raw $path

# 1) After listEl.appendChild(row); set Speak label
$repl1 = @'
listEl.appendChild(row);
      try { const cls = map?.classes?.speakBtn || 'speak-btn'; const btn = row.querySelector('.' + cls); if (btn) btn.textContent = 'Speak'; } catch {}
'@
$content = [regex]::Replace($content, 'listEl\.appendChild\(row\);\r?\n', $repl1)

# 2) Status text: normalize any corrupted "Use ... Speak." to plain ASCII
$content = [regex]::Replace($content, 'Use[^"\n]*Speak\.', 'Use Speak.')

# 3) Variations toolbar labels after const quiz = ...
$repl3 = @'
const quiz = box.querySelector('#varQuiz');
    try { const s=box.querySelector('[data-act="shuffle"]'); if (s) s.textContent='Shuffle'; const q=box.querySelector('[data-act="quiz"]'); if (q) q.textContent='Quiz me'; const a=box.querySelector('[data-act="showall"]'); if (a) a.textContent='Show all'; } catch {}
'@
$content = [regex]::Replace($content, 'const quiz = box\.querySelector\('#varQuiz'\);\r?\n', $repl3)

# 4) Variations "Listen" button label after event binding
$repl4 = @'
        try { const lb = line.querySelector('[data-jp]'); if (lb) lb.textContent = 'Listen'; } catch {}
'@
$content = [regex]::Replace($content, '(\[data-jp\]\)[^\r\n]*\r?\n', "$0$repl4")

# 5) Roleplay button labels after listEl.appendChild(box);
$repl5 = @'
listEl.appendChild(box);
    try { const s=box.querySelector('[data-act="speak"]'); if (s) s.textContent='Play Prompt'; const r=box.querySelector('[data-act="rec"]'); if (r) r.textContent='Start'; const sk=box.querySelector('[data-act="skip"]'); if (sk) sk.textContent='Skip'; } catch {}
'@
$content = [regex]::Replace($content, 'listEl\.appendChild\(box\);\r?\n', $repl5)

# 6) Phrase drill labels after listEl.appendChild(card);
$repl6 = @'
listEl.appendChild(card);
    try { const s=card.querySelector('[data-act="speak"]'); if (s) s.textContent='Speak'; const v=card.querySelector('[data-act="alt"]'); if (v) v.textContent='Variations'; const n=card.querySelector('[data-act="next"]'); if (n) n.textContent='Next >'; } catch {}
'@
$content = [regex]::Replace($content, 'listEl\.appendChild\(card\);\r?\n', $repl6)

# 7) Speed label template: normalize to "x"
$content = [regex]::Replace($content, '\$\{rate\.toFixed\(1\)\}[^`]*`', '${rate.toFixed(1)}x`')

Set-Content -Path $path -Value $content -NoNewline
Write-Output 'fix-ui.ps1 applied.'
