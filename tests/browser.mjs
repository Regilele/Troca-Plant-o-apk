/**
 * Navegador compartilhado pelos testes visuais e de fluxo.
 *
 * Ordem de preferência:
 *  1. CHROME_PATH (Chromium/Chrome já instalado)
 *  2. @sparticuz/chromium (baixa o binário junto com o pacote, sem CDN)
 *  3. Playwright instalado no sistema
 *
 * Em ambientes mínimos (como a sandbox da Arena) as libs do al2023 precisam
 * ser extraídas à mão; ver README > "Testes de interface".
 */
import fs from 'node:fs';
import path from 'node:path';

export async function launchBrowser() {
  const puppeteer = (await import('puppeteer-core')).default;
  let executablePath = process.env.CHROME_PATH || undefined;
  let args = ['--no-sandbox', '--disable-dev-shm-usage'];
  let env = { ...process.env };

  if (!executablePath) {
    try {
      const chromium = (await import('@sparticuz/chromium')).default;
      executablePath = await chromium.executablePath();
      args = [...chromium.args, '--no-sandbox'];
      const libDir = process.env.CHROMIUM_LIB_DIR || '/tmp/al2023/lib';
      if (fs.existsSync(libDir)) {
        env = { ...env, LD_LIBRARY_PATH: [libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
      }
    } catch {
      executablePath = undefined;
    }
  }

  if (!executablePath) {
    // último recurso: binário do Playwright
    const home = process.env.HOME || '/root';
    const candidates = [
      path.join(home, '.cache/ms-playwright/chromium-1148/chrome-linux/chrome'),
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
    ];
    executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  }

  if (!executablePath) {
    throw new Error(
      'Nenhum Chromium encontrado. Instale com `npx puppeteer browsers install chrome` ou defina CHROME_PATH.',
    );
  }

  return puppeteer.launch({ executablePath, args, env, headless: 'shell' });
}

/** Coleta erros de console/página de uma tab. */
export function watchErrors(page, sink) {
  page.on('console', (message) => {
    if (message.type() === 'error') sink.push(`[console] ${message.text()}`);
  });
  page.on('pageerror', (error) => sink.push(`[pageerror] ${error.message}`));
}
