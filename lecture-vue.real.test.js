/* Reproduit une seance REELLE de bout en bout, a travers le vrai
   gestionnaire MIDI : on tape le decompte pour sentir le pulse, puis on
   joue la piece proprement. C'est le scenario qui affichait 100 % de
   notes justes, 6 notes en trop et 463 ms d'ecart au temps. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');

const DIR = 'C:/Users/Lucas/PaimonAlphabet/';
const PAGE = process.argv[2] || 'lecture-vue.html';
let html = fs.readFileSync(DIR + PAGE, 'utf8');
for (const f of ['sightread-glyphs.js', 'sightread-gen.js', 'sightread-render.js'])
    html = html.replace('<script src="' + f + '"></script>',
        '<script>' + fs.readFileSync(DIR + f, 'utf8') + '</script>');

const PRELUDE = `<script>
window.__T = { now: 1000 };
performance.now = () => window.__T.now;
let __s = 7;
Math.random = () => { __s = (__s * 1103515245 + 12345) & 0x7fffffff; return __s / 0x7fffffff; };
const __node = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : __node(),
    apply: () => __node(), set: () => true
});
window.AudioContext = function () {
    return new Proxy({ state: 'running', currentTime: 0, destination: __node() }, {
        get: (t, k) => k in t ? t[k] : k === 'getOutputTimestamp'
            ? (() => ({ contextTime: 0, performanceTime: 0 })) : (() => __node())
    });
};
<\/script>`;
html = html.replace('<head>', '<head>' + PRELUDE);

const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://local.test/' + PAGE
});
const w = dom.window;
const S = () => w.eval('S');
const midi = (t, p) => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: t });

let spare = null;
function gauss(sd) {
    if (spare !== null) { const v = spare; spare = null; return v * sd; }
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v) * sd;
}

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) pass++; else { fail++; console.log('  ECHEC  ' + n + (d ? '  [' + d + ']' : '')); } };

w.startSession();
let guard = 0;
while (S().phase !== 'read' && guard++ < 4000) { w.__T.now += 250; w.tick(); }

const st = S(), t0 = st.gridT0, beat = 60000 / st.piece.bpm;
const bpb = st.piece.compound ? st.piece.ts.num / 3 : st.piece.ts.num;

console.log('piece de ' + st.tl.length + ' notes, niveau ' + st.piece.level
    + ', ' + st.piece.ts.num + '/' + st.piece.ts.den + ', noire = ' + st.piece.bpm);
console.log('');

// on tape les temps du decompte sur une touche, comme un musicien
for (let b = 2 * bpb; b >= 1; b--) { w.__T.now = t0 - b * beat + 3; midi(w.__T.now, 60); }
console.log('decompte tape : ' + S().early + ' notes ignorees, '
    + S().played.length + ' enregistrees');
check('taper le decompte ne pollue pas la lecture', S().played.length === 0,
    S().played.length + ' notes retenues');
check('ces notes sont comptees a part', S().early === 2 * bpb, S().early);

// puis la piece, jouee juste, avec 25 ms d'imprecision
for (const e of st.tl) { w.__T.now = t0 + e.ms + gauss(25); midi(w.__T.now, e.midi); }
w.__T.now += 60; w.tick();

const a = S().items[S().items.length - 1].a;
console.log('');
console.log('  notes justes    : ' + a.matched + '/' + a.total + '  (' + a.accuracy.toFixed(0) + ' %)');
console.log('  notes en trop   : ' + a.wrong);
console.log('  arrets          : ' + a.stops);
console.log('  ecart au temps  : ' + Math.round(a.offMs) + ' ms   (imprecision reelle : 25 ms)');
console.log('  derive de tempo : ' + a.drift.toFixed(0) + ' %');
console.log('');

check('toutes les notes sont reconnues', a.accuracy > 99, a.accuracy.toFixed(0) + ' %');
check('aucune note en trop', a.wrong === 0, a.wrong);
check('aucun arret', a.stops === 0, a.stops);
check('l ecart au temps correspond a l imprecision reelle',
    Math.abs(a.offMs - 25) < 12, Math.round(a.offMs) + ' ms pour 25 ms');
check('le bilan ne se contredit pas : 100 % de justes implique 0 en trop',
    !(a.accuracy > 99 && a.wrong > 0), a.accuracy.toFixed(0) + ' % et ' + a.wrong + ' en trop');

console.log((fail === 0 ? 'TOUT PASSE' : 'ECHECS') + ' : ' + pass + ' ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
