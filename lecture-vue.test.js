/* Charge lecture-vue.html dans jsdom et lance sa verification embarquee.
   Chrome ne peut pas joindre un serveur local lance depuis Bash : jsdom
   est la seule voie de validation reelle de cette page. */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');

const DIR = 'C:/Users/Lucas/PaimonAlphabet/';
const PAGE = process.argv[2] || 'lecture-vue.html';
let html = fs.readFileSync(DIR + PAGE, 'utf8');
// jsdom ne va pas chercher les <script src> relatifs : on les incorpore
for (const f of ['sightread-gen.js', 'sightread-render.js']) {
    const src = fs.readFileSync(DIR + f, 'utf8');
    html = html.replace('<script src="' + f + '"></script>',
        '<script>' + src + '</script>');
}

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' + PAGE });
const w = dom.window;

// L'audio n'existe pas ici : un mandataire qui accepte tout evite d'avoir
// a truquer chaque appel un par un.
const node = () => new Proxy(function () { }, {
    get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : node(),
    apply: () => node(), set: () => true
});
w.AudioContext = function () {
    return new Proxy({ state: 'running', currentTime: 0, destination: node() }, {
        get: (t, k) => k in t ? t[k] : k === 'getOutputTimestamp'
            ? (() => ({ contextTime: 0, performanceTime: 0 })) : (() => node())
    });
};

const res = w.selftest();
const ko = res.filter(r => !r.ok);
for (const r of res)
    console.log((r.ok ? '  ok   ' : '  ECHEC') + '  ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
console.log('\n' + (ko.length ? 'ECHECS' : 'TOUT PASSE') + ' : '
    + (res.length - ko.length) + ' / ' + res.length);
process.exit(ko.length ? 1 : 0);
