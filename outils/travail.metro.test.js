/* Le metronome doit se taire a l'arret, et ne jamais s'empiler. */
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
window.__audio = { oscillos: [], bus: 0, debranches: 0 };
window.AudioContext = function () {
  return {
    state:'running', currentTime:0, destination:{ nom:'sortie' }, resume(){},
    createOscillator: () => { const o = { frequency:{}, arrets: [],
        connect(){}, start(t){ o.depart = t; }, stop(t){ o.arrets.push(t); } };
      window.__audio.oscillos.push(o); return o; },
    createGain: () => { const g = { gain:{ value:1, setValueAtTime(){},
        exponentialRampToValueAtTime(){} }, branche:true,
        connect(){ if (g.estBus) window.__audio.bus++; },
        disconnect(){ g.branche = false; window.__audio.debranches++; } };
      return g; }
  };
};
<\/script>`;
html = html.replace('<head>','<head>'+PRE);
const erreurs=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>erreurs.push(e.message));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,
  url:'http://localhost:8765/outils/travail.html',virtualConsole:vc});
const w=dom.window,d=w.document;
// un clic est ANNULE si stop() a ete appele sans heure : c'est ce que fait
// la coupure de sortie, en plus du stop(t+0.06) programme a la creation
const annules = () => w.__audio.oscillos.filter(o=>o.arrets.includes(undefined)).length;
const programmes = () => w.__audio.oscillos.length;
const vivants = () => programmes() - annules();
setTimeout(()=>{
  w.eval('S.bpm=60; S.div=4; S.partie="A"; lance();');
  const un = w.__audio.oscillos.length;
  console.log('prise 1 : ' + un + ' clics programmes, ' + vivants() + ' vivants');
  w.eval('arrete()');
  console.log('apres arret : ' + vivants() + ' vivants, sortie debranchee : '
      + (w.eval('S.bus') === null));
  w.eval('lance()');
  const deux = w.__audio.oscillos.length - un;
  console.log('prise 2 : ' + deux + ' clics programmes, ' + vivants() + ' vivants'
      + ' (doit valoir le compte d\'UNE prise, pas deux)');
  w.eval('lance()');   // relance sans arreter : l'ancienne doit mourir
  console.log('relance a chaud : ' + vivants() + ' vivants');
  console.log('verdict : ' + (vivants() === deux ? 'aucun cumul' : 'CUMUL'));
  console.log('erreurs :', erreurs.length?erreurs.slice(0,2):'aucune');
  process.exit(0);
}, 400);
