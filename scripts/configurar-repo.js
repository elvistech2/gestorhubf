#!/usr/bin/env node
/* Aponta o projeto para o seu repositório no GitHub.
   Uso:  npm run configurar-repo -- usuario/repositorio
   Mexe em package.json (repository + build.publish), que é de onde o
   electron-updater descobre onde procurar versão nova. */
const fs = require('fs');
const path = require('path');

const alvo = (process.argv[2] || '').trim();
const m = alvo.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
if (!m) {
  console.error('Informe o repositório assim:  npm run configurar-repo -- usuario/repositorio');
  process.exit(1);
}
const [, owner, repo] = m;

const p = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
pkg.repository = { type: 'git', url: `https://github.com/${owner}/${repo}.git` };
pkg.build.publish = [{ provider: 'github', owner, repo }];
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(`Pronto: ${owner}/${repo}`);
console.log('Agora gere os instaladores de novo (npm run dist) para eles já saberem onde procurar atualização.');
