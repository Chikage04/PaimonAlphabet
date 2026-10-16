/* Lit le journal des essais et en sort un digest lisible.

     node outils/lire-essais.js            les 15 derniers items d'atelier
     node outils/lire-essais.js 40         les 40 derniers
     node outils/lire-essais.js bilan      la derniere lecture, note par note
     node outils/lire-essais.js doigts     le detail des accords plaques
*/
'use strict';
const fs = require('fs');
const JOURNAL = process.env.ESSAIS_LOG || 'C:/tmp/essais.jsonl';

const lignes = fs.existsSync(JOURNAL)
    ? fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(l => l.trim())
    : [];
const ev = [];
for (const l of lignes) { try { ev.push(JSON.parse(l)); } catch (e) { } }

const arg = process.argv[2] || '15';
const heure = t => new Date(t).toLocaleTimeString('fr-FR');
const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;

if (!ev.length) { console.log('journal vide : ' + JOURNAL); process.exit(0); }

// ------------------------------------------------------------------ bilan
if (arg === 'bilan') {
    const b = ev.filter(e => e.type === 'bilan').pop();
    if (!b) { console.log('aucune lecture terminee'); process.exit(0); }
    console.log(heure(b.t) + '  niveau ' + b.niveau + ' · ' + b.tonalite
        + ' · ' + b.mains + ', ' + b.contenu);
    console.log('  ' + b.justes + ' % justes, ' + b.couvert + ' % menee au bout, '
        + b.arrets + ' arret(s), ecart au temps ' + b.ecartMs + ' ms, '
        + 'tempo tenu ' + b.bpmTenu);
    if (!b.notes) process.exit(0);
    console.log('\n  mes  main  ecrit    joue   ecart   force');
    let prev = null;
    for (const n of b.notes) {
        const ec = n.ecrit === null ? null : n.joue - n.ecrit;
        console.log('  ' + String(n.mesure === null ? '-' : n.mesure).padStart(3)
            + '  ' + String(n.main || '-').padStart(4)
            + '  ' + String(n.ecrit === null ? 'FAUSSE' : n.ecrit).padStart(6)
            + '  ' + String(n.joue).padStart(6)
            + '  ' + (ec === null ? '     -' : (ec > 0 ? '+' : '') + ec).padStart(6)
            + '  ' + String(n.vel === null ? '-' : n.vel).padStart(5)
            + (prev !== null && n.vel !== null && Math.abs(n.vel - prev) > 25
                ? '   <- saut de force' : ''));
        if (n.vel !== null) prev = n.vel;
    }
    const ecarts = b.notes.filter(n => n.ecrit !== null).map(n => n.joue - n.ecrit);
    const vels = b.notes.map(n => n.vel).filter(v => v !== null);
    console.log('\n  ecart median ' + Math.round(med(ecarts)) + ' ms'
        + ' | force moyenne ' + Math.round(moy(vels))
        + ', de ' + Math.min(...vels) + ' a ' + Math.max(...vels));
    process.exit(0);
}

// ----------------------------------------------------------------- doigts
if (arg === 'doigts') {
    const vs = ev.filter(e => e.type === 'verdict' && e.doigts && e.doigts.length > 1);
    if (!vs.length) { console.log('aucun accord joue'); process.exit(0); }
    console.log(vs.length + ' accords plaques\n');
    for (const v of vs.slice(-20)) {
        console.log(heure(v.t) + '  ' + (v.bon ? 'juste' : 'rate ') + '  '
            + v.doigts.map(d => d.midi + '@+' + d.dt + 'ms/f' + d.vel).join('  '));
    }
    const et = vs.map(v => v.etalement);
    const dv = vs.map(v => v.forceMax - v.forceMin);
    console.log('\netalement entre le premier et le dernier doigt : median '
        + Math.round(med(et)) + ' ms, pire ' + Math.max(...et) + ' ms');
    console.log('ecart de force dans un meme accord : median ' + Math.round(med(dv))
        + ', pire ' + Math.max(...dv));
    const tard = vs.map(v => v.doigts[v.doigts.length - 1].midi);
    const compte = {};
    for (const m of tard) compte[m] = (compte[m] || 0) + 1;
    const top = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('note la plus souvent en retard : '
        + top.map(([m, n]) => m + ' (' + n + ' fois)').join(', '));
    process.exit(0);
}

// --------------------------------------------------- derniers items joues
const n = parseInt(arg, 10) || 15;
const vs = ev.filter(e => e.type === 'verdict').slice(-n);
if (!vs.length) { console.log('aucun item juge'); process.exit(0); }
console.log(vs.length + ' derniers items\n');
for (const v of vs) {
    console.log(heure(v.t) + '  niv ' + v.niv + '  ' + (v.bon ? '✓' : '✗')
        + '  joue [' + v.joue.join(' ') + ']  attendu [' + v.attendu.join(' ') + ']'
        + '  en ' + (v.ms / 1000).toFixed(1) + ' s'
        + (v.etalement ? '  etalement ' + v.etalement + ' ms' : '')
        + (v.forceMax !== null && v.forceMin !== null
            ? '  force ' + v.forceMin + '-' + v.forceMax : ''));
}
const justes = vs.filter(v => v.bon).length;
console.log('\n' + justes + ' / ' + vs.length + ' justes'
    + ' | reconnaissance mediane ' + (med(vs.filter(v => v.bon).map(v => v.ms)) / 1000).toFixed(1) + ' s'
    + ' | niveau ' + vs[0].niv + ' -> ' + vs[vs.length - 1].niv);
