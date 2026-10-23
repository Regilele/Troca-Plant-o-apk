#!/usr/bin/env node
/**
 * Cria um backup do banco antes de qualquer operação destrutiva.
 *
 *   npm run db:backup              → grava data/backups/plantao-<timestamp>.db
 *   npm run db:reset               → faz backup e zera o banco (pede confirmação)
 *   npm run db:reset -- --yes      → sem confirmação (use em scripts/CI)
 *
 * O reset NUNCA apaga os dados migrados do APK: ele recria o schema e
 * re-semeia a partir de data/legacy-seed.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');

function dbPath() {
  const dataDir = process.env.DATA_DIR || path.join(ROOT, 'data');
  return process.env.DB_PATH || path.join(dataDir, 'plantao.db');
}

/** Copia o banco (e o WAL, se existir) para data/backups/. */
export function backup(reason = 'manual') {
  const source = dbPath();
  if (!fs.existsSync(source)) {
    console.log('Nenhum banco para copiar ainda — nada a fazer.');
    return null;
  }
  const dir = path.join(path.dirname(source), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `plantao-${stamp()}-${reason}.db`);
  fs.copyFileSync(source, target);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, target + suffix);
  }
  const size = (fs.statSync(target).size / 1024).toFixed(0);
  console.log(`Backup criado: ${path.relative(ROOT, target)} (${size} kB)`);

  // mantém os 10 mais recentes
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('plantao-') && name.endsWith('.db'))
    .sort()
    .reverse();
  for (const old of files.slice(10)) {
    fs.unlinkSync(path.join(dir, old));
    console.log(`Backup antigo removido: ${old}`);
  }
  return target;
}

async function confirm(question) {
  if (process.argv.includes('--yes') || process.env.CI) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^(s|sim|y|yes)$/i.test(answer.trim());
}

async function reset() {
  console.log('Reset do banco — os dados migrados do APK serão recriados a partir do seed.');
  if (!(await confirm('Continuar? [s/N] '))) {
    console.log('Cancelado. Nada foi alterado.');
    return;
  }
  const target = backup('pre-reset');
  if (!target) console.log('Sem banco existente: será criado um novo.');

  const { db, initialize, SEED_PATH } = await import('../db.js');
  db.exec(`
    DROP TABLE IF EXISTS shifts;
    DROP TABLE IF EXISTS off_days;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS collaborators;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS integration_state;
    DROP TABLE IF EXISTS meta;
  `);
  db.close();
  console.log(`Seed usado: ${path.relative(ROOT, SEED_PATH)}`);
  console.log('Reiniciando esquema e aplicando o seed...');
  // nova conexão: db.js cria o schema no import
  const fresh = await import(`../db.js?reset=${Date.now()}`);
  fresh.initialize();
  const counts = {
    collaborators: fresh.tableCount('collaborators'),
    shifts: fresh.tableCount('shifts'),
    offDays: fresh.tableCount('off_days'),
    users: fresh.tableCount('users'),
  };
  console.log('Banco recriado:', counts);
  fresh.db.close();
}

// Só executa quando chamado direto (backup.js importa este arquivo).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  reset().catch((error) => {
    console.error('Falha no reset:', error.message);
    process.exitCode = 1;
  });
}
