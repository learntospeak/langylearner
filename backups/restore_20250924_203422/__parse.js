const fs=require('fs');
const path='lesson-shim.js';
const s=fs.readFileSync(path,'utf8');
try{
  new Function(s);
  console.log('PARSE_OK');
}catch(e){
  console.log('PARSE_ERR:'+e.name+': '+e.message);
  const m = (''+e.stack).match(/<anonymous>:(\d+):(\d+)/);
  if(m){
    console.log('AT_LINE:'+m[1]+',COL:'+m[2]);
    const lines = s.split(/\r?\n/);
    const ln = parseInt(m[1],10);
    console.log('LINE'+ln+': '+lines[ln-1]);
  }
}
