const fs=require('fs');
const vm=require('vm');
const s=fs.readFileSync('lesson-shim.js','utf8');
try{
  new vm.Script(s, { filename:'lesson-shim.js' });
  console.log('SCRIPT_PARSE_OK');
}catch(e){
  console.log('SCRIPT_PARSE_ERR:'+e.name+': '+e.message);
  const m = (''+e.stack).match(/lesson-shim.js:(\d+):(\d+)/);
  if(m){
    console.log('AT_LINE:'+m[1]+',COL:'+m[2]);
    const lines = s.split(/\r?\n/);
    const ln = parseInt(m[1],10);
    console.log('LINE'+ln+': '+lines[ln-1]);
  }
}
