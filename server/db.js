import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, sha256 } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
/** Pasta gravável (banco, backups). Pode apontar para fora do repo em previews/testes. */
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'plantao.db');
/** Dados migrados do APK moram no repo e nunca são sobrescritos. */
export const SEED_PATH = process.env.SEED_PATH || path.join(ROOT, 'data', 'legacy-seed.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT,
    specialty       TEXT,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
    rejection_reason TEXT,
    collaborator_id INTEGER REFERENCES collaborators(id),
    is_demo         INTEGER NOT NULL DEFAULT 0,
    last_login_at   TEXT,
    approved_at     TEXT,
    approved_by     INTEGER,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash  TEXT NOT NULL UNIQUE,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'guest',
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    user_agent  TEXT
  );

  CREATE TABLE IF NOT EXISTS collaborators (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_id   INTEGER UNIQUE,
    name        TEXT NOT NULL,
    color_hex   TEXT NOT NULL,
    avatar_char TEXT NOT NULL,
    phone       TEXT,
    specialty   TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_id       INTEGER UNIQUE,
    date            TEXT NOT NULL,
    on_shift        TEXT NOT NULL,
    collaborator_id INTEGER REFERENCES collaborators(id),
    period          TEXT NOT NULL,
    swap_for_date   TEXT,
    payment_date    TEXT,
    at_home         TEXT,
    status          TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','pendente','cancelado')),
    notes           TEXT,
    created_by      INTEGER,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS off_days (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_id       INTEGER UNIQUE,
    date            TEXT NOT NULL,
    name            TEXT NOT NULL,
    collaborator_id INTEGER REFERENCES collaborators(id),
    type            TEXT NOT NULL,
    notes           TEXT,
    created_by      INTEGER,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id   INTEGER,
    actor_email TEXT,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  INTEGER,
    before_json TEXT,
    after_json  TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS integration_state (
    name         TEXT PRIMARY KEY,
    enabled      INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'unknown',
    last_sync_at TEXT,
    detail       TEXT,
    payload      TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_shifts_collab ON shifts(collaborator_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_offdays_date ON off_days(date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
`);

export const nowISO = () => new Date().toISOString();

export function getMeta(key, fallback = null) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}

export function audit({ actorId = null, actorEmail = null, action, entity, entityId = null, before = null, after = null }) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, before_json, after_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    actorId,
    actorEmail,
    action,
    entity,
    entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    nowISO(),
  );
}

export function backupDatabase(reason = 'manual') {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `plantao-${stamp}-${reason}.db`);
  try {
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  } catch {
    // fallback: cópia binária consistente o suficiente para um snapshot
    fs.copyFileSync(DB_PATH, file);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .sort();
  while (files.length > 10) {
    const oldest = files.shift();
    try {
      fs.unlinkSync(path.join(dir, oldest));
    } catch {
      /* ignore */
    }
  }
  return file;
}

/** Semeia o app com os dados exatos recuperados do APK (idempotente). */
export function seedDatabase() {
  const seededVersion = getMeta('seed_version');
  if (seededVersion === '2') return { seeded: false };

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const ts = nowISO();

  const settings = {
    app_name: 'RG&SA PLANTÃO',
    support_phone: '5521980498068',
    support_phone_display: '(21) 98049-8068',
    support_email: 'oliveira30regi@gmail.com',
    pix_key: '21980498068',
    beneficiary: 'Reginaldo G. S. Azevedo',
    default_month: '2026-06',
  };
  for (const [key, value] of Object.entries(settings)) {
    if (getSetting(key) === null) setSetting(key, value);
  }

  const insertCollab = db.prepare(
    `INSERT INTO collaborators (legacy_id, name, color_hex, avatar_char, specialty, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(legacy_id) DO NOTHING`,
  );
  for (const c of seed.collaborators) {
    insertCollab.run(c.legacyId, c.name, c.colorHex, c.avatarChar, null, ts, ts);
  }

  const collabIdByName = new Map(
    db.prepare('SELECT id, name FROM collaborators').all().map((c) => [c.name, c.id]),
  );

  const insertShift = db.prepare(
    `INSERT INTO shifts (legacy_id, date, on_shift, collaborator_id, period, swap_for_date, payment_date, at_home, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?)
     ON CONFLICT(legacy_id) DO NOTHING`,
  );
  for (const s of seed.shifts) {
    insertShift.run(
      s.legacyId,
      s.date,
      s.onShift,
      collabIdByName.get(s.onShift) ?? null,
      s.period,
      s.swapForDate ?? null,
      s.paymentDate ?? null,
      s.atHome ?? null,
      ts,
      ts,
    );
  }

  const insertOffDay = db.prepare(
    `INSERT INTO off_days (legacy_id, date, name, collaborator_id, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(legacy_id) DO NOTHING`,
  );
  for (const o of seed.offDays) {
    insertOffDay.run(o.legacyId, o.date, o.name, collabIdByName.get(o.name) ?? null, o.type, ts, ts);
  }

  // Contas de acesso. O APK original não possuía banco de usuários aprovados:
  // a autenticação era Firebase Auth + nó /users sem aprovação. Estas contas
  // existem para operar a prévia local; a senha pode ser trocada por variável
  // de ambiente (ADMIN_PASSWORD) e o hash nunca é exposto pela API.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rgsa.plantao';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Plantao@2026';
  const memberEmail = process.env.MEMBER_EMAIL || 'juliana@rgsa.plantao';
  const memberPassword = process.env.MEMBER_PASSWORD || 'Plantao@2026';

  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    db.prepare(
      `INSERT INTO users (name, email, phone, specialty, password_hash, role, status, collaborator_id, is_demo, approved_at, approved_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admin', 'approved', ?, 1, ?, NULL, ?, ?)`,
    ).run(
      'Reginaldo G. S. Azevedo',
      adminEmail,
      '21980498068',
      'Coordenação / Suporte',
      hashPassword(adminPassword),
      collabIdByName.get('Reginaldo') ?? null,
      ts,
      ts,
      ts,
    );
  }

  const existingMember = db.prepare('SELECT id FROM users WHERE email = ?').get(memberEmail);
  if (!existingMember) {
    db.prepare(
      `INSERT INTO users (name, email, phone, specialty, password_hash, role, status, collaborator_id, is_demo, approved_at, approved_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'member', 'approved', ?, 1, ?, NULL, ?, ?)`,
    ).run(
      'Juliana',
      memberEmail,
      '21980498068',
      'Enfermeira',
      hashPassword(memberPassword),
      collabIdByName.get('Juliana') ?? null,
      ts,
      ts,
      ts,
    );
  }

  // Solicitação de exemplo para demonstrar o fluxo de aprovação do admin.
  const pendingEmail = 'camila.rocha@exemplo.com';
  const existingPending = db.prepare('SELECT id FROM users WHERE email = ?').get(pendingEmail);
  if (!existingPending) {
    db.prepare(
      `INSERT INTO users (name, email, phone, specialty, password_hash, role, status, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'member', 'pending', 1, ?, ?)`,
    ).run(
      'Camila Rocha',
      pendingEmail,
      '21988887777',
      'Técnica de Enfermagem',
      hashPassword('Plantao@2026'),
      ts,
      ts,
    );
  }

  const integrations = [
    ['open-meteo', 1, 'configured', 'Clima do Rio via Open-Meteo (mesma API do APK original) — somente leitura.'],
    ['firebase-rtdb', 0, 'disabled', 'Sincronização Firebase Realtime Database desativada por padrão para não tocar em produção.'],
    ['whatsapp-support', 1, 'configured', 'Atalho de suporte via WhatsApp preservado do APK original.'],
    ['pdf-report', 1, 'configured', 'Relatório mensal em PDF gerado no navegador (sem enviar dados para fora).'],
  ];
  const insertIntegration = db.prepare(
    `INSERT INTO integration_state (name, enabled, status, detail) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING`,
  );
  for (const row of integrations) insertIntegration.run(...row);

  setMeta('seed_version', '2');
  setMeta('legacy_source', `${seed.package} v${seed.versionName} (${seed.versionCode})`);
  setMeta('legacy_imported_at', ts);
  setMeta('legacy_counts', JSON.stringify({ collaborators: seed.collaborators.length, shifts: seed.shifts.length, offDays: seed.offDays.length }));

  audit({
    action: 'seed',
    entity: 'database',
    after: { source: seed.package, collaborators: seed.collaborators.length, shifts: seed.shifts.length, offDays: seed.offDays.length },
  });
  return { seeded: true };
}

export function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowISO());
}

export function tableCount(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

export function initialize() {
  seedDatabase();
  cleanupSessions();
  if (!getMeta('first_boot_backup')) {
    backupDatabase('first-boot');
    setMeta('first_boot_backup', nowISO());
  }
  return db;
}

export default db;
