const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { autoUpdater } = require('electron-updater');

const userDataDir = app.getPath('userData');
const dbPath = path.join(userDataDir, 'gestor.db');
const backupsDir = path.join(userDataDir, 'backups');

if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  categoria TEXT,
  descricao TEXT,
  valor REAL,
  data TEXT,
  status TEXT,
  dataLiq TEXT,
  recId TEXT,
  recDate TEXT
);
CREATE TABLE IF NOT EXISTS recorrencias (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  categoria TEXT,
  descricao TEXT,
  valor REAL,
  freq TEXT,
  dia INTEGER,
  modo TEXT,
  inicio TEXT,
  fim TEXT,
  ajusteDomingo INTEGER,
  ativa INTEGER
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS app_state (
  app TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT,
  PRIMARY KEY (app, key)
);
CREATE TABLE IF NOT EXISTS state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  saved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_state_history_app_key ON state_history (app, key, id DESC);
`);

const DEF_META = {
  cgBase: 0,
  categories: { recebimentos: ['Vendas Balcão', 'Convênios', 'Planos de Saúde', 'Manipulados', 'Dermocosméticos', 'Outros'], pagamentos: ['Fornecedores', 'Aluguel', 'Energia/Água', 'Impostos', 'Salários', 'Material de Escritório', 'Outros'] },
  dayTags: {},
  tagLibrary: ['☀️ Sol', '🌧️ Chuva', '☁️ Nublado', '🔥 Movimentado', '🐌 Fraco', '🎉 Evento na cidade', '💊 Campanha/vacinação', '💰 Dia de pagamento'],
  budgets: {},
  lastBackup: ''
};

function loadState() {
  const lancamentos = db.prepare('SELECT * FROM lancamentos').all().map(l => ({
    id: l.id, tipo: l.tipo, categoria: l.categoria, descricao: l.descricao, valor: l.valor,
    data: l.data, status: l.status, dataLiq: l.dataLiq,
    ...(l.recId ? { recId: l.recId, recDate: l.recDate } : {})
  }));
  const recorrencias = db.prepare('SELECT * FROM recorrencias').all().map(r => ({
    id: r.id, tipo: r.tipo, categoria: r.categoria, descricao: r.descricao, valor: r.valor,
    freq: r.freq, dia: r.dia, modo: r.modo, inicio: r.inicio, fim: r.fim || undefined,
    ajusteDomingo: !!r.ajusteDomingo, ativa: !!r.ativa
  }));
  const metaRows = db.prepare('SELECT key, value FROM meta').all();
  const meta = { ...DEF_META };
  for (const row of metaRows) {
    try { meta[row.key] = JSON.parse(row.value); } catch { /* ignore malformed row */ }
  }
  return { ...meta, lancamentos, recorrencias };
}

const insertLanc = db.prepare(`INSERT INTO lancamentos (id,tipo,categoria,descricao,valor,data,status,dataLiq,recId,recDate)
  VALUES (@id,@tipo,@categoria,@descricao,@valor,@data,@status,@dataLiq,@recId,@recDate)`);
const insertRec = db.prepare(`INSERT INTO recorrencias (id,tipo,categoria,descricao,valor,freq,dia,modo,inicio,fim,ajusteDomingo,ativa)
  VALUES (@id,@tipo,@categoria,@descricao,@valor,@freq,@dia,@modo,@inicio,@fim,@ajusteDomingo,@ativa)`);
const upsertMeta = db.prepare(`INSERT INTO meta (key,value) VALUES (@key,@value)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

const saveTxn = db.transaction((state) => {
  db.prepare('DELETE FROM lancamentos').run();
  for (const l of state.lancamentos || []) {
    insertLanc.run({
      id: l.id, tipo: l.tipo, categoria: l.categoria, descricao: l.descricao || '', valor: l.valor,
      data: l.data, status: l.status, dataLiq: l.dataLiq || null,
      recId: l.recId || null, recDate: l.recDate || null
    });
  }
  db.prepare('DELETE FROM recorrencias').run();
  for (const r of state.recorrencias || []) {
    insertRec.run({
      id: r.id, tipo: r.tipo, categoria: r.categoria, descricao: r.descricao || '', valor: r.valor,
      freq: r.freq, dia: r.dia ?? null, modo: r.modo || null, inicio: r.inicio, fim: r.fim || null,
      ajusteDomingo: r.ajusteDomingo ? 1 : 0, ativa: r.ativa ? 1 : 0
    });
  }
  for (const key of ['cgBase', 'categories', 'dayTags', 'tagLibrary', 'budgets', 'lastBackup']) {
    upsertMeta.run({ key, value: JSON.stringify(state[key]) });
  }
});

function saveState(state) {
  saveTxn(state);
  maybeAutoBackup(true);
}

function todayStr() { return new Date().toISOString().split('T')[0]; }

// Copiar o banco inteiro a cada gravação deixava a digitação lenta (uma cópia
// por tecla). O backup do dia continua sendo refeito, mas no máximo a cada
// 2 minutos — e sempre ao fechar o programa, então nada se perde.
const INTERVALO_BACKUP = 2 * 60 * 1000;
let ultimoBackup = 0;
let backupEmAndamento = false;

function maybeAutoBackup(force = false) {
  const today = todayStr();
  const target = path.join(backupsDir, `gestor-${today}.db`);
  const existe = fs.existsSync(target);
  if (!force && existe) return;
  // já existe cópia de hoje e faz pouco tempo: deixa para depois
  if (existe && Date.now() - ultimoBackup < INTERVALO_BACKUP) return;
  if (backupEmAndamento) return;

  backupEmAndamento = true;
  ultimoBackup = Date.now();
  const tmp = target + '.tmp';
  db.backup(tmp)
    .then(() => { fs.renameSync(tmp, target); pruneOldBackups(); })
    .catch(() => { /* backup failure should not crash the app */ })
    .finally(() => { backupEmAndamento = false; });
}

function pruneOldBackups(keep = 30) {
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('gestor-') && f.endsWith('.db'))
      .sort();
    const excess = files.length - keep;
    for (let i = 0; i < excess; i++) fs.unlinkSync(path.join(backupsDir, files[i]));
  } catch { /* ignore */ }
}

// ── Estado genérico por app (orcafarma, farmapedidos, fiados, precificador) ──
// Guarda o JSON que o próprio app já escrevia no localStorage, sem alterar o formato.
const HISTORY_KEEP = 20;

const selAppState = db.prepare('SELECT value FROM app_state WHERE app = ? AND key = ?');
const selAppKeys = db.prepare('SELECT key FROM app_state WHERE app = ?');
const upsertAppState = db.prepare(`INSERT INTO app_state (app, key, value, updated_at)
  VALUES (@app, @key, @value, @updated_at)
  ON CONFLICT(app, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
const delAppState = db.prepare('DELETE FROM app_state WHERE app = ? AND key = ?');
const insHistory = db.prepare(`INSERT INTO state_history (app, key, value, saved_at)
  VALUES (@app, @key, @value, @saved_at)`);
const pruneHistory = db.prepare(`DELETE FROM state_history
  WHERE app = @app AND key = @key AND id NOT IN (
    SELECT id FROM state_history WHERE app = @app AND key = @key ORDER BY id DESC LIMIT @keep
  )`);

function appGet(appName, key) {
  const row = selAppState.get(appName, key);
  return row ? row.value : null;
}

// Grava o valor novo e guarda a versão ANTERIOR no histórico, para permitir voltar atrás.
const appSetTxn = db.transaction((appName, key, value) => {
  const prev = selAppState.get(appName, key);
  if (prev && prev.value !== value) {
    insHistory.run({ app: appName, key, value: prev.value, saved_at: new Date().toISOString() });
    pruneHistory.run({ app: appName, key, keep: HISTORY_KEEP });
  }
  upsertAppState.run({ app: appName, key, value, updated_at: new Date().toISOString() });
});

function appSet(appName, key, value) {
  appSetTxn(appName, key, value);
  maybeAutoBackup(true);
}

const appRemoveTxn = db.transaction((appName, key) => {
  const prev = selAppState.get(appName, key);
  if (prev) {
    insHistory.run({ app: appName, key, value: prev.value, saved_at: new Date().toISOString() });
    pruneHistory.run({ app: appName, key, keep: HISTORY_KEEP });
  }
  delAppState.run(appName, key);
});

ipcMain.on('db:load', (event) => { event.returnValue = loadState(); });
ipcMain.on('db:save', (event, state) => { saveState(state); event.returnValue = true; });
ipcMain.on('app:get', (event, appName, key) => { event.returnValue = appGet(appName, key); });
ipcMain.on('app:set', (event, appName, key, value) => {
  try { appSet(appName, key, value); event.returnValue = true; }
  catch { event.returnValue = false; }
});
ipcMain.on('app:remove', (event, appName, key) => {
  try { appRemoveTxn(appName, key); event.returnValue = true; }
  catch { event.returnValue = false; }
});
ipcMain.on('app:keys', (event, appName) => {
  event.returnValue = selAppKeys.all(appName).map(r => r.key);
});
// Abre link externo — restrito ao WhatsApp de propósito, para que uma falha
// em qualquer app do hub não vire um abridor de URL arbitrária.
ipcMain.on('app:abrirWhatsApp', (event, url) => {
  const permitido = typeof url === 'string' && /^https:\/\/(wa\.me|web\.whatsapp\.com)\//.test(url);
  if (permitido) shell.openExternal(url);
  event.returnValue = permitido;
});
// ── Integração: Orçamentos → Pedidos ──────────────────────────────────
// Escrita feita aqui no processo principal para ser atômica: lê o estado do
// FarmaPedidos, acrescenta o pedido e grava de uma vez. Passa por appSet, então
// entra no histórico de versões e no backup como qualquer outra alteração.
function idCurto(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

ipcMain.on('app:enviarParaPedidos', (event, pedido) => {
  try {
    if (!pedido || !Array.isArray(pedido.itens) || !pedido.itens.length) {
      event.returnValue = { ok: false, erro: 'Nenhum item para enviar.' };
      return;
    }
    const bruto = appGet('farmapedidos', 'farma_v5');
    const db2 = bruto ? JSON.parse(bruto) : {};
    db2.clients = Array.isArray(db2.clients) ? db2.clients : [];
    db2.dailyOrders = Array.isArray(db2.dailyOrders) ? db2.dailyOrders : [];
    db2.wishlist = Array.isArray(db2.wishlist) ? db2.wishlist : [];
    db2.monthlyStatus = db2.monthlyStatus || {};

    const cliente = (pedido.cliente || '').trim() || 'Estoque';
    // cadastra a pessoa no FarmaPedidos se ainda não existir por lá
    if (cliente !== 'Estoque' && !db2.clients.some(c => c.name === cliente)) {
      db2.clients.push({ id: idCurto(), name: cliente, phone: pedido.telefone || '', monthly: false });
    }

    db2.dailyOrders.push({
      id: idCurto(),
      createdAt: Date.now(),
      client: cliente,
      phone: pedido.telefone || '',
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      obs: pedido.obs || '',
      meds: pedido.itens.map(i => ({
        id: idCurto(),
        name: String(i.nome || '').trim(),
        qty: Number(i.qtd) || 1,
        price: Number(i.preco) || 0,
        notes: i.obs || '',
        istatus: 'pending',
        received: false
      }))
    });

    appSet('farmapedidos', 'farma_v5', JSON.stringify(db2));
    event.returnValue = { ok: true, cliente, itens: pedido.itens.length };
  } catch (e) {
    event.returnValue = { ok: false, erro: e.message };
  }
});

ipcMain.on('app:historyInfo', (event) => {
  try {
    event.returnValue = db.prepare(
      `SELECT app, COUNT(*) AS versoes, MAX(saved_at) AS ultima FROM state_history GROUP BY app`
    ).all();
  } catch { event.returnValue = []; }
});
// ── Arquivo de baixa para o Cowork ────────────────────────────────────
// Grava SOMENTE dentro de "PASTA DE TRABALHO COWORK/Baixas Vencidos", com nome
// saneado e extensão .json. Não é gravação livre de arquivo: o renderer escolhe
// o nome, nunca o caminho.
const pastaBaixas = path.join(app.getPath('desktop'), 'PASTA DE TRABALHO COWORK', 'Baixas Vencidos');
ipcMain.on('app:salvarBaixa', (event, nome, conteudo) => {
  try {
    const limpo = String(nome || 'baixa').replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.+/g, '.').slice(0, 80);
    const arquivo = limpo.endsWith('.json') ? limpo : limpo + '.json';
    if (!fs.existsSync(pastaBaixas)) fs.mkdirSync(pastaBaixas, { recursive: true });
    const destino = path.join(pastaBaixas, arquivo);
    fs.writeFileSync(destino, String(conteudo), 'utf8');
    event.returnValue = { ok: true, caminho: destino };
  } catch (e) {
    event.returnValue = { ok: false, erro: e.message };
  }
});
ipcMain.on('app:abrirPastaBaixas', () => {
  if (!fs.existsSync(pastaBaixas)) fs.mkdirSync(pastaBaixas, { recursive: true });
  shell.openPath(pastaBaixas);
});
ipcMain.on('db:openBackupFolder', () => { shell.openPath(backupsDir); });
ipcMain.on('db:backupInfo', (event) => {
  // Mede o que o programa ocupa em disco: o banco (com o -wal, que ainda não
  // foi para o arquivo principal) e a pasta de cópias diárias.
  let count = 0, backupsBytes = 0, maisAntigo = null, maisNovo = null;
  try {
    for (const f of fs.readdirSync(backupsDir)) {
      if (!f.endsWith('.db')) continue;
      const st = fs.statSync(path.join(backupsDir, f));
      count++; backupsBytes += st.size;
      if (!maisAntigo || st.mtimeMs < maisAntigo.quando) maisAntigo = { nome: f, quando: st.mtimeMs, bytes: st.size };
      if (!maisNovo || st.mtimeMs > maisNovo.quando) maisNovo = { nome: f, quando: st.mtimeMs, bytes: st.size };
    }
  } catch { /* ignore */ }

  let dbBytes = 0;
  for (const suf of ['', '-wal', '-shm']) {
    try { dbBytes += fs.statSync(dbPath + suf).size; } catch { /* pode não existir */ }
  }

  event.returnValue = { folder: backupsDir, count, dbPath, dbBytes, backupsBytes, maisAntigo, maisNovo };
});

/* ══════════════ ATUALIZAÇÕES ══════════════
   Procura no GitHub Releases do repositório declarado em package.json.
   Nada é baixado nem instalado sem o usuário mandar: autoDownload fica
   desligado e a interface do hub controla cada passo. */
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function avisarUpdate(info) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', info);
  } catch { /* janela já foi embora */ }
}
autoUpdater.on('checking-for-update', () => avisarUpdate({ estado: 'procurando' }));
autoUpdater.on('update-available', i => avisarUpdate({ estado: 'disponivel', versao: i && i.version }));
autoUpdater.on('update-not-available', () => avisarUpdate({ estado: 'atual' }));
autoUpdater.on('download-progress', p => avisarUpdate({ estado: 'baixando', detalhe: Math.round(p.percent || 0) + '%' }));
autoUpdater.on('update-downloaded', i => avisarUpdate({ estado: 'pronto', versao: i && i.version }));
// 404 = repositório existe mas ainda não tem release publicado
function detalheErro(e) {
  const msg = String((e && e.message) || e);
  return /404/.test(msg) ? 'nenhuma versão publicada no repositório ainda' : msg.slice(0, 120);
}
autoUpdater.on('error', e => avisarUpdate({ estado: 'erro', detalhe: detalheErro(e) }));

// Só a versão instalada sabe se atualizar: rodando pelo código-fonte não há o que trocar.
function updaterDisponivel() { return app.isPackaged; }

ipcMain.on('app:version', (event) => { event.returnValue = app.getVersion(); });
ipcMain.on('update:check', () => {
  if (!updaterDisponivel()) return avisarUpdate({ estado: 'sem-suporte' });
  autoUpdater.checkForUpdates().catch(e => avisarUpdate({ estado: 'erro', detalhe: detalheErro(e) }));
});
ipcMain.on('update:download', () => {
  if (!updaterDisponivel()) return avisarUpdate({ estado: 'sem-suporte' });
  autoUpdater.downloadUpdate().catch(e => avisarUpdate({ estado: 'erro', detalhe: detalheErro(e) }));
});
ipcMain.on('update:install', () => { try { autoUpdater.quitAndInstall(); } catch { /* ignore */ } });

let mainWindow;
function createWindow() {
  const iconPath = path.join(__dirname, 'renderer', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // necessário para que cada app rodando em iframe receba o preload e
      // consiga falar com o banco de forma síncrona (validado em spike)
      nodeIntegrationInSubFrames: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'hub.html'));
}

app.whenReady().then(() => {
  maybeAutoBackup();
  createWindow();
  // consulta discreta alguns segundos depois de abrir, sem travar a janela
  if (updaterDisponivel()) setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 5000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  // ao sair ignora o intervalo: garante cópia com tudo do dia
  try { ultimoBackup = 0; maybeAutoBackup(true); } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
