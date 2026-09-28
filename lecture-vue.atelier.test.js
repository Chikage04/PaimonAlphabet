/* L'atelier de reconnaissance, methode Richard Yang.

   Ses regles sont l'INVERSE de celles de la seance : aucun tempo, aucun
   arret compte, et seule la justesse decide. Ce qui est juge est la
   FORME — l'ecart, pas la hauteur — parce que son principe est qu'on ne
   nomme pas les notes : on reconnait un ecartement de main. */
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
let __s = 24680;
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

function outils(w) {
    const D = () => w.eval('D');
    const $ = i => w.document.getElementById(i);
    const midi = (p, v) => w.onMIDIMessage({
        data: [0x90, p, v === undefined ? 80 : v], timeStamp: w.__T.now
    });
    // joue une forme a partir d'une base donnee, puis laisse juger
    const jouer = (forme, base) => {
        for (const off of forme) { midi((base === undefined ? 64 : base) + off); w.__T.now += 6; }
        w.__T.now += 600; w.tick();
    };
    const suivant = () => { w.__T.now += 2200; w.tick(); };
    return { D, $, midi, jouer, suivant };
}

// ------------------------------------------------------------------
section('1. Ce qui est juge est la FORME, pas la hauteur');

for (const kind of ['intervals', 'octaves', 'shape']) {
    const w = boot();
    const { D, $, jouer } = outils(w);
    w.startDrill(kind);
    const att = D().expect.shape.slice();

    // la meme forme, cinq demi-tons plus haut : c'est son principe meme
    jouer(att, 69);
    check(kind + ' : une forme transposee compte juste', D().ok === 1,
        'forme [' + att.join(',') + '] jouee depuis une autre note');
    check(kind + ' : le fragment se colorie',
        [...$('paper').querySelectorAll('.sr-head')]
            .every(h => h.getAttribute('fill') === '#1e56d6'));
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('2. Une forme fausse ne passe pas');

{
    const w = boot();
    const { D, jouer, suivant } = outils(w);
    w.startDrill('intervals');
    const att = D().expect.shape.slice();

    // un demi-ton de trop : ce n'est plus le meme ecart
    jouer([0, att[1] + 1], 64);
    check('un ecart faux d\'un demi-ton est refuse', D().ok === 0);

    suivant();
    const att2 = D().expect.shape.slice();
    jouer([0, att2[1], att2[1] + 3], 64);          // une note de trop
    check('une note en trop est refusee', D().ok === 0);

    suivant();
    jouer([0], 64);                                  // une note de moins
    check('une note manquante est refusee', D().ok === 0);
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('3. Aucun tempo, aucune pression');

{
    const w = boot();
    const { D, $, jouer } = outils(w);
    w.startDrill('intervals');
    const att = D().expect.shape.slice();

    // trente secondes de reflexion : rien ne doit se passer
    for (let k = 0; k < 300; k++) { w.__T.now += 100; w.tick(); }
    check('trente secondes de reflexion ne font rien echouer',
        D().on && D().item === 1 && D().ok === 0, 'item ' + D().item);
    check('aucun metronome n\'a demarre', w.eval('metro.timer') === null);

    jouer(att, 60);
    check('et la reponse tardive compte quand meme', D().ok === 1);
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('4. Une serie complete, et son bilan');

{
    const w = boot();
    const { D, $, jouer, suivant } = outils(w);
    w.startDrill('intervals');
    const total = w.eval('DRILLS.intervals.total');
    let vus = 0;
    while (D().on && vus < total + 2) {
        vus++;
        const att = D().expect.shape.slice();
        // une fois sur trois on se trompe, pour verifier le decompte
        jouer(vus % 3 === 0 ? [0, att[1] + 1] : att, 62);
        suivant();
    }
    check('la serie compte le nombre d\'items annonce', vus === total,
        vus + ' items pour ' + total + ' annonces');
    check('elle se termine d\'elle-meme', !D().on);
    check('le decompte des justes est exact',
        D().ok === total - Math.floor(total / 3),
        D().ok + ' justes sur ' + total);
    check('le bilan est affiche', /\d+\D{1,6}\d+/.test($('drillInfo').textContent),
        $('drillInfo').textContent.slice(0, 60));
    check('une pastille par item', $('drillChips').children.length === total,
        $('drillChips').children.length);
    check('la partition est rangee a la fin', $('paper').classList.contains('hidden'));
}

// ------------------------------------------------------------------
section('5. L\'atelier et la seance ne se marchent pas dessus');

{
    const w = boot();
    const { D, $ } = outils(w);
    w.startSession();
    check('une seance tourne', w.eval('S.running'));
    w.startDrill('intervals');
    check('lancer un atelier arrete la seance', !w.eval('S.running'));
    check('le bouton de seance est desactive pendant l\'atelier',
        $('startBtn').disabled);
    check('le bouton d\'arret de l\'atelier est actif', !$('drillStop').disabled);
    w.eval('D.item = 99'); w.endDrill();
    check('a la fin, la seance redevient lancable', !$('startBtn').disabled);
    check('et aucune piece n\'a ete comptee comme lue',
        w.eval('S.items').length === 0, w.eval('S.items').length);
}

// ------------------------------------------------------------------
section('6. Les filtres d\'entree valent aussi dans l\'atelier');

{
    const w = boot();
    const { D, midi, jouer } = outils(w);
    w.startDrill('intervals');
    const att = D().expect.shape.slice();
    midi(64, 2);                       // un effleurement a 2 % de force
    w.__T.now += 10;
    check('une touche effleuree n\'est pas comptee', D().buf.length === 0,
        D().buf.length + ' notes retenues');
    jouer(att, 64);
    check('et la vraie frappe passe normalement', D().ok === 1);
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('7. Les trois exercices couvrent bien ce qu\'ils annoncent');

{
    const w = boot();
    const { D, suivant, jouer } = outils(w);
    // les intervalles doivent couvrir les DEUX classes de sa regle :
    // ligne a ligne donne les impairs, ligne a interligne les pairs
    const vus = new Set();
    for (let essai = 0; essai < 40; essai++) {
        w.startDrill('intervals');
        vus.add(D().expect.shape[1]);
        w.eval('D.item = 99'); w.endDrill();
    }
    const demis = [...vus].sort((a, b) => a - b);
    check('les intervalles tirent des tierces ET des quartes/sixtes',
        demis.some(x => x === 3 || x === 4) && demis.some(x => x === 5)
        && demis.some(x => x === 8 || x === 9),
        demis.join(', ') + ' demi-tons');

    const gros = new Set();
    for (let essai = 0; essai < 40; essai++) {
        w.startDrill('octaves');
        gros.add(D().expect.shape[1]);
        w.eval('D.item = 99'); w.endDrill();
    }
    check('les octaves tirent bien de grands ecarts',
        Math.min(...gros) >= 10 && Math.max(...gros) >= 16,
        [...gros].sort((a, b) => a - b).join(', ') + ' demi-tons');

    let notes = [];
    for (let essai = 0; essai < 25; essai++) {
        w.startDrill('shape');
        notes.push(D().expect.shape.length);
        const span = D().expect.shape[D().expect.shape.length - 1];
        if (span > 12) check('une mesure repliee tient sous une main', false, span);
        w.eval('D.item = 99'); w.endDrill();
    }
    check('la mesure repliee fait deux a cinq notes',
        Math.min(...notes) >= 2 && Math.max(...notes) <= 5,
        Math.min(...notes) + ' a ' + Math.max(...notes));
    check('et elle tient toujours sous une main', true);
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
