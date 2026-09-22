/* Les gestes involontaires ne sont pas des notes.

   Une touche effleuree a 1 % de force est un doigt qui traine ; deux
   touches voisines frappees ensemble sont UN doigt qui deborde. Ni l'une
   ni l'autre ne doit compter comme une note jouee — et surtout pas comme
   une note FAUSSE, qui ferait chuter un pourcentage merite. */
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
let __s = 8642;
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

function lecture(level) {
    const w = boot();
    const S = () => w.eval('S');
    const set = "S.manual=true;S.calibrating=false;S.level=" + level
        + ";S.view='all';S.occl='none';";
    w.eval(set); w.startSession(); w.eval(set); w.startItem();
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    return { w, S, note: (t, p, v) => w.onMIDIMessage({ data: [0x90, p, v === undefined ? 80 : v], timeStamp: t }) };
}
function conclure(w, S) {
    let q = 0;
    while (S().phase === 'read' && q++ < 300) { w.__T.now += 200; w.tick(); }
    return S().items[S().items.length - 1].a;
}

// ------------------------------------------------------------------
section('1. Une touche effleuree n\'est pas une note');

{
    const { w, S, note } = lecture(1);
    const tl = S().tl, t0 = S().gridT0;
    for (let i = 0; i < tl.length; i++) {
        w.__T.now = t0 + tl[i].ms;
        note(w.__T.now, tl[i].midi, 80);
        // un doigt qui traine sur une touche voisine, a 1 % de force
        w.__T.now += 300;
        note(w.__T.now, tl[i].midi + 5, 2);
    }
    const a = conclure(w, S);
    check('les effleurements sont ecartes', S().grazed === tl.length,
        S().grazed + ' sur ' + tl.length);
    check('ils ne comptent pas comme des notes fausses', a.wrong === 0, a.wrong);
    check('la justesse reste entiere', a.accuracy > 99, a.accuracy.toFixed(0) + ' %');
    w.endSession();
}

{
    // une vraie nuance douce, elle, doit compter
    const { w, S, note } = lecture(1);
    const tl = S().tl, t0 = S().gridT0;
    for (const e of tl) { w.__T.now = t0 + e.ms; note(w.__T.now, e.midi, 22); }
    const a = conclure(w, S);
    check('un vrai pianissimo compte comme joue', a.accuracy > 99,
        a.accuracy.toFixed(0) + ' % a la velocite 22');
    check('et n est pas pris pour un effleurement', S().grazed === 0, S().grazed);
    w.endSession();
}

// ------------------------------------------------------------------
section('2. Deux touches voisines accrochees ne font qu une frappe');

{
    // le doigt deborde SOUS la bonne note : la bonne arrive en second
    const { w, S, note } = lecture(1);
    const tl = S().tl, t0 = S().gridT0;
    for (const e of tl) {
        w.__T.now = t0 + e.ms;
        note(w.__T.now, e.midi - 1, 70);      // la voisine, d'abord
        w.__T.now += 6;
        note(w.__T.now, e.midi, 85);          // la bonne, juste apres
    }
    const a = conclure(w, S);
    check('les paires sont fusionnees', S().brushed === tl.length,
        S().brushed + ' sur ' + tl.length);
    check('c est la note ATTENDUE qui est retenue', a.accuracy > 99,
        a.accuracy.toFixed(0) + ' %');
    check('aucune note fausse n est comptee', a.wrong === 0, a.wrong);
    check('et pas de notes en trop non plus', a.matched === tl.length,
        a.matched + '/' + tl.length);
    w.endSession();
}

{
    // le doigt deborde APRES la bonne note : la voisine arrive en second
    const { w, S, note } = lecture(1);
    const tl = S().tl, t0 = S().gridT0;
    for (const e of tl) {
        w.__T.now = t0 + e.ms;
        note(w.__T.now, e.midi, 85);          // la bonne, d'abord
        w.__T.now += 8;
        note(w.__T.now, e.midi + 1, 60);      // la voisine, juste apres
    }
    const a = conclure(w, S);
    check('la voisine tardive est jetee', S().brushed === tl.length, S().brushed);
    check('la bonne note reste', a.accuracy > 99, a.accuracy.toFixed(0) + ' %');
    check('aucune note fausse', a.wrong === 0, a.wrong);
    w.endSession();
}

{
    // deux notes voisines VOLONTAIRES, a un intervalle de temps jouable :
    // ce n'est pas un debordement, il faut les compter toutes les deux
    const { w, S, note } = lecture(1);
    const t0 = S().gridT0;
    w.__T.now = t0;
    note(w.__T.now, 60, 80);
    w.__T.now += 400;
    note(w.__T.now, 61, 80);
    check('deux voisines separees de 400 ms comptent pour deux',
        S().played.length === 2, S().played.length + ' notes retenues');
    check('et ne sont pas prises pour un debordement', S().brushed === 0, S().brushed);
    w.endSession();
}

{
    // un vrai accord de la partition ne doit pas etre fusionne : ses
    // notes sont a une tierce au moins, le filtre ne doit pas y toucher
    const { w, S, note } = lecture(6);
    const tl = S().tl, t0 = S().gridT0;
    for (const e of tl) { w.__T.now = t0 + e.ms; note(w.__T.now, e.midi, 80); }
    const a = conclure(w, S);
    check('un accord ecrit passe intact', S().brushed === 0, S().brushed + ' fusions');
    check('toutes ses notes sont reconnues', a.accuracy > 99, a.accuracy.toFixed(0) + ' %');
    w.endSession();
}

// ------------------------------------------------------------------
section('3. Le bilan le dit au lieu de corriger en silence');

{
    const { w, S, note } = lecture(1);
    const tl = S().tl, t0 = S().gridT0;
    for (const e of tl) {
        w.__T.now = t0 + e.ms;
        note(w.__T.now, e.midi - 1, 70);
        w.__T.now += 5;
        note(w.__T.now, e.midi, 85);
        w.__T.now += 250;
        note(w.__T.now, e.midi + 7, 3);
    }
    conclure(w, S);
    const txt = w.document.getElementById('vTable').textContent;
    check('le bilan signale les effleurements', /\d/.test(txt) && S().grazed > 0
        && txt.length > 0, S().grazed + ' effleurements');
    check('le bilan compte une ligne de plus par geste signale',
        w.document.getElementById('vTable').querySelectorAll('tr').length >= 11,
        w.document.getElementById('vTable').querySelectorAll('tr').length + ' lignes');
    w.endSession();
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
