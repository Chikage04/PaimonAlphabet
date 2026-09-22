#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère lecture-vue-en.html à partir de lecture-vue.html.

Même discipline que build-en.py : la page française est la SEULE source de
vérité, la version anglaise est un produit de build qu'on ne modifie jamais à
la main. Toute entrée de table qui ne correspond à aucune ligne fait échouer le
build, et tout texte français restant dans la sortie est signalé — c'est ainsi
qu'on voit qu'une modification française n'a pas encore été traduite.

Les noms de tonalités et les libellés de niveau ne sont PAS traduits ici : ils
viennent de sightread-gen.js, partagé par les deux pages, qui porte les deux
langues et bascule sur `SightGen.setLang()`.

Usage : python build-en-lecture.py
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'lecture-vue.html')
DST = os.path.join(HERE, 'lecture-vue-en.html')

# ---------------------------------------------------------------------------
#  Vocabulaire retenu, aligné sur la littérature anglophone sur la lecture à
#  vue (Sloboda, Kopiez & Lee, Harris) :
#    lecture à vue        -> sight-reading
#    déchiffrer           -> to decipher (par opposition à sight-read)
#    pré-lecture          -> pre-reading scan
#    arrêt                -> stop / breakdown
#    continuité           -> continuity
#    pulse                -> pulse
#    dérive de tempo      -> tempo drift
#    empan œil-main       -> eye-hand span
#    passage propre       -> clean run
#    vivier               -> pool
#    tonalité             -> key
#    armature             -> key signature
#    portée               -> stave
#    séance               -> session
#    pièce                -> piece
# ---------------------------------------------------------------------------

T = [

# ----------------------------------------------------------------- en-tête --
("<title>Lecture à vue — Entraîneur</title>", "<title>Sight-Reading Trainer</title>"),
("<h1>Lecture à vue</h1>", "<h1>Sight-reading</h1>"),
('<p class="subtitle">Une pièce jamais vue, une seule fois, sans jamais s\'arrêter.</p>',
 '<p class="subtitle">A piece you have never seen, once only, without ever stopping.</p>'),

# ------------------------------------------------------------ navigation ----
('<a href="index.html">← Accueil</a>', '<a href="index.html">← Home</a>'),
('<a href="lecture.html">🎼 Lecture de notes</a>', '<a href="lecture.html">🔤 Note naming</a>'),
('<a href="extrait.html">🎹 Extraits</a>', '<a href="extrait.html">🎹 Excerpts</a>'),
('<a href="lecture-vue-en.html" id="langLink">🇬🇧 English version</a>',
 '<a href="lecture-vue.html" id="langLink">🇫🇷 Version française</a>'),
# la version anglaise renvoie vers la version anglaise de Hanon
('<a href="hanon.html">🏋️ Hanon</a>', '<a href="hanon-en.html">🏋️ Hanon</a>'),

# ------------------------------------------------------------- divers ------
("const nameOf = i => i.name || 'appareil sans nom';",
 "const nameOf = i => i.name || 'unnamed device';"),

# ------------------------------------------------------------- commandes ----
('<span class="midi-status idle" id="midiStatus">🎛️ MIDI : en attente…</span>',
 '<span class="midi-status idle" id="midiStatus">🎛️ MIDI: waiting…</span>'),
('<button class="btn primary" id="startBtn">▶ Séance de 15 minutes</button>',
 '<button class="btn primary" id="startBtn">▶ 15-minute session</button>'),
('<button class="btn ghost" id="stopBtn" disabled>Arrêter</button>',
 '<button class="btn ghost" id="stopBtn" disabled>Stop</button>'),
('<span class="seg" id="levelSeg" title="Le niveau s\'ajuste tout seul ; ici tu peux le forcer.">',
 '<span class="seg" id="levelSeg" title="The level adapts on its own; here you can override it.">'),
('<button data-lv="auto" class="active">Niveau auto</button>',
 '<button data-lv="auto" class="active">Auto level</button>'),
('<button data-lv="manual">Forcer</button>', '<button data-lv="manual">Override</button>'),
('<label class="toggle"><input type="checkbox" id="clickOn" checked> Clic sur le temps</label>',
 '<label class="toggle"><input type="checkbox" id="clickOn" checked> Click on the beat</label>'),
('<label class="toggle"><input type="checkbox" id="tapOn"> Frapper le rythme d\'abord</label>',
 '<label class="toggle"><input type="checkbox" id="tapOn"> Tap the rhythm first</label>'),
('<label class="toggle">Niveau', '<label class="toggle">Level'),
('<span class="big" id="phaseText">Branche ton piano, puis lance une séance.</span>',
 '<span class="big" id="phaseText">Plug in your piano, then start a session.</span>'),

# ------------------------------------------------------ tableau de bord ----
('<div class="cell"><div class="k">Temps restant</div><div class="v" id="cTime">15:00</div></div>',
 '<div class="cell"><div class="k">Time left</div><div class="v" id="cTime">15:00</div></div>'),
('<div class="cell"><div class="k">Pièce</div><div class="v" id="cItem">—</div></div>',
 '<div class="cell"><div class="k">Piece</div><div class="v" id="cItem">—</div></div>'),
('<div class="cell"><div class="k">Niveau</div><div class="v" id="cLevel">1</div></div>',
 '<div class="cell"><div class="k">Level</div><div class="v" id="cLevel">1</div></div>'),
('<div class="cell"><div class="k">Arrêts</div><div class="v" id="cStops">—</div></div>',
 '<div class="cell"><div class="k">Stops</div><div class="v" id="cStops">—</div></div>'),
('<div class="cell"><div class="k">Notes justes</div><div class="v" id="cAcc">—</div></div>',
 '<div class="cell"><div class="k">Right notes</div><div class="v" id="cAcc">—</div></div>'),
('<svg id="score" viewBox="0 0 940 240" aria-label="partition"></svg>',
 '<svg id="score" viewBox="0 0 940 240" aria-label="score"></svg>'),

# ------------------------------------------------------------- bilans ------
('<h2 id="vTitle">Bilan de la lecture</h2>', '<h2 id="vTitle">Reading report</h2>'),
('<h2>Bilan de la séance</h2>', '<h2>Session report</h2>'),

# -------------------------------------------------- note d'intention -------
('<h2>Pourquoi cet exercice est fait comme ça</h2>',
 '<h2>Why this drill is built the way it is</h2>'),
("<p><b>On ne s'arrête jamais.</b> Une fausse note ne déclenche rien et n'interrompt rien.",
 "<p><b>You never stop.</b> A wrong note triggers nothing and interrupts nothing."),
("Le seul vrai échec mesuré ici, c'est l'arrêt : c'est lui qui distingue un lecteur d'un déchiffreur.</p>",
 "The only real failure measured here is the stop: that is what separates a sight-reader from someone deciphering.</p>"),
("<p><b>Il n'y a pas de clavier à l'écran.</b> Un clavier qui montre la touche attendue transforme",
 "<p><b>There is no on-screen keyboard.</b> A keyboard that shows the expected key turns"),
("la lecture en suivi de lumières. L'information doit venir de la portée, et d'elle seule.</p>",
 "reading into following lights. The information must come from the stave, and from nothing else.</p>"),
("<p><b>Une pièce ne se joue qu'une fois.</b> Chaque pièce lue est retirée du vivier définitivement.",
 "<p><b>A piece is played once only.</b> Every piece you read is removed from the pool for good."),
("La lecture à vue exige du matériel jamais vu ; rejouer, c'est déjà travailler un morceau.</p>",
 "Sight-reading demands unseen material; replaying is already practising a piece.</p>"),
("<p><b>Le clic bat le temps, pas la note.</b> Cliquer chaque note donnerait le rythme — or le rythme",
 "<p><b>The click marks the beat, not the note.</b> Clicking every note would hand you the rhythm — and the rhythm"),
("est précisément ce qu'il faut lire.</p>", "is precisely what you are meant to read.</p>"),
("<p><b>Une pré-lecture chronométrée.</b> Vingt secondes pour repérer la tonalité, la mesure et les",
 "<p><b>A timed pre-reading scan.</b> Twenty seconds to take in the key, the metre and the"),
("endroits difficiles, sans toucher au piano. C'est l'habitude que tout le monde réclame et que",
 "difficult spots, without touching the piano. It is the habit everyone recommends and"),
("personne ne prend.</p>", "nobody actually forms.</p>"),

# ------------------------------------------------------------- langue ------
("const LANG = 'fr';", "const LANG = 'en';"),

# ------------------------------------------------------------ masquage -----
("""<span class="seg" id="occlSeg" title="Ce qui est déjà joué peut s'effacer, pour empêcher le regard de revenir en arrière.">""",
 """<span class="seg" id="occlSeg" title="What you have already played can fade away, so your eyes cannot go back.">"""),
('''<button data-oc="none" class="active">Tout visible</button>''',
 '''<button data-oc="none" class="active">All visible</button>'''),
('''<button data-oc="fade">Voile arrière</button>''', '''<button data-oc="fade">Fade behind</button>'''),
('''<button data-oc="erase">Effacement</button>''', '''<button data-oc="erase">Erase</button>'''),

("none: 'La partition reste entière, comme sur du papier.',",
 "none: 'The score stays whole, as it would on paper.',"),
("fade: 'La mesure terminée s\\'estompe quand tu entames la suivante : le regard ne peut plus revenir en arrière.',",
 "fade: 'The finished bar fades as you start the next one: your eyes can no longer go back.',"),
("erase: 'La mesure disparaît dès sa première note. Tu la finis de mémoire — c\\'est exigeant.',",
 "erase: 'The bar vanishes on its first note. You finish it from memory — this one is demanding.',"),
("flash: 'Une mesure apparaît quelques secondes, puis disparaît : tu la rejoues de mémoire. Ce n\\'est pas de la lecture à vue mais du regroupement.'",
 "flash: 'A bar appears for a few seconds, then vanishes: you play it back from memory. This is not sight-reading but chunking.'"),

# -------------------------------------------------------------- flash -----
("setPhase('prep', 'Mesure ' + (S.flashBar + 1) + ' sur ' + S.piece.bars",
 "setPhase('prep', 'Bar ' + (S.flashBar + 1) + ' of ' + S.piece.bars"),
("+ ' — retiens-la.', performance.now() + FLASH_MS);",
 "+ ' — take it in.', performance.now() + FLASH_MS);"),
("setPhase('read', 'Rejoue la mesure ' + (S.flashBar + 1) + ' de mémoire.',",
 "setPhase('read', 'Play bar ' + (S.flashBar + 1) + ' back from memory.',"),
("setPhase('done', exact + ' mesure' + (exact > 1 ? 's' : '') + ' sur '",
 "setPhase('done', exact + ' bar' + (exact > 1 ? 's' : '') + ' out of '"),
("+ r.length + ' rejouée' + (exact > 1 ? 's' : '') + ' exactement.',",
 "+ r.length + ' played back exactly.',"),
("$('vTitle').textContent = 'Flash ' + S.itemIndex + ' — niveau ' + S.piece.level",
 "$('vTitle').textContent = 'Flash ' + S.itemIndex + ' — level ' + S.piece.level"),
("$('vLead').textContent = 'Le flash n\\'est pas de la lecture à vue : il entraîne le '",
 "$('vLead').textContent = 'The flash drill is not sight-reading: it trains '"),
("+ 'regroupement, c\\'est-à-dire la capacité à saisir une mesure d\\'un coup d\\'œil. '",
 "+ 'chunking, that is, taking in a whole bar at a glance. '"),
("+ 'Aucun temps n\\'est mesuré ici, il n\\'y a pas de grille.';",
 "+ 'No timing is measured here, there is no grid.';"),
("chip('Mesures exactes', a.flash.exact + ' / ' + a.flash.bars, a.flash.exact === a.flash.bars);",
 "chip('Bars exactly right', a.flash.exact + ' / ' + a.flash.bars, a.flash.exact === a.flash.bars);"),
("chip('Notes retrouvées', Math.round(a.accuracy) + ' %', a.accuracy > 90);",
 "chip('Notes recalled', Math.round(a.accuracy) + ' %', a.accuracy > 90);"),
("$('vTable').innerHTML = '<tr><th>Mesure</th><th>Notes retrouvées</th></tr>'",
 "$('vTable').innerHTML = '<tr><th>Bar</th><th>Notes recalled</th></tr>'"),

# ------------------------------------------------- note d'intention -------
("<p><b>Ce qui est joué peut s'effacer, ce qui vient jamais.</b> Masquer les mesures déjà",
 "<p><b>What you have played may fade; what is coming never does.</b> Hiding the bars already"),
("jouées empêche le regard de revenir en arrière. Restreindre au contraire ce qu'on voit",
 "played stops your eyes from going back. Restricting instead what you can see"),
("<i>devant</i> est la seule de ces manipulations qui ait été testée — et elle fait",
 "<i>ahead</i> is the one manipulation of the two that has actually been tested — and it makes"),
("<i>rétrécir</i> l'empan œil-main au lieu de l'agrandir (Truitt et coll., 1997 ;",
 "the eye-hand span <i>shrink</i> rather than grow (Truitt et al., 1997;"),
("Gilman &amp; Underwood, 2003). Aucune étude n'a évalué l'effacement du passé : c'est",
 "Gilman &amp; Underwood, 2003). No study has evaluated erasing the past: it is offered"),
("proposé comme une expérience, et cette page mesure assez pour que tu la tranches",
 "here as an experiment, and this page measures enough for you to settle it"),
("toi-même en comparant tes séances.</p>", "yourself by comparing your own sessions.</p>"),

# --------------------------------------------------------------- MIDI ------
("oAll.value = '*'; oAll.textContent = 'Toutes les entrées (doublons)';",
 "oAll.value = '*'; oAll.textContent = 'All inputs (duplicates)';"),
("if (!n) setMidiStatus('off', '🎛️ MIDI : aucun clavier détecté');",
 "if (!n) setMidiStatus('off', '🎛️ MIDI: no keyboard detected');"),
("else if (all) setMidiStatus('off', `⚠️ ${n} entrées écoutées — chaque note comptée ${n} fois`);",
 "else if (all) setMidiStatus('off', `⚠️ listening on ${n} inputs — every note counted ${n} times`);"),
("else if (n > 1) setMidiStatus('on', `🎹 ${nameOf(target)} — ${n - 1} autre(s) entrée(s) ignorée(s)`);",
 "else if (n > 1) setMidiStatus('on', `🎹 ${nameOf(target)} — ${n - 1} other input(s) ignored`);"),
("else setMidiStatus('on', '🎹 MIDI connecté : ' + nameOf(target));",
 "else setMidiStatus('on', '🎹 MIDI connected: ' + nameOf(target));"),
("setMidiStatus('idle', '🎛️ Web MIDI non supporté — utilise Chrome ou Edge');",
 "setMidiStatus('idle', '🎛️ Web MIDI unsupported — use Chrome or Edge');"),
("}).catch(() => setMidiStatus('idle', '🎛️ MIDI : accès refusé'));",
 "}).catch(() => setMidiStatus('idle', '🎛️ MIDI: access denied'));"),

# ------------------------------------------------------- partition ---------
("+ ' · ♩= ' + piece.bpm + ' · ' + piece.bars + ' mesures · niveau ' + piece.level",
 "+ ' · ♩= ' + piece.bpm + ' · ' + piece.bars + ' bars · level ' + piece.level"),

# ------------------------------------------------------------ variantes ----
("""<span class="seg" id="handsSeg" title="Quelle main joue. Le niveau, lui, ne change pas.">""",
 """<span class="seg" id="handsSeg" title="Which hand plays. The level itself does not change.">"""),
('''<button data-h="both" class="active">Deux mains</button>''',
 '''<button data-h="both" class="active">Both hands</button>'''),
('''<button data-h="rh">Main droite</button>''', '''<button data-h="rh">Right hand</button>'''),
('''<button data-h="lh">Main gauche</button>''', '''<button data-h="lh">Left hand</button>'''),
("""<span class="seg" id="contentSeg" title="Ce qu'il y a à lire : une ligne, ou des intervalles empilés.">""",
 """<span class="seg" id="contentSeg" title="What there is to read: a line, or stacked intervals.">"""),
('''<button data-c="melody" class="active">Mélodie</button>''',
 '''<button data-c="melody" class="active">Melody</button>'''),
('''<button data-c="fifths">Quintes</button>''', '''<button data-c="fifths">Fifths</button>'''),
('''<button data-c="fifths7">Quintes et 7èmes</button>''',
 '''<button data-c="fifths7">Fifths and 7ths</button>'''),
('''<button data-c="chords">Accords</button>''', '''<button data-c="chords">Chords</button>'''),

("const HANDS_LABEL = { both: 'deux mains', rh: 'main droite', lh: 'main gauche' };",
 "const HANDS_LABEL = { both: 'both hands', rh: 'right hand', lh: 'left hand' };"),
("melody: 'mélodie', fifths: 'quintes',", "melody: 'melody', fifths: 'fifths',"),
("fifths7: 'quintes et septièmes', chords: 'accords'",
 "fifths7: 'fifths and sevenths', chords: 'chords'"),

("const h = S.hands === 'both' ? 'Les deux mains jouent.'",
 "const h = S.hands === 'both' ? 'Both hands play.'"),
(": S.hands === 'rh' ? 'La main droite seule : la portée de fa reste vide.'",
 ": S.hands === 'rh' ? 'Right hand alone: the bass stave stays empty.'"),
(": 'La main gauche seule : la ligne s\\'écrit sur la portée de fa.';",
 ": 'Left hand alone: the line is written on the bass stave.';"),
("const c = S.content === 'melody' ? 'Une ligne mélodique.'",
 "const c = S.content === 'melody' ? 'A melodic line.'"),
(": S.content === 'fifths' ? 'Des quintes à lire d\\'un coup d\\'œil.'",
 ": S.content === 'fifths' ? 'Fifths, to be taken in at a glance.'"),
("? 'Quintes et septièmes mêlées — les deux se ressemblent sur la portée, et c\\'est justement ce qu\\'on confond.'",
 "? 'Fifths and sevenths mixed — the two look alike on the stave, and those are exactly the ones people confuse.'"),
(": 'Des accords de trois et quatre sons, empilés par tierces.';",
 ": 'Chords of three and four notes, stacked in thirds.';"),
("const plus = S.content === 'melody' ? ''",
 "const plus = S.content === 'melody' ? ''"),
(": ' Les valeurs descendent au temps et la basse se tient : l\\'exercice porte sur les intervalles.';",
 ": ' Note values come down to the beat and the bass is held: the drill is about the intervals.';"),

# ------------------------------------------------- note d'intention -------
("<p><b>Quelle main, et quoi lire, se règlent à part du niveau.</b> Le niveau fixe la",
 "<p><b>Which hand, and what to read, are set apart from the level.</b> The level fixes the"),
("tonalité, la mesure, le rythme et l'étendue ; les deux autres réglages disent qui joue",
 "key, the metre, the rhythm and the range; the other two settings say who plays"),
("et ce qu'il y a à lire. « Niveau 1, main droite, quintes et septièmes » est donc une",
 "and what there is to read. \u201cLevel 1, right hand, fifths and sevenths\u201d is therefore a"),
("combinaison valable. La quinte et la septième vont toutes deux de ligne à ligne ou",
 "valid combination. A fifth and a seventh both run line-to-line or"),
("d'interligne à interligne : les mêler n'est pas une simple variation, c'est l'exercice",
 "space-to-space: mixing them is not a mere variation, it is the drill that"),
("qui sépare les deux intervalles qu'on confond le plus.</p>",
 "separates the two intervals people confuse most.</p>"),
("$('sysnav').textContent = 'Ligne ' + (S.sys + 1) + ' sur ' + systems.length;",
 "$('sysnav').textContent = 'Line ' + (S.sys + 1) + ' of ' + systems.length;"),
("$('sysnav').textContent = 'Les ' + systems.length + ' lignes, en entier';",
 "$('sysnav').textContent = 'All ' + systems.length + ' lines, in full';"),

# ---------------------------------------------------------- affichage -----
("""<span class="seg" id="viewSeg" title="Voir toute la partition, ou une ligne a la fois.">""",
 """<span class="seg" id="viewSeg" title="See the whole score, or one line at a time.">"""),
('''<button data-v="all" class="active">Partition entière</button>''',
 '''<button data-v="all" class="active">Whole score</button>'''),
('''<button data-v="line">Ligne par ligne</button>''',
 '''<button data-v="line">Line by line</button>'''),
("all: 'Toute la partition reste sous les yeux, comme une page de papier.',",
 "all: 'The whole score stays in view, like a page of paper.',"),

# ------------------------------------------- rappel du mode restrictif ----
("line: 'ligne par ligne',", "line: 'line by line',"),
("fade: 'voile arrière', erase: 'effacement', flash: 'flash'",
 "fade: 'fade behind', erase: 'erase', flash: 'flash'"),
("if (S.hands === 'rh') on.push('main droite seule');",
 "if (S.hands === 'rh') on.push('right hand only');"),
("if (S.hands === 'lh') on.push('main gauche seule');",
 "if (S.hands === 'lh') on.push('left hand only');"),
("line: 'Une ligne à la fois ; elle tourne quand la lecture l\\'atteint.'",
 "line: 'One line at a time; it turns when your reading reaches it.'"),

("<p><b>La partition entière reste visible.</b> Découper en lignes partait d'une",
 "<p><b>The whole score stays visible.</b> Cutting it into lines came from a"),
("confusion : un <i>défilement</i> impose son propre tempo de lecture, mais une page",
 "confusion: <i>scrolling</i> does impose its own reading tempo, but a fixed page"),
("fixe non. Un lecteur voit sa page entière et tourne quand il arrive au bout ;",
 "does not. A reader sees the whole page and turns it on reaching the end;"),
("n'en montrer qu'une ligne est plus restrictif que la réalité, et c'est justement la",
 "showing only one line is more restrictive than reality, and it is precisely the"),
("restriction vers l'avant que la recherche donne pour nuisible. « Ligne par ligne »",
 "restriction ahead that research finds harmful. \u201cLine by line\u201d"),
("reste disponible pour qui veut s'y contraindre.</p>",
 "remains available for anyone who wants to impose it on themselves.</p>"),
("svg.setAttribute('aria-label', 'partition, ligne ' + (i + 1));",
 "svg.setAttribute('aria-label', 'score, line ' + (i + 1));"),

# --------------------------------------------------------- criteres --------
("c.push({ k: 'stops', label: 'Aucun arrêt', ok: a.stops === 0, mid: a.stops <= 2, val: a.stops });",
 "c.push({ k: 'stops', label: 'No stops', ok: a.stops === 0, mid: a.stops <= 2, val: a.stops });"),
("k: 'longest', label: 'Plus long arrêt', ok: a.longest < 500,",
 "k: 'longest', label: 'Longest stop', ok: a.longest < 500,"),
("k: 'off', label: 'Écart au temps', ok: a.offMs < 45, mid: a.offMs < 90,",
 "k: 'off', label: 'Off the beat by', ok: a.offMs < 45, mid: a.offMs < 90,"),
("k: 'drift', label: 'Pas de ralentissement', ok: Math.abs(a.drift) < 12,",
 "k: 'drift', label: 'No slowing down', ok: Math.abs(a.drift) < 12,"),
("k: 'covered', label: 'Pièce menée au bout', ok: a.covered > 95,",
 "k: 'covered', label: 'Piece carried to the end', ok: a.covered > 95,"),
("k: 'acc', label: 'Notes justes', ok: a.accuracy > 90,",
 "k: 'acc', label: 'Right notes', ok: a.accuracy > 90,"),
("k: 'recov', label: 'Reprise après faute', ok: a.recovery < 1,",
 "k: 'recov', label: 'Recovery after a slip', ok: a.recovery < 1,"),
("k: 'hesit', label: 'Anticipation des difficultés', ok: a.hesitation < 15,",
 "k: 'hesit', label: 'Reading ahead of difficulties', ok: a.hesitation < 15,"),

# ----------------------------------------------------------- phases --------
("'Pré-lecture — repère la tonalité, la mesure, et les endroits entourés. Ne joue pas.',",
 "'Pre-reading scan — take in the key, the metre and the circled spots. Do not play.',"),
("setPhase('prep', 'Frappe le rythme sur n\\'importe quelle touche — seules les durées comptent.',",
 "setPhase('prep', 'Tap the rhythm on any key — only the durations are measured.',"),
("setPhase('read', 'Lis. Ne t\\'arrête pas, quoi qu\\'il arrive.', 0);",
 "setPhase('read', 'Read. Do not stop, whatever happens.', 0);"),
("setPhase('done', v.cleanRun ? 'Lecture menée sans casser.' :",
 "setPhase('done', v.cleanRun ? 'Read through without breaking down.' :"),
("v.brokeDown ? 'La lecture a cassé — la suivante sera plus facile.' :",
 "v.brokeDown ? 'The reading broke down — the next one will be easier.' :"),
("'Lecture terminée.', performance.now() + VERDICT_MS);",
 "'Reading finished.', performance.now() + VERDICT_MS);"),
("setPhase('', 'Séance terminée.');", "setPhase('', 'Session finished.');"),

# ------------------------------------------------------- decompte ----------
("setPhase('prep', 'Écoute le décompte — tu entres sur le 1.', 0);",
 "setPhase('prep', 'Listen to the count-in — you come in on beat 1.', 0);"),
("setPhase('read', 'Lis. Ne t\\'arrête pas, quoi qu\\'il arrive.', 0);",
 "setPhase('read', 'Read. Do not stop, whatever happens.', 0);"),
("? 'Prépare-toi — entrée dans ' + Math.ceil(n / bpb) + ' mesures'",
 "? 'Get ready — you come in ' + Math.ceil(n / bpb) + ' bars from now'"),
(": 'Entrée sur le prochain 1';", ": 'Come in on the next beat 1';"),

# ---------------------------------------------------- bilan d'une piece ----
("$('vTitle').textContent = 'Pièce ' + S.itemIndex + ' — niveau ' + S.piece.level",
 "$('vTitle').textContent = 'Piece ' + S.itemIndex + ' — level ' + S.piece.level"),
("? 'Aucun arrêt. C\\'est le critère qui compte le plus, et il est tenu.'",
 "? 'No stops at all. That is the criterion that matters most, and you held it.'"),
("? 'Un seul arrêt. Une hésitation isolée vaut mieux qu\\'un arrêt franc, mais le but reste zéro.'",
 "? 'One stop. An isolated hesitation beats an outright halt, but the target is still zero.'"),
(": a.stops + ' arrêts. La continuité passe avant les notes justes : ralentis mentalement plutôt que de t\\'arrêter.';",
 ": a.stops + ' stops. Continuity comes before right notes: slow the piece down in your head rather than stopping.';"),

("['Notes attendues', a.total, ''],", "['Notes expected', a.total, ''],"),
("['Notes justes', a.matched + ' (' + a.accuracy.toFixed(0) + ' %)', a.accuracy > 90 ? 'g' : a.accuracy > 75 ? 'w' : 'b'],",
 "['Right notes', a.matched + ' (' + a.accuracy.toFixed(0) + ' %)', a.accuracy > 90 ? 'g' : a.accuracy > 75 ? 'w' : 'b'],"),
("['Notes fausses ou en trop', a.wrong, a.wrong === 0 ? 'g' : a.wrong < 5 ? 'w' : 'b'],",
 "['Wrong or extra notes', a.wrong, a.wrong === 0 ? 'g' : a.wrong < 5 ? 'w' : 'b'],"),
("['Arrêts', a.stops, a.stops === 0 ? 'g' : a.stops <= 2 ? 'w' : 'b'],",
 "['Stops', a.stops, a.stops === 0 ? 'g' : a.stops <= 2 ? 'w' : 'b'],"),
("['Plus long arrêt', Math.round(a.longest) + ' ms', a.longest < 500 ? 'g' : a.longest < 1500 ? 'w' : 'b'],",
 "['Longest stop', Math.round(a.longest) + ' ms', a.longest < 500 ? 'g' : a.longest < 1500 ? 'w' : 'b'],"),
("['Écart au temps, arrêts exclus', Math.round(a.offMs) + ' ms',",
 "['Off the beat by, stops excluded', Math.round(a.offMs) + ' ms',"),
("['Dérive de tempo', (a.drift > 0 ? '+' : '') + a.drift.toFixed(0) + ' %', Math.abs(a.drift) < 12 ? 'g' : 'w'],",
 "['Tempo drift', (a.drift > 0 ? '+' : '') + a.drift.toFixed(0) + ' %', Math.abs(a.drift) < 12 ? 'g' : 'w'],"),
("['Tempo réellement tenu', '♩≈ ' + Math.round(a.bpmPlayed), ''],",
 "['Tempo actually held', '♩≈ ' + Math.round(a.bpmPlayed), ''],"),
("['Pièce menée au bout', a.covered.toFixed(0) + ' %', a.covered > 95 ? 'g' : 'w']",
 "['Piece carried to the end', a.covered.toFixed(0) + ' %', a.covered > 95 ? 'g' : 'w']"),
("if (S.early) rows.push(['Notes jouées pendant le décompte (ignorées)', S.early, 'w']);",
 "if (S.early) rows.push(['Notes played during the count-in (ignored)', S.early, 'w']);"),
("if (S.dupes) rows.push(['Notes reçues en double (ignorées)', S.dupes, 'w']);",
 "if (S.dupes) rows.push(['Notes received twice (ignored)', S.dupes, 'w']);"),
("if (S.grazed) rows.push(['Touches effleurées (ignorées)', S.grazed, 'w']);",
 "if (S.grazed) rows.push(['Keys barely brushed (ignored)', S.grazed, 'w']);"),
("if (S.brushed) rows.push(['Touches voisines accrochées (fusionnées)', S.brushed, 'w']);",
 "if (S.brushed) rows.push(['Neighbouring keys caught (merged)', S.brushed, 'w']);"),
("if (a.errors) rows.push(['Notes perdues après une faute', a.recovery.toFixed(1),",
 "if (a.errors) rows.push(['Notes lost after a slip', a.recovery.toFixed(1),"),
("if (a.hesitation !== null) rows.push(['Ralentissement devant les difficultés',",
 "if (a.hesitation !== null) rows.push(['Slowing down before difficulties',"),
("$('vTable').innerHTML = '<tr><th>Mesure</th><th>Valeur</th></tr>'",
 "$('vTable').innerHTML = '<tr><th>Measure</th><th>Value</th></tr>'"),

# ------------------------------------------------------ bilan de seance ----
("$('rLead').textContent = it.length + ' pièces lues, ' + clean + ' sans aucun arrêt, '",
 "$('rLead').textContent = it.length + ' pieces read, ' + clean + ' with no stop at all, '"),
("+ 'niveau ' + Math.min(...lv) + ' à ' + Math.max(...lv) + '.';",
 "+ 'level ' + Math.min(...lv) + ' to ' + Math.max(...lv) + '.';"),
("$('rTable').innerHTML = '<tr><th>Pièce</th><th>Niveau</th><th>Tonalité</th><th>Arrêts</th>'",
 "$('rTable').innerHTML = '<tr><th>Piece</th><th>Level</th><th>Key</th><th>Stops</th>'"),
("+ '<th>Plus long</th><th>Justes</th><th>Écart au temps</th></tr>'",
 "+ '<th>Longest</th><th>Right</th><th>Off the beat</th></tr>'"),
("+ '<tr><th>Moyenne</th><th></th><th></th><th>' + (stops / it.length).toFixed(1) + '</th>'",
 "+ '<tr><th>Average</th><th></th><th></th><th>' + (stops / it.length).toFixed(1) + '</th>'"),

("adv.push('Tu t\\'arrêtes trop. Le remède n\\'est pas de mieux lire : c\\'est de lire plus lentement. '",
 "adv.push('You stop too often. The cure is not to read better: it is to read slower. '"),
("+ 'Choisis mentalement un tempo où tu peux tenir la note la plus difficile de la pièce.');",
 "+ 'Pick, in your head, a tempo at which you can hold the hardest note of the piece.');"),
("adv.push('Tu tiens la continuité mais tu perds des notes : c\\'est le bon compromis à ce stade, '",
 "adv.push('You keep going but you lose notes: at this stage that is the right trade-off, '"),
("+ 'et le niveau va monter tout seul.');", "+ 'and the level will rise on its own.');"),
("adv.push('Tu ralentis nettement en arrivant sur les sauts et les altérations : ton regard reste '",
 "adv.push('You slow down markedly when a leap or an accidental arrives: your eyes stay '"),
("+ 'collé à la note jouée. Pendant la pré-lecture, force-toi à nommer à voix haute les deux '",
 "+ 'glued to the note being played. During the pre-reading scan, force yourself to name out loud the two '"),
("+ 'endroits difficiles.');", "+ 'difficult spots.');"),
("adv.push('Rien n\\'a cassé de toute la séance : le niveau est trop bas, il montera au prochain passage.');",
 "adv.push('Nothing broke down all session: the level is too low, it will rise next time.');"),

# --------------------------------------------- verification embarquee ------
("check('une lecture parfaite : aucune faute', a.wrong === 0 && a.matched === tl.length,",
 "check('a perfect reading: no wrong notes', a.wrong === 0 && a.matched === tl.length,"),
("a.matched + '/' + tl.length + ', ' + a.wrong + ' fausses');",
 "a.matched + '/' + tl.length + ', ' + a.wrong + ' wrong');"),
("check('une lecture parfaite : aucun arrêt', a.stops === 0, a.stops);",
 "check('a perfect reading: no stops', a.stops === 0, a.stops);"),
("check('une lecture parfaite : pièce menée au bout', a.covered > 99, a.covered.toFixed(0) + ' %');",
 "check('a perfect reading: piece carried to the end', a.covered > 99, a.covered.toFixed(0) + ' %');"),
("check('une note fausse ne désynchronise pas la suite',",
 "check('one wrong note does not desynchronise what follows',"),
("a.matched === tl.length && a.wrong === 1, a.matched + '/' + tl.length + ', ' + a.wrong + ' fausses');",
 "a.matched === tl.length && a.wrong === 1, a.matched + '/' + tl.length + ', ' + a.wrong + ' wrong');"),
("check('les notes sautées manquent sans compter comme fausses',",
 "check('skipped notes count as missing, not as wrong',"),
("check('un arrêt de 3 s est détecté', a.stops === 1, a.stops + ' arrêt(s)');",
 "check('a 3 s stop is detected', a.stops === 1, a.stops + ' stop(s)');"),
("check('sa durée est mesurée correctement',", "check('its duration is measured correctly',"),
("check('jouer lentement mais régulièrement n\\'est PAS un arrêt', a.stops === 0, a.stops);",
 "check('playing slowly but steadily is NOT a stop', a.stops === 0, a.stops);"),
("check('le tempo réellement tenu est mesuré',", "check('the tempo actually held is measured',"),
("Math.abs(a.bpmPlayed - p.bpm / 1.8) < 2, Math.round(a.bpmPlayed) + ' au lieu de ' + p.bpm);",
 "Math.abs(a.bpmPlayed - p.bpm / 1.8) < 2, Math.round(a.bpmPlayed) + ' instead of ' + p.bpm);"),
("check('une pièce à accords existe au niveau 6', !!chordPiece);",
 "check('a piece with chords exists at level 6', !!chordPiece);"),
("check('un accord joué dans le désordre ne compte aucune faute',",
 "check('a chord played out of order counts no wrong note',"),
("ac.wrong === 0, ac.wrong + ' fausses sur ' + tlc.length);",
 "ac.wrong === 0, ac.wrong + ' wrong out of ' + tlc.length);"),
("check('il ne crée pas non plus d\\'arrêt', ac.stops === 0, ac.stops);",
 "check('nor does it create a stop', ac.stops === 0, ac.stops);"),
("check('un jeu parfaitement régulier a un écart au temps nul',",
 "check('perfectly steady playing is zero off the beat',"),
("analyse(p, tl, perfect).offMs.toFixed(1) + ' ms');",
 "analyse(p, tl, perfect).offMs.toFixed(1) + ' ms');"),
("check('jouer lentement mais régulièrement ne crée aucun écart au temps',",
 "check('playing slowly but steadily is not off the beat',"),
("check('même imprécision sur des noires et sur des croches : même chiffre',",
 "check('same imprecision on quarters and on eighths: same figure',"),
("Math.round(offQuarter) + ' ms contre ' + Math.round(offEighth) + ' ms');",
 "Math.round(offQuarter) + ' ms against ' + Math.round(offEighth) + ' ms');"),
("check('et ce chiffre est bien celui de l\\'imprécision réelle',",
 "check('and that figure is the real imprecision',"),
("check('un ralentissement progressif est vu comme une dérive',",
 "check('a gradual slowing is seen as tempo drift',"),
("check('une lecture parfaite est un passage propre', v1.cleanRun);",
 "check('a perfect reading counts as a clean run', v1.cleanRun);"),
("check('une lecture hachée casse, même avec toutes les notes justes',",
 "check('a halting reading breaks down, even with every note right',"),
("v2.brokeDown && !v2.cleanRun, analyse(p, tl, manyStops).stops + ' arrêts');",
 "v2.brokeDown && !v2.cleanRun, analyse(p, tl, manyStops).stops + ' stops');"),
("check('300 tirages au niveau 4 ne se répètent pas', dup === 0, dup + ' doublons');",
 "check('300 draws at level 4 never repeat', dup === 0, dup + ' duplicates');"),
("check('la partition affiche des notes',", "check('the score shows notes',"),
("check('les symboles de gravure sont charges',", "check('the engraving glyphs are loaded',"),
("check('les cles et le chiffrage sont graves',", "check('clefs and time signature are engraved',"),
("check('la pré-lecture entoure les difficultés ou n\\'en trouve aucune',",
 "check('the pre-reading scan circles the difficulties, or finds none',"),
("check('les repères de pré-lecture s\\'effacent', $('score').querySelectorAll('.sr-hot').length === 0);",
 "check('the pre-reading marks are cleared', $('score').querySelectorAll('.sr-hot').length === 0);"),
("check('aucun clavier n\\'est affiché sur la page',",
 "check('no keyboard is displayed anywhere on the page',"),
("check('aucune hauteur n\\'est portée hors de la partition',",
 "check('no pitch is carried outside the score',"),
("$('sysnav').innerHTML = '<span style=\"color:' + COL_OK + '\">■</span> jouée'",
 "$('sysnav').innerHTML = '<span style=\"color:' + COL_OK + '\">■</span> played'"),
("+ ' &nbsp; <span style=\"color:' + COL_MISS + '\">■</span> manquée';",
 "+ ' &nbsp; <span style=\"color:' + COL_MISS + '\">■</span> missed';"),
("check('deux lectures propres font monter d\\'un niveau', S.level === 5, S.level);",
 "check('two clean runs move the level up by one', S.level === 5, S.level);"),
("check('deux lectures cassées font redescendre', S.level === 4, S.level);",
 "check('two breakdowns move the level back down', S.level === 4, S.level);"),
("check('le niveau ne dépasse jamais 8', S.level === 8, S.level);",
 "check('the level never goes above 8', S.level === 8, S.level);"),
("check('le niveau ne descend jamais sous 1', S.level === 1, S.level);",
 "check('the level never goes below 1', S.level === 1, S.level);"),
("check('les réglages survivent au rechargement', $('tapOn').checked === true);",
 "check('settings survive a page reload', $('tapOn').checked === true);"),
("check('une pièce lue n\\'est plus jamais resservie', same === 0, same + ' reprises');",
 "check('a piece already read is never served again', same === 0, same + ' repeats');"),
("check('au pire, une pièce tient en 100 s (donc 9 pièces au moins)',",
 "check('at worst a piece fits in 100 s (so at least 9 pieces)',"),
("worst < 100000, Math.round(worst / 1000) + ' s');", "worst < 100000, Math.round(worst / 1000) + ' s');"),
("check('une séance ordinaire enchaîne au moins 9 pièces',",
 "check('an ordinary session runs at least 9 pieces',"),
("Math.floor(SESSION_MS / worst) >= 9, Math.floor(SESSION_MS / worst) + ' pièces');",
 "Math.floor(SESSION_MS / worst) >= 9, Math.floor(SESSION_MS / worst) + ' pieces');"),
("+ ' vérifications passées</b></li>'", "+ ' checks passed</b></li>'"),
]


def main():
    src = io.open(SRC, encoding='utf-8').read()
    lines = src.split('\n')

    index = {}
    for i, l in enumerate(lines):
        index.setdefault(l.strip(), []).append(i)

    missing = []
    for fr, en in T:
        hits = index.get(fr.strip())
        if not hits:
            missing.append(fr.strip())
            continue
        for i in hits:
            indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
            lines[i] = indent + en.strip()

    if missing:
        print('BUILD ECHOUE : %d entree(s) ne correspondent a aucune ligne de '
              'lecture-vue.html.' % len(missing))
        print('La page francaise a change ; mets la table a jour.\n')
        for m in missing[:25]:
            print('  -', m[:140])
        return 1

    out = '\n'.join(lines).replace('<html lang="fr">', '<html lang="en">')
    io.open(DST, 'w', encoding='utf-8', newline='').write(out)

    # --- ce qui reste en francais dans la sortie, hors commentaires
    ACC = re.compile(r'[àâäéèêëîïôöùûüçÀÂÉÈÊËÎÏÔÖÙÛÜÇœ]')
    left = []
    for n, l in enumerate(out.split('\n'), 1):
        st = l.strip()
        if st.startswith('//') or st.startswith('*') or st.startswith('/*'):
            continue
        code = re.sub(r'\s//.*$', '', l)
        if ACC.search(code) and re.search(r"'|\"|`|>[^<]+<", code):
            left.append((n, st[:120]))

    print('lecture-vue-en.html genere : %d lignes, %d chaines traduites'
          % (len(lines), len(T)))
    if left:
        print('\n%d ligne(s) portent encore du texte accentue a verifier :' % len(left))
        for n, l in left[:25]:
            print('  %5d| %s' % (n, l))
    else:
        print('aucun texte francais residuel detecte dans la sortie.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
