/**
 * Prévia visual automatizada (desktop + mobile).
 * Requer Chromium: usa @sparticuz/chromium quando não há navegador do sistema.
 * Uso: node tests/visual.mjs [baseUrl] [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const OUT = process.argv[3] || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const puppeteer = (await import('puppeteer-core')).default;
let executablePath;
let args = ['--no-sandbox', '--disable-dev-shm-usage'];
let env = { ...process.env };

try {
  const chromium = (await import('@sparticuz/chromium')).default;
  executablePath = await chromium.executablePath();
  args = [...chromium.args, '--no-sandbox'];
  env = { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' };
} catch {
  executablePath = undefined;
}

const browser = await puppeteer.launch({ executablePath, args, env, headless: 'shell' });
const errors = [];

async function newPage(viewport) {
  const page = await browser.newPage();
  // sessão limpa para cada viewport (cookies não vazam entre cenários)
  const client = await page.createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await page.setViewport(viewport);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
  return page;
}

async function shot(page, name, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, options.wait ?? 700));
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: options.fullPage ?? false });
  console.log('📸', name);
}

async function login(page, email = 'admin@rgsa.plantao', password = 'Plantao@2026') {
  await page.evaluate(() => localStorage.setItem('rgsa.lang', 'pt'));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#auth-email');
  await page.type('#auth-email', email);
  await page.type('#auth-password', password);
  await Promise.all([page.click('button[type="submit"]'), new Promise((r) => setTimeout(r, 1500))]);
}

const desktop = await newPage({ width: 1440, height: 960, deviceScaleFactor: 2 });

await desktop.goto(BASE, { waitUntil: 'networkidle0' });
await desktop.evaluate(() => localStorage.setItem('rgsa.lang', 'pt'));
await desktop.reload({ waitUntil: 'networkidle0' });
await shot(desktop, '01-login-desktop', { wait: 1200 });

await login(desktop);
await shot(desktop, '02-dashboard', { wait: 1400 });

const tabs = [
  ['escala', '03-calendario'],
  ['equipe', '04-equipe'],
  ['relatorios', '05-relatorios'],
  ['aprovacoes', '06-aprovacoes'],
  ['ajustes', '07-ajustes'],
];
for (const [tab, name] of tabs) {
  await desktop.evaluate((tabId) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tabId);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    const buttons = [...document.querySelectorAll('.side-nav .nav-item')];
    const label = { escala: 'Escala', equipe: 'Equipe', relatorios: 'Relatórios', aprovacoes: 'Aprovações', ajustes: 'Ajustes' }[tabId];
    const button = buttons.find((b) => b.textContent?.includes(label));
    button?.click();
  }, tab);
  await shot(desktop, name, { wait: 1100 });
}

// Lista (agenda) no calendário
await desktop.evaluate(() => {
  const buttons = [...document.querySelectorAll('.side-nav .nav-item')];
  buttons.find((b) => b.textContent?.includes('Escala'))?.click();
});
await new Promise((r) => setTimeout(r, 800));
const listClicked = await desktop.evaluate(() => {
  const buttons = [...document.querySelectorAll('.segmented button')];
  const target = buttons.find((b) => b.textContent?.includes('Lista'));
  target?.click();
  return Boolean(target);
});
if (listClicked) await shot(desktop, '08-calendario-lista', { wait: 800 });

// Drawer de um dia
await desktop.evaluate(() => {
  const params = new URLSearchParams(window.location.search);
  params.set('tab', 'escala');
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
});
await desktop.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));
const openedDay = await desktop.evaluate(() => {
  const buttons = [...document.querySelectorAll('.segmented button')];
  buttons.find((b) => b.textContent?.includes('Grade'))?.click();
  const day = [...document.querySelectorAll('.day-cell')].find((cell) => cell.querySelector('.shift-chip'));
  day?.click();
  return Boolean(day);
});
if (openedDay) await shot(desktop, '09-dia-drawer', { wait: 900 });

// Modal de novo plantão
await desktop.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 400));
await desktop.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Plantão') && b.className.includes('btn-primary'));
  button?.click();
});
await shot(desktop, '10-modal-plantao', { wait: 800 });

// Mobile
const mobile = await newPage({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await mobile.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
await mobile.goto(BASE, { waitUntil: 'networkidle0' });
await shot(mobile, '11-mobile-login', { wait: 1000, fullPage: true });
await login(mobile);
await shot(mobile, '12-mobile-dashboard', { wait: 1400, fullPage: true });
await shot(mobile, '13-mobile-dashboard-fold', { wait: 400 });
await mobile.evaluate(() => {
  const buttons = [...document.querySelectorAll('.mobile-nav button')];
  buttons.find((b) => b.textContent?.includes('Escala'))?.click();
});
await shot(mobile, '14-mobile-escala', { wait: 1200, fullPage: true });
await mobile.evaluate(() => {
  const day = [...document.querySelectorAll('.day-cell')].find((cell) => cell.querySelector('.shift-chip'));
  day?.click();
});
await shot(mobile, '15-mobile-drawer', { wait: 900 });
await mobile.keyboard.press('Escape');
await mobile.evaluate(() => {
  const buttons = [...document.querySelectorAll('.mobile-nav button')];
  buttons.find((b) => b.textContent?.includes('Relatórios'))?.click();
});
await shot(mobile, '16-mobile-relatorios', { wait: 1000, fullPage: true });

// Dark theme
const dark = await newPage({ width: 1440, height: 960, deviceScaleFactor: 2 });
await dark.goto(BASE, { waitUntil: 'networkidle0' });
await dark.evaluate(() => {
  localStorage.setItem('rgsa.theme', 'dark');
});
await dark.reload({ waitUntil: 'networkidle0' });
await shot(dark, '17-login-dark', { wait: 900 });
await login(dark);
await shot(dark, '18-dashboard-dark', { wait: 1200 });

await browser.close();

console.log('\nErros de console:', errors.length);
for (const error of errors.slice(0, 20)) console.log(' -', error);
if (errors.length) process.exitCode = 1;
