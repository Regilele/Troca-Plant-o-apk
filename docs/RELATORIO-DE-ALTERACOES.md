# Relatório de alterações — RG&SA PLANTÃO 2.0

Prévia funcional para testes. **Nada foi publicado em produção** e o APK
original permanece intacto no repositório (`trocaplantao.apk`).

- App: `npm install && npm run build && npm start` → `http://localhost:3000`
- Login admin: `admin@rgsa.plantao` / `Plantao@2026`
- Login plantonista: `juliana@rgsa.plantao` / `Plantao@2026`
- Convidado (leitura): botão “Entrar como convidado”

---

## 1. O que existia e como foi tratado

O projeto original era apenas o APK Android (`com.aistudio.shiftexchange.kltxpqc`,
v1.0, minSdk 24 / targetSdk 36). Nada de código-fonte, nada de back-end.

**Análise feita antes de qualquer alteração:**

| Item | Encontrado no APK |
|---|---|
| Banco local | Room `shiftexchange_database` |
| Tabelas | `collaborators`, `off_days`, `shifts` |
| Plantonistas | Reginaldo (índigo), Agenor (esmeralda), Juliana (violeta), Marcos (âmbar) |
| Escala semeada | junho/2026, 6 plantões 12h |
| Trocas | 03↔04/06, 07↔14/06, 21↔28/06 |
| Folgas | 13/06 Agenor (mensal), 20/06 Reginaldo (mensal) |
| Convenção | `-x-` = em serviço |
| Integrações | Open-Meteo (clima), Firebase, canal `rgsa_plantao_alerts`, PDF/e-mail |
| Contato | (21) 98049-8068 · PIX `21980498068` · `oliveira30regi@gmail.com` |

Tudo isso foi extraído, salvo em `data/legacy-seed.json` e reaplicado no banco
novo por um seed idempotente. **Nenhum registro original foi descartado ou
reescrito.**

O APK não foi alterado, desinstalado, republicado ou sobrescrito.

---

## 2. Problemas relatados e o que foi feito

### 2.1 “O calendário corta e sobrepõe informações” → resolvido
- A grade agora é calculada em **semanas completas de 6 linhas** (42 células),
  garantindo que nenhum dia do mês fique de fora, inclusive em fevereiro e em
  meses que começam no domingo.
- Cada evento fica dentro da própria célula (`min-width: 0`, truncamento com
  reticências), sem estourar a coluna.
- Células de dias de outro mês recebem tratamento visual apagado, sem misturar
  com o mês ativo.
- O chip do plantão passou a mostrar **pessoa + data de troca + pagamento** em
  duas linhas no desktop, mantendo uma linha compacta no celular.
- Foi adicionada uma **agenda** (lista) como alternativa à grade — e ela é o
  padrão no celular, onde a grade nunca é a única opção.
- Rodapé com legenda, contagem de plantões/trocas/folgas/pagamentos e alertas,
  sem sobreposição com o conteúdo.

### 2.2 “Data de troca e data de pagamento separadas” → resolvido
- Três campos independentes no banco: `date` (turno), `swap_for_date`
  (troca) e `payment_date` (pagamento).
- O formulário tem a seção “Pagamento — campo independente”, com aviso explícito
  de que o pagamento **não** é derivado do turno nem da troca.
- Interface, drawer, agenda, tabela de relatórios, PDF, CSV, e-mail e API
  mostram as três datas em colunas/campos distintos.
- Valor em branco é exibido como **“a definir”**, nunca inventado.
- Teste automatizado cobre: só troca, só pagamento, ambos, mesmo dia, e
  pagamento anterior ao turno (gera alerta, não bloqueio).

### 2.3 “Animações dos plantões com destaque elegante” → resolvido
- Entrada das semanas em cascata suave, `layoutId` no item ativo do menu,
  transições de drawer/modal com mola, destaque dourado no próximo plantão.
- Brilho radial animado no cartão hero e no `hero-ring`.
- Tudo respeita `prefers-reduced-motion` (quem prefere menos movimento não
  recebe animação).

### 2.4 “Layout premium, sem perder dados” → resolvido
- Nova identidade: Fraunces (display) + Inter (texto), paleta oficial
  (`#01696F`, `#008994`, `#02A2AF`, `#4DD0E1`, dourado `#B08D2A`).
- Painel reorganizado: hero do próximo plantão (ou do último registrado, quando
  não há plantão futuro), faixa de indicadores, resumo do mês, clima,
  distribuição da equipe, conformidade, próximos plantões e ações rápidas.
- Tema claro/escuro completo, com persistência por aparelho.
- Nenhuma informação antiga foi removida: todos os campos do APK continuam
  visíveis e editáveis.

### 2.5 “Cadastro com aprovação do admin” → resolvido
- Cadastro cria usuário `pending` e **não abre sessão**.
- Login de conta pendente explica o status (não vaza existência de e-mail).
- Painel **Aprovações**: aprovar (com papel e vínculo ao plantonista),
  recusar com motivo, suspender, reativar, redefinir senha, promover/rebaixar.
- Histórico de auditoria de todas as ações, com autor, data e antes/depois.
- Regra de segurança: nunca ficar sem administrador.
- Recusar/suspender **não apaga** plantões nem histórico.

### 2.6 “Melhorar de verdade o mobile” → resolvido
- Barra de navegação inferior fixa (5 itens) + topo compacto com ações.
- Agenda como visão padrão da escala no celular.
- Formulários em coluna única, modais em folha deslizante.
- Tabela de relatórios prioriza as colunas de troca × pagamento e cabe na tela.
- Corrigidos estouros horizontais (chips, textos longos e tabela) — validado
  com medição real: `scrollWidth === clientWidth` em 390 px.
- Áreas seguras (`safe-area-inset`) respeitadas no iOS/Android.

### 2.7 “Botão de instalação da PWA realmente funcional” → resolvido
- `manifest.webmanifest` com ícones 192/512, maskable, apple-touch e atalhos.
- Service worker com cache do shell, cache de dados e página offline.
- Botão usa `beforeinstallprompt` quando o navegador oferece; quando não
  oferece, mostra o passo a passo do aparelho (iOS/Android/desktop) em vez de
  um botão que não faz nada.
- Corrigido bug real de registro: se o `load` já tivesse acontecido antes do
  React montar, o service worker nunca era registrado.
- Testado offline: com a rede desligada o app abre com a última escala.

### 2.8 “Testar tudo em prévia visual” → resolvido
- `npm test` → **41 testes** (domínio + API com banco temporário).
- `npm run test:e2e` → **12 fluxos reais** em Chromium (cadastro → aprovação →
  login, plantão com troca/pagamento, calendário/drawer, PWA, offline, tema,
  idioma, mobile, relatório, console limpo).
- `npm run test:visual` → 18 capturas desktop/mobile/tema escuro.
- Resultado atual: 41/41, 12/12 e **0 erros de console**.

---

## 3. O que foi preservado (checklist)

- [x] Plantonistas, cores e iniciais originais
- [x] Plantões de junho/2026 com `swap_for_date` e `-x-`
- [x] Folgas mensais de Agenor e Reginaldo
- [x] Regras 12×36, interjornada 11 h (Art. 66 CLT), folga mensal
- [x] Integração Open-Meteo, Firebase (dry-run), notificações, PDF, e-mail
- [x] Dados de suporte, WhatsApp, PIX e beneficiário
- [x] APK original intocado; nenhum deploy em produção

## 4. O que mudou tecnicamente

- **Antes:** app Android isolado, dados só no aparelho.
- **Agora:** API Express + SQLite com migração fiel, PWA React, autenticação por
  sessão, papéis, auditoria, backup/restauração, exportação/importação.

Arquivos principais: `server/{domain,db,repo,auth,integrations,reports,index}.js`,
`client/src/**`, `tests/{domain.test.js,api.test.js,e2e.mjs,visual.mjs}`,
`data/legacy-seed.json`.

## 5. Como validar em 5 minutos

1. Abra a prévia e entre como admin.
2. **Visão geral:** cartão do plantão, indicadores e clima.
3. **Escala:** grade de junho, chips com troca e pagamento, clique no dia 03.
4. **Plantão:** crie um em julho com troca `05/07` e pagamento `20/07`;
   confirme que as duas datas aparecem separadas.
5. **Aprovações:** aprove/recuse um cadastro e veja o histórico.
6. **Relatórios:** gere o PDF e exporte o CSV.
7. **Ajustes:** instale a PWA, alterne o tema, exporte o backup.
8. No celular (ou DevTools 390 px): navegação inferior, agenda e nenhum corte.

## 5.1 Correção — “login aprovado, mas a tela de login não sai”

**Sintoma:** o acesso era aceito, mas o app voltava para a tela de login.

**Causa:** a sessão existia **apenas em cookie** (`SameSite=Lax`, `HttpOnly`).
Em prévia embutida (iframe de outra origem), com cookies de terceiros
bloqueados, em modo privado ou atrás de proxy que descarta `Set-Cookie`, o
`POST /api/auth/login` respondia 200 e o `GET /api/bootstrap` seguinte chegava
anônimo — o app então voltava ao login, sem explicar nada.

**Correção aplicada:**
- O login (e o acesso de convidado) agora devolve um `sessionToken`; o cliente
  guarda no aparelho e envia em `Authorization: Bearer`, com cópia em memória
  para quando o `localStorage` está bloqueado.
- O servidor aceita token **ou** cookie (`sessionTokenFromRequest`), e o logout
  revoga o token de verdade.
- Cookie continua sendo gravado, agora também como `Partitioned` (CHIPS) em HTTPS.
- Se, mesmo assim, a sessão não se mantiver, aparece uma mensagem clara em vez
  de voltar silenciosamente ao formulário.
- Se o usuário existe mas os dados não chegam, há tela de “tentar novamente”
  (antes ficava carregando para sempre).
- Token inválido é descartado automaticamente e o login aparece normalmente.
- Service worker atualizado (v2.0.1) e o cache de dados passa a ser limpo ao
  entrar/sair, para nunca servir escala de outra sessão em modo offline.

**Verificado em:** navegador sem nenhum cookie, app dentro de iframe de outra
origem com cookies de terceiros bloqueados, e após reload. Testes: 43/43 na
API e 14/14 no navegador (incluindo “login continua logado mesmo sem cookies”).

## 6. Observações honestas

- A base migrada é de **junho/2026**; “hoje” é outubro/2026. O app abre no mês
  com dados e avisa isso claramente. Não inventamos plantões para o mês atual.
- Firebase continua em modo simulado — publicar chaves no navegador seria um
  risco de segurança. A integração original foi isolada no servidor.
- Envio de e-mail/WhatsApp é geração de texto para copiar/abrir; nada é enviado
  automaticamente a partir desta prévia.
- Alterar dados nesta prévia grava no banco local `data/plantao.db`
  (ignorado pelo Git). `npm run db:reset` recria tudo a partir do APK, com
  backup automático antes.
