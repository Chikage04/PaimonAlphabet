/* Le metronome doit se taire a l'arret, et ne jamais s'empiler.
   Depuis qu'il est glissant, « s'empiler » veut dire : deux ordonnanceurs
   qui tournent a la fois. */
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
window.__clics = []; window.__horloges = 0;
const _si = window.setInterval, _ci = window.clearInterval;
window.setInterval = function (f, ms) { if (ms === 25) window.__horloges++; return _si(f, ms); };
window.clearInterval = function (id) { if (id) window.__horloges = Math.max(0, window.__horloges - 1); return _ci(id); };
window.AudioContext = function () {
  const c = { t: 0, state:'running', destination:{}, resume(){},
    get currentTime(){ return c.t; },
    createOscillator: () => { const o = { frequency:{}, arrets:[],
      connect(){}, start(t){ window.__clics.push(o); }, stop(t){ o.arrets.push(t); } }; return o; },
    createGain: () => ({ gain:{ value:1, setValueAtTime(){}, exponentialRampToValueAtTime(){} },
      connect(){}, disconnect(){} }) };
  window.__ctx = c; return c;
};
<\/script>`;
html = html.replace('<head>','<head>'+PRE);
const erreurs=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>erreurs.push(e.message));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
  url:'http://localhost:8765/outils/travail.html',virtualConsole:vc});
const w=dom.window,d=w.document;
const annules = () => w.__clics.filter(o=>o.arrets.includes(undefined)).length;
const vivants = () => w.__clics.length - annules();
const avance = n => { for (let k=0;k<n;k++){ w.__ctx.t += 0.05; w.eval('bat()'); } };
setTimeout(()=>{
  w.eval('S.bpm=60; S.div=4; S.partie="A"; lance();'); avance(20);
  console.log('prise 1 : ' + vivants() + ' clics vivants, ' + w.__horloges + ' horloge(s)');
  w.eval('arrete()');
  console.log('apres arret : ' + vivants() + ' vivants, ' + w.__horloges + ' horloge(s), sortie coupee : ' + (w.eval('S.bus') === null));
  w.eval('lance()'); avance(20);
  console.log('prise 2 : ' + vivants() + ' vivants, ' + w.__horloges + ' horloge(s)');
  w.eval('lance()'); avance(20);
  console.log('relance a chaud : ' + w.__horloges + ' horloge(s) (doit rester 1)');
  console.log('verdict : ' + (w.__horloges === 1 ? 'aucun cumul' : 'CUMUL'));
  console.log('erreurs :', erreurs.length?erreurs.slice(0,2):'aucune');
  process.exit(0);
}, 400);
