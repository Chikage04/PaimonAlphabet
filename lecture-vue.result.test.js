/* La partition coloriee a la fin d'une lecture.

   Un pourcentage dit COMBIEN on a rate ; il ne dit pas OU. Trois notes
   perdues au meme endroit signalent un passage a preparer, trois notes
   perdues au hasard signalent autre chose. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');

const DIR = 'C:/Users/Lucas/PaimonAlphabet/';
const PAGE = process.argv[2] || 'lecture-vue.html';
const OK = '#1e56d6', MISS = '#cf2222', ENCRE = '#111';

function boot() {
    let html = fs.readFileSync(DIR + PAGE, 'utf8');
    for (const f of ['sightread-glyphs.js', 'sightread-gen.js', 'sightread-render.js'])
        html = html.replace('<script src="' + f + '"></script>',
            '<script>' + fs.readFileSync(DIR + f, 'utf8') + '</script>');
    const PRE = `<script>
window.__T = { now: 1000 };
performance.now = () => window.__T.now;
let __s = 13579;
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

function lire(level, saute) {
    const w = boot();
    const S = () => w.eval('S');
    const $ = i => w.document.getElementById(i);
    const set = "S.manual=true;S.calibrating=false;S.level=" + level
        + ";S.view='all';S.occl='none';";
    w.eval(set); w.startSession(); w.eval(set); w.startItem();
    let g = 0;
    while (S().phase !== 'read' && g++ < 4000) { w.__T.now += 250; w.tick(); }
    const tl = S().tl, t0 = S().gridT0;
    let joue = 0;
    for (let i = 0; i < tl.length; i++) {
        if (saute(i)) continue;
        w.__T.now = t0 + tl[i].ms;
        w.onMIDIMessage({ data: [0x90, tl[i].midi, 80], timeStamp: w.__T.now });
        joue++;
    }
    let q = 0;
    while (S().phase === 'read' && q++ < 400) { w.__T.now += 200; w.tick(); }
    const heads = [...$('paper').querySelectorAll('.sr-head')];
    const compte = c => heads.filter(h => h.getAttribute('fill') === c).length;
    return {
        w, S, $, tl, joue, heads,
        bleu: compte(OK), rouge: compte(MISS), encre: compte(ENCRE),
        a: S().items[S().items.length - 1].a
    };
}

// ------------------------------------------------------------------
section('1. Chaque note ecrite recoit une couleur');

{
    const r = lire(1, i => i % 4 === 2);
    check('une tete par note attendue', r.heads.length === r.tl.length,
        r.heads.length + ' tetes pour ' + r.tl.length + ' notes');
    check('aucune tete ne reste en noir', r.encre === 0, r.encre + ' en noir');
    check('les bleues sont les notes trouvees', r.bleu === r.a.matched,
        r.bleu + ' bleues, ' + r.a.matched + ' trouvees');
    check('les rouges sont les notes manquees',
        r.rouge === r.tl.length - r.a.matched,
        r.rouge + ' rouges, ' + (r.tl.length - r.a.matched) + ' manquees');
    check('bleues et rouges couvrent toute la piece',
        r.bleu + r.rouge === r.tl.length, r.bleu + ' + ' + r.rouge);
    r.w.endSession();
}

// ------------------------------------------------------------------
section('2. Les deux extremes');

{
    const r = lire(1, () => false);
    check('lecture parfaite : tout est bleu', r.rouge === 0 && r.bleu === r.tl.length,
        r.bleu + ' bleues, ' + r.rouge + ' rouges');
    r.w.endSession();
}
{
    const r = lire(1, () => true);
    check('rien joue : tout est rouge', r.bleu === 0 && r.rouge === r.tl.length,
        r.bleu + ' bleues, ' + r.rouge + ' rouges');
    r.w.endSession();
}

// ------------------------------------------------------------------
section('3. La partition reste sous les yeux, avec sa legende');

{
    const r = lire(3, i => i % 5 === 1);
    check('la partition est visible apres la lecture',
        !r.$('paper').classList.contains('hidden'));
    check('toutes les lignes sont la',
        r.$('paper').querySelectorAll('svg').length === r.w.eval('systems.length'),
        r.$('paper').querySelectorAll('svg').length);
    check('aucun repere de pre-lecture ne subsiste',
        r.$('paper').querySelectorAll('.sr-hot').length === 0);
    const leg = r.$('sysnav');
    check('une legende explique les couleurs', !leg.hidden && leg.textContent.length > 5,
        leg.textContent);
    check('elle montre les deux couleurs',
        leg.innerHTML.indexOf(OK) >= 0 && leg.innerHTML.indexOf(MISS) >= 0);
    r.w.endSession();
}

// ------------------------------------------------------------------
section('4. La piece suivante repart d une partition neuve');

{
    const r = lire(1, i => i % 3 === 0);
    check('la lecture precedente a bien colorie', r.rouge > 0, r.rouge);
    // on enchaine
    let g = 0;
    while (r.S().phase !== 'preread' && g++ < 4000) { r.w.__T.now += 250; r.w.tick(); }
    const heads = [...r.$('paper').querySelectorAll('.sr-head')];
    const restes = heads.filter(h => h.getAttribute('fill') !== ENCRE).length;
    check('la piece suivante n herite d aucune couleur', restes === 0,
        restes + ' tetes encore coloriees');
    check('et ses difficultes sont a nouveau entourees',
        r.$('paper').querySelectorAll('.sr-hot').length
        === r.w.SightGen.hotspots(r.S().piece).length);
    r.w.endSession();
}

// ------------------------------------------------------------------
section('5. Chaque note est designee sans ambiguite');

{
    // le triplet mesure/position/hauteur doit viser UNE seule tete,
    // sinon on colorierait la mauvaise
    const r = lire(7, i => i % 6 === 0);
    let doubles = 0;
    for (const e of r.tl) {
        const sel = '.sr-head[data-bar="' + e.bar + '"][data-on="' + e.on
            + '"][data-midi="' + e.midi + '"]';
        if (r.$('paper').querySelectorAll(sel).length !== 1) doubles++;
    }
    check('chaque note attendue vise exactement une tete', doubles === 0,
        doubles + ' ambiguites sur ' + r.tl.length);
    r.w.endSession();
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
