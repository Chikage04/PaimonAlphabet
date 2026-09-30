/* Banc de test du generateur de lecture a vue.
   Il ne verifie pas que la musique est belle — ca, il faut l'ecouter.
   Il verifie que chaque piece respecte EXACTEMENT le contrat du niveau
   annonce, parce que c'est ce contrat qui rend la progression honnete. */
'use strict';
const G = require('C:/Users/Lucas/PaimonAlphabet/sightread-gen.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; return; }
    fail++;
    console.log('  ECHEC  ' + name + (detail ? '  [' + detail + ']' : ''));
}
function section(t) { console.log('\n' + t); }

const N = 400;                       // pieces tirees par niveau
const STEP_PC = [0, 2, 4, 5, 7, 9, 11];

// ------------------------------------------------------------------
section('1. Contrat de niveau (400 pieces par niveau)');

for (const lvl of G.LEVELS) {
    const bad = {
        midi: 0, sumRH: 0, sumLH: 0, bars: 0, span: 0, leap: 0,
        shift: 0, acc: 0, rhythm: 0, keys: 0, empty: 0, overlap: 0
    };
    const allowed = new Set();
    // durees autorisees, deduites du vivier du niveau
    const POOL = {
        w: [192], h: [96], q: [48], e: [24], r: [48], re: [24],
        dq: [72, 24], s: [12, 24], syn: [24, 48],
        c1: [72], c2: [48, 24], c3: [24], cr: [24]
    };
    lvl.rhythm.forEach(k => POOL[k].forEach(d => allowed.add(d)));

    for (let i = 0; i < N; i++) {
        const p = G.generate(lvl.n, 1000 + i * 7919);

        if (p.bars !== lvl.bars || p.measures.length !== lvl.bars) bad.bars++;
        if (lvl.keys.indexOf(p.sharps) < 0) bad.keys++;

        let rhNotes = [], prevD = null, mi = -1;
        for (const m of p.measures) {
            mi++;
            // la derniere mesure tient une seule valeur longue : c'est la
            // cadence, pas une duree hors vivier
            const okDur = d => allowed.has(d) || (mi === p.bars - 1 && d === p.barTicks);
            // -- les durees remplissent la mesure, exactement, par main
            const sum = a => a.filter(n => n.on !== undefined)
                .reduce((s, n) => s, 0);
            let tRH = 0;
            for (const n of m.rh) tRH += n.dur;
            if (m.rh.length && tRH !== p.barTicks) bad.sumRH++;

            // main gauche : des notes peuvent etre simultanees (accords),
            // donc on somme la couverture, pas les durees
            if (m.lh.length) {
                const ons = [...new Set(m.lh.map(n => n.on))].sort((a, b) => a - b);
                let cover = 0;
                for (const o of ons) cover += Math.max(...m.lh.filter(n => n.on === o).map(n => n.dur));
                if (cover !== p.barTicks) bad.sumLH++;
            }

            for (const n of m.rh) {
                if (n.rest) { if (!okDur(n.dur)) bad.rhythm++; continue; }
                rhNotes.push(n);
                if (!okDur(n.dur)) bad.rhythm++;
                if (n.midi !== (n.oct + 1) * 12 + STEP_PC[n.step] + n.alter) bad.midi++;
                if (n.midi < 21 || n.midi > 108) bad.midi++;
                if (!lvl.acc && n.acc) bad.acc++;
                if (!lvl.shift && n.shift) bad.shift++;
                if (prevD !== null && Math.abs(n.d - prevD) > lvl.maxLeap) bad.leap++;
                prevD = n.d;
            }
            for (const n of m.lh) {
                if (n.midi !== (n.oct + 1) * 12 + STEP_PC[n.step] + n.alter) bad.midi++;
                if (n.midi < 21 || n.midi > 108) bad.midi++;
            }
        }
        if (!rhNotes.length) bad.empty++;
        const ds = rhNotes.map(n => n.d);
        if (Math.max(...ds) - Math.min(...ds) > lvl.span) bad.span++;
        if (lvl.lh === 'none' && p.measures.some(m => m.lh.length)) bad.empty++;
        if (lvl.lh !== 'none' && p.measures.some(m => !m.lh.length)) bad.empty++;
    }

    const L = 'niveau ' + lvl.n;
    check(L + ' : nombre de mesures', bad.bars === 0, bad.bars);
    check(L + ' : armature conforme', bad.keys === 0, bad.keys);
    check(L + ' : la main droite remplit la mesure', bad.sumRH === 0, bad.sumRH);
    check(L + ' : la main gauche remplit la mesure', bad.sumLH === 0, bad.sumLH);
    check(L + ' : hauteurs midi coherentes avec l\'ecriture', bad.midi === 0, bad.midi);
    check(L + ' : etendue <= ' + lvl.span + ' degres', bad.span === 0, bad.span);
    check(L + ' : aucun saut > ' + lvl.maxLeap + ' degres', bad.leap === 0, bad.leap);
    check(L + ' : ' + (lvl.shift ? 'changements permis' : 'aucun changement de position'),
        bad.shift === 0, bad.shift);
    check(L + ' : ' + (lvl.acc ? 'alterations permises' : 'aucune alteration accidentelle'),
        bad.acc === 0, bad.acc);
    check(L + ' : durees issues du vivier du niveau', bad.rhythm === 0, bad.rhythm);
    check(L + ' : main gauche presente si et seulement si prevue', bad.empty === 0, bad.empty);
}

// ------------------------------------------------------------------
section('1 bis. La partition est JOUABLE a deux mains');

for (const lvl of G.LEVELS) {
    let unisson = 0, croise = 0, tropLarge = 0, voisines = 0, n = 0;
    for (let i = 0; i < 400; i++) {
        const p = G.generate(lvl.n, 7000 + i * 617);
        const tl = G.timeline(p, p.bpm);
        n++;
        // une touche ne s'enfonce pas deux fois a la fois
        const vus = new Set();
        for (const e of tl) {
            const key = e.tick + ':' + e.midi;
            if (vus.has(key)) unisson++;
            vus.add(key);
        }
        // les mains ne se croisent pas
        const parTick = new Map();
        for (const e of tl) {
            if (!parTick.has(e.tick)) parTick.set(e.tick, []);
            parTick.get(e.tick).push(e);
        }
        for (const [, es] of parTick) {
            const rh = es.filter(e => e.hand === 'R'), lh = es.filter(e => e.hand === 'L');
            if (rh.length && lh.length
                && Math.max(...lh.map(e => e.midi)) >= Math.min(...rh.map(e => e.midi))) croise++;
            // un accord d'une seule main doit tenir sous les doigts
            for (const h of ['R', 'L']) {
                const v = es.filter(e => e.hand === h).map(e => e.midi);
                if (v.length > 1 && Math.max(...v) - Math.min(...v) > 12) tropLarge++;
            }
            // Deux touches voisines frappees ensemble sont indiscernables
            // d'un doigt qui deborde : la partition ne doit jamais en
            // demander, sinon le filtre qui corrige ce geste les mangerait.
            const ps = es.map(e => e.midi).sort((a, b) => a - b);
            for (let k = 1; k < ps.length; k++) if (ps[k] - ps[k - 1] < 3) voisines++;
        }
    }
    const L = 'niveau ' + lvl.n;
    check(L + ' : jamais deux fois la meme note au meme instant', unisson === 0, unisson);
    check(L + ' : jamais deux touches voisines au meme instant', voisines === 0,
        voisines + ' intervalles de moins d\'une tierce');
    check(L + ' : les mains ne se croisent jamais', croise === 0, croise);
    check(L + ' : aucun accord ne depasse l\'octave sous une main', tropLarge === 0, tropLarge);
}

// ------------------------------------------------------------------
section('1 ter. Variantes : quelle main, quel contenu');

// intervalle diatonique entre les notes simultanees
// L'option de contenu s'applique a la main QUI LIT : on inspecte donc
// cette main-la, pas l'accompagnement.
function stacksOf(p, hands) {
    const out = [];
    for (const m of p.measures)
        for (const hand of [hands === 'lh' ? 'lh' : 'rh']) {
            const byOn = new Map();
            for (const n of m[hand]) {
                if (n.rest) continue;
                if (!byOn.has(n.on)) byOn.set(n.on, []);
                byOn.get(n.on).push(n.d);
            }
            for (const [, ds] of byOn) out.push(ds.sort((a, b) => a - b));
        }
    return out;
}

// Un bouton qui annonce « deux mains » et n'en donne qu'une ment. Le
// niveau 1 se reservait la main droite : sa portee de fa restait vide
// alors que l'utilisateur avait demande les deux.
for (const lvl of G.LEVELS) {
    let sansMG = 0, sansMD = 0;
    for (let i = 0; i < 100; i++) {
        const p = G.generate(lvl.n, 3100 + i * 977, { hands: 'both' });
        if (!p.measures.some(m => m.lh.some(n => !n.rest))) sansMG++;
        if (!p.measures.some(m => m.rh.some(n => !n.rest))) sansMD++;
    }
    check('niveau ' + lvl.n + ' : en deux mains, la main gauche a des notes',
        sansMG === 0, sansMG + '/100 pieces sans main gauche');
    check('niveau ' + lvl.n + ' : en deux mains, la main droite a des notes',
        sansMD === 0, sansMD + '/100 pieces sans main droite');
}

check('sans options, la piece est identique a avant',
    JSON.stringify(G.generate(4, 999)) === JSON.stringify(G.generate(4, 999, {})),
    'les valeurs par defaut ne doivent rien changer');

for (const lvl of G.LEVELS) {
    let noLH = 0, noRH = 0, horsPortee = 0, n = 0;
    for (let i = 0; i < 150; i++) {
        const a = G.generate(lvl.n, 4000 + i * 811, { hands: 'rh' });
        const b = G.generate(lvl.n, 4000 + i * 811, { hands: 'lh' });
        n++;
        if (a.measures.some(m => m.lh.length)) noLH++;
        if (b.measures.some(m => m.rh.length)) noRH++;
        // la main gauche seule doit tenir sur la portee de fa,
        // ledgers raisonnables compris : do2 a do4
        for (const e of G.timeline(b, b.bpm))
            if (e.midi < 36 || e.midi > 62) horsPortee++;
    }
    check('niveau ' + lvl.n + ' : main droite seule, rien a la main gauche', noLH === 0, noLH);
    check('niveau ' + lvl.n + ' : main gauche seule, rien a la main droite', noRH === 0, noRH);
    check('niveau ' + lvl.n + ' : la main gauche seule tient sur sa portee',
        horsPortee === 0, horsPortee + ' notes hors de do2-do4');
}

{
    // quintes : deux notes, toujours une quinte
    let mauvais = 0, total = 0;
    for (let i = 0; i < 300; i++)
        for (const st of stacksOf(G.generate(1 + (i % 8), 6000 + i, { content: 'fifths' }), 'rh')) {
            total++;
            if (st.length !== 2 || Math.abs(st[1] - st[0]) !== 4) mauvais++;
        }
    check('quintes : chaque empilement est exactement une quinte',
        mauvais === 0, mauvais + ' ecarts sur ' + total);

    // quintes et septiemes : les deux, et rien d'autre
    let horsJeu = 0, q = 0, sept = 0;
    for (let i = 0; i < 300; i++)
        for (const st of stacksOf(G.generate(1 + (i % 8), 7000 + i, { content: 'fifths7' }), 'rh')) {
            if (st.length !== 2) { horsJeu++; continue; }
            const w = Math.abs(st[1] - st[0]);
            if (w === 4) q++; else if (w === 6) sept++; else horsJeu++;
        }
    check('quintes et septiemes : aucun autre intervalle', horsJeu === 0, horsJeu);
    check('les deux intervalles apparaissent vraiment', q > 100 && sept > 100,
        q + ' quintes, ' + sept + ' septiemes');

    // accords : trois ou quatre sons empiles par tierces
    let malForme = 0, n3 = 0, n4 = 0;
    for (let i = 0; i < 300; i++)
        for (const st of stacksOf(G.generate(1 + (i % 8), 8000 + i, { content: 'chords' }), 'rh')) {
            if (st.length === 3) n3++; else if (st.length === 4) n4++; else { malForme++; continue; }
            for (let k = 1; k < st.length; k++) if (st[k] - st[k - 1] !== 2) malForme++;
        }
    check('accords : trois ou quatre sons, empiles par tierces', malForme === 0, malForme);
    check('les triades et les septiemes apparaissent', n3 > 100 && n4 > 100, n3 + ' / ' + n4);
}

{
    // L'ARPEGE : l'accord se deroule au lieu d'etre plaque. Une note par
    // temps, du grave vers l'aigu, et sur la portee de la main qui joue.
    let horsAccord = 0, horsBande = 0, horsTemps = 0, descend = 0, tot = 0;
    for (const hands of ['rh', 'lh', 'both'])
        for (let lv = 1; lv <= 8; lv++)
            for (let i = 0; i < 40; i++) {
                const p = G.generate(lv, 6600 + i * 313, { hands, content: 'arpeggio' });
                const main = hands === 'lh' ? 'lh' : 'rh';
                const beat = p.compound ? p.tpq * 1.5 : p.tpq;
                for (let m = 0; m < p.measures.length; m++) {
                    const row = p.measures[m][main].filter(n => !n.rest);
                    if (!row.length) continue;
                    tot++;
                    // toutes les notes appartiennent a l'accord de la mesure
                    const tonic = Math.round((28 - p.tonicStep) / 7) * 7 + p.tonicStep;
                    const deg = p.plan[m];
                    const tons = [deg % 7, (deg + 2) % 7, (deg + 4) % 7, (deg + 6) % 7];
                    for (const n of row)
                        if (tons.indexOf(((n.d - tonic) % 7 + 7) % 7) < 0) horsAccord++;
                    // une note par temps, sauf la mesure cadentielle
                    if (m < p.measures.length - 1)
                        for (const n of row) if (n.dur !== beat) horsTemps++;
                    // la figure monte depuis sa base
                    if (row.length > 1 && row[1].d < row[0].d) descend++;
                    // et elle tient sur sa portee
                    for (const n of row) {
                        const lo = main === 'lh' ? 35 : 56, hi = main === 'lh' ? 58 : 78;
                        if (n.midi < lo || n.midi > hi) horsBande++;
                    }
                }
            }
    check('arpege : toutes les notes appartiennent a l\'accord de la mesure',
        horsAccord === 0, horsAccord);
    check('arpege : une note par temps hors cadence', horsTemps === 0, horsTemps);
    check('arpege : la figure monte depuis sa base', descend === 0,
        descend + ' mesures sur ' + tot);
    check('arpege : elle tient sur la portee de la main qui joue',
        horsBande === 0, horsBande);
}

{
    // un accord ne se lit pas en doubles croches
    let tropCourt = 0;
    for (const content of ['fifths', 'fifths7', 'chords'])
        for (let i = 0; i < 200; i++) {
            const p = G.generate(1 + (i % 8), 9000 + i, { content });
            const beat = p.compound ? p.tpq * 1.5 : p.tpq;
            for (const m of p.measures)
                for (const nn of m.rh.concat(m.lh)) if (nn.dur < beat) tropCourt++;
        }
    check('aucun empilement plus court qu\'un temps', tropCourt === 0, tropCourt);
}

{
    // une variante n'est pas la meme piece : elle ne doit pas bruler
    // la melodie correspondante
    const sigs = new Set();
    for (const hands of G.HANDSETS)
        for (const content of G.CONTENTS)
            sigs.add(G.generate(3, 12345, { hands, content }).sig);
    // derive du nombre d'options, pas ecrit en dur : ajouter un contenu
    // doit etendre la verification, pas la casser
    const attendu = G.HANDSETS.length * G.CONTENTS.length;
    check('chaque variante a sa propre empreinte', sigs.size === attendu,
        sigs.size + ' sur ' + attendu);
}

{
    // la jouabilite tient aussi dans les variantes
    let unisson = 0, croise = 0, tropLarge = 0;
    for (const hands of G.HANDSETS)
        for (const content of G.CONTENTS)
            for (let i = 0; i < 60; i++) {
                const p = G.generate(1 + (i % 8), 15000 + i, { hands, content });
                const tl = G.timeline(p, p.bpm);
                const vus = new Set(), parTick = new Map();
                for (const e of tl) {
                    const key = e.tick + ':' + e.midi;
                    if (vus.has(key)) unisson++;
                    vus.add(key);
                    if (!parTick.has(e.tick)) parTick.set(e.tick, []);
                    parTick.get(e.tick).push(e);
                }
                for (const [, es] of parTick) {
                    const R = es.filter(e => e.hand === 'R'), L = es.filter(e => e.hand === 'L');
                    if (R.length && L.length
                        && Math.max(...L.map(e => e.midi)) >= Math.min(...R.map(e => e.midi))) croise++;
                    for (const h of ['R', 'L']) {
                        const v = es.filter(e => e.hand === h).map(e => e.midi);
                        if (v.length > 1 && Math.max(...v) - Math.min(...v) > 12) tropLarge++;
                    }
                }
            }
    check('variantes : jamais deux fois la meme note au meme instant', unisson === 0, unisson);
    check('variantes : les mains ne se croisent jamais', croise === 0, croise);
    check('variantes : aucun accord ne depasse l\'octave sous une main', tropLarge === 0, tropLarge);
}

// ------------------------------------------------------------------
section('1 quater. Murs d\'accords (methode Richard Yang)');

// Regroupe les notes par INSTANT, main par main.
function instants(p) {
    const out = [];
    p.measures.forEach((m, mi) => {
        const par = new Map();
        const ajoute = (n, cote) => {
            if (n.rest) return;
            if (!par.has(n.on)) par.set(n.on, { h: [], b: [], dur: n.dur });
            par.get(n.on)[cote].push(n.midi);
        };
        m.rh.forEach(n => ajoute(n, 'h'));
        m.lh.forEach(n => ajoute(n, 'b'));
        [...par.keys()].sort((a, b) => a - b).forEach(on => {
            const v = par.get(on);
            out.push({ bar: mi, on, dur: v.dur,
                h: v.h.sort((a, b) => a - b), b: v.b.sort((a, b) => a - b) });
        });
    });
    return out;
}

{
    let ensemble = 0, tropPres = 99, surTemps = 0, tenue = 0, n = 0;
    let quintes = 0, gros = 0, changes = { 0: 0, 1: 0, 2: 0, 3: 0, plus: 0 };
    for (let lv = 1; lv <= G.LEVELS.length; lv++) {
        for (let k = 0; k < 60; k++) {
            const p = G.generate(lv, k * 7919 + lv, { hands: 'both', content: 'blocks' });
            n++;
            const ins = instants(p);
            // les deux mains frappent ensemble, sans exception
            if (ins.every(i => i.h.length && i.b.length)) ensemble++;
            // un accord par temps, et la derniere mesure se tient
            if (ins.every(i => i.bar === p.bars - 1 || i.dur === p.beatTicks)) surTemps++;
            const fin = ins.filter(i => i.bar === p.bars - 1);
            if (fin.length === 1 && fin[0].dur === p.barTicks) tenue++;
            // jamais deux mains a portee de doigt l'une de l'autre
            for (const i of ins)
                tropPres = Math.min(tropPres, i.h[0] - i.b[i.b.length - 1]);
            // la forme tenue d'un bout a l'autre de la piece
            if (ins.every(i => i.h.length === 2)) quintes++;
            else if (ins.every(i => i.h.length >= 3)) gros++;
            // combien de notes changent d'un accord au suivant
            for (let j = 1; j < ins.length; j++) {
                if (ins[j].h.length !== ins[j - 1].h.length) continue;
                if (ins[j].h.length < 3) continue;   // deux quintes conjointes
                                                     // changent leurs deux notes
                const d = ins[j].h.filter(x => ins[j - 1].h.indexOf(x) < 0).length;
                changes[d > 3 ? 'plus' : d]++;
            }
        }
    }
    check('les deux mains frappent toujours ensemble', ensemble === n, ensemble + ' / ' + n);
    check('un accord par temps, sauf la resolution', surTemps === n, surTemps + ' / ' + n);
    check('la derniere mesure est une ronde plaquee', tenue === n, tenue + ' / ' + n);
    // Une tierce au moins : a un ton d'ecart les deux mains se disputent
    // les memes touches. Mesure avant correction : 138 instants fautifs.
    check('les mains ne se touchent jamais', tropPres >= 3, tropPres + ' demi-tons');
    // Les deux formes de ses feuilles, et une seule par piece
    check('les deux formes sortent, et une piece garde la sienne',
        quintes + gros === n && quintes > n * 0.2 && gros > n * 0.2,
        quintes + ' pieces de quintes, ' + gros + ' d\'accords, sur ' + n);
    // Un accord qui bouge d'une tierce garde trois sons sur quatre. Ce
    // n'est pas une regle a respecter — il le dit lui-meme, il peut y en
    // avoir plus — mais c'est ce qui domine, et c'est ce qui se lit vite.
    const suites = Object.values(changes).reduce((a, b) => a + b, 0);
    check('le plus souvent, une seule note change',
        changes[1] > suites * 0.8, (100 * changes[1] / suites).toFixed(0) + ' %');
    check('mais il arrive qu\'il en change plusieurs',
        changes[2] + changes[3] > 0, changes[2] + ' fois deux, ' + changes[3] + ' fois trois');
}

// une quinte reste une quinte, et une seule main laisse l'autre portee vide
{
    let quintesJustes = 0, quintesTotal = 0, videD = 0, videG = 0, nn = 0;
    for (let k = 0; k < 200; k++) {
        const p = G.generate(1 + (k % 8), k * 104729, { hands: 'both', content: 'blocks' });
        for (const m of p.measures) {
            const par = new Map();
            for (const nt of m.rh) if (!nt.rest) {
                if (!par.has(nt.on)) par.set(nt.on, []);
                par.get(nt.on).push(nt.d);
            }
            for (const ds of par.values()) {
                if (ds.length !== 2) continue;
                quintesTotal++;
                // une quinte, c'est quatre degres de portee — toujours. Le
                // nombre de demi-tons depend du mode : en mineur harmonique
                // la sensible haussee en donne une augmentee, qui s'ecrit
                // exactement pareil et se lit donc pareil.
                ds.sort((a, b) => a - b);
                if (ds[1] - ds[0] === 4) quintesJustes++;
            }
        }
        const d = G.generate(1 + (k % 8), k * 15485863, { hands: 'rh', content: 'blocks' });
        const g = G.generate(1 + (k % 8), k * 32452843, { hands: 'lh', content: 'blocks' });
        nn++;
        if (d.measures.every(m => !m.lh.length)) videD++;
        if (g.measures.every(m => !m.rh.length)) videG++;
    }
    check('toutes les quintes ecrites en sont vraiment',
        quintesJustes === quintesTotal, quintesJustes + ' / ' + quintesTotal);
    check('main droite seule : la portee de fa reste vide', videD === nn, videD + ' / ' + nn);
    check('main gauche seule : la portee de sol reste vide', videG === nn, videG + ' / ' + nn);
}

// ------------------------------------------------------------------
section('2. La difficulte ne recule jamais d\'un niveau au suivant');

for (let i = 1; i < G.LEVELS.length; i++) {
    const a = G.LEVELS[i - 1], b = G.LEVELS[i];
    const t = 'niveau ' + a.n + ' -> ' + b.n;
    check(t + ' : etendue', b.span >= a.span, a.span + ' -> ' + b.span);
    check(t + ' : saut maximal', b.maxLeap >= a.maxLeap, a.maxLeap + ' -> ' + b.maxLeap);
    check(t + ' : nombre de mesures', b.bars >= a.bars, a.bars + ' -> ' + b.bars);
    check(t + ' : alterations a la cle', Math.max(...b.keys.map(Math.abs))
        >= Math.max(...a.keys.map(Math.abs)));
    check(t + ' : une main gauche acquise ne disparait pas',
        !(a.lh !== 'none' && b.lh === 'none'));
}

// ------------------------------------------------------------------
section('3. Musicalite : cadences et forme');

let endTonic = 0, startTonic = 0, cadV = 0, tot = 0;
let restTonic = 0, restChord = 0;
function tonicOf(p) {           // tonique de reference, autour de do4
    return Math.round((28 - p.tonicStep) / 7) * 7 + p.tonicStep;
}
for (const lvl of G.LEVELS) {
    for (let i = 0; i < 200; i++) {
        const p = G.generate(lvl.n, 50000 + i * 104729);
        tot++;
        if (p.plan[0] === 0) startTonic++;
        if (p.plan[p.plan.length - 1] === 0) endTonic++;
        if (p.plan[p.plan.length - 2] === 4) cadV++;
        const last = p.measures[p.measures.length - 1].rh.filter(n => !n.rest).pop();
        const deg = ((last.d - tonicOf(p)) % 7 + 7) % 7;
        if (deg === 0) restTonic++;
        if (deg === 0 || deg === 2 || deg === 4) restChord++;
    }
}
check('toute piece commence sur la tonique', startTonic === tot, startTonic + '/' + tot);
check('toute piece finit sur l\'accord de tonique', endTonic === tot, endTonic + '/' + tot);
check('la cadence finale est bien V -> I', cadV === tot, cadV + '/' + tot);
// Se poser sur la tierce est une fin valable ; se poser hors de l'accord
// de tonique n'en est pas une.
check('la melodie se pose sur une note de l accord de tonique', restChord === tot,
    restChord + '/' + tot);
check('elle se pose sur la tonique elle-meme dans 80% des cas',
    restTonic / tot >= 0.8, (restTonic / tot * 100).toFixed(1) + '%');

// ------------------------------------------------------------------
section('4. Reproductibilite et renouvellement');

const a1 = G.generate(4, 424242), a2 = G.generate(4, 424242);
check('meme graine, meme piece', JSON.stringify(a1) === JSON.stringify(a2));
check('graine differente, piece differente',
    G.generate(4, 424242).sig !== G.generate(4, 424243).sig);

for (const lvl of G.LEVELS) {
    const seen = new Set();
    const M = 1000;
    for (let i = 0; i < M; i++) seen.add(G.generate(lvl.n, i * 2654435761 % 4294967296).sig);
    const ratio = seen.size / M;
    // Un pourcentage de doublons ne dit rien tout seul. Ce qui compte est
    // la TAILLE du vivier : un eleve voit au plus une centaine de pieces
    // a un niveau donne avant d'en sortir, il ne doit jamais revoir la
    // meme. On estime le vivier a partir du nombre de tirages distincts.
    let est = seen.size;
    for (let k = 0; k < 200; k++) est = seen.size / (1 - Math.pow(1 - 1 / est, M));
    check('niveau ' + lvl.n + ' : vivier d au moins 5000 pieces',
        est >= 5000 || seen.size === M, Math.round(est) + ' pieces estimees');
    // le niveau 1 a un espace volontairement etroit (cinq notes, trois
    // valeurs) : on tolere quelques doublons, l'application les rejoue.
    const need = lvl.n <= 2 ? 0.95 : 0.999;
    check('niveau ' + lvl.n + ' : pieces distinctes sur 1000 tirages',
        ratio >= need, (ratio * 100).toFixed(1) + '% (seuil ' + (need * 100) + '%)');
}

// ------------------------------------------------------------------
section('5. Ligne de temps et points chauds');

for (const lvl of G.LEVELS) {
    let mono = true, inBar = true, hotOK = true, durOK = true;
    for (let i = 0; i < 100; i++) {
        const p = G.generate(lvl.n, 777000 + i * 31337);
        const tl = G.timeline(p, 60);
        for (let k = 1; k < tl.length; k++) if (tl[k].tick < tl[k - 1].tick) mono = false;
        for (const e of tl) if (e.tick < 0 || e.tick >= p.bars * p.barTicks) inBar = false;
        const total = G.durationMs(p, 60);
        if (Math.abs(total - p.bars * p.barTicks * (1000 / G.TPQ)) > 0.001) durOK = false;
        for (const h of G.hotspots(p)) {
            if (h.bar < 0 || h.bar >= p.bars) hotOK = false;
            if (['saut', 'position', 'alteration'].indexOf(h.why) < 0) hotOK = false;
        }
    }
    check('niveau ' + lvl.n + ' : ligne de temps ordonnee', mono);
    check('niveau ' + lvl.n + ' : toutes les notes dans la piece', inBar);
    check('niveau ' + lvl.n + ' : duree totale exacte', durOK);
    check('niveau ' + lvl.n + ' : points chauds valides', hotOK);
}

// un niveau 1 n'a aucune difficulte signalee, un niveau 7 en a
let hot1 = 0, hot7 = 0;
for (let i = 0; i < 200; i++) {
    hot1 += G.hotspots(G.generate(1, 900000 + i)).length;
    hot7 += G.hotspots(G.generate(7, 900000 + i)).length;
}
check('le niveau 1 ne signale aucune difficulte', hot1 === 0, hot1);
check('le niveau 7 signale des difficultes', hot7 > 200, hot7);

// ------------------------------------------------------------------
section('6. Duree d\'une lecture : compatible avec une seance de 15 min');

for (const lvl of G.LEVELS) {
    const p = G.generate(lvl.n, 12345);
    const sec = G.durationMs(p, p.bpm) / 1000;
    check('niveau ' + lvl.n + ' : lecture entre 10 et 75 s',
        sec >= 10 && sec <= 75, sec.toFixed(1) + ' s a ' + p.bpm + ' bpm');
}

// ------------------------------------------------------------------
console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS') +
    ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
