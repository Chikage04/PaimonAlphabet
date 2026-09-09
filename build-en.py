#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère hanon-en.html à partir de hanon.html.

hanon.html est la SEULE source de vérité. La version anglaise est un produit de
build : on ne la modifie jamais à la main, on modifie la page française puis on
relance ce script. Sans ça les deux copies divergeraient en quelques jours.

La table ci-dessous associe des lignes entières, comparées après suppression de
l'indentation, ce qui rend le remplacement insensible aux décalages de mise en
forme. Toute entrée qui ne correspond à rien fait échouer le build, et tout
texte français restant dans la sortie est signalé : c'est ainsi qu'on détecte
qu'une modification de la page française n'a pas encore été traduite.

Usage : python build-en.py
"""
import io, os, re, sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hanon.html')
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hanon-en.html')

# ---------------------------------------------------------------------------
#  Vocabulaire retenu, aligné sur les termes employés en pédagogie pianistique
#  et dans la littérature sur le contrôle moteur :
#    égalité              -> evenness              (temporal evenness)
#    irrégularité (ms)    -> unevenness
#    intervalle d'attaque -> inter-onset interval (IOI)
#    vélocité             -> key velocity
#    déséquilibre doigts  -> finger balance
#    écart des mains      -> hand asynchrony
#    écart au clic        -> sync to click
#    legato               -> legato / key overlap
#    doigté               -> fingering
#    motif                -> pattern
#    passage              -> pass
#    séance               -> session
#    montée / descente    -> ascending / descending
# ---------------------------------------------------------------------------

T = [

# ---------------------------------------------------------------- en-tête ---
("<title>Hanon — Entraîneur</title>", "<title>Hanon Trainer</title>"),
('<p class="subtitle">Les notes ne sont pas la question. On mesure l\'égalité, les mains et la tenue du tempo.</p>',
 '<p class="subtitle">The notes are not the point. This measures evenness, hand synchrony and tempo stability.</p>'),
('<a href="index.html">🏠 Accueil</a>', '<a href="index.html">🏠 Home</a>'),
('<a href="piano.html">🎹 Accords</a>', '<a href="piano.html">🎹 Chords</a>'),
('<a href="lecture.html">👀 Lecture à vue</a>', '<a href="lecture.html">👀 Sight-reading</a>'),
('<a href="majeur-mineur.html">🎭 Majeur ou Mineur ?</a>', '<a href="majeur-mineur.html">🎭 Major or Minor?</a>'),
('<a href="extrait.html">🎼 Extrait à rejouer</a>', '<a href="extrait.html">🎼 Play-back excerpt</a>'),
('<a href="hanon-en.html" id="langLink">🇬🇧 English version</a>',
 '<a href="hanon.html" id="langLink">🇫🇷 Version française</a>'),
('<div class="midi-status idle" id="midiStatus">🎛️ MIDI : recherche…</div>',
 '<div class="midi-status idle" id="midiStatus">🎛️ MIDI: searching…</div>'),
('<select id="midiSel" title="Entrée MIDI écoutée" style="display:none"></select>',
 '<select id="midiSel" title="MIDI input being listened to" style="display:none"></select>'),

# ------------------------------------------------------------- séance ------
('<button class="btn daily-btn" id="dailyBtn">🗓️ Séance du jour — 30 min</button>',
 '<button class="btn daily-btn" id="dailyBtn">🗓️ Daily session — 30 min</button>'),
('<div class="segmented" id="levelSeg" title="Exigence pour qu\'un passage compte comme propre">',
 '<div class="segmented" id="levelSeg" title="How demanding a pass must be to count as clean">'),
('<button data-level="souple" class="active">Souple</button>',
 '<button data-level="souple" class="active">Lenient</button>'),
('<button data-level="normal">Normal</button>', '<button data-level="normal">Standard</button>'),
('<button data-level="strict">Strict</button>', '<button data-level="strict">Strict</button>'),
('<h2>Passages de cette séance</h2>', '<h2>Passes this session</h2>'),
('<button id="clearRecaps">Vider</button>', '<button id="clearRecaps">Clear</button>'),
('<div><span class="k">Temps restant</span><span class="v" id="rtTime">30:00</span></div>',
 '<div><span class="k">Time left</span><span class="v" id="rtTime">30:00</span></div>'),
('<div><span class="k">Exercice</span><span class="v" id="rtEx">n°1</span></div>',
 '<div><span class="k">Exercise</span><span class="v" id="rtEx">no. 1</span></div>'),
('<div><span class="k">Passages propres</span><span class="v" id="rtStreak">○ ○</span></div>',
 '<div><span class="k">Clean passes</span><span class="v" id="rtStreak">○ ○</span></div>'),
('<div class="segmented" id="rtHandSeg" title="Change les mains travaillées pendant la séance">',
 '<div class="segmented" id="rtHandSeg" title="Switch which hands the session drills">'),
('<button data-h="both" class="active">Les deux mains</button>',
 '<button data-h="both" class="active">Both hands</button>'),

# ------------------------------------------------------------- jauges ------
('<div class="gauge" id="gTempo"><div class="label">Tempo</div><div class="value" id="vTempo">—</div><div class="bar"><i></i></div></div>',
 '<div class="gauge" id="gTempo"><div class="label">Tempo</div><div class="value" id="vTempo">—</div><div class="bar"><i></i></div></div>'),
('<div class="gauge" id="gEven"><div class="label">Égalité</div><div class="value" id="vEven">—</div><div class="bar"><i></i></div></div>',
 '<div class="gauge" id="gEven"><div class="label">Evenness</div><div class="value" id="vEven">—</div><div class="bar"><i></i></div></div>'),
('<div class="gauge" id="gHands"><div class="label">Mains</div><div class="value" id="vHands">—</div><div class="bar"><i></i></div></div>',
 '<div class="gauge" id="gHands"><div class="label">Hands</div><div class="value" id="vHands">—</div><div class="bar"><i></i></div></div>'),
('<div class="gauge" id="gProg"><div class="label">Avancement</div><div class="value" id="vProg">—</div><div class="bar"><i></i></div></div>',
 '<div class="gauge" id="gProg"><div class="label">Progress</div><div class="value" id="vProg">—</div><div class="bar"><i></i></div></div>'),
('<div class="coach" id="coach"><span class="ic">💬</span> Lance une session, les conseils arrivent en jouant</div>',
 '<div class="coach" id="coach"><span class="ic">💬</span> Start a run — coaching appears as you play</div>'),

# ----------------------------------------------------------- contrôles -----
('<select id="exSel" title="Exercice"></select>', '<select id="exSel" title="Exercise"></select>'),
('<div class="control-row"><span class="seg-label">Référence de tempo</span></div>',
 '<div class="control-row"><span class="seg-label">Tempo reference</span></div>'),
('<button data-mode="metro" class="active">Métronome</button>',
 '<button data-mode="metro" class="active">Metronome</button>'),
('<button data-mode="free">Libre</button>', '<button data-mode="free">Free</button>'),
('<div class="control-row"><span class="seg-label">Clic — Hanon est en doubles croches, soit 4 notes par temps</span></div>',
 '<div class="control-row"><span class="seg-label">Click — Hanon is in sixteenth notes, i.e. 4 notes per beat</span></div>'),
('<button data-click="sub" class="active">🔊 Chaque note</button>',
 '<button data-click="sub" class="active">🔊 Every note</button>'),
('<button data-click="beat">Sur le temps</button>', '<button data-click="beat">On the beat</button>'),
('<button data-click="off">Muet</button>', '<button data-click="off">Silent</button>'),
('<div class="control-row"><span class="seg-label">Mains</span></div>',
 '<div class="control-row"><span class="seg-label">Hands</span></div>'),
('<button data-h="both" class="active">Les deux</button>',
 '<button data-h="both" class="active">Both</button>'),
('<button data-h="R">Main droite</button>', '<button data-h="R">Right hand</button>'),
('<button data-h="L">Main gauche</button>', '<button data-h="L">Left hand</button>'),
('<div class="control-row"><span class="seg-label">Longueur</span></div>',
 '<div class="control-row"><span class="seg-label">Length</span></div>'),
('<button data-len="4">4 groupes</button>', '<button data-len="4">4 groups</button>'),
('<button data-len="8" class="active">8 groupes</button>', '<button data-len="8" class="active">8 groups</button>'),
('<button data-len="up">Montée</button>', '<button data-len="up">Ascending</button>'),
('<button data-len="all">Complet</button>', '<button data-len="all">Complete</button>'),
('<button data-len="loop">∞ Boucle</button>', '<button data-len="loop">∞ Loop</button>'),
('<button data-len="frag">✂ Fragment</button>', '<button data-len="frag">✂ Excerpt</button>'),
('<span class="frag-lab">Groupes</span>', '<span class="frag-lab">Groups</span>'),
('<span class="frag-lab">à</span>', '<span class="frag-lab">to</span>'),
('<button class="btn" id="startBtn">▶ Démarrer</button>', '<button class="btn" id="startBtn">▶ Start</button>'),
('<label class="toggle"><input type="checkbox" id="showNames"> Noms des touches</label>',
 '<label class="toggle"><input type="checkbox" id="showNames"> Key names</label>'),
('<label class="toggle"><input type="checkbox" id="coachOn" checked> 💬 Conseils en direct</label>',
 '<label class="toggle"><input type="checkbox" id="coachOn" checked> 💬 Live coaching</label>'),
('<label class="toggle" title="Deux touches voisines enfoncées en même temps comptent pour une seule"><input type="checkbox" id="mergeOn" checked> 🤏 Fusionner les touches voisines</label>',
 '<label class="toggle" title="Two adjacent keys struck together count as one"><input type="checkbox" id="mergeOn" checked> 🤏 Merge adjacent keys</label>'),
('<label class="toggle" title="Une fausse note interrompt le passage, qui repart du début"><input type="checkbox" id="trainOn" checked> 🎯 Mode entraînement</label>',
 '<label class="toggle" title="A wrong note aborts the pass, which restarts from the top"><input type="checkbox" id="trainOn" checked> 🎯 Drill mode</label>'),

# -------------------------------------------------------------- aide -------
("Les doigtés sont issus d'une transcription recoupée avec deux sources indépendantes.",
 "The fingerings come from a transcription cross-checked against two independent sources."),
("Joue <b>pianissimo</b> une fois sur deux : c'est le filtre le plus dur, un doigt faible n'y sonne",
 "Play <b>pianissimo</b> every other time: it is the harshest filter — a weak finger simply"),
("simplement pas. Ajoute <code>?selftest=1</code> à l'URL pour vérifier le moteur de mesure lui-même.",
 "will not sound. Append <code>?selftest=1</code> to the URL to verify the measurement engine itself."),

# ------------------------------------------------------- noms de notes -----
("const SHARP_ABC = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];",
 "const SHARP_ABC = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];"),
("const SHARP_FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];",
 "const SHARP_FR = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];"),

# ------------------------------------------------------------- portée ------
("cap.textContent = 'Groupe ' + (start / MOTIF + 1 + S.groupOffset) + ' — doigtés sous les notes';",
 "cap.textContent = 'Group ' + (start / MOTIF + 1 + S.groupOffset) + ' — fingering under each note';"),

# ------------------------------------------------------------ légende ------
("el.innerHTML = `Exercice <b>n°${S.exNum}</b> — ${total / MOTIF | 0} groupes de ${MOTIF} doubles croches, `",
 "el.innerHTML = `Exercise <b>no. ${S.exNum}</b> — ${total / MOTIF | 0} groups of ${MOTIF} sixteenth notes, `"),
("+ `<b>${total}</b> notes par main`",
 "+ `<b>${total}</b> notes per hand`"),
("? ` — <b>groupes ${S.fragFrom} à ${S.fragTo}</b>, soit les notes `",
 "? ` — <b>groups ${S.fragFrom} to ${S.fragTo}</b>, i.e. notes `"),
("+ `<b>${(S.fragFrom - 1) * MOTIF + 1} à ${S.fragTo * MOTIF}</b>, répétés sans fin.`",
 "+ `<b>${(S.fragFrom - 1) * MOTIF + 1} to ${S.fragTo * MOTIF}</b>, looping endlessly.`"),
(": S.loop ? `, <b>répétés sans fin</b> jusqu'à ce que tu arrêtes.` : '.') + '<br>'",
 ": S.loop ? `, <b>looping endlessly</b> until you stop.` : '.') + '<br>'"),
("+ `À ♩=${S.bpm} : <b>4 notes par temps</b>, une note toutes les <b>${perNote} ms</b>, `",
 "+ `At ♩=${S.bpm}: <b>4 notes per beat</b>, one note every <b>${perNote} ms</b>, `"),
("+ `soit ${(S.bpm * 4 / 60).toFixed(1)} notes par seconde. `",
 "+ `i.e. ${(S.bpm * 4 / 60).toFixed(1)} notes per second. `"),
("+ `Le clic bat chaque note, l'aigu marque le temps.`;",
 "+ `The click marks every note; the higher pitch marks the beat.`;"),

# ---------------------------------------------------------- démarrage ------
("document.getElementById('startBtn').textContent = '⏹ Arrêter';",
 "document.getElementById('startBtn').textContent = '⏹ Stop';"),
("document.getElementById('startBtn').textContent = '▶ Démarrer';",
 "document.getElementById('startBtn').textContent = '▶ Start';"),
("resetCoach('Joue — les conseils arrivent au bout de quelques notes');",
 "resetCoach('Play — coaching starts after a few notes');"),
("resetCoach('Session terminée — le détail est dans le rapport ci-dessous');",
 "resetCoach('Run finished — the detail is in the report below');"),

# --------------------------------------------------------------- coach -----
("if (rel <= -0.03) add('rush', Math.abs(rel) / se, '⏩', 'Tu accélères — reste sur le clic', 'bad');",
 "if (rel <= -0.03) add('rush', Math.abs(rel) / se, '⏩', 'Rushing — stay with the click', 'bad');"),
("else if (rel >= 0.03) add('drag', Math.abs(rel) / se, '⏪', 'Tu ralentis — relance', 'bad');",
 "else if (rel >= 0.03) add('drag', Math.abs(rel) / se, '⏪', 'Dragging — pick it back up', 'bad');"),
("if (cv > 8) add('cv', cv / 4, '〰️', 'Irrégulier — place chaque note', 'bad');",
 "if (cv > 8) add('cv', cv / 4, '〰️', 'Uneven — place every note', 'bad');"),
("if (r < 0.95) add('legato-court', (0.95 - r) / se, '🔗', 'Notes trop courtes — tiens-les jusqu\\'à la suivante', 'warn');",
 "if (r < 0.95) add('legato-court', (0.95 - r) / se, '🔗', 'Notes too short — hold each until the next sounds', 'warn');"),
("else if (r > 1.15) add('legato-long', (r - 1.15) / se, '✂️', 'Tu lies trop — relâche un peu plus tôt', 'warn');",
 "else if (r > 1.15) add('legato-long', (r - 1.15) / se, '✂️', 'Over-connected — release a little sooner', 'warn');"),
("bestF.d > 0 ? `Doigt ${bestF.f} trop fort — allège` : `Doigt ${bestF.f} trop faible — appuie plus`, 'warn');",
 "bestF.d > 0 ? `Finger ${bestF.f} too strong — lighten it` : `Finger ${bestF.f} too weak — press more`, 'warn');"),
("add('pos' + bestP.p, bestP.sev, '🎯', `Tu accentues la note ${bestP.p + 1} du groupe`, 'warn');",
 "add('pos' + bestP.p, bestP.sev, '🎯', `You accent note ${bestP.p + 1} of the group`, 'warn');"),
("sl > 0 ? 'Tu forces en montant — même volume partout'",
 "sl > 0 ? 'Getting louder as you ascend — keep one level'"),
(": 'Tu faiblis en montant — même volume partout', 'warn');",
 ": 'Getting softer as you ascend — keep one level', 'warn');"),
("if (m > 20) add('sync', (m - 20) / se, '🤝', 'Mains décalées — écoute-les ensemble', 'bad');",
 "if (m > 20) add('sync', (m - 20) / se, '🤝', 'Hands out of sync — listen to them together', 'bad');"),
(": '<span class=\"ic\">✓</span> Ça tient — continue';",
 ": '<span class=\"ic\">✓</span> Holding up — keep going';"),

# -------------------------------------------------------------- rapport ----
("const HN = { R: 'Main droite', L: 'Main gauche' };", "const HN = { R: 'Right hand', L: 'Left hand' };"),
("const FING = ['1 (pouce)', '2 (index)', '3 (majeur)', '4 (annulaire)', '5 (auriculaire)'];",
 "const FING = ['1 (thumb)', '2 (index)', '3 (middle)', '4 (ring)', '5 (little)'];"),
("let html = `<h2>${finished ? 'Exercice terminé' : 'Session interrompue'}</h2>`",
 "let html = `<h2>${finished ? 'Exercise completed' : 'Run interrupted'}</h2>`"),
("+ `<p class=\"when\">Hanon n°${S.exNum} — ${A.notes} notes — ♩=${S.bpm} — `",
 "+ `<p class=\"when\">Hanon no. ${S.exNum} — ${A.notes} notes — ♩=${S.bpm} — `"),
("+ `mode ${S.mode === 'metro' ? 'Métronome' : 'Libre'}`",
 "+ `${S.mode === 'metro' ? 'Metronome' : 'Free'} mode`"),
("+ (S.loop ? ` — ${lapOf(S.hands[0]) - 1} tours complets` : '')",
 "+ (S.loop ? ` — ${lapOf(S.hands[0]) - 1} complete laps` : '')"),
("html += card('Égalité (CV)', primary.cv.toFixed(1), '%',",
 "html += card('Evenness (CV)', primary.cv.toFixed(1), '%',"),
("'Écart-type des intervalles entre attaques, rapporté à leur moyenne. Sous 4 % c\\'est propre.', cvCls);",
 "'Standard deviation of inter-onset intervals over their mean. Under 4% is clean.', cvCls);"),
("html += card('Irrégularité', primary.resSD.toFixed(1), 'ms',",
 "html += card('Unevenness', primary.resSD.toFixed(1), 'ms',"),
("'Écart-type des retards par rapport à une grille ajustée localement.', cvCls);",
 "'Standard deviation of timing deviations from a locally fitted grid.', cvCls);"),
("html += card('Tempo réel', primary.bpm.toFixed(0), '♩',",
 "html += card('Actual tempo', primary.bpm.toFixed(0), '♩',"),
("`Visé : ${S.bpm}. Dérive ${s1(primary.drift)} ♩/min.`,",
 "`Target: ${S.bpm}. Drift ${s1(primary.drift)} ♩/min.`,"),
("html += card('Vélocité', primary.velMean.toFixed(0), '',",
 "html += card('Key velocity', primary.velMean.toFixed(0), '',"),
("`Écart-type ${primary.velSD.toFixed(1)} — c'est lui qui compte, pas la moyenne.`, velCls);",
 "`Standard deviation ${primary.velSD.toFixed(1)} — that is what matters, not the mean.`, velCls);"),
("html += card('Crescendo', s1(primary.cresc), '/oct',",
 "html += card('Crescendo', s1(primary.cresc), '/oct',"),
("'Dérive de vélocité par octave montée. Proche de 0 = pas de crescendo involontaire.',",
 "'Velocity drift per octave ascended. Near 0 means no unintended crescendo.',"),
("html += card('Fausses notes', A.wrong, '',",
 "html += card('Wrong notes', A.wrong, '',"),
("'Comptées mais exclues du diagnostic : le doigt reste attribué correctement.',",
 "'Counted but excluded from the diagnosis: the finger is still attributed correctly.',"),
("html += card('Touches voisines', A.merged, '',",
 "html += card('Adjacent-key hits', A.merged, '',"),
("'Attaques à un ton ou moins et à moins de ' + MERGE_MS + ' ms d\\'écart, comptées '",
 "'Onsets a whole tone or less apart and within ' + MERGE_MS + ' ms, counted '"),
("+ 'pour une seule. C\\'est un doigt qui ripe — position de main ou courbure à revoir.', 'warn');",
 "+ 'as one. That is a finger slipping — review hand position and finger curve.', 'warn');"),
("html += card('Écart des mains', A.sync.meanAbs.toFixed(1), 'ms',",
 "html += card('Hand asynchrony', A.sync.meanAbs.toFixed(1), 'ms',"),
("`Biais ${s1(A.sync.bias)} ms (${A.sync.bias > 0 ? 'droite en retard' : 'gauche en retard'}), dispersion ${A.sync.sd.toFixed(1)} ms.`,",
 "`Bias ${s1(A.sync.bias)} ms (${A.sync.bias > 0 ? 'right hand late' : 'left hand late'}), spread ${A.sync.sd.toFixed(1)} ms.`,"),
("html += card('Écart au clic', primary.grid.sd.toFixed(1), 'ms',",
 "html += card('Sync to click', primary.grid.sd.toFixed(1), 'ms',"),
("`Dispersion autour du métronome, latence de sortie (${primary.grid.lat.toFixed(0)} ms) retirée.`,",
 "`Spread around the metronome, output latency (${primary.grid.lat.toFixed(0)} ms) removed.`,"),
("html += card('Legato', primary.artMean.toFixed(2), '×',",
 "html += card('Legato', primary.artMean.toFixed(2), '×',"),
("A.pedal ? '⚠️ Pédale détectée : mesure faussée.'",
 "A.pedal ? '⚠️ Sustain pedal detected: measurement invalid.'"),
(": `Durée / intervalle. > 1 = notes liées. Régularité ${primary.artSD.toFixed(2)}.`,",
 ": `Duration over interval. > 1 means overlapping notes. Consistency ${primary.artSD.toFixed(2)}.`,"),

# ------------------------------------------------------------- tableaux ----
("['Doigt'].concat(...A.order.map(H => [HS[H] + ' retard', HS[H] + ' notes'])),",
 "['Finger'].concat(...A.order.map(H => [HS[H] + ' lag', HS[H] + ' notes'])),"),
("['Doigt'].concat(...A.order.map(H => [HS[H] + ' vélocité', HS[H] + ' écart'])),",
 "['Finger'].concat(...A.order.map(H => [HS[H] + ' velocity', HS[H] + ' deviation'])),"),
("['Note du groupe'].concat(...A.order.map(H => [HS[H] + ' doigt', HS[H] + ' retard'])),",
 "['Note in group'].concat(...A.order.map(H => [HS[H] + ' finger', HS[H] + ' lag'])),"),
("Array.from({ length: MOTIF }, (_, p) => [`n° ${p + 1}`].concat(...A.order.map(H => {",
 "Array.from({ length: MOTIF }, (_, p) => [`no. ${p + 1}`].concat(...A.order.map(H => {"),
("['Mesure'].concat(A.order.map(H => HN[H])),", "['Measure'].concat(A.order.map(H => HN[H])),"),
("['Tempo visé', ...A.order.map(() => S.bpm + ' ♩')],", "['Target tempo', ...A.order.map(() => S.bpm + ' ♩')],"),
("['Tempo moyen', ...A.order.map(H => num(A.hands[H].bpm, 0) + ' ♩')],",
 "['Mean tempo', ...A.order.map(H => num(A.hands[H].bpm, 0) + ' ♩')],"),
("['Écart au tempo visé', ...A.order.map(H => s1(A.hands[H].bpm - S.bpm) + ' ♩')],",
 "['Deviation from target', ...A.order.map(H => s1(A.hands[H].bpm - S.bpm) + ' ♩')],"),
("['Le plus lent', ...A.order.map(H => {", "['Slowest', ...A.order.map(H => {"),
("['Le plus rapide', ...A.order.map(H => {", "['Fastest', ...A.order.map(H => {"),
("['Dérive', ...A.order.map(H => s1(A.hands[H].drift) + ' ♩/min')],",
 "['Drift', ...A.order.map(H => s1(A.hands[H].drift) + ' ♩/min')],"),
("['Intervalle moyen', ...A.order.map(H => num(A.hands[H].ioiMean, 0) + ' ms')]",
 "['Mean interval', ...A.order.map(H => num(A.hands[H].ioiMean, 0) + ' ms')]"),

# --------------------------------------------------------- blocs graphes ---
('html += `<div class="chart-block"><h3>Profil par doigt</h3>',
 'html += `<div class="chart-block"><h3>Timing by finger</h3>'),
("<p>Retard moyen de chaque doigt, en millisecondes, une fois le tempo local retiré.",
 "<p>Mean lag of each finger, in milliseconds, once the local tempo is removed."),
("Au-dessus de zéro le doigt traîne, en dessous il anticipe. ${legend}</p>",
 "Above zero the finger drags, below it anticipates. ${legend}</p>"),
('html += `<div class="chart-block"><h3>Force par doigt</h3>',
 'html += `<div class="chart-block"><h3>Velocity by finger</h3>'),
("<p>Écart de vélocité de chaque doigt à ta moyenne. Le schéma classique : pouce trop fort,",
 "<p>Each finger's velocity deviation from your mean. The classic pattern: thumb too strong,"),
("4 et 5 trop faibles. ${legend}</p>", "ring and little too weak. ${legend}</p>"),
('html += `<div class="chart-block"><h3>Profil par position dans le motif</h3>',
 'html += `<div class="chart-block"><h3>Timing by position in the pattern</h3>'),
("<p>Retard moyen selon le rang de la note dans le groupe de 8. Un pic isolé signale un",
 "<p>Mean lag by rank of the note within the group of 8. An isolated spike signals a"),
("accident mécanique récurrent — changement de position, passage du pouce.",
 "recurring mechanical accident — position shift, thumb crossing."),
("Le doigté indiqué est celui du premier groupe. ${legend}</p>",
 "The fingering shown is that of the first group. ${legend}</p>"),
('html += `<div class="chart-block"><h3>Tenue du tempo</h3>',
 'html += `<div class="chart-block"><h3>Tempo stability</h3>'),
("<p>Tempo local au fil de la session. ${legend}</p>",
 "<p>Local tempo over the course of the run. ${legend}</p>"),
("barChart(document.getElementById('cFinger'), fingers, resSeries, 'ms', v => v.toFixed(0));",
 "barChart(document.getElementById('cFinger'), fingers, resSeries, 'ms', v => v.toFixed(0));"),
("barChart(document.getElementById('cVel'), fingers, velSeries, 'vélocité', v => v.toFixed(0));",
 "barChart(document.getElementById('cVel'), fingers, velSeries, 'velocity', v => v.toFixed(0));"),
("c.fillText('secondes', padL + iw / 2, h - 7);", "c.fillText('seconds', padL + iw / 2, h - 7);"),
("c.fillText('cible ' + target, padL + 4, Y(target) - 4);",
 "c.fillText('target ' + target, padL + 4, Y(target) - 4);"),

# --------------------------------------------------------------- verdict ---
("if (p.cv < 4) li.push('<span class=\"ok\">Égalité propre</span> — CV sous 4 %, on est dans les clous.');",
 "if (p.cv < 4) li.push('<span class=\"ok\">Clean evenness</span> — CV under 4%, well within range.');"),
("else if (p.cv < 8) li.push(`Égalité moyenne (${p.cv.toFixed(1)} %). Redescends de 10 ♩ et vise 4 %.`);",
 "else if (p.cv < 8) li.push(`Middling evenness (${p.cv.toFixed(1)}%). Drop 10 ♩ and aim for 4%.`);"),
("else li.push(`<span class=\"no\">Égalité insuffisante (${p.cv.toFixed(1)} %)</span> — ce tempo est trop rapide pour ton contrôle actuel.`);",
 "else li.push(`<span class=\"no\">Insufficient evenness (${p.cv.toFixed(1)}%)</span> — this tempo is beyond your current control.`);"),
("li.push(`Le <b>doigt ${worstF}</b> ${worstV > 0 ? 'traîne' : 'anticipe'} de ${Math.abs(worstV).toFixed(0)} ms en moyenne. Travaille le groupe au ralenti en ne pensant qu'à lui.`);",
 "li.push(`<b>Finger ${worstF}</b> ${worstV > 0 ? 'drags' : 'anticipates'} by ${Math.abs(worstV).toFixed(0)} ms on average. Work the group slowly, thinking only about it.`);"),
("li.push(`Le <b>doigt ${weakF}</b> sort ${Math.abs(weakV).toFixed(0)} points de vélocité sous la moyenne. Essaie l'exercice en pianissimo : c'est là que ça se verra le plus.`);",
 "li.push(`<b>Finger ${weakF}</b> comes out ${Math.abs(weakV).toFixed(0)} velocity points below the mean. Try the exercise pianissimo — that is where it shows most.`);"),
("li.push(`Accident récurrent sur la <b>note ${pk + 1}</b> du groupe (${s1(pv)} ms). C'est mécanique, pas musical.`);",
 "li.push(`Recurring accident on <b>note ${pk + 1}</b> of the group (${s1(pv)} ms). Mechanical, not musical.`);"),
("li.push(`Tu ${p.cresc > 0 ? 'montes' : 'descends'} en volume de ${Math.abs(p.cresc).toFixed(0)} points par octave sans le vouloir.`);",
 "li.push(`You ${p.cresc > 0 ? 'get louder' : 'get softer'} by ${Math.abs(p.cresc).toFixed(0)} points per octave without meaning to.`);"),
("li.push(`Le tempo ${p.drift > 0 ? 'accélère' : 'ralentit'} de ${Math.abs(p.drift).toFixed(0)} ♩ par minute.`);",
 "li.push(`The tempo ${p.drift > 0 ? 'speeds up' : 'slows down'} by ${Math.abs(p.drift).toFixed(0)} ♩ per minute.`);"),
("li.push(`Les mains sont décalées de ${A.sync.meanAbs.toFixed(0)} ms en moyenne — au-delà de 30 ms ça s'entend nettement.`);",
 "li.push(`Hands are ${A.sync.meanAbs.toFixed(0)} ms apart on average — beyond 30 ms it is clearly audible.`);"),
("li.push('Pédale de sustain détectée pendant la session : la mesure de legato est à ignorer.');",
 "li.push('Sustain pedal detected during the run: ignore the legato measurement.');"),
("if (li.length === 1) li.push('<span class=\"ok\">Rien à signaler ailleurs.</span> Monte de 4 à 8 ♩ à la prochaine session.');",
 "if (li.length === 1) li.push('<span class=\"ok\">Nothing else to report.</span> Add 4 to 8 ♩ next run.');"),
("return `<div class=\"verdict\"><b>Ce que disent les chiffres</b><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul></div>`;",
 "return `<div class=\"verdict\"><b>What the numbers say</b><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul></div>`;"),

# --------------------------------------------------------------- records ---
("? `<span class=\"record-line\">Record de tempo propre sur le n°${S.exNum} : <b>♩=${r.bpm}</b> <span style=\"opacity:.7\">(${r.date})</span></span>`",
 "? `<span class=\"record-line\">Clean-tempo record on no. ${S.exNum}: <b>♩=${r.bpm}</b> <span style=\"opacity:.7\">(${r.date})</span></span>`"),
(": `<span class=\"record-line\">Pas encore de tempo propre enregistré sur le n°${S.exNum} — il faut CV &lt; 5 %, vélocité régulière et zéro fausse note.</span>`;",
 ": `<span class=\"record-line\">No clean tempo recorded yet on no. ${S.exNum} — needs CV &lt; 5%, steady velocity and zero wrong notes.</span>`;"),

# ------------------------------------------------------------------ MIDI ---
("const nameOf = i => i.name || 'appareil sans nom';", "const nameOf = i => i.name || 'unnamed device';"),
("oAll.textContent = 'Toutes les entrées (doublons)';", "oAll.textContent = 'All inputs (duplicates)';"),
("if (!n) setMidiStatus('off', '🎛️ MIDI : aucun clavier détecté (branche-le puis rejoue une note)');",
 "if (!n) setMidiStatus('off', '🎛️ MIDI: no keyboard detected (plug it in, then play a note)');"),
("else if (all) setMidiStatus('off', `⚠️ ${n} entrées écoutées — chaque note sera comptée ${n} fois`);",
 "else if (all) setMidiStatus('off', `⚠️ ${n} inputs listened to — every note will be counted ${n} times`);"),
("else if (n > 1) setMidiStatus('on', `🎹 ${nameOf(target)} — ${n - 1} autre${n > 2 ? 's' : ''} entrée${n > 2 ? 's' : ''} ignorée${n > 2 ? 's' : ''}`);",
 "else if (n > 1) setMidiStatus('on', `🎹 ${nameOf(target)} — ${n - 1} other input${n > 2 ? 's' : ''} ignored`);"),
("else setMidiStatus('on', '🎹 MIDI connecté : ' + nameOf(target));",
 "else setMidiStatus('on', '🎹 MIDI connected: ' + nameOf(target));"),
("setMidiStatus('idle', '🎛️ Web MIDI non supporté — utilise Chrome ou Edge');",
 "setMidiStatus('idle', '🎛️ Web MIDI not supported — use Chrome or Edge');"),
("}).catch(() => setMidiStatus('idle', '🎛️ MIDI : accès refusé'));",
 "}).catch(() => setMidiStatus('idle', '🎛️ MIDI: access denied'));"),

# ------------------------------------------------------ exercices doutes ---
("5: 'doigté de la descente', 6: 'doigté de la descente',",
 "5: 'the fingering of the descent', 6: 'the fingering of the descent',"),
("15: 'une note de la main gauche', 20: 'une note en fin de descente'",
 "15: 'one left-hand note', 20: 'one note near the end of the descent'"),
("o.textContent = 'Hanon n°' + i + (A_VERIFIER[i] ? ' ⚠' : '');",
 "o.textContent = 'Hanon no. ' + i + (A_VERIFIER[i] ? ' ⚠' : '');"),
("w.innerHTML = `⚠️ Sur le n°${n}, les deux sources croisées divergent sur <b>${A_VERIFIER[n]}</b>. `",
 "w.innerHTML = `⚠️ On no. ${n}, the two cross-checked sources disagree on <b>${A_VERIFIER[n]}</b>. `"),
("+ `Les autres exercices sont concordants — vérifie ce passage contre ton édition papier.`;",
 "+ `The other exercises agree — check this spot against your printed edition.`;"),
("'sur ' + total + ' groupes · ' + ((+b.value - +a.value + 1) * MOTIF) + ' notes par tour';",
 "'of ' + total + ' groups · ' + ((+b.value - +a.value + 1) * MOTIF) + ' notes per lap';"),

# ------------------------------------------------------------- niveaux -----
("souple: { label: 'Souple', even: 8, finger: 5,   tempo: 5, grid: 45, minBpm: 0,  artSD: null, art: null },",
 "souple: { label: 'Lenient', even: 8, finger: 5,   tempo: 5, grid: 45, minBpm: 0,  artSD: null, art: null },"),
("normal: { label: 'Normal', even: 6, finger: 3.5, tempo: 3, grid: 30, minBpm: 60, artSD: 0.15, art: null },",
 "normal: { label: 'Standard', even: 6, finger: 3.5, tempo: 3, grid: 30, minBpm: 60, artSD: 0.15, art: null },"),
("strict: { label: 'Strict', even: 4, finger: 2.5, tempo: 2, grid: 20, minBpm: 80, artSD: 0.12, art: 0.95 }",
 "strict: { label: 'Strict', even: 4, finger: 2.5, tempo: 2, grid: 20, minBpm: 80, artSD: 0.12, art: 0.95 }"),
("const RT_HAND_LABEL = { both: 'les deux mains', R: 'main droite seule', L: 'main gauche seule' };",
 "const RT_HAND_LABEL = { both: 'both hands', R: 'right hand alone', L: 'left hand alone' };"),

# -------------------------------------------------------------- critères ---
("c.push({ label: 'Exercice terminé', ok: !!finished, val: finished ? 'oui' : 'non' });",
 "c.push({ label: 'Exercise completed', ok: !!finished, val: finished ? 'yes' : 'no' });"),
("c.push({ label: 'Fausses notes', ok: !!A && A.wrong === 0, val: A ? String(A.wrong) : '—', lim: '0' });",
 "c.push({ label: 'Wrong notes', ok: !!A && A.wrong === 0, val: A ? String(A.wrong) : '—', lim: '0' });"),
("label: 'Tempo minimum', ok: S.bpm >= L.minBpm,", "label: 'Minimum tempo', ok: S.bpm >= L.minBpm,"),
("label: 'Égalité' + n, ok: h.resSD <= tol,", "label: 'Evenness' + n, ok: h.resSD <= tol,"),
("label: 'Doigts' + n, ok: h.fingerSD <= L.finger,", "label: 'Finger balance' + n, ok: h.fingerSD <= L.finger,"),
("c.push({ label: 'Tempo' + n, ok: dt <= L.tempo, val: dt.toFixed(1) + ' %', lim: '±' + L.tempo + ' %' });",
 "c.push({ label: 'Tempo' + n, ok: dt <= L.tempo, val: dt.toFixed(1) + '%', lim: '±' + L.tempo + '%' });"),
("if (h.grid) c.push({ label: 'Clic' + n, ok: h.grid.sd <= L.grid, val: h.grid.sd.toFixed(0) + ' ms', lim: '≤ ' + L.grid + ' ms' });",
 "if (h.grid) c.push({ label: 'Click' + n, ok: h.grid.sd <= L.grid, val: h.grid.sd.toFixed(0) + ' ms', lim: '≤ ' + L.grid + ' ms' });"),
("label: 'Legato régulier' + n, ok: h.artSD <= L.artSD,",
 "label: 'Legato consistency' + n, ok: h.artSD <= L.artSD,"),
("label: 'Legato' + n, ok: h.artMean >= L.art,", "label: 'Legato' + n, ok: h.artMean >= L.art,"),

# ------------------------------------------------------- config séance -----
("'Exercice complet · ' + RT_HAND_LABEL[routine.hands] + ' · métronome ♩='",
 "'Complete exercise · ' + RT_HAND_LABEL[routine.hands] + ' · metronome ♩='"),
("+ '<br>Niveau <b>' + L.label + '</b> — zéro fausse note, irrégularité ≤ '",
 "+ '<br><b>' + L.label + '</b> level — zero wrong notes, unevenness ≤ '"),
("+ evenTolerance(L, 60000 / S.bpm / 4).toFixed(0) + ' ms, doigts ≤ ' + L.finger",
 "+ evenTolerance(L, 60000 / S.bpm / 4).toFixed(0) + ' ms, finger balance ≤ ' + L.finger"),
("+ ', tempo ±' + L.tempo + ' %, clic ≤ ' + L.grid + ' ms'",
 "+ ', tempo ±' + L.tempo + '%, click ≤ ' + L.grid + ' ms'"),
("+ (L.artSD ? ', legato régulier à ±' + L.artSD.toFixed(2) : '')",
 "+ (L.artSD ? ', legato consistency within ±' + L.artSD.toFixed(2) : '')"),
("+ (L.art ? ' et ≥ ' + L.art.toFixed(2) + '×' : '')",
 "+ (L.art ? ' and ≥ ' + L.art.toFixed(2) + '×' : '')"),
("+ (L.minBpm ? ', à partir de ♩=' + L.minBpm : '');",
 "+ (L.minBpm ? ', from ♩=' + L.minBpm + ' upwards' : '');"),
("document.getElementById('rtEx').textContent = 'n°' + routine.ex;",
 "document.getElementById('rtEx').textContent = 'no. ' + routine.ex;"),
("+ `<span class=\"res\">${r.clean ? '✓ propre' : '✗ ' + r.why}</span></li>`",
 "+ `<span class=\"res\">${r.clean ? '✓ clean' : '✗ ' + r.why}</span></li>`"),

# ------------------------------------------------------- messages séance ---
("setRtState('↻ Passage relancé en ' + RT_HAND_LABEL[h], '');",
 "setRtState('↻ Pass restarted with ' + RT_HAND_LABEL[h], '');"),
("setRtState('▶ Exercice n°' + routine.ex + ' — passage ' + (routine.streak + 1)",
 "setRtState('▶ Exercise no. ' + routine.ex + ' — pass ' + (routine.streak + 1)"),
("+ ' sur ' + DAILY_PERFECT, '');", "+ ' of ' + DAILY_PERFECT, '');"),
("setRtState('✓ Validé — on passe au n°' + routine.ex, 'ok');",
 "setRtState('✓ Passed — moving on to no. ' + routine.ex, 'ok');"),
("setRtState('✓ Propre — encore un passage pour valider', 'ok');",
 "setRtState('✓ Clean — one more pass to validate', 'ok');"),
("setRtState('✗ ' + f.label + ' : ' + f.val + (f.lim ? ' (il faut ' + f.lim + ')' : '')",
 "setRtState('✗ ' + f.label + ': ' + f.val + (f.lim ? ' (needs ' + f.lim + ')' : '')"),
("+ ' — on recommence', 'bad');", "+ ' — starting over', 'bad');"),
("document.getElementById('dailyBtn').textContent = '⏹ Terminer la séance';",
 "document.getElementById('dailyBtn').textContent = '⏹ End session';"),
("document.getElementById('dailyBtn').textContent = '🗓️ Séance du jour — 30 min';",
 "document.getElementById('dailyBtn').textContent = '🗓️ Daily session — 30 min';"),
("setRtState(`Séance terminée — ${fmtClock(used)} de jeu, ${validated} exercice`",
 "setRtState(`Session over — ${fmtClock(used)} played, ${validated} exercise`"),
("+ `${validated > 1 ? 's validés' : ' validé'}, ${routine.log.length} passage`",
 "+ `${validated > 1 ? 's passed' : ' passed'}, ${routine.log.length} pass`"),
("+ `${routine.log.length > 1 ? 's' : ''}`, 'ok');", "+ `${routine.log.length > 1 ? 'es' : ''}`, 'ok');"),
("? `Dernière séance : ${d.date} (${d.level || ''}) — ${d.validated} validé${d.validated > 1 ? 's' : ''}, arrêté au n°${d.reached}`",
 "? `Last session: ${d.date} (${d.level || ''}) — ${d.validated} passed, stopped at no. ${d.reached}`"),
(": 'Chaque exercice dans l\\'ordre, deux passages propres pour le valider, 30 minutes chrono.';",
 ": 'Every exercise in order, two clean passes to validate each, 30 minutes on the clock.';"),

# ------------------------------------------------- mode entraînement -------
("el.innerHTML = '<span class=\"ic\">✗</span> Fausse note — reprise du passage dans '",
 "el.innerHTML = '<span class=\"ic\">✗</span> Wrong note — pass restarts in '"),
("+ Math.ceil(left / 1000) + ' s';", "+ Math.ceil(left / 1000) + ' s';"),

# ------------------------------------------------------------- récaps ------
("recaps.length + (recaps.length > 1 ? ' passages' : ' passage');",
 "recaps.length + (recaps.length > 1 ? ' passes' : ' pass');"),
("? (r.validated ? '✓ propre, exercice validé' : '✓ propre')",
 "? (r.validated ? '✓ clean, exercise passed' : '✓ clean')"),
(": r.reason === 'fausse' ? '✗ fausse note'", ": r.reason === 'fausse' ? '✗ wrong note'"),
(": r.wrong ? '✗ ' + r.wrong + ' fausse' + (r.wrong > 1 ? 's' : '')",
 ": r.wrong ? '✗ ' + r.wrong + ' wrong note' + (r.wrong > 1 ? 's' : '')"),
(": '✗ interrompu';", ": '✗ interrupted';"),
("? `À la note ${r.fail.idx + 1} sur ${r.fail.total} (${HN[r.fail.hand].toLowerCase()}) : `",
 "? `At note ${r.fail.idx + 1} of ${r.fail.total} (${HN[r.fail.hand].toLowerCase()}): `"),
("+ `<b>${fullName(r.fail.played)}</b> au lieu de <b>${fullName(r.fail.expected)}</b>.`",
 "+ `<b>${fullName(r.fail.played)}</b> instead of <b>${fullName(r.fail.expected)}</b>.`"),
("['irrég.', num(h.res, 1, ' ms')], ['CV', num(h.cv, 1, ' %')],",
 "['uneven', num(h.res, 1, ' ms')], ['CV', num(h.cv, 1, '%')],"),
("['doigts', num(h.fingerSD, 1)], ['force', num(h.vel, 1)],",
 "['fingers', num(h.fingerSD, 1)], ['velocity', num(h.vel, 1)],"),
("['tempo', num(h.tempo, 0, ' ♩')], ['clic', num(h.grid, 0, ' ms')],",
 "['tempo', num(h.tempo, 0, ' ♩')], ['click', num(h.grid, 0, ' ms')],"),
("+ `<div class=\"rc-fingers\">force par doigt <b>${fv}</b></div></div>`;",
 "+ `<div class=\"rc-fingers\">velocity by finger <b>${fv}</b></div></div>`;"),
("['notes', r.notes], ['mains', num(r.sync, 1, ' ms')],",
 "['notes', r.notes], ['hands', num(r.sync, 1, ' ms')],"),
("['voisines', r.merged || null], ['pédale', r.pedal ? 'oui' : null]",
 "['adjacent', r.merged || null], ['pedal', r.pedal ? 'yes' : null]"),
("+ `<div class=\"rc-head\"><span class=\"ex\">n°${r.ex}</span>`",
 "+ `<div class=\"rc-head\"><span class=\"ex\">no. ${r.ex}</span>`"),
("+ `<span class=\"when\">passage ${i + 1} · `", "+ `<span class=\"when\">pass ${i + 1} · `"),
("+ (L ? `<div class=\"rc-note\">Niveau ${L.label} · ♩=${r.bpm}</div>` : '')",
 "+ (L ? `<div class=\"rc-note\">${L.label} level · ♩=${r.bpm}</div>` : '')"),
]

# --------------------------------------------------------------------------
#  Auto-test : les libellés d'assertion sont visibles avec ?selftest=1
# --------------------------------------------------------------------------
T += [
("out.push(`${cond ? '  OK  ' : ' ÉCHEC'} │ ${name.padEnd(46)} │ ${got}`);",
 "out.push(`${cond ? '  OK  ' : ' FAIL '} │ ${name.padEnd(46)} │ ${got}`);"),
("check('jeu parfait : CV ≈ 0', A.hands.R.cv < 0.01, A.hands.R.cv.toFixed(4) + ' %');",
 "check('perfect playing: CV ≈ 0', A.hands.R.cv < 0.01, A.hands.R.cv.toFixed(4) + '%');"),
("check('jeu parfait : irrégularité ≈ 0', A.hands.R.resSD < 0.01, A.hands.R.resSD.toFixed(4) + ' ms');",
 "check('perfect playing: unevenness ≈ 0', A.hands.R.resSD < 0.01, A.hands.R.resSD.toFixed(4) + ' ms');"),
("check('jeu parfait : mains synchrones', A.sync.meanAbs < 0.01, A.sync.meanAbs.toFixed(4) + ' ms');",
 "check('perfect playing: hands in sync', A.sync.meanAbs < 0.01, A.sync.meanAbs.toFixed(4) + ' ms');"),
("check('jeu parfait : vélocité constante', A.hands.R.velSD < 0.01, A.hands.R.velSD.toFixed(4));",
 "check('perfect playing: constant velocity', A.hands.R.velSD < 0.01, A.hands.R.velSD.toFixed(4));"),
("check('retard de 20 ms sur le doigt 4 → détecté', gap > 15 && gap < 25, gap.toFixed(1) + ' ms d\\'écart');",
 "check('20 ms lag on finger 4 → detected', gap > 15 && gap < 25, gap.toFixed(1) + ' ms apart');"),
("check('… et les autres doigts restent groupés', sd(others) < 6, 'dispersion ' + sd(others).toFixed(1) + ' ms');",
 "check('… and the other fingers stay grouped', sd(others) < 6, 'spread ' + sd(others).toFixed(1) + ' ms');"),
("check('décalage de 15 ms entre les mains', Math.abs(A.sync.meanAbs - 15) < 1.5, A.sync.meanAbs.toFixed(1) + ' ms');",
 "check('15 ms offset between hands', Math.abs(A.sync.meanAbs - 15) < 1.5, A.sync.meanAbs.toFixed(1) + ' ms');"),
("check('… avec le bon signe (gauche en retard)', A.sync.bias < -13, 'biais ' + A.sync.bias.toFixed(1) + ' ms');",
 "check('… with the right sign (left hand late)', A.sync.bias < -13, 'bias ' + A.sync.bias.toFixed(1) + ' ms');"),
("check('tempo qui accélère → dérive positive', A.hands.R.drift > 5, s1(A.hands.R.drift) + ' ♩/min');",
 "check('accelerating tempo → positive drift', A.hands.R.drift > 5, s1(A.hands.R.drift) + ' ♩/min');"),
("check('crescendo de 8 par octave → détecté', Math.abs(A.hands.R.cresc - 8) < 1.5, A.hands.R.cresc.toFixed(2) + ' /octave');",
 "check('crescendo of 8 per octave → detected', Math.abs(A.hands.R.cresc - 8) < 1.5, A.hands.R.cresc.toFixed(2) + ' /octave');"),
("check('décalage constant vs clic → latence isolée', A.hands.R.grid.sd < 0.01 && Math.abs(A.hands.R.grid.lat - 40) < 1,",
 "check('constant offset vs click → latency isolated', A.hands.R.grid.sd < 0.01 && Math.abs(A.hands.R.grid.lat - 40) < 1,"),
("'latence ' + A.hands.R.grid.lat.toFixed(1) + ' ms, dispersion ' + A.hands.R.grid.sd.toFixed(3) + ' ms');",
 "'latency ' + A.hands.R.grid.lat.toFixed(1) + ' ms, spread ' + A.hands.R.grid.sd.toFixed(3) + ' ms');"),
("check('20 exercices : mains exactement à l\\'octave', octOk, tot + ' notes vérifiées');",
 "check('20 exercises: hands exactly an octave apart', octOk, tot + ' notes verified');"),
("check('20 exercices : doigtés tous entre 1 et 5', figOk, 'OK');",
 "check('20 exercises: all fingerings between 1 and 5', figOk, 'OK');"),
("check('hauteur des touches = hauteur réservée', Math.abs(kh - KB_H) < 0.5,",
 "check('key height = reserved height', Math.abs(kh - KB_H) < 0.5,"),
("`touches ${kh}px, réservé ${KB_H}px`);", "`keys ${kh}px, reserved ${KB_H}px`);"),
("check('jeu parfait → le coach se tait', adv({ durRatio: 1.05 }) === null,",
 "check('perfect playing → the coach stays silent', adv({ durRatio: 1.05 }) === null,"),
("String((adv({ durRatio: 1.05 }) || {}).key || 'silence'));",
 "String((adv({ durRatio: 1.05 }) || {}).key || 'silent'));"),
("check('doigt 4 trop faible → nommé correctement',", "check('finger 4 too weak → named correctly',"),
("a && a.key === 'doigt4' && /appuie plus/.test(a.text), a ? a.key + ' : ' + a.text : 'aucun conseil');",
 "a && a.key === 'doigt4' && /press more/.test(a.text), a ? a.key + ': ' + a.text : 'no advice');"),
("check('pouce trop fort → nommé correctement',", "check('thumb too strong → named correctly',"),
("a && a.key === 'doigt1' && /allège/.test(a.text), a ? a.key + ' : ' + a.text : 'aucun conseil');",
 "a && a.key === 'doigt1' && /lighten it/.test(a.text), a ? a.key + ': ' + a.text : 'no advice');"),
("check('notes trop courtes → « tiens-les »',", "check('notes too short → \"hold them\"',"),
("a && a.key === 'legato-court', a ? a.key : 'aucun conseil');",
 "a && a.key === 'legato-court', a ? a.key : 'no advice');"),
("check('notes trop liées → « relâche plus tôt »',", "check('notes over-connected → \"release sooner\"',"),
("a && a.key === 'legato-long', a ? a.key : 'aucun conseil');",
 "a && a.key === 'legato-long', a ? a.key : 'no advice');"),
("check('12 % trop rapide → « tu accélères »', a && a.key === 'rush', a ? a.key : 'aucun conseil');",
 "check('12% too fast → \"rushing\"', a && a.key === 'rush', a ? a.key : 'no advice');"),
("check('13 % trop lent → « tu ralentis »', a && a.key === 'drag', a ? a.key : 'aucun conseil');",
 "check('13% too slow → \"dragging\"', a && a.key === 'drag', a ? a.key : 'no advice');"),
("check('mains décalées de 45 ms → signalé', a && a.key === 'sync', a ? a.key : 'aucun conseil');",
 "check('hands 45 ms apart → flagged', a && a.key === 'sync', a ? a.key : 'no advice');"),
("check('écart de 3 sur un doigt → sous le bruit, ignoré', a === null, a ? a.key : 'silence');",
 "check('3-point finger gap → below noise, ignored', a === null, a ? a.key : 'silent');"),
("check('mode Libre : tempo différent du curseur → pas de reproche',",
 "check('Free mode: tempo differing from the slider → no complaint',"),
("a === null || a.key !== 'rush', a ? a.key : 'silence');",
 "a === null || a.key !== 'rush', a ? a.key : 'silent');"),
("check('mode Métronome : le même jeu est bien signalé', a && a.key === 'rush', a ? a.key : 'silence');",
 "check('Metronome mode: the same playing is flagged', a && a.key === 'rush', a ? a.key : 'silent');"),
("check('boucle : un tour = nombre entier de groupes', loopOk,",
 "check('loop: one lap = whole number of groups', loopOk,"),
("'de ' + Math.min(...loopLens) + ' à ' + Math.max(...loopLens) + ' notes par tour');",
 "'from ' + Math.min(...loopLens) + ' to ' + Math.max(...loopLens) + ' notes per lap');"),
("check('boucle : position dans le motif conservée sur 3 tours', alignOk, Lp + ' notes par tour');",
 "check('loop: position in pattern preserved over 3 laps', alignOk, Lp + ' notes per lap');"),
("check('boucle : la note finale isolée est écartée',", "check('loop: the isolated final note is dropped',"),
("check('réglage inconnu → le groupe garde un bouton actif',",
 "check('unknown setting → the group keeps an active button',"),
("segValue('modeSeg') === modeBefore, 'resté sur « ' + segValue('modeSeg') + ' »');",
 "segValue('modeSeg') === modeBefore, 'stayed on \"' + segValue('modeSeg') + '\"');"),
("check('les réglages sont bien écrits', !!round && round.mode === modeBefore,",
 "check('settings are actually written', !!round && round.mode === modeBefore,"),
("round ? Object.keys(round).length + ' champs' : 'rien écrit');",
 "round ? Object.keys(round).length + ' fields' : 'nothing written');"),
("check('fenêtre de fusion bien en deçà du jeu le plus rapide',",
 "check('merge window well below the fastest playing',"),
("MERGE_MS < fastest / 2, MERGE_MS + ' ms contre ' + fastest.toFixed(0) + ' ms à ♩=' + bpmMax);",
 "MERGE_MS < fastest / 2, MERGE_MS + ' ms against ' + fastest.toFixed(0) + ' ms at ♩=' + bpmMax);"),
("check('verrou plus long que l\\'intervalle le plus lent',",
 "check('lockout longer than the slowest interval',"),
("TRAIN_LOCK_MS > slowest, TRAIN_LOCK_MS + ' ms contre ' + slowest.toFixed(0)",
 "TRAIN_LOCK_MS > slowest, TRAIN_LOCK_MS + ' ms against ' + slowest.toFixed(0)"),
("+ ' ms à ♩=' + document.getElementById('bpm').min);",
 "+ ' ms at ♩=' + document.getElementById('bpm').min);"),
("check('noms des touches noires corrects',", "check('black-key names correct',"),
("check('les 3 choix de mains de la séance existent',", "check('the 3 session hand choices exist',"),
("check('fragment : 2 groupes = 16 notes', fr.R.length === 16 && fr.L.length === 16,",
 "check('excerpt: 2 groups = 16 notes', fr.R.length === 16 && fr.L.length === 16,"),
("fr.R.length + ' notes par main');", "fr.R.length + ' notes per hand');"),
("check('fragment : découpe au bon endroit',", "check('excerpt: cut at the right place',"),
("'commence sur la note ' + (27 * MOTIF + 1));", "'starts on note ' + (27 * MOTIF + 1));"),
("check('fragment : aligné sur le motif', fr.R.length % MOTIF === 0,",
 "check('excerpt: aligned to the pattern', fr.R.length % MOTIF === 0,"),
("check('fragment : bornes hors plage ramenées dans l\\'exercice',",
 "check('excerpt: out-of-range bounds clamped into the exercise',"),
("buildSeq(1, 'frag', 999, 999).R.length === MOTIF, 'dernier groupe seul');",
 "buildSeq(1, 'frag', 999, 999).R.length === MOTIF, 'last group alone');"),
("check('tolérance jamais sous le seuil d\\'audibilité',",
 "check('tolerance never below the audibility threshold',"),
("'Strict à ♩=144 : ' + tolFast.toFixed(0) + ' ms, Souple à ♩=40 : ' + tolSlow.toFixed(0) + ' ms');",
 "'Strict at ♩=144: ' + tolFast.toFixed(0) + ' ms, Lenient at ♩=40: ' + tolSlow.toFixed(0) + ' ms');"),
("check('6 ports pour un piano → un seul écouté', live.length === 1, live.length + ' port(s) actif(s)');",
 "check('6 ports for one piano → only one listened to', live.length === 1, live.length + ' active port(s)');"),
("check('… et c\\'est bien « piano 2 » par défaut', live.length === 1 && live[0].name === 'piano 2',",
 "check('… and it is indeed \"piano 2\" by default', live.length === 1 && live[0].name === 'piano 2',"),
("`<pre>Auto-test du moteur de mesure\\n${'─'.repeat(74)}\\n${out.join('\\n')}\\n${'─'.repeat(74)}\\n`",
 "`<pre>Measurement engine self-test\\n${'─'.repeat(74)}\\n${out.join('\\n')}\\n${'─'.repeat(74)}\\n`"),
("+ `${pass} réussis, ${fail} échoués</pre>`;", "+ `${pass} passed, ${fail} failed</pre>`;"),
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
        print('BUILD ECHOUE : %d entree(s) ne correspondent a aucune ligne de hanon.html.' % len(missing))
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

    print('hanon-en.html genere : %d lignes, %d chaines traduites' % (len(lines), len(T)))
    if left:
        print('\n%d ligne(s) portent encore du texte accentue a verifier :' % len(left))
        for n, l in left[:20]:
            print('  %5d| %s' % (n, l))
    else:
        print('aucun texte francais residuel detecte dans la sortie.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
