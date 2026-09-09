#!/usr/bin/env node
/* Instalador do Windows em duas etapas.
   Existe porque o electron-builder, ao empacotar direto nesta máquina, precisa
   criar links simbólicos no cache (winCodeSign) e o Windows só permite isso com
   o Modo de Desenvolvedor ligado ou em terminal elevado. Então:
     1. electron-packager monta a pasta do app (já com ícone);
     2. app-update.yml é escrito a partir do publish do package.json;
     3. electron-builder gera só o instalador NSIS a partir dessa pasta.
   No GitHub Actions isso não é necessário: lá "npm run dist:win" roda direto. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const nome = pkg.build.productName || pkg.productName;
const pasta = path.join(raiz, 'dist', `${nome}-win32-x64`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// shell: true porque no Windows os executáveis do npm são .cmd; por isso também as aspas
const roda = (cmd, args) => execFileSync(cmd, args.map(x => x.includes(' ') ? '"' + x + '"' : x), { cwd: raiz, stdio: 'inherit', shell: true });

console.log('1/3 empacotando…');
roda(npx, ['electron-packager', '.', nome, '--platform=win32', '--arch=x64',
  '--icon=renderer/icon.ico', '--out=dist', '--overwrite', '--ignore=^/dist$']);

console.log('2/3 gravando app-update.yml…');
const pub = (pkg.build.publish || [])[0];
if (!pub) throw new Error('package.json sem build.publish — rode: npm run configurar-repo -- usuario/repo');
const yml = [
  `provider: ${pub.provider}`,
  `owner: ${pub.owner}`,
  `repo: ${pub.repo}`,
  `updaterCacheDirName: ${pkg.name}-updater`,
  ''
].join('\n');
fs.writeFileSync(path.join(pasta, 'resources', 'app-update.yml'), yml, 'utf8');

console.log('3/3 gerando o instalador…');
roda(npx, ['electron-builder', '--win', 'nsis', '--prepackaged', pasta,
  '-c.win.signAndEditExecutable=false']);

console.log('\nPronto. Veja a pasta dist/.');
