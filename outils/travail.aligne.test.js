const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs');
const DIR='C:/Users/Lucas/PaimonAlphabet/';
let html = fs.readFileSync(DIR+'outils/travail.html','utf8');
for (const f of ['sightread-glyphs.js','sightread-gen.js','sightread-render.js'])
  html = html.replace('<script src="../'+f+'"></script>','<script>'+fs.readFileSync(DIR+f,'utf8')+'</script>');
const suite = fs.readFileSync(DIR+'outils/suite-main-droite.json','utf8');
const PRE = `<script>
window.__SUITE = ${suite};
window.fetch = () => Promise.resolve({ json: () => Promise.resolve(window.__SUITE) });
window.AudioContext = function () {
  return { state:'running', currentTime:0, destination:{}, resume(){},
    createOscillator: () => ({ frequency:{}, connect(){}, start(){}, stop(){} }),
    createGain: () => ({ gain:{ value:1, setValueAtTime(){}, exponentialRampToValueAtTime(){} },
      connect(){}, disconnect(){} }) };
};
<\/script>`;
html = html.replace('<head>','<head>'+PRE);
const erreurs=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>erreurs.push(e.message));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
  url:'http://localhost:8765/outils/travail.html',virtualConsole:vc});
const w=dom.window,d=w.document;
const tuiles=()=>[...d.querySelectorAll('.tuile')].map(x=>x.querySelector('.k').textContent+'='+x.querySelector('.v').textContent).join(' ');
setTimeout(()=>{
  const cas = [
    ['parfait',          n=>n.slice()],
    ['une oubliee',      n=>n.filter((_,i)=>i!==25)],
    ['une en trop',      n=>{const c=n.slice(); c.splice(25,0,72); return c;}],
    ['trois fausses',    n=>n.map((m,i)=>[10,30,50].includes(i)?m+1:m)],
    ['une note apres',   n=>n.concat([72])],
    ['deux notes apres', n=>n.concat([72,74])]
  ];
  for (const [titre, f] of cas) {
    w.eval('S.bpm=60; S.div=4; S.partie="A"; lance();');
    const cible=JSON.parse(w.eval('JSON.stringify(S.cibles)'));
    const joue=f(cible); const pas=60000/60/4;
    w.eval('S.t0 = 0');
    joue.forEach((m,i)=>w.eval('S.joue.push({t:'+(i*pas)+',midi:'+m+',vel:70})'));
    w.eval('fin()');
    console.log(titre.padEnd(16), tuiles());
    if (/apres/.test(titre)) console.log(' '.repeat(16), 'verdict :', d.getElementById('phase').textContent.slice(0,50));
  }
  console.log('erreurs :', erreurs.length?erreurs.slice(0,2):'aucune');
  process.exit(0);
}, 400);
