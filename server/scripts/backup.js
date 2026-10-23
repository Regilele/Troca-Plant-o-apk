#!/usr/bin/env node
/**
 * Backup seguro do banco SQLite.
 *
 *   npm run db:backup
 *
 * Cria data/backups/plantao-<timestamp>-manual.db preservando WAL/SHM e
 * mantém apenas os 10 arquivos mais recentes. Nunca modifica o banco atual.
 */
import fs from 'node:fs';
import path from 'node:path';
import { backup, ROOT } from './reset-db.js';

const stamp = new Date().toISOString();
const file = backup('manual');

if (!file) process.exit(0);

const stat = fs.statSync(file);
console.log(`Quando:    ${stamp}`);
console.log(`Arquivo:   ${path.relative(ROOT, file)}`);
console.log(`Tamanho:   ${(stat.size / 1024).toFixed(0)} kB`);
console.log('Para restaurar: pare o servidor, copie este arquivo sobre data/plantao.db e remova os .db-wal/.db-shm antigos.');
