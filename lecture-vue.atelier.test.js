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

// Un ecart qui n'est aucune realisation de l'ecart ecrit : c'est cela,
// une fausse reponse. Ajouter un demi-ton n'en est pas une — une tierce
// vaut trois ou quatre demi-tons selon la note de depart.
function faux(w, forme, degs) {
    const sortie = forme.slice();
    const possibles = w.ecartsPossibles(degs[degs.length - 1]);
    let v = forme[forme.length - 1];
    while (possibles.indexOf(v) >= 0) v++;
    sortie[sortie.length - 1] = v;
    return sortie;
}

// Repondre a un item, qu'il soit plaque ou en suite. `juste` a faux
// fabrique une reponse qui n'est AUCUNE realisation de ce qui est ecrit.
function repondre(w, it, juste, base) {
    const midi = p => w.onMIDIMessage({
        data: [0x90, p, 80], timeStamp: w.__T.now
    });
    const sh = it.shape, b = base === undefined ? 60 : base;
    if (!it.suite) {
        // un accord : tous les sons ensemble, du grave vers l'aigu
        const der = sh.length - 1;
        const poss = w.ecartsPossibles(it.degs[der]);
        let v = sh[der];
        if (!juste) while (poss.indexOf(v) >= 0) v++;
        for (let i = 0; i < sh.length; i++) {
            midi(b + (i === der ? v : sh[i]));
            w.__T.now += 6;
        }
    } else {
        let d = b;
        midi(d);
        for (let i = 0; i < sh.length; i++) {
            w.__T.now += 150;
            let p = sh[i];
            if (!juste && i === 0) {
                const poss = w.ecartsPossibles(Math.abs(it.degs[0]));
                while (poss.indexOf(Math.abs(p)) >= 0) p += (p < 0 ? -1 : 1);
            }
            d += p; midi(d);
        }
    }
    w.__T.now += 500; w.tick();
}

// Epingle le barreau : certains tests ont besoin d'une forme fixe.
function epingle(w, niv) { w.eval('D.niv = ' + niv + '; D.serie = 0; D.rates = 0;'); }

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

for (const kind of ['intervals', 'octaves', 'shape', 'walls']) {
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

    // Un ecart faux, c'est un ecart d'une autre taille SUR LA PORTEE. Un
    // demi-ton de plus ne suffit pas a le dire : une tierce vaut trois ou
    // quatre demi-tons selon la note de depart, et l'atelier invite a
    // partir d'ou l'on veut — c'est tout l'objet de l'exercice.
    epingle(w, 1);
    repondre(w, D().expect, false);
    check('un ecart d\'une autre taille est refuse', D().ok === 0);

    // ... et toutes les realisations diatoniques du bon ecart passent
    let passees = 0;
    for (let essai = 0; essai < 6; essai++) {
        suivant(); epingle(w, 1);
        const ok = w.ecartsPossibles(D().expect.degs[1]);
        jouer([0, ok[essai % ok.length]], 64);
        passees++;
    }
    check('toutes les realisations du bon ecart passent',
        D().ok === passees, D().ok + ' sur ' + passees);

    let avant = D().ok;
    suivant(); epingle(w, 1);
    const att2 = D().expect.shape.slice();
    jouer([0, att2[1], att2[1] + 3], 64);          // une note de trop
    check('une note en trop est refusee', D().ok === avant);

    avant = D().ok;
    suivant(); epingle(w, 1);
    jouer([0], 64);                                  // une note de moins
    check('une note manquante est refusee', D().ok === avant);
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('3. Aucun tempo, aucune pression');

{
    const w = boot();
    const { D, $, jouer } = outils(w);
    w.startDrill('intervals');
    epingle(w, 1);
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
        repondre(w, D().expect, vus % 3 !== 0, 62);
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
section('7. Les exercices couvrent bien ce qu\'ils annoncent');

{
    const w = boot();
    const { D, suivant, jouer } = outils(w);
    // les intervalles doivent couvrir les DEUX classes de sa regle :
    // ligne a ligne donne les impairs, ligne a interligne les pairs
    // L'echelle : le premier barreau tire petit et plaque, le dernier
    // tire grand et en suite. On regarde ce que chacun produit vraiment.
    const parNiv = {};
    for (const niv of [1, 4, 8]) {
        const notes = new Set(), ecarts = new Set();
        for (let essai = 0; essai < 25; essai++) {
            w.startDrill('intervals');
            epingle(w, niv);
            w.eval('D.expect = drillItem("intervals")');
            const it = D().expect;
            notes.add(it.shape.length + (it.suite ? 1 : 0));
            for (const p of it.pas) ecarts.add(Math.abs(p));
            w.eval('D.item = 99'); w.endDrill();
        }
        parNiv[niv] = { notes: [...notes], ecarts: [...ecarts].sort((a, b) => a - b) };
    }
    check('le premier barreau reste sur deux notes plaquées',
        parNiv[1].notes.every(x => x === 2), parNiv[1].notes.join(', '));
    check('le premier barreau ne dépasse pas la quarte',
        Math.max(...parNiv[1].ecarts) <= 3, parNiv[1].ecarts.join(', '));
    check('le quatrième barreau donne des suites',
        parNiv[4].notes.every(x => x >= 3), parNiv[4].notes.join(', '));
    check('le dernier barreau est plus long et plus large',
        Math.max(...parNiv[8].notes) > Math.max(...parNiv[4].notes)
        && Math.max(...parNiv[8].ecarts) > Math.max(...parNiv[4].ecarts),
        parNiv[8].notes.join('/') + ' notes, écarts ' + parNiv[8].ecarts.join(','));

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

// ------------------------------------------------------------------
section('8. La serie sans fin');

{
    const w = boot();
    const { D, $, jouer, suivant } = outils(w);
    w.startDrill('endless');

    const tires = new Set();
    let vus = 0, justes = 0;
    for (let k = 0; k < 40; k++) {
        vus++;
        tires.add(w.eval('D.sous'));
        // deux fois sur trois on repond juste, pour verifier le decompte
        repondre(w, D().expect, k % 3 !== 2, 60);
        if (k % 3 !== 2) justes++;
        suivant();
    }
    check('quarante items et la serie tourne toujours', D().on, 'item ' + D().item);
    check('elle tire bien les quatre exercices', tires.size === 4,
        [...tires].join(', '));
    check('le decompte des justes suit', D().ok === justes,
        D().ok + ' pour ' + justes);
    check('une pastille par item', $('drillChips').children.length === vus,
        $('drillChips').children.length + ' pour ' + vus);

    // et elle s'arrete quand ON l'arrete, sur le total joue
    w.endDrill();
    check('l\'arret conclut la serie', !D().on);
    check('le bilan compte ce qui a ete joue, pas un total prevu',
        $('drillInfo').textContent.indexOf(String(vus)) >= 0
        && $('drillInfo').textContent.indexOf('Infinity') < 0,
        $('drillInfo').textContent.slice(0, 70));
    check('la partition est rangee', $('paper').classList.contains('hidden'));
}

// ------------------------------------------------------------------
section('9. Le mur d\'accords, dans l\'atelier');

{
    const w = boot();
    const { D, $, jouer } = outils(w);
    let deuxMains = 0, gros = 0;
    for (let k = 0; k < 20; k++) {
        w.startDrill('walls');
        const p = D().expect.piece, m = p.measures[0];
        // les deux portees portent des notes, au MEME instant
        if (m.rh.length && m.lh.length
            && m.rh.every(n => n.on === 0) && m.lh.every(n => n.on === 0)) deuxMains++;
        if (D().expect.shape.length >= 4) gros++;
        w.eval('D.item = 99'); w.endDrill();
    }
    check('un item de mur occupe les deux portees', deuxMains === 20, deuxMains + ' / 20');
    check('et c\'est bien un gros accord', gros === 20, gros + ' / 20');

    // le jugement reste celui de l'atelier : la forme, pas la hauteur
    w.startDrill('walls');
    const att = D().expect.shape.slice();
    jouer(att, 55);
    check('un mur transpose compte juste', D().ok === 1,
        'forme de ' + att.length + ' sons jouee ailleurs');
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('10. L\'exercice d\'intervalles, en profondeur');

{
    const w = boot();
    const { D, $, jouer, suivant } = outils(w);
    w.startDrill('intervals');
    const total = w.eval('DRILLS.intervals.total');

    // Douze lectures pour cinq ecarts ne font pas une moyenne : deux par
    // ecart, et une hesitation suffit a tout fausser.
    check('la serie est assez longue pour une moyenne', total >= 25, total + ' items');

    // On epingle le deuxieme barreau : paires, les cinq ecarts, deux
    // cles — ce qu'il faut pour juger le releve lui-meme.
    const ecarts = new Set(), clefs = new Set();
    let vus = 0, justes = 0;
    while (D().on && vus < total + 2) {
        vus++;
        epingle(w, 2);
        w.eval('D.expect = drillItem("intervals")');
        w.showFragment(D().expect.piece);
        const it = w.eval('D.expect');
        ecarts.add(it.deg);
        clefs.add(!!it.grave);
        // on met du temps sur les grands ecarts, pour voir si le releve le voit
        w.__T.now += it.deg >= 4 ? 1500 : 300;
        const rate = it.deg === 5 && vus % 2 === 0;
        repondre(w, it, !rate, 62);
        if (!rate) justes++;
        suivant();
    }

    check('la serie va bien jusqu\'au bout', vus === total, vus + ' pour ' + total);
    check('la seconde fait partie du tirage', ecarts.has(1),
        [...ecarts].sort().join(', '));
    check('les écarts vont jusqu\'à la sixte', ecarts.has(5),
        [...ecarts].sort().join(', '));
    check('les deux clés sont lues', clefs.size === 2,
        [...clefs].join(', '));

    // --- le releve
    const t = $('drillTable');
    check('un relevé par écart est affiché', !t.hidden && t.rows.length >= 3,
        t.rows.length + ' lignes');
    const lignes = [...t.rows].slice(1).map(r => [...r.cells].map(c => c.textContent));
    check('chaque ligne porte le nombre lu, la justesse et un temps',
        lignes.every(l => l.length === 5 && /\d/.test(l[2]) && /%/.test(l[3])),
        JSON.stringify(lignes[0]));

    // Le tableau est trie par ecart croissant : on retrouve donc le degre
    // de chaque ligne dans l'etat, sans rien chercher dans le texte — ces
    // verifications tombaient sinon sur la page anglaise.
    const releve = w.eval('D.releve');
    const degs = Object.keys(releve).map(k => releve[k].deg).sort((a, b) => a - b);
    check('le tableau a une ligne par écart relevé', lignes.length === degs.length,
        lignes.length + ' lignes pour ' + degs.length + ' écarts');

    // Sa regle pair/impair : les ecarts de meme parite portent la meme
    // mention, et les deux parites ne portent pas la meme.
    const pairs = new Set(), impairs = new Set();
    degs.forEach((d, i) => (d % 2 === 0 ? pairs : impairs).add(lignes[i][1]));
    check('les écarts de même nature portent la même mention',
        pairs.size <= 1 && impairs.size <= 1,
        [...pairs].join('/') + ' contre ' + [...impairs].join('/'));
    check('ligne → ligne et ligne → interligne sont distingués',
        pairs.size === 1 && impairs.size === 1 && [...pairs][0] !== [...impairs][0],
        [...pairs][0] + ' / ' + [...impairs][0]);

    // Le temps de reconnaissance distingue ce qui a ete lent. Les grands
    // ecarts (quinte, sixte : degres 4 et 5) ont ete joues lentement.
    const temps = {};
    degs.forEach((d, i) => { temps[d] = parseFloat(lignes[i][4]); });
    const lent = degs.filter(d => d >= 4).map(d => temps[d]);
    const vite = degs.filter(d => d < 4).map(d => temps[d]);
    check('le relevé distingue les écarts lents des rapides',
        lent.length && vite.length && Math.min(...lent) > Math.max(...vite),
        'lents ' + lent.join('/') + ' contre rapides ' + vite.join('/'));

    // et la justesse par ecart suit ce qui a ete joue : seul le degre 5
    // a ete rate, une fois sur deux
    const rang = degs.indexOf(5);
    check('l\'écart raté ressort dans sa colonne de justesse',
        rang >= 0 && parseInt(lignes[rang][3], 10) < 100,
        rang >= 0 ? lignes[rang][3] : 'écart absent du relevé');
    check('et les autres écarts restent à 100 %',
        degs.every((d, i) => d === 5 || parseInt(lignes[i][3], 10) === 100),
        lignes.map(l => l[3]).join(' '));
}

// ------------------------------------------------------------------
section('11. L\'echelle monte et redescend toute seule');

{
    const w = boot();
    const { D, $ } = outils(w);
    const suivant = () => { w.__T.now += 1800; w.tick(); };
    try { w.localStorage.setItem('lecture.atelier.niveau', '1'); } catch (e) { }

    w.startDrill('intervalsInf');
    check('la série sans fin démarre au premier barreau', D().niv === 1, D().niv);

    const suite = [];
    for (let k = 0; k < 24; k++) {
        suite.push({ niv: D().niv, n: D().expect.shape.length + (D().expect.suite ? 1 : 0) });
        repondre(w, D().expect, k < 15);        // quinze justes, puis on rate
        suivant();
    }

    // trois bonnes reponses d'affilee font monter : au quinzieme item on
    // doit avoir gravi cinq barreaux
    check('trois bonnes réponses d\'affilée font monter d\'un barreau',
        suite[3].niv === 2 && suite[6].niv === 3 && suite[9].niv === 4,
        suite.slice(0, 12).map(x => x.niv).join(' '));
    check('et deux fautes d\'affilée font redescendre',
        D().niv < suite[14].niv, suite[14].niv + ' puis ' + D().niv);
    check('le plus haut barreau atteint est retenu',
        D().hautNiv >= suite[14].niv, D().hautNiv);

    // les barreaux hauts servent des suites, les bas des paires
    check('les premiers barreaux sont des paires',
        suite.slice(0, 6).every(x => x.n === 2),
        suite.slice(0, 6).map(x => x.n).join(' '));
    check('les barreaux suivants sont des suites de notes',
        suite.filter(x => x.niv >= 3).every(x => x.n >= 3),
        suite.filter(x => x.niv >= 3).map(x => x.n).join(' '));

    // la serie sans fin ne s'arrete pas d'elle-meme
    check('la série sans fin tourne toujours', D().on, 'item ' + D().item);
    const atteint = D().niv;
    w.endDrill();

    // ... et le niveau est repris au lancement suivant
    const w2 = boot();
    w2.localStorage.setItem('lecture.atelier.niveau', String(atteint));
    w2.startDrill('intervals');
    check('le niveau atteint est repris à la fois suivante',
        w2.eval('D.niv') === atteint, w2.eval('D.niv') + ' pour ' + atteint);
    w2.eval('D.item = 99'); w2.endDrill();
}

// ------------------------------------------------------------------
section('12. Une suite se lit dans l\'ordre, et le sens compte');

{
    const w = boot();
    const { D } = outils(w);
    const midi = p => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: w.__T.now });

    // un barreau a suites, avec mouvement descendant possible
    w.startDrill('intervalsInf');
    epingle(w, 5);
    w.eval('D.expect = drillItem("intervals")');
    const it = D().expect;
    check('le barreau sert bien une suite', !!it.suite,
        it.shape.length + 1 + ' notes');

    // jouee a l'endroit : juste
    repondre(w, it, true, 60);
    check('la suite jouée dans l\'ordre est juste', D().ok === 1);

    // la meme suite a l'envers : les ecarts y sont, le sens non
    w.__T.now += 1800; w.tick();
    epingle(w, 5);
    w.eval('D.expect = drillItem("intervals")');
    const it2 = D().expect;
    const sh = it2.shape;
    let d = 60; midi(d);
    for (let i = sh.length - 1; i >= 0; i--) { w.__T.now += 150; d += sh[i]; midi(d); }
    w.__T.now += 500; w.tick();
    const memeOrdre = sh.every((v, i) => v === sh[sh.length - 1 - i]);
    check('la suite jouée à l\'envers est refusée',
        memeOrdre || D().ok === 1, 'écarts ' + sh.join(','));
    w.eval('D.item = 99'); w.endDrill();
}

// ------------------------------------------------------------------
section('13. Un fragment est gravé comme un extrait');

{
    const w = boot();
    const { D, $ } = outils(w);
    w.startDrill('intervalsInf');

    for (let niv = 1; niv <= 8; niv++) {
        epingle(w, niv);
        const it = w.eval('drillItem("intervals")');
        const p = it.piece;
        const ns = p.measures[0].rh.length ? p.measures[0].rh : p.measures[0].lh;
        w.showFragment(p);

        // Mesure avant correction : au barreau 7 la cinquieme note tombait
        // au top 192 d'une mesure de 192, donc apres la barre.
        check('niveau ' + niv + ' : rien ne déborde de la mesure',
            ns.every(n => n.on + n.dur <= p.barTicks),
            ns.map(n => n.on + '+' + n.dur).join(' ') + ' pour ' + p.barTicks);

        const svg = $('score');
        const large = parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
        check('niveau ' + niv + ' : la zone dessinée tient dans l\'extrait',
            large <= 520, large + ' px');

        // ... et les notes d'une suite sont régulièrement espacées.
        // Avant : 284 px entre deux têtes pour trois notes, soit dix-huit
        // fois la largeur d'une tête.
        const xs = [...svg.querySelectorAll('.sr-head')].map(h => {
            const m = /translate\(([-\d.]+)/.exec(h.getAttribute('transform') || '');
            return m ? Math.round(+m[1]) : null;
        }).filter(x => x !== null);
        const uniq = [...new Set(xs)].sort((a, b) => a - b);
        if (uniq.length > 2) {
            const gaps = uniq.slice(1).map((v, i) => v - uniq[i]);
            check('niveau ' + niv + ' : les notes sont régulièrement espacées',
                Math.max(...gaps) - Math.min(...gaps) <= 2, gaps.join(','));
            check('niveau ' + niv + ' : et l\'espacement reste celui d\'une gravure',
                Math.max(...gaps) <= 80, Math.max(...gaps) + ' px entre deux têtes');
        }
    }
    w.eval('D.item = 99'); w.endDrill();
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
