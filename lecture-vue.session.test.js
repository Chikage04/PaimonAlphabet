/* Simule des SEANCES ENTIERES de lecture a vue, horloge truquee.
   Le selftest embarque verifie les mesures ; celui-ci verifie la boucle :
   enchainement des phases, tourne des pages, adaptation du niveau, fin de
   seance, et surtout qu'aucune piece n'est resservie. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');

const DIR = 'C:/Users/Lucas/PaimonAlphabet/';
const PAGE = process.argv[2] || 'lecture-vue.html';
let html = fs.readFileSync(DIR + PAGE, 'utf8');
for (const f of ['sightread-glyphs.js', 'sightread-gen.js', 'sightread-render.js'])
    html = html.replace('<script src="' + f + '"></script>',
        '<script>' + fs.readFileSync(DIR + f, 'utf8') + '</script>');

// L'horloge et l'audio doivent etre truques AVANT que le script de la
// page ne s'execute. Comme la page est en mode strict, un eval tardif ne
// publierait pas ses fonctions : on injecte donc un prelude dans le HTML.
const PRELUDE = `<script>
window.__T = { now: 1000 };
// Alea reproductible : un banc qui tire des pieces au hasard donnerait des
// verdicts differents a chaque execution, et un test instable ne vaut rien.
let __s = 123456789;
Math.random = () => {
    __s = (__s * 1103515245 + 12345) & 0x7fffffff;
    return __s / 0x7fffffff;
};
performance.now = () => window.__T.now;
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
Object.defineProperty(globalThis, 'CLOCK', {
    get: () => w.__T.now,
    set: v => { w.__T.now = v; }
});

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) pass++; else { fail++; console.log('  ECHEC  ' + n + (d ? '  [' + d + ']' : '')); } };
const section = t => console.log('\n' + t);

const S = () => w.eval('S');
const $ = id => w.document.getElementById(id);

function midi(t, pitch) {
    w.onMIDIMessage({ data: [0x90, pitch, 80], timeStamp: t });
}

// Joue la piece courante selon un profil donne, puis rend la main.
// mode : 'parfait' | 'lent' | 'hache' | 'faux' | 'abandon'
function playCurrent(mode) {
    const st = S();
    const tl = st.tl, t0 = st.gridT0 || CLOCK;
    if (mode === 'abandon') {                 // on ne joue rien du tout
        CLOCK = t0 + w.SightGen.durationMs(st.piece, st.piece.bpm) * 3 + 16000;
        w.tick();
        let g0 = 0;
        while (S().phase === 'read' && g0++ < 200) { CLOCK += 500; w.tick(); }
        return;
    }
    const k = mode === 'lent' ? 1.7 : 1;
    let extra = 0;
    for (let i = 0; i < tl.length; i++) {
        if (mode === 'hache' && i > 0 && i % 4 === 0) extra += 2600;
        const t = t0 + tl[i].ms * k + extra;
        CLOCK = t;
        // une note fausse de temps en temps, sans jamais s'arreter
        const pitch = (mode === 'faux' && i % 5 === 2) ? tl[i].midi + 1 : tl[i].midi;
        midi(t, pitch);
    }
    // On ne coupe pas quelqu'un qui joue encore : la lecture se termine
    // apres un silence, il faut donc le laisser passer.
    let quiet = 0;
    while (S().phase === 'read' && quiet++ < 200) { CLOCK += 200; w.tick(); }
}

// Avance jusqu'a ce que la phase demandee soit atteinte (ou echoue).
function until(phase, budgetMs) {
    let guard = 0;
    while (S().phase !== phase && guard++ < 4000) {
        CLOCK += 250;
        w.tick();
    }
    return S().phase === phase;
}

// ------------------------------------------------------------------
section('1. Une seance complete s\'enchaine toute seule');

{
    w.localStorage.clear();
    w.restoreSettings();
    CLOCK = 1000;
    w.startSession();

    const seen = new Set(), levels = [], phases = [];
    let items = 0, guard = 0;
    while (S().running && guard++ < 60) {
        if (!until('preread', 0)) break;
        phases.push('preread');
        const p = S().piece;
        seen.add(p.sig);
        levels.push(p.level);
        items++;
        if (!until('read', 0)) break;
        phases.push('read');
        playCurrent('parfait');
        if (S().phase !== 'verdict' && S().running) break;
    }

    check('la seance enchaine au moins 9 pieces', items >= 9, items + ' pieces');
    check('aucune piece n\'est resservie dans la seance', seen.size === items,
        seen.size + ' distinctes sur ' + items);
    check('la seance s\'arrete d\'elle-meme', !S().running);
    check('le temps restant est bien epuise',
        $('cTime').textContent === '0:00', $('cTime').textContent);
    check('le bilan de seance s\'affiche', !$('report').hidden);
    // une derniere piece peut etre commencee sans etre terminee quand le
    // quart d'heure s'epuise : le bilan liste les lectures ACHEVEES
    const faites = S().items.length;
    check('le bilan liste toutes les lectures achevees',
        ($('rTable').querySelectorAll('tr').length - 2) === faites,
        ($('rTable').querySelectorAll('tr').length - 2) + ' lignes pour ' + faites + ' achevees');
    check('presque toutes les pieces commencees sont achevees',
        faites >= items - 1, faites + ' achevees sur ' + items + ' commencees');
    check('des lectures parfaites font monter le niveau',
        Math.max(...levels) > Math.min(...levels),
        'niveaux ' + Math.min(...levels) + ' a ' + Math.max(...levels));
    check('le niveau ne depasse jamais 8', Math.max(...levels) <= 8, Math.max(...levels));
}

// ------------------------------------------------------------------
section('2. Le piano est muet pendant la pre-lecture');

{
    w.localStorage.clear();
    CLOCK = 1000;
    w.startSession();
    until('preread', 0);
    const before = S().played.length;
    for (let i = 0; i < 10; i++) midi(CLOCK + i * 40, 60 + i);
    check('les notes jouees pendant la pre-lecture sont ignorees',
        S().played.length === before, S().played.length + ' notes enregistrees');

    check('la partition est affichee des la pre-lecture',
        !$('paper').classList.contains('hidden'));
    check('les difficultes sont entourees pendant la pre-lecture',
        $('score').querySelectorAll('.sr-hot').length
        === w.SightGen.hotspots(S().piece).filter(h => h.bar < 4).length);

    until('read', 0);
    check('les reperes sont effaces au moment de lire',
        $('score').querySelectorAll('.sr-hot').length === 0);
    // avant l'entree : compte a part, pas melange a la lecture
    midi(CLOCK, S().tl[0].midi);
    check('une note frappee pendant le decompte ne compte pas comme jouee',
        S().played.length === 0, S().played.length);
    check('elle est comptee a part', S().early === 1, S().early);
    // une fois l'entree passee, tout compte
    CLOCK = S().gridT0 + 10;
    w.tick();
    midi(CLOCK, S().tl[0].midi);
    check('les notes comptent une fois l\'entree passee', S().played.length === 1,
        S().played.length);
    w.endSession();
}

// ------------------------------------------------------------------
section('3. Une lecture hachee fait redescendre, une propre fait monter');

{
    w.localStorage.clear();
    CLOCK = 1000;
    w.eval('S.manual = false; S.calibrating = false; S.level = 5;');
    w.startSession();
    w.eval('S.calibrating = false; S.level = 5;');

    const lv = [];
    for (let i = 0; i < 4 && S().running; i++) {
        if (!until('preread', 0)) break;
        lv.push(S().piece.level);
        if (!until('read', 0)) break;
        playCurrent('hache');
    }
    check('quatre lectures hachees font baisser le niveau',
        lv[lv.length - 1] < lv[0], 'de ' + lv[0] + ' a ' + lv[lv.length - 1]);
    w.endSession();

    w.localStorage.clear();
    CLOCK = 1000;
    w.startSession();
    w.eval('S.calibrating = false; S.level = 3;');
    const lv2 = [];
    for (let i = 0; i < 5 && S().running; i++) {
        if (!until('preread', 0)) break;
        lv2.push(S().piece.level);
        if (!until('read', 0)) break;
        playCurrent('parfait');
    }
    check('cinq lectures propres font monter le niveau',
        lv2[lv2.length - 1] > lv2[0], 'de ' + lv2[0] + ' a ' + lv2[lv2.length - 1]);
    w.endSession();
}

// ------------------------------------------------------------------
section('4. Jouer lentement n\'est pas une faute, s\'arreter en est une');

{
    w.localStorage.clear();
    CLOCK = 1000;
    w.startSession();
    w.eval('S.calibrating = false; S.level = 4;');
    until('preread', 0); until('read', 0);
    playCurrent('lent');
    let a = S().items[S().items.length - 1].a;
    check('une lecture lente mais reguliere ne compte aucun arret', a.stops === 0, a.stops);
    check('elle est reconnue comme un passage propre',
        S().items[S().items.length - 1].clean);

    until('preread', 0); until('read', 0);
    playCurrent('hache');
    a = S().items[S().items.length - 1].a;
    check('une lecture hachee compte des arrets', a.stops > 2, a.stops + ' arrets');
    check('elle n\'est pas un passage propre', !S().items[S().items.length - 1].clean);

    until('preread', 0); until('read', 0);
    playCurrent('faux');
    a = S().items[S().items.length - 1].a;
    check('des fausses notes sans arret sont comptees comme fausses',
        a.wrong > 0 && a.stops === 0, a.wrong + ' fausses, ' + a.stops + ' arrets');
    w.endSession();
}

// ------------------------------------------------------------------
section('5. Une lecture abandonnee ne bloque pas la seance');

{
    w.localStorage.clear();
    CLOCK = 1000;
    w.startSession();
    until('preread', 0);
    const first = S().piece.sig;
    until('read', 0);
    playCurrent('abandon');
    check('la lecture s\'interrompt d\'elle-meme apres un abandon',
        S().phase === 'verdict', S().phase);
    check('elle est comptee comme non menee au bout',
        S().items[S().items.length - 1].a.covered < 50,
        S().items[S().items.length - 1].a.covered.toFixed(0) + ' %');
    until('preread', 0);
    check('la piece suivante arrive quand meme', S().piece.sig !== first);
    w.endSession();
}

// ------------------------------------------------------------------
section('6. Les pieces lues restent brulees d\'une seance a l\'autre');

{
    w.localStorage.clear();
    const all = new Set();
    for (let s = 0; s < 3; s++) {
        CLOCK = 1000;
        w.startSession();
        w.eval('S.calibrating = false; S.level = 2;');
        for (let i = 0; i < 5 && S().running; i++) {
            if (!until('preread', 0)) break;
            const sig = S().piece.sig;
            check('piece jamais vue (seance ' + (s + 1) + ', piece ' + (i + 1) + ')', !all.has(sig), sig);
            all.add(sig);
            if (!until('read', 0)) break;
            playCurrent('parfait');
        }
        w.endSession();
    }
    const seen = JSON.parse(w.localStorage.getItem('lecture.seen') || '{}');
    const total = Object.values(seen).reduce((s, a) => s + a.length, 0);
    check('le registre des pieces lues persiste', total >= 12, total + ' pieces enregistrees');
    check('l\'historique des seances persiste',
        JSON.parse(w.localStorage.getItem('lecture.history') || '[]').length === 3);
}

// ------------------------------------------------------------------
section('7. La page tourne au bon moment');

{
    w.localStorage.clear();
    CLOCK = 1000;
    w.startSession();
    // le niveau doit etre pose AVANT que la piece ne soit tiree : la
    // changer en cours d'item ne toucherait que la piece suivante
    w.eval('S.manual = true; S.calibrating = false; S.level = 7;');
    w.startItem();                                   // 12 mesures : 3 systemes
    until('read', 0);
    const nSys = w.eval('systems.length');
    check('la piece tiree est bien au niveau 7', S().piece.level === 7, S().piece.level);
    check('une piece de 12 mesures tient sur 3 lignes', nSys === 3, nSys);
    const st = S(), tl = st.tl, t0 = st.gridT0;
    let turned = [];
    for (let i = 0; i < tl.length; i++) {
        CLOCK = t0 + tl[i].ms;
        midi(CLOCK, tl[i].midi);
        turned.push(w.eval('S.sys'));
    }
    check('la lecture commence sur la premiere ligne', turned[0] === 0);
    check('la derniere ligne est atteinte', turned[turned.length - 1] === nSys - 1,
        'ligne ' + (turned[turned.length - 1] + 1));
    check('les pages ne tournent que vers l\'avant',
        turned.every((v, i) => i === 0 || v >= turned[i - 1]));
    w.endSession();
}

// ------------------------------------------------------------------
section('8. Le premier temps n\'arrive pas par surprise');

{
    w.localStorage.clear();
    CLOCK = 1000;
    w.startSession();
    until('read', 0);

    const st = S(), bpm = st.piece.bpm, beat = 60000 / bpm;
    const bpb = st.piece.compound ? st.piece.ts.num / 3 : st.piece.ts.num;
    const t0 = st.gridT0;

    check('l\'entree est annoncee a l\'avance', t0 > CLOCK, Math.round(t0 - CLOCK) + ' ms');
    check('le decompte dure bien deux mesures',
        Math.abs((t0 - CLOCK) - 2 * bpb * beat) < 3 * beat,
        Math.round((t0 - CLOCK) / beat) + ' temps');

    const seen = [], said = [];
    for (let k = 2 * bpb; k >= 1; k--) {
        CLOCK = t0 - k * beat + 5;
        w.tick();
        seen.push($('phaseCd').textContent);
        said.push($('phaseText').textContent);
    }
    check('un chiffre s\'affiche a chaque temps du decompte',
        seen.every(v => /^[0-9]+$/.test(v)), seen.join(' '));
    check('il compte avec la mesure, en repartant a 1 sur chaque temps fort',
        seen.join(' ') === Array.from({ length: 2 * bpb },
            (_, i) => (i % bpb) + 1).join(' '), seen.join(' '));
    // On verifie le COMPORTEMENT, pas le vocabulaire : la consigne doit
    // changer entre la premiere mesure de decompte et la derniere.
    // Chercher des mots rendrait l'assertion fausse dans l'autre langue.
    check('la consigne devient plus pressante sur la derniere mesure',
        said[0] !== said[said.length - 1],
        said[0] + '  ->  ' + said[said.length - 1]);

    // au moment exact de l'entree, la consigne de lecture prend la place
    CLOCK = t0 + 5;
    w.tick();
    check('a l\'entree, la consigne devient celle de la lecture',
        $('phase').className.indexOf('read') >= 0, $('phase').className);
    check('le decompte disparait', $('phaseCd').textContent === '', '[' + $('phaseCd').textContent + ']');

    // Taper le decompte pour sentir le pulse est un reflexe de musicien.
    // Ces notes-la ne font pas partie de la lecture : melangees a elle,
    // elles comptaient comme notes en trop et tiraient la grille de temps.
    CLOCK = t0 - beat;
    const before = S().played.length, earlyBefore = S().early;
    for (let i = 0; i < 4; i++) midi(CLOCK - i * beat, st.tl[0].midi);
    check('taper le decompte ne pollue pas la lecture',
        S().played.length === before, S().played.length - before + ' notes retenues');
    check('ces notes sont comptees a part, pas perdues',
        S().early === earlyBefore + 4, S().early - earlyBefore);
    w.endSession();
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
