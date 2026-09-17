# -*- coding: utf-8 -*-
"""
Extrait de Bravura les seuls glyphes dont la page a besoin, en chemins SVG.

Pourquoi extraire plutot que charger la police : la page reste sans
dependance reseau, il n'y a pas de clignotement au chargement, et le rendu
est identique dans le navigateur et dans jsdom (donc testable).

Convention SMuFL : 1 interligne de portee = 0,25 em. Les chemins sont donc
normalises en UNITES D'INTERLIGNE, y vers le bas comme en SVG. Le rendu n'a
plus qu'a multiplier par l'ecart entre deux lignes de portee.

Bravura est sous SIL Open Font License 1.1, qui autorise explicitement
l'incorporation et la redistribution.
"""
import io, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

SRC = r'C:\tmp\Bravura.otf'
DST = r'C:\Users\Lucas\PaimonAlphabet\sightread-glyphs.js'

WANTED = {
    'gClef': 0xE050, 'fClef': 0xE062,
    'noteheadWhole': 0xE0A2, 'noteheadHalf': 0xE0A3, 'noteheadBlack': 0xE0A4,
    'accidentalFlat': 0xE260, 'accidentalNatural': 0xE261, 'accidentalSharp': 0xE262,
    'restWhole': 0xE4E3, 'restHalf': 0xE4E4, 'restQuarter': 0xE4E5,
    'rest8th': 0xE4E6, 'rest16th': 0xE4E7,
    'flag8thUp': 0xE240, 'flag8thDown': 0xE241,
    'flag16thUp': 0xE242, 'flag16thDown': 0xE243,
    'augmentationDot': 0xE1E7,
}
for d in range(10):
    WANTED['timeSig%d' % d] = 0xE080 + d

font = TTFont(SRC)
upem = font['head'].unitsPerEm
space = upem / 4.0            # 1 interligne = 0,25 em
cmap = font.getBestCmap()
gs = font.getGlyphSet()
hmtx = font['hmtx']

out = {}
missing = []
for name, cp in sorted(WANTED.items()):
    gname = cmap.get(cp)
    if not gname:
        missing.append('%s U+%04X' % (name, cp))
        continue
    # y vers le bas, et 1 unite = 1 interligne
    t = Transform(1.0 / space, 0, 0, -1.0 / space, 0, 0)
    pen = SVGPathPen(gs, ntos=lambda v: ('%.4f' % v).rstrip('0').rstrip('.'))
    gs[gname].draw(TransformPen(pen, t))
    d = pen.getCommands()

    bp = BoundsPen(gs)
    gs[gname].draw(bp)
    if bp.bounds:
        x0, y0, x1, y1 = [v / space for v in bp.bounds]
        box = [round(x0, 4), round(-y1, 4), round(x1, 4), round(-y0, 4)]
    else:
        box = [0, 0, 0, 0]

    adv = hmtx[gname][0] / space
    out[name] = {'d': d, 'w': round(adv, 4), 'box': box}

if missing:
    raise SystemExit('glyphes introuvables : ' + ', '.join(missing))

body = ',\n'.join(
    '    %s: { w: %s, box: [%s], d: \'%s\' }'
    % (k, v['w'], ', '.join(str(b) for b in v['box']), v['d'])
    for k, v in sorted(out.items()))

js = """/* ------------------------------------------------------------------
   sightread-glyphs.js — les symboles de la gravure, en chemins SVG.

   Extraits de BRAVURA, la police de reference du standard SMuFL, sous
   SIL Open Font License 1.1 (incorporation et redistribution autorisees).
   Genere par extract_glyphs.py : ne pas modifier a la main.

   Les contours sont exprimes en UNITES D'INTERLIGNE de portee, y vers le
   bas comme en SVG. Le rendu n'a donc qu'a multiplier par l'ecart entre
   deux lignes : tetes, cles, alterations et silences restent alors
   proportionnes entre eux quelle que soit la taille de la portee.

   Pour chaque glyphe :
     w   : chasse, en interlignes (sert a placer une hampe ou un point)
     box : [x0, y0, x1, y1] du contour, pour centrer et espacer
     d   : le chemin
   ------------------------------------------------------------------ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SightGlyphs = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
%s
    };
}));
""" % body

io.open(DST, 'w', encoding='utf-8', newline='').write(js)
print('%d glyphes extraits (upem %d, interligne %g unites)' % (len(out), upem, space))
print('%s : %.1f Ko' % (DST, len(js) / 1024.0))
for k in ['gClef', 'noteheadBlack', 'accidentalSharp', 'restQuarter']:
    v = out[k]
    print('  %-18s chasse %5.2f  boite %s' % (k, v['w'], v['box']))
