/* Banc de test de la gravure.
   On ne peut pas verifier "c'est joli" par assertion. On peut verifier
   que rien ne manque, que rien n'est en trop, et que l'espacement porte
   bien l'information de duree — sans quoi la page enseignerait un rythme
   faux, ce qui serait pire que de ne rien afficher. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const G = require('C:/Users/Lucas/PaimonAlphabet/sightread-gen.js');

const dom = new JSDOM('<!doctype html><html><body><svg id="s"></svg></body></html>');
global.document = dom.window.document;
global.window = dom.window;
const R = require('C:/Users/Lucas/PaimonAlphabet/sightread-render.js');

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) pass++; else { fail++; console.log('  ECHEC  ' + n + (d ? '  [' + d + ']' : '')); } };
const section = t => console.log('\n' + t);

const svg = document.getElementById('s');
const q = sel => svg.querySelectorAll(sel);
// Les symboles sont desormais des chemins issus de Bravura, portant une
// classe stable. Il n'y a plus ni ellipse ni caractere Unicode a compter.
const GLY = require('C:/Users/Lucas/PaimonAlphabet/sightread-glyphs.js');
const many = sel => svg.querySelectorAll(sel).length;
const dOf = sel => Array.from(svg.querySelectorAll(sel)).map(e => e.getAttribute('d'));

function noteCount(p) {
    let n = 0;
    for (const m of p.measures) {
        n += m.rh.filter(x => !x.rest).length;
        n += m.lh.filter(x => !x.rest).length;
    }
    return n;
}
function restCount(p) {
    let n = 0;
    for (const m of p.measures) {
        n += m.rh.filter(x => x.rest).length;
        n += m.lh.filter(x => x.rest).length;
    }
    return n;
}

// ------------------------------------------------------------------
section('1. Rien ne manque, rien n\'est en trop (tous niveaux)');

for (const lvl of G.LEVELS) {
    let badHeads = 0, badPos = 0, badOrder = 0, badBox = 0, n = 0;
    for (let i = 0; i < 40; i++) {
        const p = G.generate(lvl.n, 31000 + i * 9973);
        const pos = R.draw(svg, p, { width: 900 });
        n++;

        // une tete par note reelle
        const heads = many('.sr-head');
        if (heads !== noteCount(p)) badHeads++;

        // chaque note reelle a une position connue de la page
        if (pos.length !== noteCount(p)) badPos++;

        // les abscisses suivent le temps, sans jamais reculer
        const flat = [];
        for (let m = 0; m < p.bars; m++)
            for (const e of pos.filter(e => e.bar === m))
                flat.push({ k: m * p.barTicks + e.on, x: e.x });
        flat.sort((a, b) => a.k - b.k);
        for (let k = 1; k < flat.length; k++)
            if (flat[k].k > flat[k - 1].k && flat[k].x <= flat[k - 1].x) { badOrder++; break; }

        // le cadre englobe tout ce qui est dessine
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        for (const e of pos)
            if (e.y < vb[1] || e.y > vb[1] + vb[3]) { badBox++; break; }
    }
    const L = 'niveau ' + lvl.n;
    check(L + ' : une tete de note par note', badHeads === 0, badHeads + '/' + n);
    check(L + ' : chaque note a une position', badPos === 0, badPos + '/' + n);
    check(L + ' : les abscisses suivent le temps', badOrder === 0, badOrder + '/' + n);
    check(L + ' : le cadre englobe toutes les notes', badBox === 0, badBox + '/' + n);
}

// ------------------------------------------------------------------
section('2. L espacement porte la duree');

{
    // Dans UNE mesure : plus la note est longue, plus la place qui la
    // suit est grande. C'est la propriete relative qui compte ; en
    // absolu, les mesures sont justifiees sur la largeur du systeme.
    const p = G.generate(3, 1);
    const mk = (on, dur) => ({ d: 28, step: 0, oct: 4, alter: 0, midi: 60, on, dur, rest: false });
    p.measures = [{ rh: [mk(0, 96), mk(96, 48), mk(144, 24), mk(168, 24)], lh: [] }];
    p.bars = 1; p.barTicks = 192; p.sharps = 0; p.ts = { num: 4, den: 4 };
    const pos = R.draw(svg, p, { width: 900 }).sort((a, b) => a.on - b.on);
    const g = [pos[1].x - pos[0].x, pos[2].x - pos[1].x, pos[3].x - pos[2].x];
    check('la blanche recoit plus de place que la noire', g[0] > g[1],
        g.map(v => v.toFixed(0)).join(' > '));
    check('la noire recoit plus de place que la croche', g[1] > g[2],
        g.map(v => v.toFixed(0)).join(' > '));

    // Entre DEUX mesures : celle qui contient seize doubles croches doit
    // etre plus large que celle qui ne contient qu'une ronde.
    const q2 = G.generate(3, 2);
    q2.measures = [
        { rh: [mk(0, 192)], lh: [] },
        { rh: Array.from({ length: 16 }, (_, i) => mk(i * 12, 12)), lh: [] }
    ];
    q2.bars = 2; q2.barTicks = 192; q2.sharps = 0; q2.ts = { num: 4, den: 4 };
    R.draw(svg, q2, { width: 900 });
    const bl = Array.from(svg.querySelectorAll('line')).filter(l =>
        +l.getAttribute('y1') === 40 && +l.getAttribute('y2') === 206)
        .map(l => +l.getAttribute('x1')).sort((a, b) => a - b);
    // bl = [bord gauche, barre entre les deux mesures, double barre...]
    const w1 = bl[1] - bl[0], w2 = bl[bl.length - 1] - bl[1];
    check('la mesure de doubles croches est plus large que celle de la ronde',
        w2 > w1 * 1.5, w1.toFixed(0) + ' px contre ' + w2.toFixed(0) + ' px');
}

// ------------------------------------------------------------------
section('3. Armature et alterations');

{
    // do majeur : aucune alteration a la cle, aucune alteration du tout
    const p = G.generate(3, 777);
    R.draw(svg, p, { width: 900 });
    check('do majeur : aucune alteration a la cle', many('.sr-key') === 0, many('.sr-key'));
    check('les deux cles sont gravees', many('.sr-clef') === 2, many('.sr-clef'));
    check('le chiffrage est grave sur les deux portees', many('.sr-ts') === 4, many('.sr-ts'));

    // une piece a deux bemols : deux bemols par portee, donc quatre
    let two = null;
    for (let i = 0; i < 400 && !two; i++) {
        const c = G.generate(6, 5000 + i);
        if (c.sharps === -2) two = c;
    }
    check('une piece a 2 bemols existe au niveau 6', !!two);
    if (two) {
        R.draw(svg, two, { width: 900 });
        const flats = many('.sr-key');
        check('2 bemols graves sur chacune des deux portees', flats === 4, flats + ' bemols');
    }

    // mineur harmonique : la sensible haussee doit etre gravee
    let min = null;
    for (let i = 0; i < 400 && !min; i++) {
        const c = G.generate(7, 9000 + i);
        if (c.minor) min = c;
    }
    check('une piece en mineur existe au niveau 7', !!min);
    if (min) {
        R.draw(svg, min, { width: 900 });
        const marks = many('.sr-acc');
        const accNotes = min.measures.reduce((s, m) =>
            s + m.rh.filter(n => n.acc).length + m.lh.filter(n => n.acc).length, 0);
        check('le mineur harmonique produit des alterations a lire', accNotes > 0, accNotes);
        check('ces alterations sont bien gravees', marks > 0, marks + ' symboles');
    }
}

{
    // la meme note alteree deux fois dans la mesure ne reprend pas le signe
    const p = G.generate(1, 5);
    p.measures = [{
        rh: [
            { d: 28, step: 0, oct: 4, alter: 1, midi: 61, on: 0, dur: 48, rest: false, acc: true },
            { d: 28, step: 0, oct: 4, alter: 1, midi: 61, on: 48, dur: 48, rest: false, acc: true },
            { d: 28, step: 0, oct: 4, alter: 1, midi: 61, on: 96, dur: 48, rest: false, acc: true },
            { d: 28, step: 0, oct: 4, alter: 0, midi: 60, on: 144, dur: 48, rest: false, acc: false }
        ], lh: []
    }];
    p.bars = 1; p.barTicks = 192; p.sharps = 0; p.ts = { num: 4, den: 4 };
    R.draw(svg, p, { width: 900 });
    const accs = dOf('.sr-acc');
    const nSharp = accs.filter(d => d === GLY.accidentalSharp.d).length;
    const nNat = accs.filter(d => d === GLY.accidentalNatural.d).length;
    check('un diese repete dans la mesure n est grave qu une fois', nSharp === 1, nSharp);
    check('le retour a la note naturelle porte un becarre', nNat === 1, nNat);
}

// ------------------------------------------------------------------
section('4. Silences, ligatures, lignes supplementaires');

{
    let anyRest = null;
    for (let i = 0; i < 300 && !anyRest; i++) {
        const c = G.generate(4, 4000 + i);
        if (restCount(c) > 0) anyRest = c;
    }
    check('les niveaux avec silences en produisent', !!anyRest);
    if (anyRest) {
        R.draw(svg, anyRest, { width: 900 });
        check('les silences sont dessines', many('.sr-rest') > 0, many('.sr-rest') + ' silences');
    }

    // ligatures : des croches dans un meme temps doivent etre barrees
    const p = G.generate(3, 11);
    p.measures = [{
        rh: [0, 24, 48, 72, 96, 120, 144, 168].map(on =>
            ({ d: 28 + (on / 24) % 5, step: (on / 24) % 5, oct: 4, alter: 0, midi: 60, on, dur: 24, rest: false })),
        lh: []
    }];
    p.bars = 1; p.barTicks = 192; p.ts = { num: 4, den: 4 };
    R.draw(svg, p, { width: 900 });
    // une ligature est un rectangle plein, une par temps
    const nbeams = q('rect').length;
    check('huit croches donnent quatre ligatures (une par temps)', nbeams === 4, nbeams + ' barres');
    check('aucun crochet isole quand les croches sont ligaturees',
        many('.sr-flag') === 0, many('.sr-flag'));
}

{
    // lignes supplementaires : une note tres aigue en fait apparaitre
    const p = G.generate(1, 3);
    p.measures = [{
        rh: [{ d: 42, step: 0, oct: 6, alter: 0, midi: 84, on: 0, dur: 192, rest: false }], lh: []
    }];
    p.bars = 1; p.barTicks = 192; p.sharps = 0; p.ts = { num: 4, den: 4 };
    R.draw(svg, p, { width: 900 });
    const LW = 0.16 * R.GAP;                 // epaisseur SMuFL d'une ligne suppl.
    const led = Array.from(q('line')).filter(l =>
        Math.abs(+l.getAttribute('x2') - +l.getAttribute('x1')) < 40
        && Math.abs(+l.getAttribute('stroke-width') - LW) < 0.01).length;
    check('un do6 fait apparaitre des lignes supplementaires', led >= 3, led + ' lignes');
}

// ------------------------------------------------------------------
section('5. Pre-lecture : montrer puis effacer');

{
    const p = G.generate(7, 4242);
    R.draw(svg, p, { width: 900, showHotspots: true });
    const before = q('.sr-hot').length;
    const hs = G.hotspots(p).length;
    check('la pre-lecture signale les endroits difficiles', before > 0, before + ' halos');
    const removed = R.clearHotspots(svg);
    check('elle les efface tous ensuite', q('.sr-hot').length === 0, removed + ' retires');

    R.draw(svg, p, { width: 900 });
    check('sans pre-lecture, aucun halo n est dessine', q('.sr-hot').length === 0);
}

// ------------------------------------------------------------------
section('6. Decoupe en systemes');

{
    const p = G.generate(7, 1);
    const sys = R.systems(p, 4);
    check('12 mesures donnent 3 systemes de 4', sys.length === 3, sys.length);
    check('les systemes couvrent toute la piece, sans trou ni recouvrement',
        sys[0].from === 0 && sys[2].to === p.bars
        && sys[0].to === sys[1].from && sys[1].to === sys[2].from);
    const pos = R.draw(svg, p, { fromBar: 4, toBar: 8, width: 900 });
    check('on peut graver un seul systeme', pos.every(e => e.bar >= 4 && e.bar < 8));
}

// ------------------------------------------------------------------
// Une page a regarder : les assertions ne disent pas si c'est lisible.
{
    const parts = [];
    for (const lvl of G.LEVELS) {
        const p = G.generate(lvl.n, 20260917 + lvl.n * 1000);
        parts.push('<h2>Niveau ' + lvl.n + ' &mdash; ' + p.levelLabel + '</h2>'
            + '<p>' + p.keyName + ', ' + p.ts.num + '/' + p.ts.den + ', ' + p.bars
            + ' mesures, noire = ' + p.bpm + '</p>');
        for (const s of R.systems(p, 4)) {
            R.draw(svg, p, { fromBar: s.from, toBar: s.to, width: 900, showTimeSig: s.from === 0 });
            parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'
                + svg.getAttribute('viewBox') + '" width="900">' + svg.innerHTML + '</svg>');
        }
    }
    fs.writeFileSync('C:/tmp/domtest/apercu-gravure.html',
        '<!doctype html><meta charset="utf-8"><title>Gravure</title>'
        + '<style>body{font-family:system-ui;background:#fff;color:#111;max-width:960px;margin:24px auto}'
        + 'svg{display:block;margin:6px 0 22px;border:1px solid #eee}h2{margin:28px 0 2px;font-size:17px}'
        + 'p{margin:0 0 8px;color:#666;font-size:13px}</style>' + parts.join('\n'));
    console.log('\napercu ecrit : C:/tmp/domtest/apercu-gravure.html');
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
