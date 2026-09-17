/* Le scenario signale : « en grade 2 ca se termine super vite, comme si
   deux touches comptaient pour quatre notes ». On rejoue une lecture
   entiere avec chaque note recue en double, a travers le vrai
   gestionnaire MIDI, et on verifie que la piece va bien jusqu'au bout. */
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
    const PRELUDE = `<script>
window.__T = { now: 1000 };
performance.now = () => window.__T.now;
let __s = 4242;
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
    return new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://local.test/' + PAGE
    }).window;
}

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) pass++; else { fail++; console.log('  ECHEC  ' + n + (d ? '  [' + d + ']' : '')); } };

// Joue une piece entiere ; double : chaque note emise deux fois.
function lire(w, double, level) {
    const S = () => w.eval('S');
    const midi = (t, p) => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: t });
    w.__T.now = 1000;
    // le niveau doit etre pose AVANT que la piece ne soit tiree
    w.eval('S.manual = true; S.calibrating = false; S.level = ' + level + ';');
    w.startSession();
    w.eval('S.manual = true; S.calibrating = false; S.level = ' + level + ';');
    w.startItem();
    let guard = 0;
    while (S().phase !== 'read' && guard++ < 4000) { w.__T.now += 250; w.tick(); }

    const st = S(), t0 = st.gridT0, tl = st.tl;
    let stoppedAt = -1;
    for (let i = 0; i < tl.length; i++) {
        w.__T.now = t0 + tl[i].ms;
        midi(w.__T.now, tl[i].midi);
        if (double) { w.__T.now += 2; midi(w.__T.now, tl[i].midi); }
        w.tick();
        if (S().phase !== 'read' && stoppedAt < 0) stoppedAt = i + 1;
    }
    // le clavier se tait : la lecture doit se conclure
    for (let k = 0; k < 40 && S().phase === 'read'; k++) { w.__T.now += 250; w.tick(); }
    return {
        total: tl.length, stoppedAt: stoppedAt < 0 ? tl.length : stoppedAt,
        a: S().items[S().items.length - 1].a,
        dupes: S().dupes, phase: S().phase
    };
}

console.log('chaque note recue en double, lecture jouee jusqu\'au bout');
console.log('');
console.log('niveau   notes   coupee apres   doublons ecartes   justes   arrets');

for (const lv of [1, 2, 3, 5, 7]) {
    const w = boot();
    const r = lire(w, true, lv);
    console.log('  ' + lv + '       ' + String(r.total).padStart(3) + '      '
        + String(r.stoppedAt).padStart(3) + ' notes       '
        + String(r.dupes).padStart(3) + '            '
        + r.a.accuracy.toFixed(0).padStart(3) + ' %     ' + r.a.stops);
    check('niveau ' + lv + ' : la lecture va jusqu\'a la derniere note',
        r.stoppedAt === r.total, r.stoppedAt + '/' + r.total);
    check('niveau ' + lv + ' : les doublons sont ecartes', r.dupes === r.total, r.dupes);
    check('niveau ' + lv + ' : toutes les notes restent reconnues',
        r.a.accuracy > 99, r.a.accuracy.toFixed(0) + ' %');
    check('niveau ' + lv + ' : les doublons ne creent pas d\'arret',
        r.a.stops === 0, r.a.stops);
    check('niveau ' + lv + ' : la lecture se conclut une fois le clavier tu',
        r.phase !== 'read', r.phase);
}

// Controle : une vraie note repetee, elle, doit compter.
{
    const w = boot();
    w.startSession();
    const S = () => w.eval('S');
    const midi = (t, p) => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: t });
    w.eval('S.manual = true; S.calibrating = false; S.level = 3;');
    let guard = 0;
    while (S().phase !== 'read' && guard++ < 4000) { w.__T.now += 250; w.tick(); }
    const st = S(), t0 = st.gridT0;
    // deux fois la meme note, a un intervalle jouable a la main
    midi(t0, st.tl[0].midi);
    midi(t0 + 200, st.tl[0].midi);
    check('une note reellement repetee a 200 ms compte deux fois',
        S().played.length === 2, S().played.length + ' notes retenues');
    check('et elle n\'est pas prise pour un doublon', S().dupes === 0, S().dupes);
    w.endSession();
}

console.log('');
console.log((fail === 0 ? 'TOUT PASSE' : 'ECHECS') + ' : ' + pass + ' ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
