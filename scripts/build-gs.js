// Assemble dist/Code.gs = assets/logic.js + apps-script/server.js
// C'est ce fichier unique qu'on colle dans l'éditeur Google Apps Script.
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');

const entete = [
  '// ================================================================',
  '// locaproj — Code.gs (fichier généré : ne pas modifier à la main)',
  '// Source : assets/logic.js + apps-script/server.js',
  '// Regénérer avec : npm run build',
  '// ================================================================',
  ''
].join('\n');

const sortie = entete + lire('assets/logic.js') + '\n\n' + lire('apps-script/server.js');
fs.mkdirSync(path.join(racine, 'dist'), { recursive: true });
fs.writeFileSync(path.join(racine, 'dist', 'Code.gs'), sortie);
console.log('dist/Code.gs généré (' + sortie.length + ' caractères)');
