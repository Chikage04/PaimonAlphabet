/* Serveur local : sert le site ET enregistre les essais.

   Pourquoi pas un MCP de navigateur : l'extension Chrome ne joint pas les
   serveurs lances depuis ce terminal — c'est mesure et note. Et meme si
   elle les joignait, elle ne verrait pas le piano : le MIDI arrive dans
   l'onglet de l'utilisateur, pas dans un onglet pilote.

   Donc l'inverse : la page envoie ce qu'elle voit, le serveur l'ecrit dans
   un journal, et le journal se lit en direct depuis le terminal. Aucune
   dependance, aucun paquet a installer.

     node outils/serveur-essais.js [port]

   La page n'envoie rien tant qu'on ne le demande pas : il faut ouvrir
   lecture-vue.html?essais=1 (ou poser localStorage['lecture.essais']='1').
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 8765;
const RACINE = path.resolve(__dirname, '..');
const JOURNAL = process.env.ESSAIS_LOG || 'C:/tmp/essais.jsonl';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.mid': 'audio/midi'
};

function journalise(lignes) {
    const sortie = lignes.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFile(JOURNAL, sortie, err => {
        if (err) console.error('journal :', err.message);
    });
}

const serveur = http.createServer((req, res) => {
    // le journal : seule route qui ecrit
    if (req.method === 'POST' && req.url === '/essais') {
        let corps = '';
        req.on('data', c => {
            corps += c;
            if (corps.length > 2e6) req.destroy();        // garde-fou
        });
        req.on('end', () => {
            try {
                const lot = JSON.parse(corps);
                journalise(Array.isArray(lot) ? lot : [lot]);
            } catch (e) {
                console.error('lot illisible :', e.message);
            }
            res.writeHead(204, { 'access-control-allow-origin': '*' });
            res.end();
        });
        return;
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': 'content-type'
        });
        res.end();
        return;
    }

    // le reste : des fichiers du depot, et rien d'autre
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const abs = path.resolve(RACINE, '.' + rel);
    if (!abs.startsWith(RACINE)) { res.writeHead(403); res.end('non'); return; }
    fs.readFile(abs, (err, data) => {
        if (err) { res.writeHead(404); res.end('absent'); return; }
        res.writeHead(200, {
            'content-type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
            'cache-control': 'no-store'
        });
        res.end(data);
    });
});

serveur.listen(PORT, '127.0.0.1', () => {
    console.log('site      : http://localhost:' + PORT + '/lecture-vue.html?essais=1');
    console.log('journal   : ' + JOURNAL);
    console.log('racine    : ' + RACINE);
});
