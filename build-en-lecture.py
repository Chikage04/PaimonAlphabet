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
("+ ' · ♩= ' + piece.bpm + ' · ' + piece.bars + ' mesures · niveau ' + piece.level;",
 "+ ' · ♩= ' + piece.bpm + ' · ' + piece.bars + ' bars · level ' + piece.level;"),
("$('sysnav').textContent = 'Ligne ' + (S.sys + 1) + ' sur ' + systems.length;",
 "$('sysnav').textContent = 'Line ' + (S.sys + 1) + ' of ' + systems.length;"),

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
("['Écart au temps', Math.round(a.offMs) + ' ms', a.offMs < 45 ? 'g' : a.offMs < 90 ? 'w' : 'b'],",
 "['Off the beat by', Math.round(a.offMs) + ' ms', a.offMs < 45 ? 'g' : a.offMs < 90 ? 'w' : 'b'],"),
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
