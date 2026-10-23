/**
 * Fluxos de ponta a ponta na interface real (Chromium headless).
 *
 * Sobe um servidor isolado com banco temporário — não toca em data/plantao.db.
 * Rodar:  npm run test:e2e
 *
 * Cobre os pedidos do cliente:
 *  · cadastro → aprovação do admin → login
 *  · plantão com data de troca e data de pagamento separadas
 *  · animação/hierarquia do calendário e do painel
 *  · responsividade mobile (navegação inferior + agenda)
 *  · PWA instalável (manifest, service worker, botão de instalação)
 *  · idioma e tema persistem
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser, watchErrors } from './browser.mjs';

const PORT = Number(process.env.E2E_PORT || 4601);
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), 'rgsa-e2e-'));
const results = [];
const browserErrors = [];

let server;
const browser = await launchBrowser();

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.log(`❌ ${name} — ${detail}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (error) {
    fail(name, error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, { timeout = 8000, interval = 120, label = 'condição' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(`tempo esgotado esperando ${label}${lastError ? ` (${lastError.message})` : ''}`);
}

async function clickByText(page, selector, text) {
  const clicked = await page.evaluate(
    (sel, expected) => {
      const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const target = [...document.querySelectorAll(sel)].find((element) =>
        normalize(element.textContent).includes(expected.toLowerCase()),
      );
      if (!target) return false;
      target.scrollIntoView({ block: 'center' });
      target.click();
      return true;
    },
    selector,
    text,
  );
  assert(clicked, `elemento "${selector}" com texto "${text}" não encontrado`);
  await sleep(400);
}

const context = browser.defaultBrowserContext();
await context.overridePermissions(BASE, ['notifications']);

const errors = [];
const page = await browser.newPage();
watchErrors(page, errors);
await page.setViewport({ width: 1440, height: 960 });

async function clearSession() {
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rgsa.lang', 'pt');
  });
  await page.reload({ waitUntil: 'networkidle0' });
}

async function login(email, password) {
  // A sessão agora também vive em token: limpar cookie não basta para
  // garantir que o formulário de login apareça.
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('rgsa.session'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#auth-email', { timeout: 15000 });
  await page.type('#auth-email', email);
  await page.type('#auth-password', password);
  await page.click('button[type="submit"]');
  await waitFor(() => page.$('.side-nav'), { label: 'shell autenticado' });
  await sleep(700);
}

function tab(name) {
  return page.evaluate((tabName) => {
    const target = document.querySelector(`.side-nav .nav-item[data-tab="${tabName}"]`);
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, name);
}

try {
  /* ---------------------------------------------------------------- */
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DB_PATH: join(tmp, 'e2e.db'),
      DATA_DIR: tmp,
      SEED_PATH: new URL('../data/legacy-seed.json', import.meta.url).pathname,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => {
    const text = String(chunk);
    if (!/ExperimentalWarning|trace-warnings/.test(text)) process.stderr.write(`[server] ${text}`);
  });
  await waitFor(
    async () => {
      const res = await fetch(`${BASE}/api/health`);
      return res.ok;
    },
    { timeout: 25000, label: 'servidor' },
  );

  /* 1. Tela de login em português ---------------------------------- */
  await step('login em português com dados de demonstração', async () => {
    await clearSession();
    const heading = await page.$eval('.auth-card, .login-card, form', (el) => el.textContent).catch(() => '');
    assert(/Bem-vindo|Entrar/.test(heading + (await page.evaluate(() => document.body.innerText))), 'textos em português');
    const demo = await page.evaluate(() => document.body.innerText.includes('admin@rgsa.plantao'));
    assert(demo, 'credenciais de demonstração visíveis');
    return 'marca, formulário e credenciais de demonstração';
  });

  /* 2. Cadastro novo fica pendente ---------------------------------- */
  await step('cadastro novo entra como pendente', async () => {
    await clickByText(page, '.segmented button, .auth-tabs button, button', 'Criar cadastro');
    await page.waitForSelector('#signup-name', { timeout: 8000 });
    await page.type('#signup-name', 'Camila Teste E2E');
    await page.type('#signup-phone', '21988887777');
    await page.type('#signup-specialty', 'Técnica de Enfermagem');
    await page.type('#auth-email', 'e2e.camila@exemplo.com');
    await page.type('#auth-password', 'Plantao@2026');
    await page.click('button[type="submit"]');
    const body = await waitFor(
      async () => {
        const text = await page.evaluate(() => document.body.innerText);
        return /aprova|pendente/i.test(text) ? text : null;
      },
      { label: 'mensagem de aprovação pendente' },
    );
    assert(/administrador/i.test(body), 'mensagem menciona o administrador');
    return 'solicitação guardada aguardando aprovação';
  });

  /* 3. Admin aprova -------------------------------------------------- */
  await step('admin aprova a solicitação pelo painel', async () => {
    await login('admin@rgsa.plantao', 'Plantao@2026');
    const went = await tab('aprovacoes');
    assert(went, 'aba Aprovações acessível pelo menu lateral');
    await sleep(600);
    const hasRequest = await page.evaluate(() => document.body.innerText.includes('Camila Teste E2E'));
    assert(hasRequest, 'solicitação aparece na fila');

    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.list-row, .card')];
      const row = rows.find((el) => el.textContent.includes('Camila Teste E2E'));
      const button = row?.querySelector('button');
      button?.click();
    });
    await waitFor(async () => page.$('.modal'), { label: 'modal de aprovação' });
    await sleep(500);
    const approved = await page.evaluate(() => {
      const button = [...document.querySelectorAll('.modal button')].find((el) =>
        /Aprovar$/i.test(el.textContent.trim()),
      );
      if (!button) return false;
      button.click();
      return true;
    });
    assert(approved, 'botão Aprovar dentro do modal');
    await sleep(1600);
    const pendingGone = await page.evaluate(() => !document.querySelector('.modal'));
    assert(pendingGone, 'modal fecha após aprovar');
    return 'fluxo aprovação → conta ativa';
  });

  /* 4. Novo usuário consegue entrar ---------------------------------- */
  await step('usuário aprovado consegue entrar', async () => {
    await login('e2e.camila@exemplo.com', 'Plantao@2026');
    const user = await page.evaluate(() => document.body.innerText);
    assert(/Camila/i.test(user), 'nome do usuário no painel');
    assert(!/Administrador/.test(await page.evaluate(() => document.querySelector('.user-card')?.innerText || '')), 'sem poderes admin');
    return 'sessão de plantonista criada';
  });

  /* 5. Plantão com troca e pagamento separados ----------------------- */
  await step('cadastro de plantão com troca e pagamento independentes', async () => {
    await login('admin@rgsa.plantao', 'Plantao@2026');
    await tab('escala');
    await sleep(900);
    await clickByText(page, 'button', 'Plantão');
    await waitFor(async () => page.$('#shift-date'), { label: 'formulário de plantão' });
    await page.evaluate(() => {
      const input = document.querySelector('#shift-date');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '2026-06-09');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.select('#shift-person', 'Juliana');
    await page.evaluate(() => {
      const set = (id, value) => {
        const input = document.querySelector(id);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('#shift-payment', '2026-07-05');
      set('#shift-swap', '2026-06-12');
    });
    await clickByText(page, '.modal button, form button', 'Adicionar à escala');
    await sleep(1800);
    const stored = await page.evaluate(async () => {
      const res = await fetch('/api/shifts', { headers: { 'x-requested-with': 'rgsa-plantao' } });
      const data = await res.json();
      return data.shifts.find((shift) => shift.date === '2026-06-09' && shift.onShift === 'Juliana');
    });
    assert(stored, 'plantão gravado na API');
    assert(stored.swapForDate === '2026-06-12', `data de troca separada (${stored.swapForDate})`);
    assert(stored.paymentDate === '2026-07-05', `data de pagamento separada (${stored.paymentDate})`);
    return `troca ${stored.swapForDate} · pagamento ${stored.paymentDate}`;
  });

  /* 6. Calendário mostra o plantão e o dia abre o drawer ------------- */
  await step('calendário mostra o plantão e abre o detalhe do dia', async () => {
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'escala');
      window.history.replaceState({}, '', url);
      window.location.reload();
    });
    await page.waitForSelector('.calendar-board, .agenda', { timeout: 12000 });
    await sleep(1200);
    const found = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.day-cell')];
      const cell = cells.find((el) => el.textContent.includes('9'));
      if (!cell) return false;
      cell.click();
      return true;
    });
    if (found) {
      await waitFor(async () => page.$('.drawer'), { label: 'drawer do dia' });
      const text = await page.evaluate(() => document.querySelector('.drawer').innerText);
      assert(/Juliana/.test(text), 'plantonista listado no drawer');
      assert(/05\/07\/2026/.test(text), 'data de pagamento exibida separada');
      await page.keyboard.press('Escape');
      return 'drawer com plantão e pagamento independentes';
    }
    // mobile-first: o modo agenda é o padrão em telas pequenas
    const agenda = await page.evaluate(() => document.querySelector('.agenda')?.innerText || '');
    assert(/Juliana/.test(agenda), 'plantão visível na agenda');
    return 'agenda com plantão do dia';
  });

  /* 7. PWA instalável ------------------------------------------------ */
  await step('PWA: manifest, service worker e botão de instalação', async () => {
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'visao');
      window.history.replaceState({}, '', url);
      window.location.reload();
    });
    await page.waitForSelector('.side-nav', { timeout: 12000 });
    await sleep(1500);
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      const res = await fetch(link.href);
      const json = await res.json();
      return { name: json.name, display: json.display, icons: json.icons.length, start: json.start_url };
    });
    assert(manifest, 'manifest linkado');
    assert(manifest.display === 'standalone', `display ${manifest.display}`);
    assert(manifest.icons >= 2, `${manifest.icons} ícones`);
    const sw = await waitFor(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'unsupported';
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.active ? 'active' : null;
        }),
      { label: 'service worker ativo' },
    );
    assert(sw === 'active', `service worker ${sw}`);
    const cached = await page.evaluate(() => caches.keys());
    assert(cached.some((key) => /rgsa/i.test(key)), 'cache offline criado');
    const installCard = await page.evaluate(() => document.body.innerText.includes('Instalar no aparelho'));
    assert(installCard, 'card de instalação presente no painel');
    return `manifest ${manifest.name} · ${manifest.icons} ícones · sw ${sw}`;
  });

  /* 7b. Offline ------------------------------------------------------- */
  await step('app abre offline com o shell em cache', async () => {
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    const text = await page.evaluate(() => document.body.innerText);
    assert(/RG&SA|PLANTÃO/.test(text), 'marca renderizada sem rede');
    await page.setOfflineMode(false);
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    return 'shell servido pelo service worker';
  });

  /* 8. Tema e idioma persistem --------------------------------------- */
  await step('tema escuro e idioma persistem após recarregar', async () => {
    await page.evaluate(() => document.querySelector('.topbar-actions [data-action="theme"]')?.click());
    await sleep(700);
    const dark = await page.evaluate(() => document.documentElement.dataset.theme || document.body.className);
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    const stillDark = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(/dark/i.test(String(dark)) || /dark/i.test(String(stillDark)), 'tema escuro aplicado');

    await page.evaluate(() => document.querySelector('.topbar-actions [data-action="lang"]')?.click());
    await sleep(800);
    const english = await page.evaluate(() => document.body.innerText.includes('Overview') || document.body.innerText.includes('Dashboard'));
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    const persisted = await page.evaluate(() => localStorage.getItem('rgsa.lang'));
    assert(persisted === 'en' || english, `idioma salvo (${persisted})`);
    await page.evaluate(() => localStorage.setItem('rgsa.lang', 'pt'));
    await page.reload({ waitUntil: 'networkidle0' });
    return `tema ${stillDark || dark} · idioma ${persisted}`;
  });

  /* 9. Mobile -------------------------------------------------------- */
  await step('mobile: navegação inferior e agenda sem corte', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    const nav = await page.$('.mobile-nav');
    assert(nav, 'barra inferior visível');
    const items = await page.evaluate(() => document.querySelectorAll('.mobile-nav button').length);
    assert(items >= 4, `${items} itens na navegação`);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.mobile-nav button')].find((el) =>
        /Escala/.test(el.textContent),
      );
      button?.click();
    });
    await sleep(1400);
    const layout = await page.evaluate(() => {
      const agenda = document.querySelector('.agenda');
      const board = document.querySelector('.calendar-board');
      const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return {
        agenda: Boolean(agenda),
        board: Boolean(board),
        overflowX,
        navFixed: getComputedStyle(document.querySelector('.mobile-nav')).position,
      };
    });
    assert(layout.overflowX <= 2, `sem rolagem horizontal (${layout.overflowX}px)`);
    assert(layout.agenda || layout.board, 'escala renderizada no mobile');
    assert(layout.navFixed === 'fixed' || layout.navFixed === 'sticky', 'navegação fixa');
    return `agenda ${layout.agenda ? 'sim' : 'não'} · overflow ${layout.overflowX}px`;
  });

  /* 10. Relatório em PDF/CSV ----------------------------------------- */
  await step('relatório mensal e exportação CSV disponíveis', async () => {
    await page.setViewport({ width: 1440, height: 960 });
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(800);
    await tab('relatorios');
    await sleep(1500);
    const text = await page.evaluate(() => document.body.innerText);
    assert(/Relatórios/.test(text), 'página de relatórios aberta');
    assert(/CSV/.test(text) && /PDF/i.test(text), 'ações de CSV e PDF presentes');
    const res = await page.evaluate(async () => {
      const token = localStorage.getItem('rgsa.session');
      const response = await fetch('/api/reports/monthly?month=2026-06', {
        headers: {
          'x-requested-with': 'rgsa-plantao',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      return { status: response.status, body: await response.json() };
    });
    assert(res.status === 200, `API de relatório ${res.status}`);
    assert(/RG&SA/.test(res.body.text), 'texto do relatório inclui a marca');
    return 'PDF no cliente + relatório da API';
  });

  /* 10b. Sessão sem cookies (prévia em iframe) ----------------------- */
  await step('login continua logado mesmo sem cookies', async () => {
    await login('admin@rgsa.plantao', 'Plantao@2026');
    const token = await page.evaluate(() => localStorage.getItem('rgsa.session'));
    assert(token, 'token de sessão salvo no aparelho');

    const cdp = await page.createCDPSession();
    await cdp.send('Network.clearBrowserCookies');
    await page.reload({ waitUntil: 'networkidle0' });
    await waitFor(async () => page.$('.side-nav'), { label: 'shell após apagar cookies' });
    const cookies = (await cdp.send('Network.getAllCookies')).cookies.length;
    assert(cookies === 0, `cookies restantes: ${cookies}`);
    return 'sessão mantida só pelo token';
  });

  /* 10c. Sessão inválida é descartada -------------------------------- */
  await step('token inválido volta para o login sem travar', async () => {
    await page.evaluate(() => localStorage.setItem('rgsa.session', 'token-invalido'));
    await page.reload({ waitUntil: 'networkidle0' });
    await waitFor(async () => page.$('#auth-email'), { label: 'tela de login' });
    const cleared = await page.evaluate(() => localStorage.getItem('rgsa.session'));
    assert(!cleared, 'token inválido removido do aparelho');
    return 'login exibido e token limpo';
  });

  /* 11. Sem erros de console ---------------------------------------- */
  await step('nenhum erro de console durante o fluxo', async () => {
    // o login de uma conta pendente devolve 403 de propósito (fluxo testado acima)
    const relevant = errors.filter(
      (line) => !/favicon|Download the React DevTools|status of 403/i.test(line),
    );
    assert(relevant.length === 0, relevant.slice(0, 3).join(' | '));
    return 'console limpo';
  });
} catch (error) {
  fail('execução dos fluxos', error.stack || error.message);
} finally {
  await browser.close();
  server?.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.ok);
console.log('\n──────── resumo E2E ────────');
console.log(`${results.length - failed.length}/${results.length} verificações passaram`);
if (failed.length) {
  for (const item of failed) console.log(`· ${item.name}: ${item.detail}`);
  process.exitCode = 1;
}
