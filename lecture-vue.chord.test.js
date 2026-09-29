/* Le premier accord ne doit pas terminer la piece.

   Signale en jeu : en mode « accords », le premier accord joue pile a
   l'heure concluait aussitot la lecture, verdict « tout faux ». L'alignement
   est global — cinq notes parmi soixante s'alignent aussi bien sur le
   dernier accord que sur le premier, et aux premiers niveaux c'est le meme
   accord, la tonique. L'ancre du temps ne doit donc rien lui devoir. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const DIR = 'C:/Users/Lucas/PaimonAlphabet/';
const PAGE = process.argv[2] || 'lecture-vue.html';

function boot() {
    let html = fs.readFileSync(DIR + PAGE, 'utf8');
    for (const f of ['sightread-glyphs.js', 'sightread-gen.js', 'sightread-render.js'])
        html = html.replace('<script src="' + f + '"></script>',
            '<script>' + fs.readFileSync(DIR + f, 'utf8') + '</script>');
    const PRE = `<script>
window.__T = { now: 1000 };
performance.now = () => window.__T.now;
let __s = 4242;
Math.random = () => { __s = (__s * 1103515245 + 12345) & 0x7fffffff; return __s / 0x7fffffff; };
const __n = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : __n(),
    apply: () => __n(), set: () => true
});
window.AudioContext = function () {
    return new Proxy({ state: 'running', currentTime: 0, destination: __n() }, {
        get: (t, k) => k in t ? t[k] : k === 'getOutputTimestamp'
            ? (() => ({ contextTime: 0, performanceTime: 0 })) : (() => __n())
    });
};
<\/script>`;
    html = html.replace('<head>', '<head>' + PRE);
    return new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://local.test/' + PAGE
    }).window;
}

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) pass++; else { fail++; console.log('  ECHEC  ' + n + (d ? '  [' + d + ']' : '')); } };
const section = t => console.log('\n' + t);

// Lance une lecture au niveau et au contenu demandes, joue les `combien`
// premiers instants ecrits pile a l'heure, puis laisse le silence venir.
function lecture(level, content, hands, combien) {
    const w = boot();
    const S = () => w.eval('S');
    const set = "S.manual=true;S.calibrating=false;S.level=" + level
        + ";S.view='all';S.occl='none';S.content='" + content
        + "';S.hands='" + hands + "';";
    w.eval(set); w.startSession(); w.eval(set); w.startItem();
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0, beat = 60000 / S().piece.bpm;

    // les `combien` premiers INSTANTS distincts, accords compris
    const instants = [...new Set(tl.map(e => e.ms))].sort((a, b) => a - b)
        .slice(0, combien);
    let joue = 0;
    for (const e of tl) {
        if (instants.indexOf(e.ms) < 0) continue;
        w.__T.now = t0 + e.ms;
        w.onMIDIMessage({ data: [0x90, e.midi, 80], timeStamp: w.__T.now });
        joue++;
    }
    const derniere = w.__T.now;
    const w_ = w;
    return {
        w: w_, S, tl, beat, joue, derniere,
        // avance le temps de `ms` en laissant la page vivre
        avance(ms) { for (let k = 0; k < ms; k += 50) { w_.__T.now += 50; w_.tick(); } }
    };
}

// ------------------------------------------------------------------
section('1. Un seul accord ne fait pas croire la piece finie');

for (const content of ['chords', 'fifths7', 'arpeggio']) {
    const L = lecture(1, content, 'both', 1);
    L.avance(3 * L.beat);
    check(content + ' : on lit encore trois temps apres le premier accord',
        L.S().phase === 'read', 'phase ' + L.S().phase + ' apres ' + L.joue + ' notes');
    const a = L.w.analyse(L.S().piece, L.tl, L.S().played);
    check(content + ' : la piece n\'est pas dite menee au bout',
        a.reached < L.tl.length * 0.5,
        a.reached + ' notes atteintes sur ' + L.tl.length);
    L.w.endSession();
}

// ------------------------------------------------------------------
section('2. Meme chose au milieu de la piece, pas seulement au debut');

{
    const L = lecture(1, 'chords', 'both', 3);
    L.avance(3 * L.beat);
    check('trois accords ne terminent pas une piece de plusieurs mesures',
        L.S().phase === 'read', 'phase ' + L.S().phase);
    const a = L.w.analyse(L.S().piece, L.tl, L.S().played);
    check('et la couverture reste modeste', a.covered < 40,
        a.covered.toFixed(0) + ' %');
    L.w.endSession();
}

// ------------------------------------------------------------------
section('3. Le silence finit quand meme par conclure');

{
    const L = lecture(1, 'chords', 'both', 1);
    L.avance(14 * L.beat);
    check('apres dix temps de silence, la lecture se conclut',
        L.S().phase !== 'read', 'phase ' + L.S().phase);
    L.w.endSession();
}

// ------------------------------------------------------------------
section('4. Une piece jouee en entier est toujours reconnue comme finie');

for (const content of ['melody', 'chords']) {
    const L = lecture(1, content, 'both', 9999);
    const a = L.w.analyse(L.S().piece, L.tl, L.S().played);
    check(content + ' : piece entiere -> menee au bout',
        a.reached === L.tl.length, a.reached + ' / ' + L.tl.length);
    L.avance(3 * L.beat);
    check(content + ' : et la lecture se conclut vite',
        L.S().phase !== 'read', 'phase ' + L.S().phase);
    L.w.endSession();
}

// ------------------------------------------------------------------
section('5. Une lecture arretee aux deux tiers est mesuree comme telle');

{
    const w = boot();
    const S = () => w.eval('S');
    const set = "S.manual=true;S.calibrating=false;S.level=2;S.view='all';"
        + "S.occl='none';S.content='melody';S.hands='both';";
    w.eval(set); w.startSession(); w.eval(set); w.startItem();
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0;
    const stop = Math.floor(tl.length * 2 / 3);
    for (let i = 0; i < stop; i++) {
        w.__T.now = t0 + tl[i].ms;
        w.onMIDIMessage({ data: [0x90, tl[i].midi, 80], timeStamp: w.__T.now });
    }
    const a = w.analyse(S().piece, tl, S().played);
    check('deux tiers joues, deux tiers comptes',
        Math.abs(a.reached - stop) <= 3, a.reached + ' pour ' + stop);
    w.endSession();
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
