/* Verifie que la version anglaise l'est VRAIMENT, y compris pour ce qui
   est fabrique a l'execution : noms de tonalites, libelles de niveau,
   bilans. Un scan de chaines dans le fichier ne voit rien de tout ca.
   Verifie aussi que les deux langues partagent la meme progression. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');

const DIR = 'C:/Users/Lucas/PaimonAlphabet/';

function boot(page, seedStore) {
    let html = fs.readFileSync(DIR + page, 'utf8');
    for (const f of ['sightread-glyphs.js', 'sightread-gen.js', 'sightread-render.js'])
        html = html.replace('<script src="' + f + '"></script>',
            '<script>' + fs.readFileSync(DIR + f, 'utf8') + '</script>');
    const PRELUDE = `<script>
window.__T = { now: 1000 };
performance.now = () => window.__T.now;
let __s = 987654321;
Math.random = () => { __s = (__s * 1103515245 + 12345) & 0x7fffffff; return __s / 0x7fffffff; };
const __node = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : __node(),
    apply: () => __node(), set: () => true
});
window.AudioContext = function () {
    return new Proxy({ state: 'running', currentTime: 0, destination: __node() }, {
        get: (t, k) => k in t ? t[k] : k === 'getOutputTimestamp'
            ? (() => ({ contextTime: 0, performanceTime: 0 })) : (() => __node())
    });
};
<\/script>`;
    html = html.replace('<head>', '<head>' + PRELUDE);
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://local.test/' + page
    });
    if (seedStore) for (const k in seedStore) dom.window.localStorage.setItem(k, seedStore[k]);
    return dom.window;
}

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) pass++; else { fail++; console.log('  ECHEC  ' + n + (d ? '  [' + d + ']' : '')); } };
const section = t => console.log('\n' + t);

// Joue une seance complete et rend le DOM tel que l'utilisateur le voit.
function runSession(w, items) {
    const S = () => w.eval('S');
    const midi = (t, p) => w.onMIDIMessage({ data: [0x90, p, 80], timeStamp: t });
    const until = ph => {
        let g = 0;
        while (S().phase !== ph && g++ < 4000) { w.__T.now += 250; w.tick(); }
        return S().phase === ph;
    };
    w.__T.now = 1000;
    w.startSession();
    const keys = [];
    for (let i = 0; i < items && S().running; i++) {
        if (!until('preread')) break;
        keys.push(S().piece.keyName);
        if (!until('read')) break;
        const st = S(), t0 = st.gridT0;
        for (const e of st.tl) { w.__T.now = t0 + e.ms; midi(w.__T.now, e.midi); }
        w.__T.now += 50; w.tick();
    }
    // le bilan de seance n'existe qu'une fois la seance close
    if (w.eval('S.running')) w.endSession();
    return keys;
}

// ------------------------------------------------------------------
section('1. La version anglaise ne laisse passer aucun francais visible');

const FRW = new RegExp(
    '\\b(aucun|aucune|niveau|niveaux|pi[eè]ce|pi[eè]ces|arr[eê]ts?|justes?'
    + '|fausses?|s[ée]ance|tonalit[ée]|mesures?|majeur|mineur|moyenne'
    + '|valeur|entr[ée]es|r[ée]glages|croches?|noires?|do|r[ée]|mi|fa|sol|la|si)\\b', 'i');

{
    const w = boot('lecture-vue-en.html');
    const keys = runSession(w, 4);

    check('la page se declare en anglais',
        w.document.documentElement.lang === 'en', w.document.documentElement.lang);
    check('la langue du generateur est bien basculee',
        w.eval('LANG') === 'en', w.eval('LANG'));

    check('les tonalites sont nommees a l\'anglaise',
        keys.length > 0 && keys.every(k => /^[A-G](#| flat)? (major|minor)$/.test(k)),
        keys.join(', '));

    const labels = [];
    for (let n = 1; n <= 8; n++) labels.push(w.SightGen.generate(n, 7).levelLabel);
    check('les libelles de niveau sont en anglais',
        labels.every(l => !FRW.test(l.replace(/-/g, ' '))), labels[6]);

    // ce que l'utilisateur lit reellement a l'ecran
    const zones = ['phaseText', 'vTitle', 'vLead', 'vChips', 'vTable',
        'rLead', 'rTable', 'rAdvice', 'scoreCap', 'sysnav', 'midiStatus'];
    const dirty = [];
    for (const id of zones) {
        const el = w.document.getElementById(id);
        if (!el) continue;
        const txt = (el.textContent || '').trim();
        if (!txt) continue;
        // on retire les mots anglais homographes du francais
        const probe = txt.replace(/\b(piece|pieces|note|notes|level|major|minor|line)\b/gi, ' ');
        if (FRW.test(probe)) dirty.push(id + ' : ' + txt.slice(0, 80));
    }
    check('aucun francais dans les zones lues par l\'utilisateur', dirty.length === 0,
        dirty.join(' | '));

    check('le bilan de seance est rempli', (w.document.getElementById('rLead').textContent || '').length > 10);
    check('le tableau de seance porte des en-tetes anglais',
        /Piece.*Level.*Key.*Stops/.test(w.document.getElementById('rTable').textContent),
        w.document.getElementById('rTable').textContent.slice(0, 60));
    check('le bilan d\'une piece porte des en-tetes anglais',
        /Measure.*Value/.test(w.document.getElementById('vTable').textContent));
}

// ------------------------------------------------------------------
section('2. La version francaise reste francaise');

{
    const w = boot('lecture-vue.html');
    const keys = runSession(w, 3);
    check('la page se declare en francais',
        w.document.documentElement.lang === 'fr', w.document.documentElement.lang);
    check('les tonalites sont nommees a la francaise',
        keys.every(k => /(majeur|mineur)$/.test(k)), keys.join(', '));
    check('le tableau de seance porte des en-tetes francais',
        /Pièce.*Niveau.*Tonalité/.test(w.document.getElementById('rTable').textContent));
}

// ------------------------------------------------------------------
section('3. Les deux langues partagent la meme progression');

{
    // une piece lue en francais ne doit pas etre reservie en anglais :
    // c'est le meme eleve, la meme origine, le meme stockage
    const w1 = boot('lecture-vue.html');
    runSession(w1, 4);
    const store = {};
    for (let i = 0; i < w1.localStorage.length; i++) {
        const k = w1.localStorage.key(i);
        store[k] = w1.localStorage.getItem(k);
    }
    check('la version francaise a enregistre des pieces lues',
        !!store['lecture.seen'], Object.keys(store).join(', '));

    const seenFr = JSON.parse(store['lecture.seen'] || '{}');
    const allFr = new Set(Object.values(seenFr).flat());

    const w2 = boot('lecture-vue-en.html', store);
    const keys2 = runSession(w2, 4);
    const seenEn = JSON.parse(w2.localStorage.getItem('lecture.seen') || '{}');
    const allEn = Object.values(seenEn).flat();

    check('la version anglaise relit le registre francais',
        allEn.length > allFr.size, allFr.size + ' -> ' + allEn.length);
    check('aucune piece lue en francais n\'est resservie en anglais',
        new Set(allEn).size === allEn.length, allEn.length - new Set(allEn).size + ' doublons');
    check('le niveau atteint est repris d\'une langue a l\'autre',
        w2.localStorage.getItem('lecture.level') !== null,
        w2.localStorage.getItem('lecture.level'));
    check('les tonalites sont bien passees a l\'anglais malgre le stockage francais',
        keys2.every(k => /(major|minor)$/.test(k)), keys2.join(', '));
}

console.log('\n' + (fail === 0 ? 'TOUT PASSE' : 'ECHECS')
    + ' : ' + pass + ' verifications ok, ' + fail + ' en echec');
process.exit(fail ? 1 : 0);
