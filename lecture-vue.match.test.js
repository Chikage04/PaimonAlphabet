/* Ce que l'appariement doit tenir, mesure sur des jeux fabriques dont on
   connait la verite. Chaque famille vient d'un defaut constate en jeu :

     - une piece d'accords jouee PARFAITEMENT annoncait 1 539 ms d'ecart au
       temps, parce que la derniere note partait neuf secondes plus loin ;
     - « piece menee au bout 100 % » pour une lecture arretee au milieu,
       avec un tempo annonce double de l'ecrit ;
     - un arret de huit secondes ne doit rien couter : le retard est
       normal, c'est l'avance qui est impossible ;
     - jouer plus vite ou plus lentement que l'ecrit doit rester lisible. */
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
let __s = 31337;
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

const w = boot();
const T0 = 10000;
const piece = (seed, content, hands) => w.SightGen.generate(
    1, seed * 7919, { hands: hands || 'both', content: content || 'chords' });

// ------------------------------------------------------------------
section('1. Un jeu parfait ne doit produire AUCUN defaut mesure');

for (const content of ['chords', 'melody', 'fifths7']) {
    let pire = 0, mal = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const p = piece(seed, content), tl = w.SightGen.timeline(p);
        const played = tl.map(e => ({ midi: e.midi, t: T0 + e.ms, v: 80 }));
        const a = w.analyse(p, tl, played);
        pire = Math.max(pire, a.offMs);
        if (a.accuracy < 99.9 || a.stops > 0 || a.covered < 99.9) mal++;
    }
    check(content + ' : jeu parfait, aucun ecart au temps', pire < 1,
        'pire ecart ' + pire.toFixed(0) + ' ms');
    check(content + ' : jeu parfait, tout juste et mene au bout', mal === 0,
        mal + ' pieces sur 20 en defaut');
}

// ------------------------------------------------------------------
section('2. Une lecture arretee en chemin est mesuree la ou elle s\'arrete');

for (const part of [0.2, 0.45, 0.7]) {
    let hors = 0, pireCouv = 0, pireEcart = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const p = piece(seed, 'chords'), tl = w.SightGen.timeline(p);
        const cut = Math.max(2, Math.floor(tl.length * part));
        const played = tl.slice(0, cut).map(e => ({ midi: e.midi, t: T0 + e.ms, v: 80 }));
        const a = w.analyse(p, tl, played);
        // la progression annoncee doit coller a la part reellement jouee
        if (Math.abs(a.covered - part * 100) > 15) hors++;
        pireCouv = Math.max(pireCouv, a.covered);
        pireEcart = Math.max(pireEcart, a.offMs);
    }
    check('arret a ' + Math.round(part * 100) + '% : progression bien situee',
        hors === 0, hors + ' pieces sur 20 hors de 15 points');
    check('arret a ' + Math.round(part * 100) + '% : jamais « menee au bout »',
        pireCouv < 95, 'pire couverture ' + pireCouv.toFixed(0) + '%');
    // le debut est joue PARFAITEMENT : l'ecart au temps doit rester nul.
    // C'est ici que se voyait le defaut signale — 1 539 ms annonces pour un
    // jeu sans le moindre defaut, a cause d'une seule note partie au loin.
    check('arret a ' + Math.round(part * 100) + '% : le debut parfait ne cree aucun ecart',
        pireEcart < 60, 'pire ecart ' + pireEcart.toFixed(0) + ' ms');
}

// ------------------------------------------------------------------
section('3. Un arret ne coute rien : le retard est normal, l\'avance impossible');

for (const arret of [2000, 5000, 8000]) {
    let mal = 0, detectes = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const p = piece(seed, 'chords'), tl = w.SightGen.timeline(p);
        const mi = Math.floor(tl.length / 2);
        const played = tl.map((e, i) => ({
            midi: e.midi, t: T0 + e.ms + (i >= mi ? arret : 0), v: 80
        }));
        const a = w.analyse(p, tl, played);
        if (a.accuracy < 99.9 || a.covered < 99.9) mal++;
        if (a.stops >= 1) detectes++;
    }
    check('arret de ' + arret + ' ms : la piece reste entierement appariee',
        mal === 0, mal + ' pieces sur 20 en defaut');
    if (arret >= 5000)
        check('arret de ' + arret + ' ms : il est vu comme un arret',
            detectes === 20, detectes + ' / 20');
}

// ------------------------------------------------------------------
section('4. Jouer plus vite ou plus lentement que l\'ecrit reste lisible');

for (const r of [0.6, 0.8, 1.5, 2.5]) {
    let mal = 0, pire = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const p = piece(seed, 'chords'), tl = w.SightGen.timeline(p);
        const played = tl.map(e => ({ midi: e.midi, t: T0 + e.ms * r, v: 80 }));
        const a = w.analyse(p, tl, played);
        if (a.accuracy < 99.9 || a.covered < 99.9) mal++;
        pire = Math.max(pire, Math.abs(a.bpmPlayed - p.bpm / r));
    }
    check('joue a ' + r + 'x : tout apparie et mene au bout', mal === 0,
        mal + ' pieces sur 20 en defaut');
    check('joue a ' + r + 'x : le tempo annonce est le bon', pire < 2,
        'pire ecart ' + pire.toFixed(1) + ' bpm');
}

// ------------------------------------------------------------------
section('5. Une note ne repond jamais a un endroit non encore atteint');

{
    let loin = 0, total = 0;
    for (let seed = 1; seed <= 20; seed++) {
        const p = piece(seed, 'chords'), tl = w.SightGen.timeline(p);
        const cut = Math.floor(tl.length * 0.45);
        const played = [];
        for (let i = 0; i < cut; i++)          // une note sur cinq est fausse
            played.push({ midi: tl[i].midi + (i % 5 === 3 ? 1 : 0),
                t: T0 + tl[i].ms, v: 80 });
        for (const pr of w.matchAligned(tl, played).pairs) {
            if (!pr.exp) continue;
            total++;
            // l'ecrit ne peut pas etre en avance de plus de deux mesures
            if (pr.exp.ms - (pr.played.t - T0) > 2 * p.barTicks * 60000 / p.bpm / p.tpq)
                loin++;
        }
    }
    check('aucune note n\'est appariee loin devant le temps ecoule',
        loin === 0, loin + ' sur ' + total + ' paires');
}

// ------------------------------------------------------------------
section('6. Chaque note est creditee a la bonne note ecrite');

// Les objets joues traversent l'appariement : on peut donc les etiqueter
// et verifier, note par note, ou chacune a ete creditee.
{
    let graine = 12345;
    const alea = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    function jeu(p, tl, opt) {
        const played = [];
        let retard = 0;
        for (let i = 0; i < tl.length; i++) {
            if (opt.stop && i >= tl.length * opt.stop) break;
            if (opt.omet && alea() < opt.omet) continue;
            if (opt.arret && alea() < 0.03) retard += 400 + alea() * 1200;
            const f = opt.faux && alea() < opt.faux;
            played.push({
                midi: tl[i].midi + (f ? (alea() < 0.5 ? 1 : 2) : 0),
                t: T0 + tl[i].ms + retard + (alea() - 0.5) * 2 * (opt.jit || 0),
                v: 80, src: i, faux: f
            });
        }
        played.sort((a, b) => a.t - b.t);
        return played;
    }

    // --- jeu parfait : aucune excuse
    for (const content of ['melody', 'chords', 'blocks']) {
        let mal = 0, n = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const p = piece(seed, content), tl = w.SightGen.timeline(p);
            const played = jeu(p, tl, { jit: 40 });
            for (const pr of w.matchAligned(tl, played).pairs) {
                if (!pr.exp) continue;
                n++;
                if (pr.idx !== pr.played.src) mal++;
            }
        }
        check(content + ' : jeu propre, chaque note a sa place', mal === 0,
            mal + ' mal creditees sur ' + n);
    }

    // --- jeu humain : on ne compte que les erreurs NETTES, celles ou la
    //     note d'origine etait plus proche dans le temps que celle choisie.
    //     Le reste est une vraie ambiguite : apres un arret, reprendre en
    //     retard sur un accord ou a l'heure sur le suivant s'ecrit pareil.
    graine = 12345;
    for (const content of ['melody', 'chords', 'blocks']) {
        let nettes = 0, n = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const p = piece(seed, content), tl = w.SightGen.timeline(p);
            const played = jeu(p, tl, { jit: 80, faux: 0.12, omet: 0.08, arret: 1, stop: 0.66 });
            n += played.length;
            for (const pr of w.matchAligned(tl, played).pairs) {
                if (!pr.exp || pr.idx === pr.played.src) continue;
                const choisi = Math.abs((pr.played.t - T0) - tl[pr.idx].ms);
                const vrai = Math.abs((pr.played.t - T0) - tl[pr.played.src].ms);
                if (vrai < choisi - 30) nettes++;
            }
        }
        // mesure avant correction : 1,2 % en melodie, 3,6 % en accords
        check(content + ' : jeu humain, moins de 2 % nettement mal creditees',
            nettes <= n * 0.02, nettes + ' sur ' + n + ' notes jouees ('
            + (100 * nettes / n).toFixed(1) + ' %)');
    }
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
