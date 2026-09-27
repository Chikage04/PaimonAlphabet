/* Quand la lecture se termine — et combien de temps le metronome tourne
   encore. Les deux plaintes sont symetriques : couper quelqu'un qui joue
   encore, et faire patienter quelqu'un qui a fini. */
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
let __s = 777;
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

// Joue la piece en sautant les notes indiquees, puis mesure le SILENCE
// qui s'ecoule avant que la lecture ne se conclue.
function attente(level, occl, saute) {
    const w = boot();
    const S = () => w.eval('S');
    const set = "S.manual=true;S.calibrating=false;S.level=" + level
        + ";S.view='all';S.occl='" + occl + "';";
    w.eval(set); w.startSession(); w.eval(set); w.startItem();
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0, beat = 60000 / S().piece.bpm;
    let derniere = t0;
    for (let i = 0; i < tl.length; i++) {
        if (saute(i, tl.length)) continue;
        w.__T.now = t0 + tl[i].ms;
        w.onMIDIMessage({ data: [0x90, tl[i].midi, 80], timeStamp: w.__T.now });
        derniere = w.__T.now;
    }
    // on laisse le silence s'installer, 100 ms a la fois
    let attendu = 0;
    while (S().phase === 'read' && attendu < 30000) {
        w.__T.now += 100; attendu += 100; w.tick();
    }
    const r = { beat, silence: w.__T.now - derniere, phase: S().phase, notes: tl.length };
    w.endSession();
    return r;
}

// ------------------------------------------------------------------
section('1. Qui a fini n\'attend pas');

{
    const r = attente(1, 'none', () => false);
    check('piece jouee en entier : conclut en moins de deux temps',
        r.phase !== 'read' && r.silence < 2 * r.beat,
        Math.round(r.silence) + ' ms pour un temps de ' + Math.round(r.beat) + ' ms');
}
{
    // le cas signale : des notes manquees au MILIEU, mais la derniere jouee
    const r = attente(1, 'none', (i, n) => i === 3 || i === 7 || i === 11);
    check('trois notes manquees au milieu : conclut quand meme en moins de deux temps',
        r.phase !== 'read' && r.silence < 2 * r.beat,
        Math.round(r.silence) + ' ms');
}
{
    // beaucoup de notes manquees, mais la fin atteinte
    const r = attente(1, 'none', (i, n) => i % 3 === 1 && i < n - 1);
    check('un tiers des notes manquees : la fin atteinte suffit',
        r.phase !== 'read' && r.silence < 2 * r.beat,
        Math.round(r.silence) + ' ms');
}
{
    // la DERNIERE note ratee : on est presque au bout, quatre temps suffisent
    const r = attente(1, 'none', (i, n) => i === n - 1);
    check('derniere note ratee : conclut en moins de cinq temps, pas dix',
        r.phase !== 'read' && r.silence < 5 * r.beat,
        Math.round(r.silence) + ' ms');
}

// ------------------------------------------------------------------
section('2. Qui hesite n\'est pas coupe');

for (const occl of ['none', 'erase']) {
    // on s'arrete aux deux tiers : la lecture doit tenir bien plus
    // longtemps que les quatre temps du cas « presque fini »
    const w = boot();
    const S = () => w.eval('S');
    const set = "S.manual=true;S.calibrating=false;S.level=1;S.view='all';S.occl='" + occl + "';";
    w.eval(set); w.startSession(); w.eval(set); w.startItem();
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0, beat = 60000 / S().piece.bpm;
    const coupe = Math.floor(tl.length * 0.66);
    for (let i = 0; i < coupe; i++) {
        w.__T.now = t0 + tl[i].ms;
        w.onMIDIMessage({ data: [0x90, tl[i].midi, 80], timeStamp: w.__T.now });
    }
    for (let k = 0; k < 60; k++) { w.__T.now += 100; w.tick(); }   // 6 s
    check(occl + ' : six secondes d\'hesitation aux deux tiers ne coupent pas',
        S().phase === 'read', S().phase + ' apres ' + coupe + '/' + tl.length + ' notes');
    // et la suite se joue normalement
    if (S().phase === 'read') {
        for (let i = coupe; i < tl.length; i++) {
            w.__T.now += 700;
            w.onMIDIMessage({ data: [0x90, tl[i].midi, 80], timeStamp: w.__T.now });
        }
        let q = 0;
        while (S().phase === 'read' && q++ < 300) { w.__T.now += 100; w.tick(); }
        const a = S().items[S().items.length - 1].a;
        check(occl + ' : et la piece est bien menee au bout', a.covered > 99,
            a.covered.toFixed(0) + ' %');
    }
    w.endSession();
}

// ------------------------------------------------------------------
section('3. Un abandon franc conclut, sans traîner');

{
    const r = attente(1, 'none', (i, n) => i > 3);
    check('quatre notes puis plus rien : conclut',
        r.phase !== 'read', r.phase);
    check('et pas avant dix temps de silence',
        r.silence >= 9 * r.beat, Math.round(r.silence) + ' ms');
    check('ni bien apres', r.silence < 13 * r.beat, Math.round(r.silence) + ' ms');
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
