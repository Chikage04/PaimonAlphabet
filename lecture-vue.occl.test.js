/* Les trois facons de forcer le regard a avancer.

   L'invariant qui compte le plus est negatif : AUCUN mode ne doit jamais
   masquer une mesure a VENIR. Restreindre la vue vers l'avant est la
   seule de ces manipulations qui ait ete testee, et elle fait retrecir
   l'empan oeil-main (Truitt et coll. 1997, Gilman & Underwood 2003). */
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
let __s = 31337;
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

function opacities(w) {
    const out = {};
    for (const g of w.document.getElementById('score').querySelectorAll('.sr-bar'))
        out[+g.getAttribute('data-bar')] = +(g.getAttribute('opacity') || 1);
    return out;
}

function start(w, mode, level) {
    const S = () => w.eval('S');
    w.eval('S.manual = true; S.calibrating = false; S.level = ' + level
        + "; S.occl = '" + mode + "';");
    w.startSession();
    w.eval('S.manual = true; S.calibrating = false; S.level = ' + level
        + "; S.occl = '" + mode + "';");
    w.startItem();
    return S;
}

// ------------------------------------------------------------------
section('1. Rien de ce qui est A VENIR n\'est jamais masque');

for (const mode of ['none', 'fade', 'erase']) {
    const w = boot();
    const S = start(w, mode, 3);
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const midi = (t, p) => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: t });
    const tl = S().tl, t0 = S().gridT0;

    let futurCache = 0, courantCache = 0, n = 0;
    for (let i = 0; i < tl.length; i++) {
        w.__T.now = t0 + tl[i].ms;
        midi(w.__T.now, tl[i].midi);
        const op = opacities(w);
        const cur = tl[i].bar;
        for (const b in op) {
            n++;
            if (+b > cur && op[b] < 1) futurCache++;
            if (+b === cur && mode !== 'erase' && op[b] < 1) courantCache++;
        }
    }
    check(mode + ' : aucune mesure a venir n\'est masquee', futurCache === 0, futurCache);
    if (mode !== 'erase')
        check(mode + ' : la mesure en cours reste visible', courantCache === 0, courantCache);
    w.endSession();
}

// ------------------------------------------------------------------
section('2. Chaque mode masque ce qu\'il annonce, et rien d\'autre');

{
    // tout visible
    const w = boot();
    const S = start(w, 'none', 3);
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0;
    for (let i = 0; i < Math.min(tl.length, 12); i++) {
        w.__T.now = t0 + tl[i].ms;
        w.onMIDIMessage({ data: [0x90, tl[i].midi, 80], timeStamp: w.__T.now });
    }
    const op = opacities(w);
    check('tout visible : rien n\'est jamais masque',
        Object.values(op).every(v => v === 1), JSON.stringify(op));
    w.endSession();
}

for (const mode of ['fade', 'erase']) {
    const w = boot();
    const S = start(w, mode, 3);
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0;
    const midi = (t, p) => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: t });

    // on joue la premiere note de la piece
    w.__T.now = t0 + tl[0].ms;
    midi(w.__T.now, tl[0].midi);
    const apres1 = opacities(w);
    check(mode + ' : apres la premiere note, la mesure 0 est '
        + (mode === 'erase' ? 'effacee' : 'encore la'),
        mode === 'erase' ? apres1[0] === 0 : apres1[0] === 1,
        'opacite ' + apres1[0]);

    // puis on va jusqu'a la premiere note de la mesure 1
    let k = 1;
    while (k < tl.length && tl[k].bar === 0) {
        w.__T.now = t0 + tl[k].ms; midi(w.__T.now, tl[k].midi); k++;
    }
    if (k < tl.length) {
        w.__T.now = t0 + tl[k].ms; midi(w.__T.now, tl[k].midi);
        const apres2 = opacities(w);
        check(mode + ' : une fois la mesure suivante entamee, la mesure 0 est masquee',
            apres2[0] < 1, 'opacite ' + apres2[0]);
        check(mode + ' : la mesure 1 n\'est pas masquee avant d\'etre finie',
            mode === 'erase' ? apres2[1] === 0 : apres2[1] === 1, 'opacite ' + apres2[1]);
    }
    w.endSession();
}

// ------------------------------------------------------------------
section('3. Mode flash : une mesure a la fois, rejouee de memoire');

{
    const w = boot();
    const S = start(w, 'flash', 2);
    check('le flash saute la pre-lecture', S().phase === 'flashShow', S().phase);

    const op = opacities(w);
    const visibles = Object.keys(op).filter(b => op[b] === 1);
    check('une seule mesure est visible', visibles.length === 1, visibles.join(','));
    check('c\'est la premiere', +visibles[0] === 0, visibles[0]);

    // apres le temps d'affichage, elle disparait
    w.__T.now += 2600; w.tick();
    check('elle disparait ensuite', S().phase === 'flashPlay', S().phase);
    check('plus rien n\'est visible', Object.values(opacities(w)).every(v => v === 0));

    // on la rejoue juste
    const midi = p => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: w.__T.now += 200 });
    const bar0 = S().tl.filter(e => e.bar === 0);
    for (const e of bar0) midi(e.midi);
    check('rejouer la mesure fait passer a la suivante',
        S().phase === 'flashShow' && S().flashBar === 1,
        S().phase + ', mesure ' + S().flashBar);
    check('la mesure 0 est comptee exacte',
        S().flashRes[0].exact, JSON.stringify(S().flashRes[0]));

    // la suivante, ratee
    w.__T.now += 2600; w.tick();
    const bar1 = S().tl.filter(e => e.bar === 1);
    for (const e of bar1) midi(e.midi + 1);
    check('une mesure fausse n\'est pas comptee exacte',
        S().flashRes[1] && !S().flashRes[1].exact, JSON.stringify(S().flashRes[1]));

    // on va au bout
    let guard = 0;
    while (S().phase !== 'verdict' && guard++ < 400) {
        if (S().phase === 'flashShow') { w.__T.now += 2600; w.tick(); }
        else if (S().phase === 'flashPlay') {
            for (const e of S().tl.filter(x => x.bar === S().flashBar)) midi(e.midi);
        } else { w.__T.now += 250; w.tick(); }
    }
    check('la piece flash se termine', S().phase === 'verdict', S().phase);
    const it = S().items[S().items.length - 1];
    check('elle est enregistree comme un flash', !!it.flash);
    check('le bilan compte les mesures exactes',
        it.a.flash.exact === S().piece.bars - 1,
        it.a.flash.exact + ' exactes sur ' + it.a.flash.bars);
    check('aucun temps n\'est mesure en flash',
        it.a.stops === 0 && it.a.offMs === 0 && it.a.hesitation === null);
    check('le bilan affiche bien un tableau par mesure',
        w.document.getElementById('vTable').querySelectorAll('tr').length === S().piece.bars + 1,
        w.document.getElementById('vTable').querySelectorAll('tr').length);

    // le flash ne doit pas faire bouger le niveau : ce n'est pas la meme epreuve
    const avant = S().level;
    w.adaptLevel({ cleanRun: true });
    w.adaptLevel({ cleanRun: true });
    check('le flash ne fait pas monter le niveau', S().level === avant,
        avant + ' -> ' + S().level);
    w.endSession();
}

// ------------------------------------------------------------------
section('4. Le reglage tient le rechargement');

{
    const w = boot();
    w.eval("S.occl = 'erase';");
    w.saveSettings();
    w.eval("S.occl = 'none';");
    w.restoreSettings();
    check('le mode de masquage est retrouve', w.eval('S.occl') === 'erase', w.eval('S.occl'));
    check('le bouton correspondant est actif',
        w.document.querySelector('#occlSeg button.active').dataset.oc === 'erase');
    check('la page explique le mode choisi',
        (w.document.getElementById('occlHint').textContent || '').length > 20);
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
