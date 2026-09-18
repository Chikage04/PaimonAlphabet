/* Les deux reglages qui s'ajoutent au niveau : quelle main, quel contenu.
   On verifie ici qu'ils arrivent bien jusqu'a la partition affichee et
   jusqu'au bilan, pas seulement jusqu'au generateur. */
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
let __s = 20260919;
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
const section = t => console.log('\n' + t);

// Lance un item avec la variante demandee et rend l'etat.
function item(w, hands, content, level) {
    const S = () => w.eval('S');
    w.eval("S.manual = true; S.calibrating = false; S.level = " + level
        + "; S.hands = '" + hands + "'; S.content = '" + content + "';");
    w.startSession();
    w.eval("S.manual = true; S.calibrating = false; S.level = " + level
        + "; S.hands = '" + hands + "'; S.content = '" + content + "';");
    w.startItem();
    return S;
}

// ------------------------------------------------------------------
section('1. Le reglage de main arrive jusqu\'a la partition');

for (const level of [1, 3, 6, 8]) {
    {
        const w = boot();
        const S = item(w, 'rh', 'melody', level);
        const tl = S().tl;
        check('niveau ' + level + ', main droite : rien a la main gauche',
            tl.every(e => e.hand === 'R'), tl.filter(e => e.hand === 'L').length + ' notes MG');
        check('niveau ' + level + ', main droite : la partition porte des notes',
            w.document.getElementById('score').querySelectorAll('.sr-head').length > 0);
        w.endSession();
    }
    {
        const w = boot();
        const S = item(w, 'lh', 'melody', level);
        const tl = S().tl;
        check('niveau ' + level + ', main gauche : rien a la main droite',
            tl.every(e => e.hand === 'L'), tl.filter(e => e.hand === 'R').length + ' notes MD');
        // la portee de fa va de sol2 (43) a la3 (57) ; on tolere quelques
        // lignes supplementaires, pas une ligne qui s'envole
        const hors = tl.filter(e => e.midi < 36 || e.midi > 62);
        check('niveau ' + level + ', main gauche : la ligne tient sur sa portee',
            hors.length === 0, hors.length + ' notes hors do2-re4');
        w.endSession();
    }
}

// ------------------------------------------------------------------
section('2. Le contenu arrive jusqu\'a la partition');

function stacks(tl) {
    const byTick = new Map();
    for (const e of tl) {
        if (!byTick.has(e.tick)) byTick.set(e.tick, []);
        byTick.get(e.tick).push(e.midi);
    }
    return [...byTick.values()].map(v => v.sort((a, b) => a - b));
}

{
    const w = boot();
    const S = item(w, 'rh', 'fifths', 2);
    const st = stacks(S().tl);
    check('quintes : chaque instant porte deux notes',
        st.every(v => v.length === 2), st.map(v => v.length).join(''));
    check('quintes : et l\'ecart vaut bien une quinte',
        st.every(v => v[1] - v[0] === 7), [...new Set(st.map(v => v[1] - v[0]))].join(','));
    w.endSession();
}

{
    const w = boot();
    const S = item(w, 'rh', 'fifths7', 2);
    const st = stacks(S().tl);
    const ecarts = [...new Set(st.map(v => v[1] - v[0]))].sort((a, b) => a - b);
    check('quintes et septiemes : deux notes par instant',
        st.every(v => v.length === 2));
    check('quintes et septiemes : uniquement des quintes et des septiemes',
        ecarts.every(x => x === 7 || x === 10 || x === 11), ecarts.join(','));
    check('les deux intervalles sont presents',
        ecarts.includes(7) && ecarts.some(x => x === 10 || x === 11), ecarts.join(','));
    w.endSession();
}

{
    const w = boot();
    const S = item(w, 'rh', 'chords', 4);
    const st = stacks(S().tl);
    check('accords : trois ou quatre sons par instant',
        st.every(v => v.length === 3 || v.length === 4),
        [...new Set(st.map(v => v.length))].join(','));
    check('accords : aucun ne depasse l\'octave sous la main',
        st.every(v => v[v.length - 1] - v[0] <= 12),
        Math.max(...st.map(v => v[v.length - 1] - v[0])));
    w.endSession();
}

{
    // main gauche ET accords : l'empilement descend, et tout reste en bas
    const w = boot();
    const S = item(w, 'lh', 'chords', 3);
    const tl = S().tl;
    check('main gauche en accords : tout est a la main gauche',
        tl.every(e => e.hand === 'L'));
    const hors = tl.filter(e => e.midi < 36 || e.midi > 62);
    check('main gauche en accords : tout tient sur la portee de fa',
        hors.length === 0, hors.length + ' notes hors do2-re4');
    w.endSession();
}

// ------------------------------------------------------------------
section('3. La page dit ce qu\'elle joue, et s\'en souvient');

{
    const w = boot();
    const S = item(w, 'rh', 'fifths7', 1);
    const cap = w.document.getElementById('scoreCap').textContent;
    check('la legende annonce le niveau', /niveau 1|level 1/.test(cap), cap);
    check('la legende annonce la variante', cap.split('·').length >= 6, cap);
    // On verifie le CABLAGE, pas la longueur du texte : cliquer un bouton
    // doit changer l'explication affichee. Mesurer des caracteres passait
    // en francais par hasard et tombait en anglais.
    const hint = () => w.document.getElementById('varHint').textContent || '';
    const clic = (seg, val, attr) => {
        const b = w.document.querySelector('#' + seg + ' button[data-' + attr + '="' + val + '"]');
        b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    };
    clic('handsSeg', 'both', 'h'); clic('contentSeg', 'melody', 'c');
    const base = hint();
    clic('contentSeg', 'fifths7', 'c');
    const apres = hint();
    check('choisir un contenu change l explication', base !== apres && apres.length > 0,
        base + '  ->  ' + apres);
    clic('handsSeg', 'lh', 'h');
    check('choisir une main la change aussi', hint() !== apres, hint());
    check('le reglage clique est bien celui retenu',
        w.eval('S.hands') === 'lh' && w.eval('S.content') === 'fifths7',
        w.eval('S.hands') + '/' + w.eval('S.content'));
    w.endSession();

    w.eval("S.hands = 'lh'; S.content = 'chords';");
    w.saveSettings();
    w.eval("S.hands = 'both'; S.content = 'melody';");
    w.restoreSettings();
    check('les reglages survivent au rechargement',
        w.eval('S.hands') === 'lh' && w.eval('S.content') === 'chords',
        w.eval('S.hands') + '/' + w.eval('S.content'));
    check('les boutons correspondants sont actifs',
        w.document.querySelector('#handsSeg button.active').dataset.h === 'lh'
        && w.document.querySelector('#contentSeg button.active').dataset.c === 'chords');
    check('sans variante, la legende reste sobre',
        (() => {
            w.eval("S.hands = 'both'; S.content = 'melody';");
            const S2 = item(w, 'both', 'melody', 3);
            const c = w.document.getElementById('scoreCap').textContent;
            w.endSession();
            return c.split('·').length === 5;
        })());
}

// ------------------------------------------------------------------
section('4. Une lecture en variante se mesure comme les autres');

{
    const w = boot();
    const S = item(w, 'rh', 'fifths7', 2);
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0;
    for (const e of tl) {
        w.__T.now = t0 + e.ms;
        w.onMIDIMessage({ data: [0x90, e.midi, 80], timeStamp: w.__T.now });
    }
    let q = 0;
    while (S().phase === 'read' && q++ < 200) { w.__T.now += 200; w.tick(); }
    const a = S().items[S().items.length - 1].a;
    check('une lecture parfaite en quintes et septiemes reste parfaite',
        a.accuracy > 99 && a.wrong === 0 && a.stops === 0,
        a.accuracy.toFixed(0) + ' %, ' + a.wrong + ' en trop, ' + a.stops + ' arrets');
    check('les notes simultanees ne comptent pas comme des fautes',
        a.matched === tl.length, a.matched + '/' + tl.length);
    check('l\'ecart au temps reste nul sur un jeu exact', a.offMs < 1,
        a.offMs.toFixed(1) + ' ms');
    w.endSession();
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
