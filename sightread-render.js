/* ------------------------------------------------------------------
   sightread-render.js — gravure d'une piece generee, en SVG.

   Reprend la geometrie du graveur d'extrait.html (memes constantes de
   portee, memes tetes, memes hampes) mais change trois choses, qui sont
   justement celles dont la lecture a vue ne peut pas se passer :

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
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SightRender = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';

    // Geometrie : reprise telle quelle d'extrait.html pour que les deux
    // pages aient la meme allure.
    var T_TOP = 40, T_BOTTOM = 96, T_REF = 30;   // portee de sol : mi4 = ligne du bas
    var B_TOP = 150, B_BOTTOM = 206, B_REF = 18; // portee de fa  : sol2 = ligne du bas
    var GAP = 14, STEP = 7;
    var INK = '#111';

    // Position des alterations a la cle, dans l'ordre reglementaire.
    var KS_SHARP = { t: [38, 35, 39, 36, 33, 37, 34], b: [24, 21, 25, 22, 19, 23, 20] };
    var KS_FLAT = { t: [34, 37, 33, 36, 32, 35, 31], b: [20, 23, 19, 22, 18, 21, 17] };

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
        return side === 't' ? B(T_BOTTOM, d, T_REF) : B(B_BOTTOM, d, B_REF);
    }
    function B(bottom, d, ref) { return bottom - (d - ref) * STEP; }

    // ---------------------------------------------------------------
    // 1. Duree -> apparence
    // ---------------------------------------------------------------
    // Renvoie la tete, le point et le nombre de crochets. tpq est le
    // nombre de ticks a la noire.
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
        // valeur inattendue : on grave la plus proche plutot que rien
        var best = table[0];
        for (var j = 0; j < table.length; j++)
            if (Math.abs(q - table[j][0]) < Math.abs(q - best[0])) best = table[j];
        return { head: best[1], dot: best[2], flags: best[3] };
    }

    // ---------------------------------------------------------------
    // 2. Regroupement en colonnes
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

    // Duree effective d'une colonne pour l'espacement : la plus courte
    // valeur qui y commence, car c'est elle qui dicte l'ecart au voisin.
    function colDur(c, barTicks, next) {
        var ds = [];
        c.t.concat(c.b).forEach(function (n) { ds.push(n.dur); });
        if (c.tRest) ds.push(c.tRest.dur);
        if (c.bRest) ds.push(c.bRest.dur);
        var gap = (next === undefined ? barTicks : next) - c.on;
        return Math.max(1, Math.min(gap, ds.length ? Math.min.apply(null, ds) : gap));
    }

    // ---------------------------------------------------------------
    // 3. Barres de croches
    // ---------------------------------------------------------------
    // On ne ligature qu'a l'interieur d'un temps : c'est ce qui rend le
    // temps visible, et donc le rythme lisible.
    function beams(cols, side, beatTicks, tpq) {
        var groups = [], cur = null;
        for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            var notes = c[side];
            var rest = side === 't' ? c.tRest : c.bRest;
            var lk = notes.length ? look(notes[0].dur, tpq) : null;
            var beamable = notes.length && lk.flags > 0;
            var beat = Math.floor(c.on / beatTicks);
            if (!beamable || rest) { cur = null; continue; }
            if (cur && cur.beat === beat) { cur.idx.push(i); cur.flags = Math.max(cur.flags, lk.flags); }
            else { cur = { beat: beat, idx: [i], flags: lk.flags }; groups.push(cur); }
        }
        return groups.filter(function (g) { return g.idx.length > 1; });
    }

    // ---------------------------------------------------------------
    // 4. Gravure
    // ---------------------------------------------------------------
    function draw(svg, piece, opts) {
        opts = opts || {};
        var from = opts.fromBar || 0;
        var to = opts.toBar === undefined ? piece.bars : opts.toBar;
        var W = opts.width || 900;
        var tpq = piece.tpq, beatTicks = piece.compound ? tpq + tpq / 2 : tpq;

        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var positions = [];        // { bar, on, midi, hand, x, y }

        // --- place reservee en tete : cles, armature, chiffrage
        var nAcc = Math.abs(piece.sharps);
        var headW = 44 + nAcc * 9 + (opts.showTimeSig === false ? 0 : 22);

        // --- largeur de chaque mesure, proportionnelle a son contenu
        var bars = [], totalW = 0, m;
        for (m = from; m < to; m++) {
            var cols = columns(piece.measures[m]);
            var w = 0;
            for (var i = 0; i < cols.length; i++) {
                var next = i + 1 < cols.length ? cols[i + 1].on : piece.barTicks;
                // racine de la duree : c'est l'usage en gravure, une ronde
                // est plus large qu'une noire sans l'etre quatre fois
                w += 16 + 30 * Math.pow(colDur(cols[i], piece.barTicks, next) / tpq, 0.55);
            }
            bars.push({ cols: cols, w: w, index: m });
            totalW += w;
        }
        var avail = W - headW - 18;
        var scale = totalW > 0 ? avail / totalW : 1;

        // --- etendue verticale reelle (notes hors portee comprises)
        var minY = T_TOP, maxY = B_BOTTOM;
        bars.forEach(function (bd) {
            bd.cols.forEach(function (c) {
                c.t.forEach(function (n) { var y = yOf(n.d, 't'); if (y < minY) minY = y; if (y > maxY) maxY = y; });
                c.b.forEach(function (n) { var y = yOf(n.d, 'b'); if (y < minY) minY = y; if (y > maxY) maxY = y; });
            });
        });
        var top = Math.min(T_TOP, minY - 36), bot = Math.max(B_BOTTOM, maxY + 36);
        svg.setAttribute('viewBox', '0 ' + top.toFixed(1) + ' ' + W + ' ' + (bot - top).toFixed(1));

        // --- portees
        [T_TOP, B_TOP].forEach(function (t0) {
            for (var i = 0; i < 5; i++)
                svg.appendChild(el('line', {
                    x1: 12, y1: t0 + i * GAP, x2: W - 6, y2: t0 + i * GAP,
                    stroke: INK, 'stroke-width': 1.2
                }));
        });
        svg.appendChild(el('line', { x1: 12, y1: T_TOP, x2: 12, y2: B_BOTTOM, stroke: INK, 'stroke-width': 2.4 }));

        var cs = el('text', { x: 15, y: 96, 'font-size': 70, fill: INK }); cs.textContent = '𝄞';
        svg.appendChild(cs);
        var cf = el('text', { x: 17, y: 190, 'font-size': 50, fill: INK }); cf.textContent = '𝄢';
        svg.appendChild(cf);

        // --- armature
        var kx = 44;
        if (nAcc) {
            var tbl = piece.sharps > 0 ? KS_SHARP : KS_FLAT;
            var sym = piece.sharps > 0 ? '♯' : '♭';
            for (var a = 0; a < nAcc; a++) {
                ['t', 'b'].forEach(function (side) {
                    var g = el('text', {
                        x: kx + a * 9, y: yOf(tbl[side][a], side) + 6,
                        'font-size': 19, fill: INK
                    });
                    g.textContent = sym;
                    svg.appendChild(g);
                });
            }
        }

        // --- chiffrage de mesure
        var tx = 44 + nAcc * 9 + 4;
        if (opts.showTimeSig !== false) {
            [[T_TOP, 0], [B_TOP, 0]].forEach(function (p) {
                var n1 = el('text', { x: tx, y: p[0] + 26, 'font-size': 26, fill: INK, 'font-weight': 700 });
                n1.textContent = piece.ts.num;
                var n2 = el('text', { x: tx, y: p[0] + 52, 'font-size': 26, fill: INK, 'font-weight': 700 });
                n2.textContent = piece.ts.den;
                svg.appendChild(n1); svg.appendChild(n2);
            });
        }

        // --- mesures
        var x = headW;
        bars.forEach(function (bd, bi) {
            var bw = bd.w * scale;
            if (bi > 0)
                svg.appendChild(el('line', { x1: x, y1: T_TOP, x2: x, y2: B_BOTTOM, stroke: INK, 'stroke-width': 1.2 }));
            drawBar(svg, piece, bd, x, bw, tpq, beatTicks, positions, opts);
            x += bw;
        });

        // double barre finale
        svg.appendChild(el('line', { x1: x - 5, y1: T_TOP, x2: x - 5, y2: B_BOTTOM, stroke: INK, 'stroke-width': 1.2 }));
        svg.appendChild(el('line', { x1: x - 1, y1: T_TOP, x2: x - 1, y2: B_BOTTOM, stroke: INK, 'stroke-width': 3 }));

        return positions;
    }

    function drawBar(svg, piece, bd, mx, mw, tpq, beatTicks, positions, opts) {
        var cols = bd.cols, xs = [], acc = {}, i;

        // abscisses, au prorata des durees
        var run = 0, unit = [];
        for (i = 0; i < cols.length; i++) {
            var next = i + 1 < cols.length ? cols[i + 1].on : piece.barTicks;
            unit.push(16 + 30 * Math.pow(colDur(cols[i], piece.barTicks, next) / tpq, 0.55));
        }
        var sum = unit.reduce(function (a, b) { return a + b; }, 0) || 1;
        for (i = 0; i < cols.length; i++) {
            xs.push(mx + (run + unit[i] * 0.42) / sum * mw);
            run += unit[i];
        }

        var drawn = { t: [], b: [] };
        for (i = 0; i < cols.length; i++) {
            ['t', 'b'].forEach(function (side) {
                drawn[side][i] = drawColumn(svg, piece, cols[i], xs[i], side, tpq,
                    acc, positions, bd.index, opts);
            });
        }

        // barres de croches
        ['t', 'b'].forEach(function (side) {
            beams(cols, side, beatTicks, tpq).forEach(function (g) {
                var ups = g.idx.filter(function (k) { return drawn[side][k] && drawn[side][k].up; }).length;
                var up = ups >= g.idx.length / 2;
                var beamY = up ? Infinity : -Infinity;
                g.idx.forEach(function (k) {
                    var d = drawn[side][k];
                    var tip = up ? d.minY - 26 : d.maxY + 26;
                    beamY = up ? Math.min(beamY, tip) : Math.max(beamY, tip);
                });
                g.idx.forEach(function (k) {
                    var d = drawn[side][k];
                    var sx = up ? d.x + 6.8 : d.x - 6.8;
                    svg.appendChild(el('line', {
                        x1: sx, y1: up ? d.maxY : d.minY, x2: sx, y2: beamY,
                        stroke: INK, 'stroke-width': 1.4
                    }));
                    d.stemDone = true; d.stemX = sx;
                });
                var x1 = drawn[side][g.idx[0]].stemX;
                var x2 = drawn[side][g.idx[g.idx.length - 1]].stemX;
                for (var bl = 0; bl < g.flags; bl++) {
                    var off = (up ? 1 : -1) * bl * 5;
                    svg.appendChild(el('line', {
                        x1: x1, y1: beamY + off, x2: x2, y2: beamY + off,
                        stroke: INK, 'stroke-width': 3.2
                    }));
                }
            });
        });

        // hampes et crochets isoles
        for (i = 0; i < cols.length; i++) {
            ['t', 'b'].forEach(function (side) {
                var d = drawn[side][i];
                if (!d || d.stemDone || d.noStem) return;
                var up = d.up;
                var sx = up ? d.x + 6.8 : d.x - 6.8;
                var y2 = up ? d.minY - 26 : d.maxY + 26;
                svg.appendChild(el('line', {
                    x1: sx, y1: up ? d.maxY : d.minY, x2: sx, y2: y2,
                    stroke: INK, 'stroke-width': 1.4
                }));
                for (var f = 0; f < d.flags; f++) {
                    var fy = y2 + (up ? f * 6 : -f * 6), dir = up ? 1 : -1;
                    svg.appendChild(el('path', {
                        d: 'M ' + sx + ' ' + fy + ' q 7 ' + (3 * dir) + ' 5 ' + (13 * dir),
                        stroke: INK, 'stroke-width': 1.6, fill: 'none'
                    }));
                }
            });
        }
    }

    function drawColumn(svg, piece, c, x, side, tpq, acc, positions, barIndex, opts) {
        var notes = c[side];
        var rest = side === 't' ? c.tRest : c.bRest;
        var top = side === 't' ? T_TOP : B_TOP;
        var bottom = side === 't' ? T_BOTTOM : B_BOTTOM;

        if (rest) { drawRest(svg, x, side, rest.dur, tpq); }
        if (!notes.length) return null;

        var lk = look(notes[0].dur, tpq);
        var minY = Infinity, maxY = -Infinity, sumD = 0;

        notes.forEach(function (n) {
            var y = yOf(n.d, side);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            sumD += n.d;

            // lignes supplementaires
            var ly;
            if (y < top) for (ly = top - GAP; ly >= y - 1; ly -= GAP)
                svg.appendChild(el('line', { x1: x - 11, y1: ly, x2: x + 11, y2: ly, stroke: INK, 'stroke-width': 1.2 }));
            if (y > bottom) for (ly = bottom + GAP; ly <= y + 1; ly += GAP)
                svg.appendChild(el('line', { x1: x - 11, y1: ly, x2: x + 11, y2: ly, stroke: INK, 'stroke-width': 1.2 }));

            // tete
            if (lk.head === 'q')
                svg.appendChild(el('ellipse', {
                    cx: x, cy: y, rx: 7.2, ry: 5.6, fill: INK,
                    transform: 'rotate(-18 ' + x + ' ' + y + ')'
                }));
            else if (lk.head === 'h')
                svg.appendChild(el('ellipse', {
                    cx: x, cy: y, rx: 7.2, ry: 5.4, fill: 'none', stroke: INK,
                    'stroke-width': 1.9, transform: 'rotate(-18 ' + x + ' ' + y + ')'
                }));
            else
                svg.appendChild(el('ellipse', {
                    cx: x, cy: y, rx: 8.6, ry: 5.6, fill: 'none', stroke: INK, 'stroke-width': 2.2
                }));

            // alteration : seulement si elle differe de ce qui est deja en
            // vigueur dans la mesure — c'est la regle de lecture reelle
            var key = n.step + '/' + n.oct;
            var eff = key in acc ? acc[key] : keyAlter(n.step, piece.sharps);
            if (n.alter !== eff) {
                var sym = n.alter === 1 ? '♯' : n.alter === -1 ? '♭' : '♮';
                var g = el('text', { x: x - 21, y: y + 6, 'font-size': 18, fill: INK });
                g.textContent = sym;
                svg.appendChild(g);
                acc[key] = n.alter;
            }

            if (lk.dot) {
                var onLine = (((n.d - (side === 't' ? T_REF : B_REF)) % 2) + 2) % 2 === 0;
                svg.appendChild(el('circle', { cx: x + 12, cy: y - (onLine ? 3.5 : 0), r: 1.9, fill: INK }));
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
            x: x, minY: minY, maxY: maxY, flags: lk.flags,
            up: (sumD / notes.length) < mid, noStem: lk.head === 'w'
        };
    }

    // Silences : le demi-soupir et au-dela sont dessines, le soupir et
    // la pause ont leurs glyphes propres.
    function drawRest(svg, x, side, dur, tpq) {
        var mid = side === 't' ? (T_TOP + T_BOTTOM) / 2 : (B_TOP + B_BOTTOM) / 2;
        var q = dur / tpq;
        if (q >= 3.5) {                       // pause : rectangle sous la 4e ligne
            svg.appendChild(el('rect', { x: x - 7, y: mid - GAP, width: 14, height: 6, fill: INK }));
        } else if (q >= 1.75) {               // demi-pause : au-dessus de la 3e ligne
            svg.appendChild(el('rect', { x: x - 7, y: mid, width: 14, height: 6, fill: INK }));
        } else if (q >= 0.9) {                // soupir
            var s = el('text', { x: x - 7, y: mid + 10, 'font-size': 30, fill: INK });
            s.textContent = '𝄽';
            svg.appendChild(s);
        } else {                              // demi-soupir et plus court
            var n = q >= 0.45 ? 1 : 2;
            for (var i = 0; i < n; i++) {
                var y = mid - 6 + i * 8;
                svg.appendChild(el('circle', { cx: x - 3, cy: y, r: 2.6, fill: INK }));
                svg.appendChild(el('path', {
                    d: 'M ' + (x - 1) + ' ' + y + ' q 6 -4 7 -10',
                    stroke: INK, 'stroke-width': 1.8, fill: 'none'
                }));
            }
        }
    }

    // ---------------------------------------------------------------
    // 5. Decoupe en systemes
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
        look: look, columns: columns, keyAlter: keyAlter, yOf: yOf
    };
}));
