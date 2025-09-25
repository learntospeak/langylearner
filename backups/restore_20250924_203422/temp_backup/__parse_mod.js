const fs=require('fs');
const acorn=require('acorn');
const s=fs.readFileSync('lesson-shim.js','utf8');
try{ acorn.Parser.extend().parse(s, { ecmaVersion:'latest', sourceType:'module' }); console.log('ACORN_OK'); }
catch(e){ console.log('ACORN_ERR:'+e.message); console.log('POS:'+e.pos); const lines=s.split(/\r?\n/); let line=1,col=0; for(let i=0;i<e.pos;i++){ if(s[i]=='\n'){ line++; col=0;} else col++; } console.log('LINE:'+line+' COL:'+col); console.log('CODE:'+lines[line-1]); }
