/* Lit tous les essais de travail du journal et en sort ce qu'un essai
   seul ne peut pas dire.

     node outils/bilan-travail.js

   Un essai isole ne distingue pas un accident d'un defaut : la 4e note du
   groupe peut trainer une fois par hasard. Sur quinze essais, si elle
   traine toujours, c'est un doigt — et c'est la qu'il faut travailler.
*/
'use strict';
const fs = require('fs');
const JOURNAL = process.env.ESSAIS_LOG || 'C:/tmp/essais.jsonl';
const SUITE = require('path').resolve(__dirname, 'suite-main-droite.json');

const NOMS = ['do', 'do#', 're', 'mib', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'sib', 'si'];
const nom = m => NOMS[m % 12] + (Math.floor(m / 12) - 1);
const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;
const r0 = x => Math.round(x);

const ev = [];
for (const l of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (l.trim()) { try { ev.push(JSON.parse(l)); } catch (e) { } }
}
const bilans = ev.filter(e => e.type === 'travailBilan');
if (!bilans.length) {
    console.log('aucun essai de travail dans ' + JOURNAL);
    process.exit(0);
}
const suite = JSON.parse(fs.readFileSync(SUITE, 'utf8')).notes;

// Realigner ici : les essais ecrits par une version qui appariait dans
// l'ordre strict portent un compte faux, et un oubli y decalait tout.
function aligne(joue, cible) {
    const n = joue.length, m = cible.length, W = m + 1;
    const cout = new Int32Array((n + 1) * W), dir = new Uint8Array((n + 1) * W);
    for (let j = 1; j <= m; j++) { cout[j] = j * 2; dir[j] = 3; }
    for (let i = 1; i <= n; i++) { cout[i * W] = i * 2; dir[i * W] = 2; }
    for (let i = 1; i <= n; i++) {
        const p = joue[i - 1], li = i * W, pre = (i - 1) * W;
        for (let j = 1; j <= m; j++) {
            let best = cout[pre + j - 1] + (p === cible[j - 1] ? 0 : 3), d = 1;
            if (cout[pre + j] + 2 < best) { best = cout[pre + j] + 2; d = 2; }
            if (cout[li + j - 1] + 2 < best) { best = cout[li + j - 1] + 2; d = 3; }
            cout[li + j] = best; dir[li + j] = d;
        }
    }
    let i = n, j = m, justes = 0, oublis = 0, enTrop = 0, fausses = 0, atteint = 0;
    while (i > 0 || j > 0) {
        const d = (i > 0 && j > 0) ? dir[i * W + j] : (i > 0 ? 2 : 3);
        if (d === 1) {
            if (joue[i - 1] === cible[j - 1]) { justes++; atteint = Math.max(atteint, j); }
            else fausses++;
            i--; j--;
        } else if (d === 2) { enTrop++; i--; }
        else { oublis++; j--; }
    }
    return { justes, oublis, enTrop, fausses, atteint };
}

// --------------------------------------------------------------- essais
// la cible de chaque essai, pour pouvoir realigner
const cibleDe = b => b.partie === 'A' ? suite
    : b.partie === 'B' ? suite.map(m => m + 12)
        : suite.concat(suite.map(m => m + 12));
for (const b of bilans) {
    b.al = b.midis ? aligne(b.midis, cibleDe(b).slice(0, b.attendues)) : null;
}

console.log(bilans.length + ' essais\n');
console.log('  #   exercice        tempo   justes  oubl  trop  faux   irreg   pire trou');
for (const b of bilans.slice(-15)) {
    const a = b.al;
    console.log('  ' + String(b.no || '?').padStart(2)
        + '   ' + (b.ex + (b.cell ? ' ' + b.cell : '') + ' · ' + b.partie).padEnd(16)
        + ' ♩' + String(b.bpm).padEnd(5)
        + ' ' + ((a ? a.justes : b.justes) + '/' + b.attendues).padStart(7)
        + ' ' + String(a ? a.oublis : '-').padStart(5)
        + ' ' + String(a ? a.enTrop : '-').padStart(5)
        + ' ' + String(a ? a.fausses : '-').padStart(5)
        + ' ' + (b.irregularite + ' %').padStart(7)
        + ' ' + (b.pireEcart + ' ms').padStart(10));
}

// ------------------------------------------------------- le plafond reel
const reussis = bilans.filter(b => b.reussi);
const parTempo = {};
for (const b of bilans) {
    const k = b.bpm + (b.div === 8 ? '/32' : '/16');
    (parTempo[k] = parTempo[k] || []).push(b);
}
console.log('\nPAR TEMPO');
for (const k of Object.keys(parTempo).sort((a, b) => parseInt(a) - parseInt(b))) {
    const l = parTempo[k];
    console.log('  ♩' + k.padEnd(8) + l.length + ' essai(s)'
        + ' | irregularite mediane ' + r0(med(l.map(x => x.irregularite))) + ' %'
        + ' | reussis ' + l.filter(x => x.reussi).length + '/' + l.length);
}
if (reussis.length)
    console.log('  plafond propre : ♩' + Math.max(...reussis.map(b => b.bpm)));

// -------------------------------- la position qui traine, TOUS essais confondus
const parPos = {};
for (const b of bilans) {
    if (!b.ecarts || b.ecarts.length < 9) continue;
    for (let i = 1; i < b.ecarts.length; i++) {
        const ioi = b.ecarts[i] - b.ecarts[i - 1];   // ecart relatif a la grille
        const pos = (i % 8) + 1;
        (parPos[pos] = parPos[pos] || []).push(ioi);
    }
}
// Centre sur la moyenne : jouer plus lentement que la grille decale
// TOUTES les positions vers le haut, et le classement ne voudrait plus
// rien dire. Ce qu'on cherche, c'est l'ecart d'une position AUX AUTRES.
const brut = Object.keys(parPos).map(p => ({
    pos: +p, dev: moy(parPos[p]), n: parPos[p].length
}));
const centre = moy(brut.map(x => x.dev));
const positions = brut.map(x => ({ pos: x.pos, n: x.n, dev: x.dev - centre }))
    .sort((a, b) => b.dev - a.dev);
if (positions.length) {
    console.log('\nQUELLE NOTE TRAINE, dans le groupe de huit');
    for (const p of positions)
        console.log('  note ' + p.pos + ' : '
            + (p.dev > 0 ? '+' : '') + r0(p.dev) + ' ms  (' + p.n + ' mesures)');
    const ecartPos = positions[0].dev - positions[positions.length - 1].dev;
    console.log(ecartPos > 25
        ? '  -> ' + Math.round(ecartPos) + ' ms separent la position la plus lente'
        + ' de la plus rapide : la note ' + positions[0].pos
        + ' du groupe traine vraiment.'
        : '  -> ' + Math.round(ecartPos) + ' ms seulement entre la plus lente et la'
        + ' plus rapide : aucun doigt ne traine en particulier, c\'est l\'allure'
        + ' d\'ensemble qui est a travailler.');
}

// ------------------------------------------- ou ca casse dans le passage
const casses = {};
for (const b of bilans) {
    if (!b.ecarts) continue;
    const seuil = 60000 / b.bpm / b.div * 0.3;
    b.ecarts.forEach((e, i) => {
        const d = i ? e - b.ecarts[i - 1] : 0;
        if (Math.abs(d) > seuil) casses[i] = (casses[i] || 0) + 1;
    });
}
// Rapporte au nombre de fois ou la note a ete ATTEINTE : on recommence
// toujours par le debut, donc les premieres notes sont jouees bien plus
// souvent, et sortaient toujours en tete sans rien vouloir dire.
const atteintes = {};
for (const b of bilans) {
    const jusque = b.al ? b.al.atteint : (b.ecarts || []).length;
    for (let i = 0; i < jusque; i++) atteintes[i] = (atteintes[i] || 0) + 1;
}
const chauds = Object.entries(casses)
    .map(([i, n]) => ({ i: +i, n, sur: atteintes[i] || 1 }))
    .filter(c => c.sur >= 2)
    .map(c => Object.assign(c, { part: c.n / c.sur }))
    .sort((a, b) => b.part - a.part || b.n - a.n).slice(0, 8);
if (chauds.length) {
    console.log('\nOU CA CASSE (notes ou le trou depasse 30 % de la valeur)');
    for (const c of chauds) {
        const cell = Math.floor(c.i / 8) + 1;
        const avant = suite[c.i - 1], ici = suite[c.i];
        console.log('  note ' + (c.i + 1) + ' (cellule ' + cell + ') : '
            + c.n + ' fois sur ' + c.sur + ' (' + Math.round(100 * c.part) + ' %)'
            + (ici !== undefined
                ? '  —  ' + (avant !== undefined ? nom(avant) + ' → ' : '') + nom(ici)
                + (avant !== undefined ? '  (' + (ici - avant > 0 ? '+' : '')
                    + (ici - avant) + ' demi-tons)' : '')
                : ''));
    }
    const cells = {};
    for (const c of chauds) cells[Math.floor(c.i / 8) + 1] =
        (cells[Math.floor(c.i / 8) + 1] || 0) + c.part;
    const pire = Object.entries(cells).sort((a, b) => b[1] - a[1])[0];
    if (pire) console.log('  -> travaille la cellule ' + pire[0] + ' seule, en boucle.');
}

// ------------------------------------------------------------ les forces
const forces = [];
for (const b of bilans) if (b.forces) forces.push(b.forces);
if (forces.length) {
    const plat = forces.flat();
    console.log('\nFORCES');
    console.log('  mediane ' + r0(med(plat)) + ', de ' + Math.min(...plat)
        + ' a ' + Math.max(...plat)
        + ' | ecart moyen a la mediane ' + r0(moy(plat.map(v => Math.abs(v - med(plat))))));
    const debuts = [], fins = [];
    for (const f of forces) {
        if (f.length < 16) continue;
        debuts.push(moy(f.slice(0, 8)));
        fins.push(moy(f.slice(-8)));
    }
    if (debuts.length) {
        const d = moy(fins) - moy(debuts);
        console.log('  debut ' + r0(moy(debuts)) + ' -> fin ' + r0(moy(fins))
            + (Math.abs(d) > 6
                ? '  (' + (d > 0 ? 'tu forces en avançant' : 'tu t\'eteins en avançant') + ')'
                : '  (stable)'));
    }
}
