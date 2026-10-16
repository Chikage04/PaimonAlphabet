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

// --------------------------------------------------------------- essais
console.log(bilans.length + ' essais\n');
console.log('  #   exercice        tempo   justes   irreg   pire trou');
for (const b of bilans.slice(-15)) {
    console.log('  ' + String(b.no || '?').padStart(2)
        + '   ' + (b.ex + (b.cell ? ' ' + b.cell : '') + ' · ' + b.partie).padEnd(16)
        + ' ♩' + String(b.bpm).padEnd(5)
        + ' ' + (b.justes + '/' + b.attendues).padStart(7)
        + ' ' + (b.irregularite + ' %').padStart(7)
        + ' ' + (b.pireEcart + ' ms').padStart(10)
        + (b.reussi ? '  ✓' : ''));
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
const positions = Object.keys(parPos).map(p => ({
    pos: +p, dev: moy(parPos[p]), n: parPos[p].length
})).sort((a, b) => b.dev - a.dev);
if (positions.length) {
    console.log('\nQUELLE NOTE TRAINE, dans le groupe de huit');
    for (const p of positions)
        console.log('  note ' + p.pos + ' : '
            + (p.dev > 0 ? '+' : '') + r0(p.dev) + ' ms  (' + p.n + ' mesures)');
    const pire = positions[0];
    if (pire.dev > 8)
        console.log('  -> la note ' + pire.pos + ' du groupe est en retard de façon'
            + ' systematique : c\'est un doigt, pas un accident.');
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
const chauds = Object.entries(casses).map(([i, n]) => ({ i: +i, n }))
    .sort((a, b) => b.n - a.n).slice(0, 8);
if (chauds.length) {
    console.log('\nOU CA CASSE (notes ou le trou depasse 30 % de la valeur)');
    for (const c of chauds) {
        const cell = Math.floor(c.i / 8) + 1;
        const avant = suite[c.i - 1], ici = suite[c.i];
        console.log('  note ' + (c.i + 1) + ' (cellule ' + cell + ') : ' + c.n + ' fois'
            + (ici !== undefined
                ? '  —  ' + (avant !== undefined ? nom(avant) + ' → ' : '') + nom(ici)
                + (avant !== undefined ? '  (' + (ici - avant > 0 ? '+' : '')
                    + (ici - avant) + ' demi-tons)' : '')
                : ''));
    }
    const cells = {};
    for (const c of chauds) cells[Math.floor(c.i / 8) + 1] =
        (cells[Math.floor(c.i / 8) + 1] || 0) + c.n;
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
