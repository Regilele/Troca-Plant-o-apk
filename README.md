# RG&SA PLANTÃO — web app + PWA

Escala 12×36 e troca de plantões reconstruída a partir do APK original
(`trocaplantao.apk`, pacote `com.aistudio.shiftexchange.kltxpqc`) **sem perder
nenhum dado**: plantonistas, plantões, trocas, folgas e as regras de negócio
foram migrados exatamente como estavam no banco Room do aplicativo Android.

| | |
|---|---|
| App | Painel web responsivo + PWA instalável com uso offline |
| Back-end | Node.js 22 · Express · SQLite (`node:sqlite`) |
| Front-end | React 18 · Vite · TypeScript · Framer Motion · Lucide |
| Dados | `data/plantao.db` (SQLite) semeado a partir de `data/legacy-seed.json` |
| Idiomas | Português (padrão) e inglês |
| Tema | Claro e escuro |

---

## 1. Rodar a prévia

```bash
npm install
npm run build          # gera client/dist
npm start              # http://localhost:3000
```

Modo desenvolvimento (API + Vite com HMR):

```bash
npm run dev            # API em :3000, interface em :5173
```

Variáveis opcionais: `PORT`, `HOST`, `DATA_DIR`, `DB_PATH`, `SEED_PATH`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MEMBER_EMAIL`, `MEMBER_PASSWORD`,
`FIREBASE_*` (integração simulada, nenhuma chave é usada no navegador).

### Contas de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@rgsa.plantao` | `Plantao@2026` |
| Plantonista | `juliana@rgsa.plantao` | `Plantao@2026` |
| Cadastro pendente | `camila.rocha@exemplo.com` | (aguardando aprovação) |
| Convidado | botão “Entrar como convidado” | somente leitura |

> A base migrada do APK está em **junho de 2026**. Ao entrar, o app abre
> automaticamente no mês com escala e avisa quando o mês corrente está vazio —
> nenhum registro fica escondido.

---

## 2. O que o app faz

### Escala
- Calendário mensal de **6 semanas** — nenhum dia do mês é cortado.
- Visão em **grade** e em **agenda** (a agenda é o padrão no celular).
- Cada dia abre um painel lateral com todos os plantões, folgas e conflitos.
- Cores por plantonista, destaque do próximo plantão e animações suaves
  (respeitando `prefers-reduced-motion`).
- Filtro por plantonista, navegação por mês e atalho “Hoje”.
- Exportação **PDF** (gerada no aparelho), **CSV** e **texto para e-mail**.

### Datas independentes
`data do turno`, **`data de troca`** e **`data de pagamento`** são campos
distintos no banco, na interface, no PDF, no CSV e no e-mail. Nunca são
derivados um do outro; em branco o pagamento aparece como **“a definir”**.

### Regras preservadas
- 12×36 → alerta quando alguém tem plantões em dias consecutivos.
- Interjornada de 11 h (Art. 66 CLT) → alerta em plantão diurno no dia seguinte.
- Um plantão por pessoa por dia → bloqueio.
- Folga mensal repetida no mês → alerta; folga duplicada → bloqueio.
- `-x-` do APK (“em serviço”) preservado no campo “permanência”.
- Exclusões são **reversíveis** (soft delete + restauração + auditoria).

### Cadastro com aprovação
- Cadastro público cria conta com status **pendente** (sem sessão).
- O administrador aprova (definindo papel e vínculo com plantonista),
  recusa com motivo, suspende, reativa, redefine senha e troca papéis.
- Toda ação administrativa entra no **histórico de auditoria**.
- Nunca é possível remover o último administrador.

### PWA de verdade
- `manifest.webmanifest` completo (ícones 192/512/maskable/apple, atalhos).
- Service worker com cache do shell, cache de dados e fallback offline.
- Botão **“Instalar no aparelho”** usa `beforeinstallprompt` quando disponível e
  mostra instruções específicas para iOS/Android quando o navegador não permite.
- O app abre offline com a última escala sincronizada.

### Integrações
- **Open-Meteo** (clima do Rio) preservado, com cache e degradação silenciosa.
- **Firebase** mantido em modo *dry-run* no servidor — nenhuma chave do projeto
  original é exposta ao navegador.
- **WhatsApp/PIX** com os dados oficiais (chave `21980498068`, beneficiário
  “Reginaldo G. S. Azevedo”).
- Notificações de plantão via service worker (com pedido de permissão).

---

## 3. Dados e segurança

- **Sem perda de dados:** `data/legacy-seed.json` guarda o conteúdo exato
  recuperado do APK (4 plantonistas, 6 plantões, 2 folgas) e o banco é semeado a
  partir dele de forma idempotente. O seed nunca é sobrescrito pela aplicação.
- Exclusões são lógicas (`deleted_at`), com restauração e registro em auditoria.
- Senhas com `scrypt` + salt; sessões opacas em cookie `HttpOnly`/`SameSite=Lax`
  **e** em token `Authorization: Bearer` (necessário em prévia embutida, modo
  privado ou quando o navegador bloqueia cookies de terceiros).
- Proteção CSRF por cabeçalho `x-requested-with: rgsa-plantao`.
- Rate limit no login, mensagens de erro genéricas para credenciais.
- Convidado não escreve (`guest_readonly`); papéis e status são verificados no servidor.
- CSP, `nosniff`, `Referrer-Policy` e `Permissions-Policy` em todas as respostas.

### Backup e restauração

```bash
npm run db:backup                 # data/backups/plantao-<data>-manual.db
npm run db:reset -- --yes         # faz backup antes e re-semeia do APK
```

Os 10 backups mais recentes são mantidos. Para restaurar: pare o servidor,
copie o arquivo sobre `data/plantao.db` e apague `plantao.db-wal`/`-shm`.

---

## 4. Testes

```bash
npm test            # 41 testes de domínio + integração da API (banco temporário)
npm run test:e2e    # 12 fluxos reais em Chromium headless (cadastro→aprovação,
                    # plantão com troca/pagamento, PWA, offline, mobile, tema)
npm run test:visual # capturas de tela desktop/mobile/tema escuro em /tmp/shots
```

Os testes de navegador usam `CHROME_PATH` ou `@sparticuz/chromium`. Em
ambientes mínimos é preciso extrair as bibliotecas do al2023 e apontar
`CHROMIUM_LIB_DIR` (padrão `/tmp/al2023/lib`).

---

## 5. Estrutura

```
server/
  domain.js        regras de negócio puras (validação, grade, trocas, 12x36)
  db.js            schema SQLite, seed do APK, backup, auditoria
  repo.js          consultas e mapeamento para camelCase
  auth.js          sessões, cookies, rate limit, guards de papel
  integrations.js  Open-Meteo, dry-run Firebase, snapshot das integrações
  reports.js       relatório mensal (texto, CSV, resumo)
  index.js         API REST + servidor do PWA
  scripts/         reset-db.js, backup.js
client/
  src/lib/         api, calendário, cores, i18n, PWA, PDF
  src/state/       AppContext (fonte única de estado)
  src/components/  Shell, calendário, drawer, formulários, instalação
  src/pages/       Painel, Escala, Equipe, Relatórios, Aprovações, Ajustes
  public/          manifest, service worker, offline, ícones
tests/             domínio, API, e2e (Chromium) e captura visual
data/              legacy-seed.json (migração do APK) e plantao.db (ignorado)
```

O relatório detalhado de mudanças está em
[`docs/RELATORIO-DE-ALTERACOES.md`](docs/RELATORIO-DE-ALTERACOES.md).
