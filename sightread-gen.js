/* ------------------------------------------------------------------
   sightread-gen.js — generateur de pieces de lecture a vue.

   La lecture a vue exige du materiel JAMAIS VU. Un catalogue fini, si
   gros soit-il, meurt en quelques semaines et cesse alors d'entrainer
   quoi que ce soit. Le moteur est donc un generateur, et les vraies
   pieces du domaine public ne sont qu'un complement.

   Mais generer au hasard donnerait du bruit, pas de la musique. Chaque
   piece est donc ecrite sous contraintes, dans cet ordre :
       1. un plan harmonique par fonctions (I-IV-V-I) avec cadences,
       2. un rythme tire d'un vivier propre au niveau,
       3. une melodie contrainte par l'accord et par la conduite de voix,
       4. une main gauche dans le style du niveau.

   Tout est diatonique : une hauteur est un indice de portee (d) plus une
   alteration. L'orthographe des notes (do diese contre re bemol) en
   decoule donc toute seule, ce qu'un calcul en demi-tons ne permet pas.

   Sortie : un modele TEMPOREL (onsets et durees en ticks). La mise en
   page vers le graveur est un autre etage, volontairement separe.
   ------------------------------------------------------------------ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SightGen = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ---------------------------------------------------------------
    // 1. Constantes et outils diatoniques
    // ---------------------------------------------------------------

    // 48 ticks par noire : divisible par 4 (doubles croches) ET par 3
    // (mesures composees), donc aucune duree n'est jamais fractionnaire.
    var TPQ = 48;

    var STEP_PC = [0, 2, 4, 5, 7, 9, 11];        // do re mi fa sol la si
    var SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];     // fa do sol re la mi si
    var FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];      // si mi la re sol do fa

    // Alteration imposee par l'armature sur un degre de portee donne.
    function keyAlter(step, sharps) {
        var i;
        if (sharps > 0) {
            for (i = 0; i < sharps; i++) if (SHARP_ORDER[i] === step) return 1;
        } else if (sharps < 0) {
            for (i = 0; i < -sharps; i++) if (FLAT_ORDER[i] === step) return -1;
        }
        return 0;
    }

    // d = indice de portee absolu = octave * 7 + degre. Do4 -> 28, midi 60.
    function midiOf(d, alter) {
        var oct = Math.floor(d / 7);
        return (oct + 1) * 12 + STEP_PC[d - oct * 7] + alter;
    }

    // Diatonique du do de l'octave n : do4 -> 28.
    function dOfC(oct) { return oct * 7; }

    // ---------------------------------------------------------------
    // 2. Alea reproductible
    // ---------------------------------------------------------------
    // Une graine donne toujours la meme piece : c'est ce qui permet de
    // rejouer un bilan, de signaler une piece ratee, et de tester.
    function rng(seed) {
        var a = seed >>> 0;
        return function () {
            a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
    function pickW(r, arr, weights) {
        var tot = 0, i;
        for (i = 0; i < weights.length; i++) tot += weights[i];
        var x = r() * tot;
        for (i = 0; i < arr.length; i++) { x -= weights[i]; if (x <= 0) return arr[i]; }
        return arr[arr.length - 1];
    }

    // ---------------------------------------------------------------
    // 3. Viviers rythmiques
    // ---------------------------------------------------------------
    // Une unite est une liste de durees en ticks ; negatif = silence.
    // Les unites ne franchissent jamais une frontiere de temps, sauf la
    // syncope, qui est precisement faite pour ca.
    var UNITS = {
        w: { len: 192, cells: [[192]], at: 'bar' },      // ronde
        h: { len: 96, cells: [[96]], at: 'beat' },      // blanche
        q: { len: 48, cells: [[48]], at: 'beat' },      // noire
        e: { len: 48, cells: [[24, 24]], at: 'beat' },  // deux croches
        r: { len: 48, cells: [[-48]], at: 'beat' },     // soupir
        re: { len: 48, cells: [[-24, 24]], at: 'beat' },// demi-soupir + croche
        dq: { len: 96, cells: [[72, 24]], at: 'beat' }, // noire pointee + croche
        s: {
            len: 48, at: 'beat',
            cells: [[12, 12, 12, 12], [24, 12, 12], [12, 12, 24]]
        },
        syn: { len: 96, cells: [[24, 48, 24]], at: 'beat' },  // syncope
        // mesures composees (6/8) : le temps vaut une noire pointee
        c1: { len: 72, cells: [[72]], at: 'beat' },
        c2: { len: 72, cells: [[48, 24]], at: 'beat' },
        c3: { len: 72, cells: [[24, 24, 24]], at: 'beat' },
        cr: { len: 72, cells: [[-24, 24, 24]], at: 'beat' }
    };

    // ---------------------------------------------------------------
    // 4. L'echelle de difficulte
    // ---------------------------------------------------------------
    // span    : etendue diatonique autorisee a la main droite (4 = les
    //           cinq doigts sans bouger).
    // maxLeap : plus grand intervalle diatonique autorise (1 = conjoint,
    //           2 = tierce, 4 = quinte, 5 = sixte, 7 = octave).
    // shift   : la main droite a-t-elle le droit de changer de position.
    //
    // La table ne dit PAS quelle main joue : c'est l'affaire des options.
    // Un niveau qui se reservait la main droite laissait une portee vide
    // alors que l'utilisateur avait demande deux mains.
    var LEVELS = [
        {
            n: 1, label: 'Cinq doigts, mouvement conjoint',
            labelEn: 'Five-finger position, stepwise motion',
            bars: 8, ts: [[4, 4], [3, 4]], keys: [0], minor: false, chordsPerBar: 1,
            span: 4, maxLeap: 1, shift: false, acc: false,
            rhythm: ['h', 'q', 'w'], lh: 'drone', bpm: 60
        },
        {
            n: 2, label: 'Sauts de tierce',
            labelEn: 'Third leaps',
            bars: 8, ts: [[4, 4], [3, 4]], keys: [0], minor: false, chordsPerBar: 1,
            span: 4, maxLeap: 2, shift: false, acc: false,
            rhythm: ['h', 'q', 'w'], lh: 'drone', bpm: 60
        },
        {
            n: 3, label: 'Croches, basse en tierces et quintes',
            labelEn: 'Eighth notes, bass in thirds and fifths',
            bars: 8, ts: [[4, 4], [3, 4]], keys: [0], minor: false, chordsPerBar: 1,
            span: 4, maxLeap: 2, shift: false, acc: false,
            rhythm: ['h', 'q', 'e'], lh: 'dyad', bpm: 63
        },
        {
            n: 4, label: 'Changement de position, basse d\'Alberti',
            labelEn: 'Position shifts, Alberti bass',
            bars: 8, ts: [[4, 4], [3, 4]], keys: [0], minor: false, chordsPerBar: 1,
            span: 7, maxLeap: 4, shift: true, acc: false,
            rhythm: ['h', 'q', 'e', 'r'], lh: 'alberti', bpm: 63
        },
        {
            n: 5, label: 'Une alteration a la cle, mains dissociees',
            labelEn: 'One sharp or flat, hands in different rhythms',
            bars: 8, ts: [[4, 4], [3, 4]], keys: [1, -1], minor: false, chordsPerBar: 1,
            span: 7, maxLeap: 4, shift: true, acc: false,
            rhythm: ['h', 'q', 'e', 'r', 'dq'], lh: 'alberti', bpm: 66
        },
        {
            n: 6, label: 'Deux alterations, sauts de sixte, doubles croches',
            labelEn: 'Two sharps or flats, sixth leaps, sixteenth notes',
            bars: 8, ts: [[4, 4], [3, 4]], keys: [2, -2], minor: false, chordsPerBar: 2,
            span: 9, maxLeap: 5, shift: true, acc: false,
            rhythm: ['h', 'q', 'e', 'r', 'dq', 's'], lh: 'chord2', bpm: 66
        },
        {
            n: 7, label: 'Mode mineur, accords a trois sons, syncopes',
            labelEn: 'Minor mode, three-note chords, syncopation',
            bars: 12, ts: [[4, 4], [3, 4]], keys: [0, 1, -1, -2], minor: true, chordsPerBar: 2,
            span: 11, maxLeap: 7, shift: true, acc: true,
            rhythm: ['h', 'q', 'e', 'r', 're', 'dq', 's', 'syn'], lh: 'chord3', bpm: 69
        },
        {
            n: 8, label: 'Mesure composee, deux voix independantes',
            labelEn: 'Compound metre, two independent voices',
            bars: 12, ts: [[6, 8]], keys: [0, 1, -1, 2, -2], minor: true, chordsPerBar: 1,
            span: 11, maxLeap: 7, shift: true, acc: true,
            rhythm: ['c1', 'c2', 'c3', 'cr'], lh: 'counter', bpm: 72
        }
    ];

    // ---------------------------------------------------------------
    // 5. Plan harmonique
    // ---------------------------------------------------------------
    // Degres 0..6 = I ii iii IV V vi vii. La grammaire refuse les
    // enchainements qui sonnent faux (V ne recule pas vers IV, etc.).
    var NEXT = {
        0: [1, 3, 4, 5],
        1: [4, 4, 0],
        2: [5, 3],
        3: [4, 4, 0, 1],
        4: [0, 0, 5],
        5: [1, 3, 4]
    };

    // Une phrase de n mesures : I ... puis la cadence.
    // 'half'   -> se pose sur V  (question)
    // 'full'   -> V puis I       (reponse)
    function phrasePlan(r, n, kind) {
        var deg = [0], i;
        var body = kind === 'full' ? n - 2 : n - 1;
        for (i = 1; i < body; i++) {
            // La dominante est reservee a la cadence. Si elle apparait au
            // milieu de la phrase, l'arrivee sur V ne s'entend plus comme
            // une ponctuation et le plan degenere en I V I V.
            var opts = (NEXT[deg[i - 1]] || [0]).filter(function (d) { return d !== 4; });
            if (!opts.length) opts = [0];
            deg.push(pick(r, opts));
        }
        if (kind === 'full') { deg.push(4); deg.push(0); }
        else deg.push(4);
        return deg.slice(0, n);
    }

    function harmonyPlan(r, bars) {
        if (bars <= 4) return phrasePlan(r, bars, 'full');
        var half = bars / 2, plan = [], k;
        if (bars % 2 === 0) {
            plan = phrasePlan(r, half, 'half').concat(phrasePlan(r, half, 'full'));
        } else {
            plan = phrasePlan(r, bars, 'full');
        }
        // les pieces longues respirent en trois phrases
        if (bars === 12) {
            plan = phrasePlan(r, 4, 'half')
                .concat(phrasePlan(r, 4, 'half'))
                .concat(phrasePlan(r, 4, 'full'));
        }
        for (k = plan.length; k < bars; k++) plan.push(0);
        return plan.slice(0, bars);
    }

    // ---------------------------------------------------------------
    // 6. Rythme d'une mesure
    // ---------------------------------------------------------------
    // cad : 0 = mesure ordinaire, 1 = fin de phrase (valeur longue en
    // tete), 2 = derniere mesure (une seule note tenue).
    function measureRhythm(r, lvl, barTicks, beatTicks, cad) {
        if (cad === 2) return [{ on: 0, dur: barTicks, rest: false }];

        var out = [], pos = 0, names = lvl.rhythm, guard = 0;
        while (pos < barTicks && guard++ < 64) {
            var left = barTicks - pos;
            // candidats compatibles avec la place restante et la position
            var ok = [], wts = [];
            for (var i = 0; i < names.length; i++) {
                var u = UNITS[names[i]];
                if (u.len > left) continue;
                if (u.at === 'bar' && (pos !== 0 || left !== u.len)) continue;
                if (u.at === 'beat' && pos % beatTicks !== 0) continue;
                ok.push(names[i]);
                // en tete de phrase on favorise les valeurs longues, pour
                // que l'oreille entende une ponctuation
                wts.push(cad === 1 && pos === 0 ? (u.len >= beatTicks * 2 ? 6 : 1) : 3);
            }
            if (!ok.length) {           // garde-fou : on comble a la noire
                var d = Math.min(beatTicks, left);
                out.push({ on: pos, dur: d, rest: false });
                pos += d;
                continue;
            }
            var cells = UNITS[pickW(r, ok, wts)].cells;
            var cell = cells[Math.floor(r() * cells.length)];
            for (var j = 0; j < cell.length; j++) {
                out.push({ on: pos, dur: Math.abs(cell[j]), rest: cell[j] < 0 });
                pos += Math.abs(cell[j]);
            }
        }
        // jamais de mesure entierement silencieuse
        if (!out.some(function (e) { return !e.rest; })) out[0].rest = false;
        return out;
    }

    // ---------------------------------------------------------------
    // 7. Melodie
    // ---------------------------------------------------------------
    // Regles de conduite de voix, dans l'ordre de priorite :
    //   - temps fort  -> note de l'accord ;
    //   - temps faible -> degre conjoint (note de passage ou broderie) ;
    //   - un saut se resout par un pas en sens contraire ;
    //   - on reste dans la position de la main tant qu'on peut.
    function buildMelody(r, lvl, ctx, plan, rhythms, beatTicks) {
        var tonicD = ctx.tonicD, span = lvl.span;
        var lo = tonicD, hi = tonicD + span;
        var cur = tonicD + (r() < 0.5 ? 0 : 2);
        var posLo = tonicD, lastMove = 0, lastLeap = false;
        var bars = [];

        for (var m = 0; m < rhythms.length; m++) {
            var slots = rhythms[m], notes = [], last = m === rhythms.length - 1;
            for (var i = 0; i < slots.length; i++) {
                var s = slots[i];
                if (s.rest) { notes.push({ on: s.on, dur: s.dur, rest: true }); continue; }

                var deg = chordAt(plan, m, s.on, ctx.barTicks, lvl.chordsPerBar);
                var strong = s.on % beatTicks === 0;
                var tones = [deg, (deg + 2) % 7, (deg + 4) % 7];

                var target;
                if (last && i === slots.length - 1) {
                    // La chute doit rester JOUABLE : se poser sur la tonique
                    // au prix d'un bond de quarte ruinerait le contrat d'un
                    // niveau annonce conjoint.
                    target = finalNote(cur, tonicD, lo, hi, lvl.maxLeap);
                } else {
                    // sur les deux dernieres mesures la melodie converge deja
                    // vers la tonique : c'est ce qui fait entendre une fin
                    var pull = m >= rhythms.length - 2 ? tonicD : null;
                    target = chooseNote(r, cur, strong, tones, tonicD, lo, hi,
                        lvl.maxLeap, lastMove, lastLeap, posLo, lvl.shift, pull);
                }

                var move = target - cur;
                var shifted = false;
                if (target < posLo || target > posLo + 4) {
                    shifted = lvl.shift && !(m === 0 && i === 0);
                    posLo = Math.max(lo, Math.min(hi - 4, target - 2));
                }
                var n = mkNote(target, s.on, s.dur, ctx);
                n.leap = Math.abs(move) >= 3;
                n.shift = shifted;
                notes.push(n);
                lastLeap = Math.abs(move) >= 3;
                lastMove = move;
                cur = target;
            }
            bars.push(notes);
        }
        return bars;
    }

    function chordAt(plan, m, tick, barTicks, perBar) {
        if (perBar < 2) return plan[m];
        // deuxieme accord de la mesure : la dominante ou la sous-dominante
        if (tick < barTicks / 2) return plan[m];
        var d = plan[m];
        return d === 0 ? 4 : d === 4 ? 0 : d === 3 ? 4 : 0;
    }

    // Note finale : la tonique si la main peut l'atteindre, sinon une
    // autre note de l'accord de tonique — une fin sur la tierce reste une
    // fin, un saut interdit reste une faute.
    function finalNote(cur, tonicD, lo, hi, maxLeap) {
        var order = [0, 2, 4], s, d, best = null, bd = 99;
        for (s = 0; s < order.length; s++) {
            best = null; bd = 99;
            for (d = lo; d <= hi; d++) {
                if (((d - tonicD) % 7 + 7) % 7 !== order[s]) continue;
                var a = Math.abs(d - cur);
                if (a <= maxLeap && a < bd) { bd = a; best = d; }
            }
            if (best !== null) return best;
        }
        return Math.max(lo, Math.min(hi, cur));
    }

    function chooseNote(r, cur, strong, tones, tonicD, lo, hi,
        maxLeap, lastMove, lastLeap, posLo, canShift, pull) {
        var cands = [], wts = [];
        for (var d = lo; d <= hi; d++) {
            var step = ((d - tonicD) % 7 + 7) % 7;
            if (strong && tones.indexOf(step) < 0) continue;
            var mv = d - cur, a = Math.abs(mv);
            if (a > maxLeap) continue;
            if (lastLeap && a >= 3) continue;                 // pas deux sauts de suite
            if (lastLeap && mv !== 0 && sign(mv) === sign(lastMove)) continue; // on resout a l'envers
            if (!canShift && (d < posLo || d > posLo + 4)) continue;

            var w = a === 0 ? 0.35 : a === 1 ? 6 : a === 2 ? 2.2 : 1 / a;
            if (!strong && a > 2) w *= 0.25;                  // les temps faibles restent conjoints
            if (a === 1 && sign(mv) === sign(lastMove)) w *= 1.5; // les gammes se poursuivent
            if (d < posLo || d > posLo + 4) w *= 0.45;        // changer de position coute
            if (pull !== null && pull !== undefined) w *= 1 + 1.6 / (1 + Math.abs(d - pull));
            cands.push(d); wts.push(w);
        }
        if (!cands.length) return Math.max(lo, Math.min(hi, cur));
        return pickW(r, cands, wts);
    }

    function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

    // ---------------------------------------------------------------
    // 8. Main gauche
    // ---------------------------------------------------------------
    function buildBass(r, lvl, ctx, plan, rhNotes, beatTicks) {
        var bars = [], barTicks = ctx.barTicks;
        if (lvl.lh === 'none') {
            for (var z = 0; z < plan.length; z++) bars.push([]);
            return bars;
        }
        var base = ctx.bassD;      // tonique grave

        // Plafond : la main gauche doit rester SOUS la main droite. Sans
        // lui, une quinte d'accompagnement pouvait atteindre la note que
        // la main droite jouait au meme instant — deux notes identiques au
        // meme moment, ce qu'un clavier ne peut pas produire.
        var ceil = 99;
        for (var m0 = 0; m0 < rhNotes.length; m0++)
            for (var i0 = 0; i0 < rhNotes[m0].length; i0++)
                if (!rhNotes[m0][i0].rest && rhNotes[m0][i0].d < ceil)
                    ceil = rhNotes[m0][i0].d;
        var floor = base - 7;
        function under(d) {
            while (d >= ceil) d -= 7;
            while (d < floor) d += 7;
            return d;
        }
        for (var m = 0; m < plan.length; m++) {
            var deg = plan[m], notes = [];
            var root = base + deg;
            while (root - base > 6) root -= 7;
            var third = root + 2, fifth = root + 4;
            var lastBar = m === plan.length - 1;

            root = under(root); third = under(third); fifth = under(fifth);

            if (lvl.lh === 'drone') {
                notes.push(mkNote(root, 0, barTicks, ctx));
            } else if (lvl.lh === 'dyad') {
                var halves = barTicks >= 144 ? [0, barTicks / 2] : [0];
                for (var h = 0; h < halves.length; h++) {
                    var dur = barTicks / halves.length;
                    notes.push(mkNote(root, halves[h], dur, ctx));
                    var other = r() < 0.5 ? fifth : third;
                    if (other !== root) notes.push(mkNote(other, halves[h], dur, ctx));
                }
            } else if (lvl.lh === 'alberti') {
                if (lastBar) { notes.push(mkNote(root, 0, barTicks, ctx)); }
                else {
                    var seq = [root, fifth, third, fifth], t = 0, k = 0;
                    var step = beatTicks;
                    while (t < barTicks) {
                        notes.push(mkNote(seq[k % 4], t, step, ctx));
                        t += step; k++;
                    }
                }
            } else if (lvl.lh === 'chord2' || lvl.lh === 'chord3') {
                var hits = lastBar ? [0] : (barTicks >= 144 ? [0, barTicks / 2] : [0]);
                for (var q = 0; q < hits.length; q++) {
                    var d2 = barTicks / hits.length;
                    var set = lvl.lh === 'chord3' ? [root, third, fifth] : [root, fifth];
                    for (var z2 = 0; z2 < set.length; z2++)
                        if (set.indexOf(set[z2]) === z2)   // jamais deux fois la meme
                            notes.push(mkNote(set[z2], hits[q], d2, ctx));
                }
            } else if (lvl.lh === 'counter') {
                // voix independante : note d'accord sur le temps, mouvement
                // contraire a la main droite quand c'est possible
                var slots = counterRhythm(r, barTicks, beatTicks, lastBar);
                var cur = m === 0 ? root : lastBassD(bars, root);
                for (var s = 0; s < slots.length; s++) {
                    var tones = [deg, (deg + 2) % 7, (deg + 4) % 7];
                    var want = slots[s].on % beatTicks === 0;
                    var tgt = under(pickBassStep(r, cur, want ? tones : null, base, ctx.tonicD));
                    notes.push(mkNote(tgt, slots[s].on, slots[s].dur, ctx));
                    cur = tgt;
                }
            }
            bars.push(notes);
        }
        return bars;
    }

    function counterRhythm(r, barTicks, beatTicks, lastBar) {
        if (lastBar) return [{ on: 0, dur: barTicks }];
        var out = [], t = 0;
        while (t < barTicks) {
            var d = r() < 0.4 && t + beatTicks * 2 <= barTicks ? beatTicks * 2 : beatTicks;
            out.push({ on: t, dur: d }); t += d;
        }
        return out;
    }
    function lastBassD(bars, fallback) {
        for (var i = bars.length - 1; i >= 0; i--)
            if (bars[i].length) return bars[i][bars[i].length - 1].d;
        return fallback;
    }
    function pickBassStep(r, cur, tones, base, tonicD) {
        var lo = base - 4, hi = base + 8, cands = [], wts = [];
        for (var d = lo; d <= hi; d++) {
            var st = ((d - tonicD) % 7 + 7) % 7;
            if (tones && tones.indexOf(st) < 0) continue;
            var a = Math.abs(d - cur);
            if (a > 4) continue;
            cands.push(d); wts.push(a === 0 ? 0.4 : a === 1 ? 5 : a === 2 ? 2 : 1);
        }
        if (!cands.length) return cur;
        return pickW(r, cands, wts);
    }

    // ---------------------------------------------------------------
    // 9. Fabrication d'une note
    // ---------------------------------------------------------------
    function mkNote(d, on, dur, ctx) {
        var oct = Math.floor(d / 7), step = d - oct * 7;
        var ka = keyAlter(step, ctx.sharps);
        var alter = ka;
        // mineur harmonique : la sensible est haussee, ce qui produit
        // une alteration accidentelle bien reelle a lire
        if (ctx.minor && ((d - ctx.tonicD) % 7 + 7) % 7 === 6) alter = ka + 1;
        return {
            d: d, step: step, oct: oct, alter: alter,
            midi: midiOf(d, alter), on: on, dur: dur,
            acc: alter !== ka, rest: false, leap: false, shift: false
        };
    }

    // ---------------------------------------------------------------
    // 10. Variantes : quelle main, quel contenu
    // ---------------------------------------------------------------
    var CONTENTS = ['melody', 'fifths', 'fifths7', 'chords'];
    var HANDSETS = ['both', 'rh', 'lh'];

    function normOpts(o) {
        o = o || {};
        return {
            hands: HANDSETS.indexOf(o.hands) >= 0 ? o.hands : 'both',
            content: CONTENTS.indexOf(o.content) >= 0 ? o.content : 'melody'
        };
    }

    // Ce qu'on empile sur la note lue, en degres de portee.
    function stackOffsets(r, content) {
        if (content === 'fifths') return [4];
        if (content === 'fifths7') return [r() < 0.5 ? 4 : 6];
        return r() < 0.5 ? [2, 4] : [2, 4, 6];
    }

    function emptyBars(n) {
        var a = [];
        for (var i = 0; i < n; i++) a.push([]);
        return a;
    }

    // dir vaut +1 a la main droite, -1 a la main gauche : un accord de
    // main gauche se lit du haut vers le bas, et c'est ce qui l'empeche
    // de deborder de la portee de fa.
    function stackBars(r, bars, ctx, content, dir) {
        for (var m = 0; m < bars.length; m++) {
            var add = [];
            for (var i = 0; i < bars[m].length; i++) {
                var n = bars[m][i];
                if (n.rest) continue;
                var offs = stackOffsets(r, content);
                for (var k = 0; k < offs.length; k++)
                    add.push(mkNote(n.d + dir * offs[k], n.on, n.dur, ctx));
            }
            bars[m] = bars[m].concat(add);
            bars[m].sort(function (a, b) { return a.on - b.on || a.d - b.d; });
        }
    }

    // ---------------------------------------------------------------
    // 11. Assemblage
    // ---------------------------------------------------------------
    function generate(levelNo, seed, opts) {
        var O = normOpts(opts);
        var lvl = LEVELS[Math.max(1, Math.min(LEVELS.length, levelNo)) - 1];
        var r = rng(seed >>> 0);

        var ts = pick(r, lvl.ts);
        var num = ts[0], den = ts[1];
        var barTicks = num * (TPQ * 4 / den);
        var beatTicks = den === 8 ? TPQ * 3 / 2 : TPQ;   // 6/8 : le temps est pointe
        var compound = den === 8;
        if (compound) beatTicks = TPQ + TPQ / 2;

        var sharps = pick(r, lvl.keys);
        var minor = lvl.minor && r() < 0.5;

        // tonique de la main droite, placee autour de do4 (d = 28)
        var tonicStep = tonicStepFor(sharps, minor);
        var tonicD = nearTo(tonicStep, 28);
        var bassD = nearTo(tonicStep, 21);               // autour de do3

        var ctx = {
            sharps: sharps, minor: minor, tonicD: tonicD, bassD: bassD,
            barTicks: barTicks
        };

        // Un accord de septieme en doubles croches ne se lit pas, et lire
        // des intervalles empiles ne demande pas une ligne large mais une
        // basse qui bouge peu. On derive donc le niveau au lieu de
        // l'appliquer tel quel — la tonalite et la mesure, elles, restent
        // celles du niveau choisi.
        var beat = compound ? beatTicks : TPQ;
        if (O.content !== 'melody' || O.hands === 'lh') {
            var base = lvl, k2;
            lvl = {};
            for (k2 in base) lvl[k2] = base[k2];
        }
        if (O.content !== 'melody') {
            lvl.span = Math.min(lvl.span, 4);
            lvl.maxLeap = Math.min(lvl.maxLeap, 2);
            lvl.rhythm = lvl.rhythm.filter(function (name) {
                return UNITS[name].cells.every(function (cell) {
                    return cell.every(function (d) { return Math.abs(d) >= beat; });
                });
            });
            if (!lvl.rhythm.length) lvl.rhythm = ['q'];
            // Demander des quintes et recevoir une basse d'Alberti par
            // dessous n'est pas ce qu'on a demande : quand le contenu est
            // empile, la basse se tient et l'exercice porte sur les
            // intervalles, sur rien d'autre.
            if (lvl.lh !== 'none') lvl.lh = 'drone';
        }
        // Main gauche seule : la ligne s'ecrit directement dans le registre
        // grave, et on la cale pour qu'elle tienne entre mi2 et do4 —
        // l'empilement vers le bas compris. Le calage se fait par octaves
        // entieres, sinon le degre de la sensible se decalerait avec lui.
        if (O.hands === 'lh') {
            // La ligne doit tenir entre do2 et do4, empilement compris.
            // Quand elle porte des accords, c'est l'empilement qui occupe
            // la place : la ligne, elle, bouge alors d'une tierce au plus.
            lvl.span = Math.min(lvl.span, O.content === 'melody' ? 7 : 2);
            var deep = O.content === 'melody' ? 0 : 6;
            var lowD = 14 + deep, hiD = 28 - lvl.span;
            // la fenetre couvre au moins sept degres, donc chaque tonalite
            // y a exactement un representant
            tonicD = nearTo(tonicStep, Math.round((lowD + hiD) / 2));
            while (tonicD < lowD) tonicD += 7;
            while (tonicD > hiD) tonicD -= 7;
            ctx.tonicD = tonicD;
        }

        var plan = harmonyPlan(r, lvl.bars);

        var rhythms = [], m;
        for (m = 0; m < lvl.bars; m++) {
            var cad = m === lvl.bars - 1 ? 2 : ((m + 1) % 4 === 0 ? 1 : 0);
            rhythms.push(measureRhythm(r, lvl, barTicks, compound ? beatTicks : TPQ, cad));
        }

        var rh = buildMelody(r, lvl, ctx, plan, rhythms, beat);
        var lh = O.hands === 'both'
            ? buildBass(r, lvl, ctx, plan, rh, beat)
            : emptyBars(lvl.bars);

        // A la main gauche, les intervalles s'empilent vers le bas : c'est
        // ainsi qu'on ecrit un accord de main gauche, et c'est ce qui le
        // garde sur sa portee.
        var dir = O.hands === 'lh' ? -1 : 1;
        if (O.content !== 'melody') stackBars(r, rh, ctx, O.content, dir);
        if (O.hands === 'lh') { lh = rh; rh = emptyBars(lvl.bars); }

        var measures = [];
        for (m = 0; m < lvl.bars; m++) measures.push({ rh: rh[m] || [], lh: lh[m] || [] });

        var piece = {
            level: lvl.n, levelLabel: levelLabel(lvl), seed: seed >>> 0,
            sharps: sharps, minor: minor, tonicStep: tonicStep,
            keyName: keyName(sharps, minor),
            ts: { num: num, den: den }, barTicks: barTicks, beatTicks: beatTicks,
            compound: compound, tpq: TPQ, bpm: lvl.bpm, bars: lvl.bars,
            plan: plan, measures: measures, variant: O
        };
        piece.sig = signature(piece);
        return piece;
    }

    // Tonique : do majeur a 0, on suit le cycle des quintes.
    function tonicStepFor(sharps, minor) {
        var majorStep = ((sharps * 4) % 7 + 7) % 7;      // 0 do, 1 sol(4), ...
        return minor ? (majorStep + 5) % 7 : majorStep;
    }
    function nearTo(step, target) {
        var oct = Math.round((target - step) / 7);
        return oct * 7 + step;
    }

    // Les noms de notes different d'une langue a l'autre : do majeur se dit
    // C major. Une seule source, deux tables, pas deux fichiers.
    var NAMES = {
        fr: {
            MAJ: ['Do', 'Sol', 'Re', 'La', 'Mi', 'Si', 'Fa#', 'Do#'],
            MAJb: ['Do', 'Fa', 'Si b', 'Mi b', 'La b', 'Re b', 'Sol b', 'Do b'],
            MIN: ['La', 'Mi', 'Si', 'Fa#', 'Do#', 'Sol#', 'Re#', 'La#'],
            MINb: ['La', 'Re', 'Sol', 'Do', 'Fa', 'Si b', 'Mi b', 'La b'],
            maj: ' majeur', min: ' mineur'
        },
        en: {
            MAJ: ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'],
            MAJb: ['C', 'F', 'B flat', 'E flat', 'A flat', 'D flat', 'G flat', 'C flat'],
            MIN: ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'],
            MINb: ['A', 'D', 'G', 'C', 'F', 'B flat', 'E flat', 'A flat'],
            maj: ' major', min: ' minor'
        }
    };
    var LANG = 'fr';
    function setLang(l) { LANG = l === 'en' ? 'en' : 'fr'; return LANG; }
    function keyName(sharps, minor, lang) {
        var N = NAMES[lang || LANG] || NAMES.fr;
        var i = Math.abs(sharps);
        var t = minor ? (sharps >= 0 ? N.MIN[i] : N.MINb[i])
            : (sharps >= 0 ? N.MAJ[i] : N.MAJb[i]);
        return t + (minor ? N.min : N.maj);
    }
    function levelLabel(lvl) { return LANG === 'en' ? lvl.labelEn : lvl.label; }

    // Empreinte du contenu : sert a ne jamais resservir la meme piece.
    function signature(p) {
        var s = p.level + '|' + p.sharps + '|' + (p.minor ? 'm' : 'M') + '|'
            + p.ts.num + '/' + p.ts.den;
        // une variante n'est pas la meme piece : on ne veut pas qu'une
        // lecture en quintes brule la melodie correspondante
        if (p.variant && (p.variant.hands !== 'both' || p.variant.content !== 'melody'))
            s += '|' + p.variant.hands + ':' + p.variant.content;
        for (var m = 0; m < p.measures.length; m++) {
            var mm = p.measures[m];
            s += '|';
            for (var i = 0; i < mm.rh.length; i++)
                s += (mm.rh[i].rest ? 'r' : mm.rh[i].midi) + ':' + mm.rh[i].dur + ',';
            s += ';';
            for (var j = 0; j < mm.lh.length; j++)
                s += mm.lh[j].midi + ':' + mm.lh[j].dur + ',';
        }
        var h = 2166136261;
        for (var k = 0; k < s.length; k++) {
            h ^= s.charCodeAt(k);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(36);
    }

    // ---------------------------------------------------------------
    // 11. Services derives
    // ---------------------------------------------------------------

    // Toutes les notes reelles, dans l'ordre de jeu, avec leur date en ms.
    // C'est ce que la mesure de la performance compare au jeu reel.
    function timeline(piece, bpm) {
        var msPerTick = 60000 / (bpm || piece.bpm) / piece.tpq;
        var out = [];
        for (var m = 0; m < piece.measures.length; m++) {
            var base = m * piece.barTicks;
            ['rh', 'lh'].forEach(function (hand) {
                var arr = piece.measures[m][hand];
                for (var i = 0; i < arr.length; i++) {
                    var n = arr[i];
                    if (n.rest) continue;
                    out.push({
                        hand: hand === 'rh' ? 'R' : 'L', midi: n.midi,
                        tick: base + n.on, ms: (base + n.on) * msPerTick,
                        durMs: n.dur * msPerTick, bar: m,
                        leap: !!n.leap, shift: !!n.shift, acc: !!n.acc
                    });
                }
            });
        }
        out.sort(function (a, b) { return a.tick - b.tick || a.midi - b.midi; });
        return out;
    }

    // Les endroits que la pre-lecture doit montrer, puis effacer.
    // Les DEUX mains comptent : une alteration a la main gauche est une
    // difficulte de lecture au meme titre qu'a la main droite.
    function hotspots(piece) {
        var out = [], hands = ['rh', 'lh'];
        for (var m = 0; m < piece.measures.length; m++) {
            for (var h = 0; h < hands.length; h++) {
                var arr = piece.measures[m][hands[h]] || [];
                for (var i = 0; i < arr.length; i++) {
                    var n = arr[i];
                    if (n.rest) continue;
                    var why = n.acc ? 'alteration' : n.shift ? 'position' : n.leap ? 'saut' : null;
                    if (why) out.push({
                        bar: m, on: n.on, midi: n.midi, why: why,
                        hand: hands[h] === 'rh' ? 'R' : 'L'
                    });
                }
            }
        }
        return out;
    }

    function durationMs(piece, bpm) {
        return piece.bars * piece.barTicks * (60000 / (bpm || piece.bpm) / piece.tpq);
    }

    return {
        TPQ: TPQ, LEVELS: LEVELS, generate: generate, timeline: timeline,
        hotspots: hotspots, durationMs: durationMs, signature: signature,
        keyAlter: keyAlter, midiOf: midiOf, keyName: keyName, rng: rng,
        setLang: setLang, levelLabel: levelLabel,
        CONTENTS: CONTENTS, HANDSETS: HANDSETS, normOpts: normOpts
    };
}));
