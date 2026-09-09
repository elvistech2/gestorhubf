# Super Gestor

Hub de gestão para pequenos negócios. Dez aplicativos numa janela só, todos gravando
no **mesmo banco de dados local** (SQLite) — sem nuvem, sem mensalidade, sem conta
para criar. O dado é seu e fica no seu computador.

Funciona em **Windows** e **Linux**.

---

## O que vem dentro

| App | Para quê |
|---|---|
| 📊 **Financeiro** | Capital de giro, lançamentos, contas a pagar e a receber, recorrências, orçamento por categoria e radar de caixa |
| 📋 **Orçamentos** | Orçamentos por cliente, score de quem fecha, envio por WhatsApp |
| 📦 **Pedidos** | Pedido do dia, clientes recorrentes com itens mensais, lista de espera |
| 🧾 **Fiados** | Fichas de crediário: compras, pagamentos, limite por cliente e cupons na bobina |
| ⏳ **Validades** | Produtos perto de vencer, com risco em dinheiro |
| 🤝 **Empréstimos** | O que você emprestou e o que pegou de parceiros |
| 🛵 **Entregas** | Fila de entregas, quem está na rua, o que falta receber |
| 💵 **Caixa** | Contagem de notas, sangrias e fechamento do dia |
| 🌡️ **Ambiente** | Registro diário de temperatura, umidade e rotinas de limpeza |
| 🖨️ **Avisos** | Recados impressos na bobina de 72 mm para entregar ao cliente |

A tela inicial junta tudo: pendências do dia, dinheiro que entrou e saiu, e o que
está atrasado em cada app.

## Por que local

- **Nada sai da máquina.** Sem servidor, sem telemetria, sem login.
- **Backup automático** do banco todo dia, guardando as últimas cópias.
- **Histórico por app**: as 20 últimas versões do estado de cada aplicativo ficam
  guardadas — dá para voltar atrás de uma importação errada.
- Você vê onde o arquivo está e quanto espaço ocupa em *Dados & Backup*.

O banco fica em:

| Sistema | Caminho |
|---|---|
| Windows | `%APPDATA%\Super Gestor\gestor.db` |
| Linux | `~/.config/Super Gestor/gestor.db` |

## Instalação

Baixe o instalador da [página de Releases](../../releases):

- **Windows**: `Super-Gestor-Setup-x.y.z.exe`
- **Linux**: `Super-Gestor-x.y.z.AppImage` (dê permissão de execução: `chmod +x`) ou o `.deb`

O programa avisa sozinho quando sai versão nova e só baixa e instala quando você mandar.

## Personalizar

Abra **Dados & Backup → Identidade** e coloque o nome do seu negócio. Ele passa a
aparecer no topo do hub e nos cupons impressos por Fiados, Orçamentos e Avisos.

## Rodar a partir do código

```bash
npm install
npm start
```

Precisa de Node 18+ e das ferramentas de compilação do seu sistema (o `better-sqlite3`
é um módulo nativo). No Ubuntu: `sudo apt install build-essential python3`.

## Gerar os instaladores

```bash
npm run dist:win     # Windows (NSIS)
npm run dist:linux   # Linux (AppImage + deb)
```

Cada sistema gera o seu: o instalador de Linux se faz no Linux (ou no WSL), o de
Windows no Windows — o `better-sqlite3` é compilado para a plataforma onde roda.
O jeito prático é deixar o GitHub fazer isso pelos dois; veja *Publicar uma versão*.

### Windows sem o Modo de Desenvolvedor

Se `npm run dist:win` parar com `Cannot create symbolic link`, é o Windows barrando
links simbólicos no cache do electron-builder. Use a rota em duas etapas, que não
precisa disso:

```bash
npm run dist:win-local
```

Ela empacota com o electron-packager, escreve o `app-update.yml` e só então monta o
instalador NSIS. O resultado é o mesmo `.exe`.

## Publicar uma versão

1. Aponte o projeto para o seu repositório (é daqui que sai a atualização automática):

   ```bash
   npm run configurar-repo -- elvistech2/gestorhubf
   ```

2. Suba a versão em `package.json` e crie a tag:

   ```bash
   git commit -am "v1.0.1"
   git tag v1.0.1
   git push && git push origin v1.0.1
   ```

3. O workflow `.github/workflows/release.yml` compila no Windows e no Linux e sobe
   os instaladores no Release. Quem já tem o programa instalado recebe o aviso na
   próxima vez que abrir.

## Como está montado

```
main.js                 processo principal: banco SQLite, backup, IPC, atualizações
preload.js              ponte segura entre o banco e as telas
renderer/hub.html       o hub: menu, dashboard, importação, ajustes
renderer/apps/*.html    um arquivo por aplicativo, cada um roda num <iframe>
renderer/shared/        marca (nome do negócio), armazenamento e estilos comuns
renderer/vendor/        bibliotecas de terceiros em cópia local
```

Cada app é uma página independente. O `db-storage.js` troca o `localStorage` de cada
um por armazenamento no SQLite, separado por app — por isso dois aplicativos podem
usar o mesmo nome de variável sem brigar.

Quer escrever o seu? Copie um HTML de `renderer/apps/`, registre em `APPS` no
`hub.html` e pronto.

## Licença

MIT — veja [LICENSE](LICENSE). As bibliotecas em `renderer/vendor/` mantêm as
licenças dos projetos de origem.
