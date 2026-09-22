/* ------------------------------------------------------------------
   sightread-render.js — gravure d'une piece generee, en SVG.

   Les symboles ne sont plus dessines a la main : ils viennent de BRAVURA,
   la police de reference du standard SMuFL, extraite en chemins par
   extract_glyphs.py (voir sightread-glyphs.js). Des ellipses et des
   caracteres Unicode donnaient une partition « a peu pres » ; ici les
   tetes, les cles, les alterations, les silences et les crochets sont
   ceux d'une vraie gravure, et surtout ils sont PROPORTIONNES entre eux,
   parce que SMuFL exprime tout en interlignes de portee.

   Geometrie reprise d'extrait.html pour que les pages se ressemblent,
   avec trois ajouts dont la lecture a vue ne peut pas se passer :

     1. l'ARMATURE est gravee. Sans elle on lit des alterations isolees
        au lieu d'une tonalite, ce qui est l'inverse de ce qu'on entraine ;
     2. les SILENCES ont des symboles. Un silence absent se lit comme une
        erreur de rythme ;
     3. l'espacement est PROPORTIONNEL A LA DUREE. extrait.html espacait
        uniformement : une ronde occupait la meme largeur qu'une double
        croche. A l'oeil, cela enseigne un rythme faux.

   Entree : le modele temporel du generateur. Sortie : du SVG, plus une
   table des positions, dont la page se sert ensuite pour situer les
   notes jouees sur la partition.
   ------------------------------------------------------------------ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports)
        module.exports = factory(require('./sightread-glyphs.js'));
    else root.SightRender = factory(root.SightGlyphs);
}(typeof self !== 'undefined' ? self : this, function (GL) {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';

    // Geometrie : reprise telle quelle d'extrait.html.
    var T_TOP = 40, T_BOTTOM = 96, T_REF = 30;   // portee de sol : mi4 = ligne du bas
    var B_TOP = 150, B_BOTTOM = 206, B_REF = 18; // portee de fa  : sol2 = ligne du bas
    var GAP = 14, STEP = 7;                      // GAP = un interligne, en pixels
    var INK = '#111';

    // Epaisseurs recommandees par SMuFL, en interlignes.
    var W_STAFF = 0.13 * GAP, W_LEDGER = 0.16 * GAP;
    var W_STEM = 0.12 * GAP, W_BEAM = 0.5 * GAP, BEAM_GAP = 0.25 * GAP;
    var W_BAR = 0.16 * GAP, W_BARTHICK = 0.5 * GAP;
    var STEM_LEN = 3.5 * GAP;                    // hampe standard : 3,5 interlignes

    // Lignes de portee ou se posent les alterations a la cle, dans l'ordre.
    var KS_SHARP = { t: [38, 35, 39, 36, 33, 37, 34], b: [24, 21, 25, 22, 19, 23, 20] };
    var KS_FLAT = { t: [34, 37, 33, 36, 32, 35, 31], b: [20, 23, 19, 22, 18, 21, 17] };

    // Les cles se posent sur LEUR note : sol4 pour la cle de sol,
    // fa3 pour la cle de fa. C'est ce qui donne son nom a la cle.
    var D_G4 = 32, D_F3 = 24;

    var STEP_PC = [0, 2, 4, 5, 7, 9, 11];
    var SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
    var FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

    function keyAlter(step, sharps) {
        var i;
        if (sharps > 0) { for (i = 0; i < sharps; i++) if (SHARP_ORDER[i] === step) return 1; }
        else if (sharps < 0) { for (i = 0; i < -sharps; i++) if (FLAT_ORDER[i] === step) return -1; }
        return 0;
    }

    function el(tag, attrs) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    }
    function yOf(d, side) {
        return side === 't' ? T_BOTTOM - (d - T_REF) * STEP : B_BOTTOM - (d - B_REF) * STEP;
    }

    // ---------------------------------------------------------------
    // 1. Pose d'un glyphe
    // ---------------------------------------------------------------
    // Les chemins sont exprimes en interlignes : une seule mise a
    // l'echelle suffit, et tous les symboles restent proportionnes.
    function glyph(svg, name, x, y, cls, attrs) {
        var g = GL[name];
        if (!g) return null;
        var e = el('path', {
            d: g.d, fill: INK,
            transform: 'translate(' + r2(x) + ' ' + r2(y) + ') scale(' + GAP + ')'
        });
        if (cls) e.setAttribute('class', cls);
        // de quoi retrouver une note precise dans le dessin, pour la
        // colorier apres coup
        if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
        svg.appendChild(e);
        return g;
    }
    // centre horizontalement sur x
    function glyphMid(svg, name, x, y, cls, attrs) {
        var g = GL[name];
        if (!g) return null;
        return glyph(svg, name, x - (g.box[0] + g.box[2]) / 2 * GAP, y, cls, attrs);
    }
    function halfWidth(name) {
        var g = GL[name];
        return g ? (g.box[2] - g.box[0]) / 2 * GAP : 7;
    }
    function r2(v) { return Math.round(v * 100) / 100; }

    // ---------------------------------------------------------------
    // 2. Duree -> apparence
    // ---------------------------------------------------------------
    var HEAD_GLYPH = { w: 'noteheadWhole', h: 'noteheadHalf', q: 'noteheadBlack' };
    var REST_GLYPH = { w: 'restWhole', h: 'restHalf', q: 'restQuarter', e: 'rest8th', s: 'rest16th' };

    function look(dur, tpq) {
        var q = dur / tpq;
        var table = [
            [4, 'w', false, 0], [3, 'h', true, 0], [2, 'h', false, 0],
            [1.5, 'q', true, 0], [1, 'q', false, 0],
            [0.75, 'q', true, 1], [0.5, 'q', false, 1],
            [0.375, 'q', true, 2], [0.25, 'q', false, 2],
            [0.125, 'q', false, 3]
        ];
        for (var i = 0; i < table.length; i++)
            if (Math.abs(q - table[i][0]) < 1e-6)
                return { head: table[i][1], dot: table[i][2], flags: table[i][3] };
        var best = table[0];
        for (var j = 0; j < table.length; j++)
            if (Math.abs(q - table[j][0]) < Math.abs(q - best[0])) best = table[j];
        return { head: best[1], dot: best[2], flags: best[3] };
    }

    // ---------------------------------------------------------------
    // 3. Regroupement en colonnes
    // ---------------------------------------------------------------
    // Une colonne = un instant. Les deux mains partagent les colonnes,
    // sinon les notes simultanees ne seraient pas alignees verticalement.
    function columns(bar) {
        var map = {};
        ['rh', 'lh'].forEach(function (h) {
            (bar[h] || []).forEach(function (n) {
                var c = map[n.on] || (map[n.on] = { on: n.on, t: [], b: [], tRest: null, bRest: null });
                var side = h === 'rh' ? 't' : 'b';
                if (n.rest) c[side === 't' ? 'tRest' : 'bRest'] = n;
                else c[side].push(n);
            });
        });
        var out = [];
        for (var k in map) out.push(map[k]);
        out.sort(function (a, b) { return a.on - b.on; });
        return out;
    }

    function colDur(c, barTicks, next) {
        var ds = [];
        c.t.concat(c.b).forEach(function (n) { ds.push(n.dur); });
        if (c.tRest) ds.push(c.tRest.dur);
        if (c.bRest) ds.push(c.bRest.dur);
        var gap = (next === undefined ? barTicks : next) - c.on;
        return Math.max(1, Math.min(gap, ds.length ? Math.min.apply(null, ds) : gap));
    }

    // ---------------------------------------------------------------
    // 4. Barres de croches
    // ---------------------------------------------------------------
    // On ne ligature qu'a l'interieur d'un temps : c'est ce qui rend le
    // temps visible, et donc le rythme lisible.
    function beams(cols, side, beatTicks, tpq) {
        var groups = [], cur = null;
        for (var i = 0; i < cols.length; i++) {
            var c = cols[i], notes = c[side];
            var rest = side === 't' ? c.tRest : c.bRest;
            var lk = notes.length ? look(notes[0].dur, tpq) : null;
            if (!notes.length || !lk.flags || rest) { cur = null; continue; }
            var beat = Math.floor(c.on / beatTicks);
            if (cur && cur.beat === beat) { cur.idx.push(i); cur.flags = Math.max(cur.flags, lk.flags); }
            else { cur = { beat: beat, idx: [i], flags: lk.flags }; groups.push(cur); }
        }
        return groups.filter(function (g) { return g.idx.length > 1; });
    }

    // ---------------------------------------------------------------
    // 5. Gravure
    // ---------------------------------------------------------------
    function draw(svg, piece, opts) {
        opts = opts || {};
        var from = opts.fromBar || 0;
        var to = opts.toBar === undefined ? piece.bars : opts.toBar;
        var W = opts.width || 900;
        var tpq = piece.tpq, beatTicks = piece.compound ? tpq + tpq / 2 : tpq;

        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var positions = [];

        var nAcc = Math.abs(piece.sharps);
        var accW = nAcc ? (GL[piece.sharps > 0 ? 'accidentalSharp' : 'accidentalFlat'].w * GAP * 0.86) : 0;
        var tsW = opts.showTimeSig === false ? 0 : GL.timeSig4.w * GAP + 6;
        var headW = 16 + GL.gClef.w * GAP + 8 + nAcc * accW + tsW + 8;

        // --- largeur de chaque mesure, proportionnelle a son contenu
        var bars = [], totalW = 0, m, i;
        for (m = from; m < to; m++) {
            var cols = columns(piece.measures[m]);
            var w = 0;
            for (i = 0; i < cols.length; i++) {
                var next = i + 1 < cols.length ? cols[i + 1].on : piece.barTicks;
                // racine de la duree : c'est l'usage en gravure, une ronde
                // est plus large qu'une noire sans l'etre quatre fois
                w += 18 + 30 * Math.pow(colDur(cols[i], piece.barTicks, next) / tpq, 0.55);
            }
            bars.push({ cols: cols, w: w, index: m });
            totalW += w;
        }
        var avail = W - headW - 18;
        var scale = totalW > 0 ? avail / totalW : 1;

        // --- etendue verticale reelle (hampes et lignes suppl. comprises)
        var minY = T_TOP, maxY = B_BOTTOM;
        bars.forEach(function (bd) {
            bd.cols.forEach(function (c) {
                c.t.forEach(function (n) { var y = yOf(n.d, 't'); if (y < minY) minY = y; if (y > maxY) maxY = y; });
                c.b.forEach(function (n) { var y = yOf(n.d, 'b'); if (y < minY) minY = y; if (y > maxY) maxY = y; });
            });
        });
        var top = Math.min(T_TOP, minY - 40), bot = Math.max(B_BOTTOM, maxY + 40);
        svg.setAttribute('viewBox', '0 ' + top.toFixed(1) + ' ' + W + ' ' + (bot - top).toFixed(1));

        // --- portees
        [T_TOP, B_TOP].forEach(function (t0) {
            for (var k = 0; k < 5; k++)
                svg.appendChild(el('line', {
                    x1: 12, y1: t0 + k * GAP, x2: W - 8, y2: t0 + k * GAP,
                    stroke: INK, 'stroke-width': W_STAFF
                }));
        });
        svg.appendChild(el('line', {
            x1: 12, y1: T_TOP, x2: 12, y2: B_BOTTOM, stroke: INK, 'stroke-width': W_BARTHICK
        }));

        // --- cles, posees sur leur note
        glyph(svg, 'gClef', 16, yOf(D_G4, 't'), 'sr-clef');
        glyph(svg, 'fClef', 16, yOf(D_F3, 'b'), 'sr-clef');

        // --- armature
        var kx = 16 + GL.gClef.w * GAP + 8;
        if (nAcc) {
            var tbl = piece.sharps > 0 ? KS_SHARP : KS_FLAT;
            var sym = piece.sharps > 0 ? 'accidentalSharp' : 'accidentalFlat';
            for (var a = 0; a < nAcc; a++)
                ['t', 'b'].forEach(function (side) {
                    glyph(svg, sym, kx + a * accW, yOf(tbl[side][a], side), 'sr-key');
                });
        }

        // --- chiffrage de mesure : numerateur et denominateur centres sur
        //     la deuxieme et la quatrieme ligne de chaque portee
        var tx = kx + nAcc * accW + 6;
        if (opts.showTimeSig !== false) {
            [T_TOP, B_TOP].forEach(function (t0) {
                glyphMid(svg, 'timeSig' + piece.ts.num, tx + GL.timeSig4.w * GAP / 2, t0 + GAP, 'sr-ts');
                glyphMid(svg, 'timeSig' + piece.ts.den, tx + GL.timeSig4.w * GAP / 2, t0 + 3 * GAP, 'sr-ts');
            });
        }

        // --- mesures
        var x = headW;
        bars.forEach(function (bd, bi) {
            var bw = bd.w * scale;
            if (bi > 0)
                svg.appendChild(el('line', {
                    x1: x, y1: T_TOP, x2: x, y2: B_BOTTOM, stroke: INK, 'stroke-width': W_BAR
                }));
            // le contenu de la mesure vit dans son propre groupe : la page
            // peut le masquer d'un coup, la portee restant en place
            var g = el('g', { 'class': 'sr-bar', 'data-bar': bd.index });
            svg.appendChild(g);
            drawBar(g, piece, bd, x, bw, tpq, beatTicks, positions, opts);
            x += bw;
        });

        // double barre finale
        svg.appendChild(el('line', {
            x1: x - 6, y1: T_TOP, x2: x - 6, y2: B_BOTTOM, stroke: INK, 'stroke-width': W_BAR
        }));
        svg.appendChild(el('line', {
            x1: x - 1, y1: T_TOP, x2: x - 1, y2: B_BOTTOM, stroke: INK, 'stroke-width': W_BARTHICK
        }));

        return positions;
    }

    // svg est ici le GROUPE de la mesure, pas la racine.
    function drawBar(svg, piece, bd, mx, mw, tpq, beatTicks, positions, opts) {
        var cols = bd.cols, xs = [], acc = {}, i;

        var unit = [];
        for (i = 0; i < cols.length; i++) {
            var next = i + 1 < cols.length ? cols[i + 1].on : piece.barTicks;
            unit.push(18 + 30 * Math.pow(colDur(cols[i], piece.barTicks, next) / tpq, 0.55));
        }
        var sum = unit.reduce(function (a, b) { return a + b; }, 0) || 1;
        var run = 0;
        for (i = 0; i < cols.length; i++) {
            xs.push(mx + (run + unit[i] * 0.45) / sum * mw);
            run += unit[i];
        }

        var drawn = { t: [], b: [] };
        for (i = 0; i < cols.length; i++)
            ['t', 'b'].forEach(function (side) {
                drawn[side][i] = drawColumn(svg, piece, cols[i], xs[i], side, tpq,
                    acc, positions, bd.index, opts);
            });

        // --- ligatures
        ['t', 'b'].forEach(function (side) {
            beams(cols, side, beatTicks, tpq).forEach(function (g) {
                var ups = g.idx.filter(function (k) { return drawn[side][k] && drawn[side][k].up; }).length;
                var up = ups >= g.idx.length / 2;
                var beamY = up ? Infinity : -Infinity;
                g.idx.forEach(function (k) {
                    var d = drawn[side][k];
                    var tip = up ? d.minY - STEM_LEN : d.maxY + STEM_LEN;
                    beamY = up ? Math.min(beamY, tip) : Math.max(beamY, tip);
                });
                g.idx.forEach(function (k) {
                    var d = drawn[side][k];
                    var sx = up ? d.x + d.hw - W_STEM / 2 : d.x - d.hw + W_STEM / 2;
                    svg.appendChild(el('line', {
                        x1: sx, y1: up ? d.maxY : d.minY, x2: sx, y2: beamY,
                        stroke: INK, 'stroke-width': W_STEM
                    }));
                    d.stemDone = true; d.stemX = sx;
                });
                var x1 = drawn[side][g.idx[0]].stemX;
                var x2 = drawn[side][g.idx[g.idx.length - 1]].stemX;
                for (var bl = 0; bl < g.flags; bl++) {
                    var off = (up ? 1 : -1) * bl * (W_BEAM + BEAM_GAP);
                    svg.appendChild(el('rect', {
                        x: Math.min(x1, x2) - W_STEM / 2, y: beamY + off - (up ? 0 : W_BEAM),
                        width: Math.abs(x2 - x1) + W_STEM, height: W_BEAM, fill: INK
                    }));
                }
            });
        });

        // --- hampes et crochets isoles
        for (i = 0; i < cols.length; i++)
            ['t', 'b'].forEach(function (side) {
                var d = drawn[side][i];
                if (!d || d.stemDone || d.noStem) return;
                var up = d.up;
                var sx = up ? d.x + d.hw - W_STEM / 2 : d.x - d.hw + W_STEM / 2;
                var y2 = up ? d.minY - STEM_LEN : d.maxY + STEM_LEN;
                svg.appendChild(el('line', {
                    x1: sx, y1: up ? d.maxY : d.minY, x2: sx, y2: y2,
                    stroke: INK, 'stroke-width': W_STEM
                }));
                if (d.flags) {
                    var name = (d.flags >= 2 ? 'flag16th' : 'flag8th') + (up ? 'Up' : 'Down');
                    glyph(svg, name, sx - (up ? W_STEM / 2 : -W_STEM / 2), y2, 'sr-flag');
                }
            });
    }

    function drawColumn(svg, piece, c, x, side, tpq, acc, positions, barIndex, opts) {
        var notes = c[side];
        var rest = side === 't' ? c.tRest : c.bRest;
        var top = side === 't' ? T_TOP : B_TOP;
        var bottom = side === 't' ? T_BOTTOM : B_BOTTOM;

        if (rest) drawRest(svg, x, top, rest.dur, tpq);
        if (!notes.length) return null;

        var lk = look(notes[0].dur, tpq);
        var head = HEAD_GLYPH[lk.head];
        var hw = halfWidth(head);
        var minY = Infinity, maxY = -Infinity, sumD = 0;

        notes.forEach(function (n) {
            var y = yOf(n.d, side);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            sumD += n.d;

            // lignes supplementaires
            var ly, half = hw + 0.34 * GAP;
            if (y < top) for (ly = top - GAP; ly >= y - 1; ly -= GAP)
                svg.appendChild(el('line', {
                    x1: x - half, y1: ly, x2: x + half, y2: ly, stroke: INK, 'stroke-width': W_LEDGER
                }));
            if (y > bottom) for (ly = bottom + GAP; ly <= y + 1; ly += GAP)
                svg.appendChild(el('line', {
                    x1: x - half, y1: ly, x2: x + half, y2: ly, stroke: INK, 'stroke-width': W_LEDGER
                }));

            glyphMid(svg, head, x, y, 'sr-head', {
                'data-bar': barIndex, 'data-on': n.on, 'data-midi': n.midi
            });

            // Alteration : seulement si elle differe de ce qui est deja en
            // vigueur dans la mesure — c'est la regle de lecture reelle.
            var key = n.step + '/' + n.oct;
            var eff = key in acc ? acc[key] : keyAlter(n.step, piece.sharps);
            if (n.alter !== eff) {
                var an = n.alter === 1 ? 'accidentalSharp'
                    : n.alter === -1 ? 'accidentalFlat' : 'accidentalNatural';
                glyph(svg, an, x - hw - 0.28 * GAP - GL[an].box[2] * GAP, y, 'sr-acc');
                acc[key] = n.alter;
            }

            if (lk.dot) {
                var ref = side === 't' ? T_REF : B_REF;
                var onLine = (((n.d - ref) % 2) + 2) % 2 === 0;
                glyph(svg, 'augmentationDot', x + hw + 0.3 * GAP, y - (onLine ? STEP : 0), 'sr-dot');
            }

            positions.push({
                bar: barIndex, on: n.on, midi: n.midi, hand: side === 't' ? 'R' : 'L',
                x: x, y: y, leap: !!n.leap, shift: !!n.shift, acc: !!n.acc
            });

            // pre-lecture : on montre l'endroit difficile, puis on l'efface
            if (opts.showHotspots && (n.acc || n.shift || n.leap)) {
                var halo = el('circle', {
                    cx: x, cy: y, r: 13, fill: 'none',
                    stroke: n.acc ? '#c2410c' : n.shift ? '#7c3aed' : '#2563eb',
                    'stroke-width': 2, opacity: 0.75
                });
                halo.setAttribute('class', 'sr-hot');
                svg.appendChild(halo);
            }
        });

        var mid = side === 't' ? 33 : 21;
        return {
            x: x, minY: minY, maxY: maxY, flags: lk.flags, hw: hw,
            up: (sumD / notes.length) < mid, noStem: lk.head === 'w'
        };
    }

    // La pause pend sous la quatrieme ligne, la demi-pause se pose sur la
    // troisieme : c'est ce qui les distingue a la lecture.
    function drawRest(svg, x, top, dur, tpq) {
        var q = dur / tpq, name, y;
        if (q >= 3.5) { name = 'restWhole'; y = top + GAP; }
        else if (q >= 1.75) { name = 'restHalf'; y = top + 2 * GAP; }
        else if (q >= 0.9) { name = 'restQuarter'; y = top + 2 * GAP; }
        else if (q >= 0.45) { name = 'rest8th'; y = top + 2 * GAP; }
        else { name = 'rest16th'; y = top + 2 * GAP; }
        glyphMid(svg, name, x, y, 'sr-rest');
    }

    // ---------------------------------------------------------------
    // 6. Decoupe en systemes
    // ---------------------------------------------------------------
    // La partition se lit page par page, pas en defilement : un
    // defilement impose son propre tempo de lecture et FOURNIT l'avance
    // que l'exercice cherche justement a faire construire.
    function systems(piece, barsPerSystem) {
        var n = barsPerSystem || 4, out = [];
        for (var i = 0; i < piece.bars; i += n)
            out.push({ from: i, to: Math.min(piece.bars, i + n) });
        return out;
    }

    function clearHotspots(svg) {
        var hot = svg.querySelectorAll('.sr-hot');
        for (var i = 0; i < hot.length; i++) hot[i].parentNode.removeChild(hot[i]);
        return hot.length;
    }

    return {
        draw: draw, systems: systems, clearHotspots: clearHotspots,
        look: look, columns: columns, keyAlter: keyAlter, yOf: yOf,
        glyphs: GL, GAP: GAP
    };
}));
