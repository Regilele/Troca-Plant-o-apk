import { db } from './db.js';

const collaboratorColumns = `
  id, legacy_id AS legacyId, name, color_hex AS colorHex, avatar_char AS avatarChar,
  phone, specialty, active, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const shiftColumns = `
  id, legacy_id AS legacyId, date, on_shift AS onShift, collaborator_id AS collaboratorId,
  period, swap_for_date AS swapForDate, payment_date AS paymentDate, at_home AS atHome,
  status, notes, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const offDayColumns = `
  id, legacy_id AS legacyId, date, name, collaborator_id AS collaboratorId, type, notes,
  created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const userColumns = `
  id, name, email, phone, specialty, role, status, rejection_reason AS rejectionReason,
  collaborator_id AS collaboratorId, is_demo AS isDemo, last_login_at AS lastLoginAt,
  approved_at AS approvedAt, approved_by AS approvedBy, created_at AS createdAt, updated_at AS updatedAt
`;

export const listCollaborators = ({ includeDeleted = false } = {}) =>
  db
    .prepare(
      `SELECT ${collaboratorColumns} FROM collaborators
       ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'}
       ORDER BY active DESC, name ASC`,
    )
    .all();

export const getCollaborator = (id) =>
  db.prepare(`SELECT ${collaboratorColumns} FROM collaborators WHERE id = ?`).get(id) || null;

export const findCollaboratorByName = (name) =>
  db
    .prepare(`SELECT ${collaboratorColumns} FROM collaborators WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`)
    .get(name) || null;

export const listShifts = ({ includeDeleted = false, start = null, end = null, person = null } = {}) => {
  const where = [];
  const params = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  if (start) {
    where.push('date >= ?');
    params.push(start);
  }
  if (end) {
    where.push('date <= ?');
    params.push(end);
  }
  if (person) {
    where.push('on_shift = ?');
    params.push(person);
  }
  return db
    .prepare(
      `SELECT ${shiftColumns} FROM shifts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY date ASC, id ASC`,
    )
    .all(...params);
};

export const getShift = (id) =>
  db.prepare(`SELECT ${shiftColumns} FROM shifts WHERE id = ?`).get(id) || null;

export const listOffDays = ({ includeDeleted = false, start = null, end = null } = {}) => {
  const where = [];
  const params = [];
  if (!includeDeleted) where.push('deleted_at IS NULL');
  if (start) {
    where.push('date >= ?');
    params.push(start);
  }
  if (end) {
    where.push('date <= ?');
    params.push(end);
  }
  return db
    .prepare(
      `SELECT ${offDayColumns} FROM off_days ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY date ASC, id ASC`,
    )
    .all(...params);
};

export const getOffDay = (id) =>
  db.prepare(`SELECT ${offDayColumns} FROM off_days WHERE id = ?`).get(id) || null;

export const getUserByEmail = (email) =>
  db.prepare(`SELECT ${userColumns}, password_hash AS passwordHash FROM users WHERE lower(email) = lower(?)`).get(email) ||
  null;

export const getUserById = (id) => db.prepare(`SELECT ${userColumns} FROM users WHERE id = ?`).get(id) || null;

export const listUsers = ({ status = null } = {}) =>
  db
    .prepare(`SELECT ${userColumns} FROM users ${status ? 'WHERE status = ?' : ''} ORDER BY created_at DESC`)
    .all(...(status ? [status] : []));

export const listAudit = ({ limit = 80, entity = null } = {}) =>
  db
    .prepare(
      `SELECT id, actor_id AS actorId, actor_email AS actorEmail, action, entity, entity_id AS entityId,
              before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
       FROM audit_log ${entity ? 'WHERE entity = ?' : ''} ORDER BY id DESC LIMIT ?`,
    )
    .all(...(entity ? [entity, limit] : [limit]));

export const integrations = () =>
  db
    .prepare(
      `SELECT name, enabled, status, last_sync_at AS lastSyncAt, detail, payload FROM integration_state ORDER BY name`,
    )
    .all()
    .map((row) => ({ ...row, enabled: Boolean(row.enabled), payload: row.payload ? JSON.parse(row.payload) : null }));

export const settingsMap = () =>
  Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
