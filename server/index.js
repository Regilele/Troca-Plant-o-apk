import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initialize, nowISO, audit, backupDatabase, DATA_DIR, getSetting, setSetting, tableCount } from './db.js';
import { hashPassword, verifyPassword } from './security.js';
import {
  attachUser,
  clearSessionCookie,
  createSession,
  destroySession,
  rateLimitLogin,
  requireAdmin,
  requireApproved,
  requireEditor,
  setSessionCookie,
} from './auth.js';
import {
  buildMonthGrid,
  buildSwapPairs,
  analyzeSchedule,
  cycleInfo,
  monthBounds,
  monthStats,
  validateCollaborator,
  validateOffDay,
  validateShift,
  PERIODS,
  OFFDAY_TYPES,
  isMonth,
  isISODate,
} from './domain.js';
import {
  findCollaboratorByName,
  getCollaborator,
  getOffDay,
  getShift,
  getUserByEmail,
  getUserById,
  integrations,
  listAudit,
  listCollaborators,
  listOffDays,
  listShifts,
  listUsers,
  settingsMap,
} from './repo.js';
import { fetchRioWeather, firebaseSync, integrationSnapshot, legacyInfo } from './integrations.js';
import { monthlyReportText, monthLabel } from './reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'client', 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = '2.0.0';

initialize();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // Não enviamos X-Frame-Options/CSP frame-ancestors: a prévia é embutida em iframe.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

const api = express.Router();

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const badRequest = (res, message, details = null) =>
  res.status(400).json({ error: { code: 'invalid_input', message, details } });
const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ error: { code, message, ...extra } });

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return {
    ...rest,
    isGuest: Boolean(user.isGuest),
    isDemo: Boolean(user.isDemo),
    label: user.role === 'admin' ? 'Administrador' : user.role === 'guest' ? 'Convidado' : 'Plantonista',
  };
}

function csrfGuard(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.get('x-requested-with') !== 'rgsa-plantao') {
      return fail(res, 403, 'csrf', 'Requisição bloqueada por proteção CSRF. Recarregue a página e tente novamente.');
    }
  }
  next();
}
api.use(csrfGuard);
api.use(attachUser);

function resolveCollaborator(payload) {
  if (payload.collaboratorId) {
    const byId = getCollaborator(Number(payload.collaboratorId));
    if (byId) return byId;
  }
  if (payload.onShift) return findCollaboratorByName(String(payload.onShift).trim());
  return null;
}

function normalizeShiftPayload(body) {
  return {
    date: body.date,
    onShift: typeof body.onShift === 'string' ? body.onShift.trim() : body.onShift,
    collaboratorId: body.collaboratorId ?? null,
    period: body.period,
    swapForDate: body.swapForDate ? String(body.swapForDate) : null,
    paymentDate: body.paymentDate ? String(body.paymentDate) : null,
    atHome: body.atHome ? String(body.atHome) : null,
    status: body.status || 'confirmado',
    notes: body.notes ? String(body.notes).slice(0, 500) : null,
  };
}

function shiftResponse() {
  return { shifts: listShifts(), swaps: buildSwapPairs(listShifts()), conflicts: analyzeSchedule(listShifts()) };
}

function sanitizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Saúde e sessão                                                     */
/* ------------------------------------------------------------------ */

api.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    time: nowISO(),
    database: { collaborators: tableCount('collaborators'), shifts: tableCount('shifts'), offDays: tableCount('off_days'), users: tableCount('users') },
  });
});

api.get('/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

api.post('/auth/login', rateLimitLogin, (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) return badRequest(res, 'Informe e-mail e senha.');

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    req.registerFailedAttempt?.();
    return fail(res, 401, 'invalid_credentials', 'E-mail ou senha incorretos.');
  }
  if (user.status === 'pending') {
    req.registerFailedAttempt?.();
    return fail(
      res,
      403,
      'pending_approval',
      'Cadastro recebido! Sua conta aguarda aprovação do administrador. Você será liberado assim que for aprovado.',
    );
  }
  if (user.status === 'rejected') {
    req.registerFailedAttempt?.();
    return fail(res, 403, 'rejected', user.rejectionReason || 'Sua solicitação de cadastro não foi aprovada. Fale com o administrador.');
  }
  if (user.status === 'suspended') {
    req.registerFailedAttempt?.();
    return fail(res, 403, 'suspended', 'Conta suspensa. Fale com o administrador.');
  }

  req.clearFailedAttempts?.();
  const { token } = createSession(req, { userId: user.id, role: user.role, userAgent: req.get('user-agent') });
  setSessionCookie(req, res, token);
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(nowISO(), nowISO(), user.id);
  audit({ actorId: user.id, actorEmail: user.email, action: 'login', entity: 'user', entityId: user.id });
  res.json({ user: publicUser(getUserById(user.id)) });
});

api.post('/auth/signup', rateLimitLogin, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = sanitizeEmail(req.body?.email);
  const phone = String(req.body?.phone || '').trim();
  const specialty = String(req.body?.specialty || '').trim();
  const password = String(req.body?.password || '');

  const errors = [];
  if (name.length < 2) errors.push('Informe seu nome completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('Informe um e-mail válido.');
  if (password.length < 8) errors.push('A senha precisa ter no mínimo 8 caracteres.');
  if (phone && phone.replace(/\D/g, '').length < 10) errors.push('Telefone inválido.');
  if (errors.length) return badRequest(res, errors[0], errors);

  if (getUserByEmail(email)) {
    return fail(res, 409, 'email_taken', 'Este e-mail já possui cadastro. Use "Entrar" ou recupere o acesso com o administrador.');
  }

  const ts = nowISO();
  const result = db
    .prepare(
      `INSERT INTO users (name, email, phone, specialty, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'member', 'pending', ?, ?)`,
    )
    .run(name, email, phone || null, specialty || null, hashPassword(password), ts, ts);

  audit({
    actorId: null,
    actorEmail: email,
    action: 'signup_requested',
    entity: 'user',
    entityId: Number(result.lastInsertRowid),
    after: { name, email, phone, specialty, status: 'pending' },
  });

  res.status(201).json({
    status: 'pending',
    message:
      'Cadastro enviado! Sua solicitação ficou pendente de aprovação do administrador. Você receberá acesso após a aprovação.',
    request: { name, email, submittedAt: ts },
  });
});

api.post('/auth/guest', (req, res) => {
  const { token } = createSession(req, { role: 'guest', userAgent: req.get('user-agent') });
  setSessionCookie(req, res, token);
  audit({ action: 'guest_login', entity: 'session' });
  res.json({ user: publicUser({ id: null, name: 'Plantonista Convidado', role: 'guest', status: 'approved', isGuest: true }) });
});

api.post('/auth/logout', (req, res) => {
  if (req.user && !req.user.isGuest) {
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'logout', entity: 'user', entityId: req.user.id });
  }
  destroySession(req);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

api.post('/auth/change-password', requireEditor, (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (next.length < 8) return badRequest(res, 'A nova senha precisa ter no mínimo 8 caracteres.');
  const full = getUserByEmail(req.user.email);
  if (!full || !verifyPassword(current, full.passwordHash)) {
    return fail(res, 400, 'wrong_password', 'Senha atual incorreta.');
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(next), nowISO(), req.user.id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'change_password', entity: 'user', entityId: req.user.id });
  res.json({ ok: true, message: 'Senha alterada com sucesso.' });
});

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

api.get('/bootstrap', (req, res) => {
  if (!req.user) {
    return res.json({ user: null, publicSettings: { appName: getSetting('app_name', 'RG&SA PLANTÃO') }, serverTime: nowISO(), version: VERSION });
  }
  const shifts = listShifts();
  const offDays = listOffDays();
  const collaborators = listCollaborators();
  const today = new Date().toISOString().slice(0, 10);
  const activeShifts = shifts.filter((s) => !s.deletedAt && s.status !== 'cancelado');
  const upcomingShift = activeShifts.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const latestShift = activeShifts.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const defaultMonth = (upcomingShift || latestShift)?.date.slice(0, 7) || today.slice(0, 7);
  res.json({
    defaultMonth,
    user: publicUser(req.user),
    collaborators,
    shifts,
    offDays,
    swaps: buildSwapPairs(shifts),
    conflicts: analyzeSchedule(shifts),
    stats: monthStats({ shifts, offDays }),
    cycles: collaborators.map((c) => cycleInfo(shifts, c.name, today)),
    settings: settingsMap(),
    integrations: integrationSnapshot(),
    legacy: legacyInfo(),
    pendingApprovals: req.user.role === 'admin' ? listUsers({ status: 'pending' }).length : 0,
    permissions: {
      canEdit: Boolean(req.user && !req.user.isGuest && req.user.status === 'approved'),
      isAdmin: req.user?.role === 'admin',
      isGuest: Boolean(req.user?.isGuest),
    },
    options: { periods: PERIODS, offDayTypes: OFFDAY_TYPES },
    serverTime: nowISO(),
    version: VERSION,
  });
});

/* ------------------------------------------------------------------ */
/* Calendário e relatórios                                             */
/* ------------------------------------------------------------------ */

api.get('/calendar', requireApproved, (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!isMonth(month)) return badRequest(res, 'Mês inválido. Use o formato AAAA-MM.');
  const { start, end } = monthBounds(month);
  const shifts = listShifts({ start, end });
  const allShifts = listShifts();
  const offDays = listOffDays({ start, end });
  const collaborators = listCollaborators();
  res.json({
    month,
    label: monthLabel(month),
    start,
    end,
    weeks: buildMonthGrid(month, { shifts, offDays }),
    shifts,
    offDays,
    stats: monthStats({ shifts, offDays }),
    conflicts: analyzeSchedule(allShifts),
    swaps: buildSwapPairs(allShifts),
    collaborators,
  });
});

api.get('/reports/monthly', requireApproved, (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!isMonth(month)) return badRequest(res, 'Mês inválido.');
  const lang = req.query.lang === 'en' ? 'en' : 'pt';
  const { start, end } = monthBounds(month);
  const result = monthlyReportText(
    {
      month,
      shifts: listShifts({ start, end }),
      offDays: listOffDays({ start, end }),
      collaborators: listCollaborators(),
    },
    lang,
  );
  res.json({
    month,
    lang,
    label: result.monthName,
    text: result.text,
    report: result.report,
    supportEmail: getSetting('support_email'),
    supportPhone: getSetting('support_phone_display'),
  });
});

/* ------------------------------------------------------------------ */
/* Plantonistas                                                        */
/* ------------------------------------------------------------------ */

api.get('/collaborators', requireApproved, (req, res) => {
  res.json({ collaborators: listCollaborators({ includeDeleted: req.query.includeDeleted === '1' && req.user.role === 'admin' }) });
});

api.post('/collaborators', requireEditor, (req, res) => {
  const payload = {
    name: String(req.body?.name || '').trim(),
    colorHex: String(req.body?.colorHex || 'bg-teal-600'),
    avatarChar: String(req.body?.avatarChar || req.body?.name || '?').trim().slice(0, 2).toUpperCase(),
    phone: req.body?.phone ? String(req.body.phone) : null,
    specialty: req.body?.specialty ? String(req.body.specialty) : null,
  };
  const validation = validateCollaborator(payload, { collaborators: listCollaborators() });
  if (!validation.ok) return badRequest(res, validation.errors[0], validation.errors);
  const ts = nowISO();
  const result = db
    .prepare(
      `INSERT INTO collaborators (name, color_hex, avatar_char, phone, specialty, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(payload.name, payload.colorHex, payload.avatarChar, payload.phone, payload.specialty, ts, ts);
  const created = getCollaborator(Number(result.lastInsertRowid));
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'create', entity: 'collaborator', entityId: created.id, after: created });
  res.status(201).json({ collaborator: created, collaborators: listCollaborators() });
});

api.put('/collaborators/:id', requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const before = getCollaborator(id);
  if (!before || before.deletedAt) return fail(res, 404, 'not_found', 'Plantonista não encontrado.');
  const payload = {
    name: req.body?.name !== undefined ? String(req.body.name).trim() : before.name,
    colorHex: req.body?.colorHex ?? before.colorHex,
    avatarChar: req.body?.avatarChar ? String(req.body.avatarChar).slice(0, 2).toUpperCase() : before.avatarChar,
    phone: req.body?.phone ?? before.phone,
    specialty: req.body?.specialty ?? before.specialty,
    active: req.body?.active !== undefined ? (req.body.active ? 1 : 0) : before.active,
  };
  const validation = validateCollaborator(payload, { collaborators: listCollaborators(), ignoreId: id });
  if (!validation.ok) return badRequest(res, validation.errors[0], validation.errors);
  const ts = nowISO();
  db.prepare(
    `UPDATE collaborators SET name = ?, color_hex = ?, avatar_char = ?, phone = ?, specialty = ?, active = ?, updated_at = ? WHERE id = ?`,
  ).run(payload.name, payload.colorHex, payload.avatarChar, payload.phone, payload.specialty, payload.active, ts, id);
  if (payload.name !== before.name) {
    db.prepare('UPDATE shifts SET on_shift = ?, updated_at = ? WHERE collaborator_id = ?').run(payload.name, ts, id);
    db.prepare('UPDATE off_days SET name = ?, updated_at = ? WHERE collaborator_id = ?').run(payload.name, ts, id);
  }
  const after = getCollaborator(id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'update', entity: 'collaborator', entityId: id, before, after });
  res.json({ collaborator: after, collaborators: listCollaborators(), ...shiftResponse(), offDays: listOffDays() });
});

api.delete('/collaborators/:id', requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const before = getCollaborator(id);
  if (!before || before.deletedAt) return fail(res, 404, 'not_found', 'Plantonista não encontrado.');
  const ts = nowISO();
  db.prepare('UPDATE collaborators SET deleted_at = ?, active = 0, updated_at = ? WHERE id = ?').run(ts, ts, id);
  db.prepare('UPDATE users SET collaborator_id = NULL WHERE collaborator_id = ?').run(id);
  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'archive',
    entity: 'collaborator',
    entityId: id,
    before,
    after: { ...before, deletedAt: ts },
  });
  res.json({
    collaborators: listCollaborators(),
    ...shiftResponse(),
    message: `${before.name} foi arquivado. Os plantões históricos continuam salvos e vinculados ao nome.`,
  });
});

api.post('/collaborators/:id/restore', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const collaborator = getCollaborator(id);
  if (!collaborator) return fail(res, 404, 'not_found', 'Plantonista não encontrado.');
  db.prepare('UPDATE collaborators SET deleted_at = NULL, active = 1, updated_at = ? WHERE id = ?').run(nowISO(), id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'restore', entity: 'collaborator', entityId: id });
  res.json({ collaborators: listCollaborators({ includeDeleted: true }) });
});

/* ------------------------------------------------------------------ */
/* Plantões                                                            */
/* ------------------------------------------------------------------ */

api.get('/shifts', requireApproved, (req, res) => {
  const month = req.query.month ? String(req.query.month) : null;
  if (month && !isMonth(month)) return badRequest(res, 'Mês inválido.');
  const bounds = month ? monthBounds(month) : {};
  res.json({
    shifts: listShifts({ start: bounds.start, end: bounds.end, includeDeleted: req.query.includeDeleted === '1' && req.user.role === 'admin' }),
    swaps: buildSwapPairs(listShifts()),
    conflicts: analyzeSchedule(listShifts()),
  });
});

api.post('/shifts', requireEditor, (req, res) => {
  const payload = normalizeShiftPayload(req.body || {});
  const collaborator = resolveCollaborator(payload);
  if (collaborator) {
    payload.collaboratorId = collaborator.id;
    if (!payload.onShift) payload.onShift = collaborator.name;
  }
  const validation = validateShift(payload, { shifts: listShifts(), collaborators: listCollaborators() });
  const force = Boolean(req.body?.force) && req.user.role === 'admin';
  if (!validation.ok) return badRequest(res, validation.errors[0], validation.errors);
  if (validation.warnings.length && !force && req.body?.force !== false) {
    const onlyWarnings = validation.warnings.length > 0;
    if (onlyWarnings && req.body?.acknowledgeWarnings !== true) {
      return res.status(409).json({
        error: {
          code: 'rule_warnings',
          message: validation.warnings[0],
          warnings: validation.warnings,
          hint: 'Envie acknowledgeWarnings: true para registrar o plantão mesmo assim.',
        },
      });
    }
  }
  const ts = nowISO();
  const result = db
    .prepare(
      `INSERT INTO shifts (date, on_shift, collaborator_id, period, swap_for_date, payment_date, at_home, status, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      payload.date,
      payload.onShift,
      payload.collaboratorId ?? null,
      payload.period,
      payload.swapForDate,
      payload.paymentDate,
      payload.atHome,
      payload.status,
      payload.notes,
      req.user.id,
      ts,
      ts,
    );
  const created = getShift(Number(result.lastInsertRowid));
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'create', entity: 'shift', entityId: created.id, after: created });
  res.status(201).json({ shift: created, warnings: validation.warnings, ...shiftResponse(), offDays: listOffDays() });
});

api.put('/shifts/:id', requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const before = getShift(id);
  if (!before || before.deletedAt) return fail(res, 404, 'not_found', 'Plantão não encontrado.');
  const payload = normalizeShiftPayload({ ...before, ...req.body });
  const collaborator = resolveCollaborator(payload);
  if (collaborator) {
    payload.collaboratorId = collaborator.id;
    payload.onShift = collaborator.name;
  }
  const validation = validateShift(payload, {
    shifts: listShifts(),
    collaborators: listCollaborators(),
    ignoreId: id,
  });
  if (!validation.ok) return badRequest(res, validation.errors[0], validation.errors);
  if (validation.warnings.length && req.body?.acknowledgeWarnings !== true && !(req.body?.force && req.user.role === 'admin')) {
    return res.status(409).json({
      error: {
        code: 'rule_warnings',
        message: validation.warnings[0],
        warnings: validation.warnings,
        hint: 'Envie acknowledgeWarnings: true para salvar mesmo assim.',
      },
    });
  }
  const ts = nowISO();
  db.prepare(
    `UPDATE shifts SET date = ?, on_shift = ?, collaborator_id = ?, period = ?, swap_for_date = ?, payment_date = ?,
       at_home = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`,
  ).run(
    payload.date,
    payload.onShift,
    payload.collaboratorId ?? null,
    payload.period,
    payload.swapForDate,
    payload.paymentDate,
    payload.atHome,
    payload.status,
    payload.notes,
    ts,
    id,
  );
  const after = getShift(id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'update', entity: 'shift', entityId: id, before, after });
  res.json({ shift: after, warnings: validation.warnings, ...shiftResponse(), offDays: listOffDays() });
});

api.delete('/shifts/:id', requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const before = getShift(id);
  if (!before || before.deletedAt) return fail(res, 404, 'not_found', 'Plantão não encontrado.');
  const ts = nowISO();
  db.prepare('UPDATE shifts SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'soft_delete', entity: 'shift', entityId: id, before });
  res.json({
    ...shiftResponse(),
    offDays: listOffDays(),
    message: 'Plantão removido da escala. O registro fica no histórico e pode ser restaurado pelo administrador.',
  });
});

api.post('/shifts/:id/restore', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const shift = getShift(id);
  if (!shift) return fail(res, 404, 'not_found', 'Plantão não encontrado.');
  db.prepare('UPDATE shifts SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowISO(), id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'restore', entity: 'shift', entityId: id });
  res.json({ ...shiftResponse(), offDays: listOffDays() });
});

/* ------------------------------------------------------------------ */
/* Folgas                                                              */
/* ------------------------------------------------------------------ */

api.get('/off-days', requireApproved, (req, res) => {
  const month = req.query.month ? String(req.query.month) : null;
  if (month && !isMonth(month)) return badRequest(res, 'Mês inválido.');
  const bounds = month ? monthBounds(month) : {};
  res.json({ offDays: listOffDays({ start: bounds.start, end: bounds.end }) });
});

api.post('/off-days', requireEditor, (req, res) => {
  const payload = {
    date: req.body?.date,
    name: String(req.body?.name || '').trim(),
    type: req.body?.type,
    notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null,
  };
  const validation = validateOffDay(payload, { offDays: listOffDays() });
  if (!validation.ok) return badRequest(res, validation.errors[0], validation.errors);
  if (validation.warnings.length && req.body?.acknowledgeWarnings !== true) {
    return res.status(409).json({
      error: {
        code: 'rule_warnings',
        message: validation.warnings[0],
        warnings: validation.warnings,
        hint: 'Envie acknowledgeWarnings: true para registrar mesmo assim.',
      },
    });
  }
  const collaborator = findCollaboratorByName(payload.name);
  const ts = nowISO();
  const result = db
    .prepare(
      `INSERT INTO off_days (date, name, collaborator_id, type, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(payload.date, payload.name, collaborator?.id ?? null, payload.type, payload.notes, req.user.id, ts, ts);
  const created = getOffDay(Number(result.lastInsertRowid));
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'create', entity: 'off_day', entityId: created.id, after: created });
  res.status(201).json({ offDay: created, offDays: listOffDays(), warnings: validation.warnings });
});

api.put('/off-days/:id', requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const before = getOffDay(id);
  if (!before || before.deletedAt) return fail(res, 404, 'not_found', 'Folga não encontrada.');
  const payload = {
    date: req.body?.date ?? before.date,
    name: req.body?.name !== undefined ? String(req.body.name).trim() : before.name,
    type: req.body?.type ?? before.type,
    notes: req.body?.notes !== undefined ? String(req.body.notes || '').slice(0, 500) : before.notes,
  };
  const validation = validateOffDay(payload, { offDays: listOffDays(), ignoreId: id });
  if (!validation.ok) return badRequest(res, validation.errors[0], validation.errors);
  const collaborator = findCollaboratorByName(payload.name);
  db.prepare(
    'UPDATE off_days SET date = ?, name = ?, collaborator_id = ?, type = ?, notes = ?, updated_at = ? WHERE id = ?',
  ).run(payload.date, payload.name, collaborator?.id ?? null, payload.type, payload.notes, nowISO(), id);
  const after = getOffDay(id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'update', entity: 'off_day', entityId: id, before, after });
  res.json({ offDay: after, offDays: listOffDays(), warnings: validation.warnings });
});

api.delete('/off-days/:id', requireEditor, (req, res) => {
  const id = Number(req.params.id);
  const before = getOffDay(id);
  if (!before || before.deletedAt) return fail(res, 404, 'not_found', 'Folga não encontrada.');
  const ts = nowISO();
  db.prepare('UPDATE off_days SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'soft_delete', entity: 'off_day', entityId: id, before });
  res.json({ offDays: listOffDays(), message: 'Folga removida. O registro permanece no histórico.' });
});

api.post('/off-days/:id/restore', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const offDay = getOffDay(id);
  if (!offDay) return fail(res, 404, 'not_found', 'Folga não encontrada.');
  db.prepare('UPDATE off_days SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowISO(), id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'restore', entity: 'off_day', entityId: id });
  res.json({ offDays: listOffDays() });
});

/* ------------------------------------------------------------------ */
/* Administração / aprovação de cadastros                              */
/* ------------------------------------------------------------------ */

api.get('/admin/users', requireAdmin, (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const users = listUsers({ status });
  res.json({ users: users.map(publicUser) });
});

api.get('/admin/overview', requireAdmin, (req, res) => {
  const users = listUsers();
  res.json({
    counts: {
      pending: users.filter((u) => u.status === 'pending').length,
      approved: users.filter((u) => u.status === 'approved').length,
      rejected: users.filter((u) => u.status === 'rejected').length,
      suspended: users.filter((u) => u.status === 'suspended').length,
      admins: users.filter((u) => u.role === 'admin').length,
    },
    pending: users.filter((u) => u.status === 'pending').map(publicUser),
    recent: users.slice(0, 8).map(publicUser),
  });
});

api.post('/admin/users/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = getUserById(id);
  if (!target) return fail(res, 404, 'not_found', 'Usuário não encontrado.');
  const role = req.body?.role === 'admin' ? 'admin' : 'member';
  const collaboratorId = req.body?.collaboratorId ? Number(req.body.collaboratorId) : null;
  if (collaboratorId && !getCollaborator(collaboratorId)) return badRequest(res, 'Plantonista vinculado não existe.');
  const ts = nowISO();
  db.prepare(
    `UPDATE users SET status = 'approved', role = ?, rejection_reason = NULL, collaborator_id = ?, approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?`,
  ).run(role, collaboratorId, ts, req.user.id, ts, id);
  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'approve',
    entity: 'user',
    entityId: id,
    before: { status: target.status, role: target.role },
    after: { status: 'approved', role },
  });
  res.json({ user: publicUser(getUserById(id)), message: `${target.name} aprovado(a) como ${role === 'admin' ? 'administrador' : 'plantonista'}.` });
});

api.post('/admin/users/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = getUserById(id);
  if (!target) return fail(res, 404, 'not_found', 'Usuário não encontrado.');
  if (target.role === 'admin') return fail(res, 400, 'invalid_action', 'Não é possível rejeitar um administrador.');
  const reason = String(req.body?.reason || '').slice(0, 300) || 'Solicitação não aprovada pelo administrador.';
  const ts = nowISO();
  db.prepare(`UPDATE users SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?`).run(reason, ts, id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit({
    actorId: req.user.id,
    actorEmail: req.user.email,
    action: 'reject',
    entity: 'user',
    entityId: id,
    before: { status: target.status },
    after: { status: 'rejected', reason },
  });
  res.json({ user: publicUser(getUserById(id)), message: `Solicitação de ${target.name} recusada.` });
});

api.post('/admin/users/:id/role', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = getUserById(id);
  if (!target) return fail(res, 404, 'not_found', 'Usuário não encontrado.');
  const role = req.body?.role === 'admin' ? 'admin' : 'member';
  if (target.id === req.user.id && role !== 'admin') {
    return fail(res, 400, 'invalid_action', 'Você não pode remover o próprio acesso de administrador.');
  }
  const others = listUsers().filter((u) => u.role === 'admin' && u.id !== id);
  if (role === 'member' && others.length === 0) {
    return fail(res, 400, 'invalid_action', 'É necessário manter pelo menos um administrador ativo.');
  }
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowISO(), id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'set_role', entity: 'user', entityId: id, before: { role: target.role }, after: { role } });
  res.json({ user: publicUser(getUserById(id)), message: `${target.name} agora é ${role === 'admin' ? 'administrador' : 'plantonista'}.` });
});

api.post('/admin/users/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = getUserById(id);
  if (!target) return fail(res, 404, 'not_found', 'Usuário não encontrado.');
  const status = String(req.body?.status || '');
  if (!['approved', 'suspended', 'pending'].includes(status)) return badRequest(res, 'Status inválido.');
  if (target.id === req.user.id && status !== 'approved') {
    return fail(res, 400, 'invalid_action', 'Você não pode suspender a própria conta.');
  }
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowISO(), id);
  if (status !== 'approved') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'set_status', entity: 'user', entityId: id, after: { status } });
  res.json({ user: publicUser(getUserById(id)) });
});

api.post('/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = getUserById(id);
  if (!target) return fail(res, 404, 'not_found', 'Usuário não encontrado.');
  const password = String(req.body?.newPassword || '');
  if (password.length < 8) return badRequest(res, 'A nova senha precisa ter no mínimo 8 caracteres.');
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(password), nowISO(), id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'reset_password', entity: 'user', entityId: id });
  res.json({ ok: true, message: `Senha de ${target.name} redefinida. Sessões antigas foram encerradas.` });
});

api.get('/admin/audit', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 80, 300);
  res.json({
    audit: listAudit({ limit, entity: req.query.entity || null }).map((row) => ({
      ...row,
      before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
      after: row.afterJson ? JSON.parse(row.afterJson) : null,
    })),
  });
});

api.get('/admin/export', requireAdmin, (req, res) => {
  const payload = {
    exportedAt: nowISO(),
    version: VERSION,
    source: 'rgsa-plantao-web',
    legacy: legacyInfo(),
    collaborators: listCollaborators({ includeDeleted: true }),
    shifts: listShifts({ includeDeleted: true }),
    offDays: listOffDays({ includeDeleted: true }),
    users: listUsers().map((u) => ({ ...publicUser(u), status: u.status, role: u.role })),
    settings: settingsMap(),
  };
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'export', entity: 'database' });
  res.setHeader('Content-Disposition', `attachment; filename="rgsa-plantao-backup-${nowISO().slice(0, 10)}.json"`);
  res.json(payload);
});

api.post('/admin/backup', requireAdmin, (req, res) => {
  const file = backupDatabase('manual');
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'backup', entity: 'database', after: { file: path.basename(file) } });
  res.json({ ok: true, file: path.basename(file), directory: path.relative(ROOT, DATA_DIR), message: 'Backup do banco criado (mantemos os 10 mais recentes).' });
});

api.post('/admin/import', requireAdmin, (req, res) => {
  const body = req.body?.payload || req.body;
  if (!body || typeof body !== 'object') return badRequest(res, 'Envie um JSON de backup ou os dados legados.');
  const collabs = Array.isArray(body.collaborators) ? body.collaborators : [];
  const shifts = Array.isArray(body.shifts) ? body.shifts : [];
  const offDays = Array.isArray(body.offDays || body.off_days) ? body.offDays || body.off_days : [];
  if (!collabs.length && !shifts.length && !offDays.length) {
    return badRequest(res, 'O arquivo não contém collaborators, shifts ou offDays.');
  }

  const result = { inserted: { collaborators: 0, shifts: 0, offDays: 0 }, skipped: { collaborators: 0, shifts: 0, offDays: 0 }, issues: [] };
  const ts = nowISO();
  const collabIdByName = new Map(listCollaborators({ includeDeleted: true }).map((c) => [c.name.toLowerCase(), c.id]));

  for (const raw of collabs) {
    const name = String(raw.name || '').trim();
    if (!name) {
      result.skipped.collaborators += 1;
      result.issues.push('Plantonista sem nome ignorado.');
      continue;
    }
    if (collabIdByName.has(name.toLowerCase())) {
      result.skipped.collaborators += 1;
      continue;
    }
    const legacyId = raw.legacyId ?? raw.id ?? null;
    try {
      const info = db
        .prepare(
          `INSERT INTO collaborators (legacy_id, name, color_hex, avatar_char, phone, specialty, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          legacyId,
          name,
          raw.colorHex || raw.color || 'bg-teal-600',
          raw.avatarChar || name.slice(0, 1).toUpperCase(),
          raw.phone || null,
          raw.specialty || null,
          ts,
          ts,
        );
      collabIdByName.set(name.toLowerCase(), Number(info.lastInsertRowid));
      result.inserted.collaborators += 1;
    } catch (error) {
      result.skipped.collaborators += 1;
      result.issues.push(`Plantonista ${name}: ${error.message}`);
    }
  }

  for (const raw of shifts) {
    const date = raw.date;
    const onShift = String(raw.onShift || raw.name || '').trim();
    const period = raw.period || 'Diurno (12h)';
    if (!isISODate(date) || !onShift) {
      result.skipped.shifts += 1;
      result.issues.push(`Plantão ignorado (data/plantonista inválidos): ${JSON.stringify(raw)}`);
      continue;
    }
    const legacyId = raw.legacyId ?? raw.id ?? null;
    const exists = legacyId
      ? db.prepare('SELECT id FROM shifts WHERE legacy_id = ?').get(legacyId)
      : db.prepare('SELECT id FROM shifts WHERE date = ? AND on_shift = ? AND period = ? AND IFNULL(swap_for_date, "") = IFNULL(?, "")').get(date, onShift, period, raw.swapForDate || null);
    if (exists) {
      result.skipped.shifts += 1;
      continue;
    }
    try {
      db.prepare(
        `INSERT INTO shifts (legacy_id, date, on_shift, collaborator_id, period, swap_for_date, payment_date, at_home, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        legacyId,
        date,
        onShift,
        collabIdByName.get(onShift.toLowerCase()) ?? null,
        period,
        raw.swapForDate || null,
        raw.paymentDate || null,
        raw.atHome || null,
        raw.status || 'confirmado',
        raw.notes || null,
        ts,
        ts,
      );
      result.inserted.shifts += 1;
    } catch (error) {
      result.skipped.shifts += 1;
      result.issues.push(`Plantão ${date}: ${error.message}`);
    }
  }

  for (const raw of offDays) {
    const date = raw.date;
    const name = String(raw.name || '').trim();
    if (!isISODate(date) || !name) {
      result.skipped.offDays += 1;
      result.issues.push(`Folga ignorada: ${JSON.stringify(raw)}`);
      continue;
    }
    const legacyId = raw.legacyId ?? raw.id ?? null;
    const exists = legacyId
      ? db.prepare('SELECT id FROM off_days WHERE legacy_id = ?').get(legacyId)
      : db.prepare('SELECT id FROM off_days WHERE date = ? AND name = ?').get(date, name);
    if (exists) {
      result.skipped.offDays += 1;
      continue;
    }
    try {
      db.prepare(
        `INSERT INTO off_days (legacy_id, date, name, collaborator_id, type, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(legacyId, date, name, collabIdByName.get(name.toLowerCase()) ?? null, raw.type || 'mensal', raw.notes || null, ts, ts);
      result.inserted.offDays += 1;
    } catch (error) {
      result.skipped.offDays += 1;
      result.issues.push(`Folga ${date}: ${error.message}`);
    }
  }

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'import', entity: 'database', after: result });
  res.json({
    ...result,
    message: `Importação concluída: ${result.inserted.shifts} plantões, ${result.inserted.offDays} folgas e ${result.inserted.collaborators} plantonistas adicionados. Nada foi apagado.`,
    ...shiftResponse(),
    collaborators: listCollaborators(),
    offDays: listOffDays(),
  });
});

/* ------------------------------------------------------------------ */
/* Integrações                                                         */
/* ------------------------------------------------------------------ */

api.get('/integrations', requireApproved, (req, res) => {
  res.json({ integrations: integrationSnapshot(), legacy: legacyInfo() });
});

api.get('/integrations/weather', requireApproved, asyncHandler(async (req, res) => {
  const force = req.query.refresh === '1';
  const weather = await fetchRioWeather({ force });
  res.json(weather);
}));

api.post('/integrations/firebase/sync', requireAdmin, asyncHandler(async (req, res) => {
  const result = await firebaseSync({
    confirm: req.body?.confirm === true,
    payload: { collaborators: listCollaborators(), shifts: listShifts(), offDays: listOffDays() },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'integration_sync', entity: 'firebase', after: { status: result.status, dryRun: result.dryRun } });
  res.json(result);
}));

api.get('/notifications/payload', requireApproved, (req, res) => {
  const shifts = listShifts();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const next = shifts.find((s) => s.date >= todayISO);
  const todayShift = shifts.find((s) => s.date === todayISO);
  const title = todayShift ? 'Plantão hoje — RG&SA PLANTÃO' : 'RG&SA PLANTÃO — próximo plantão';
  const body = todayShift
    ? `${todayShift.onShift} está escalado hoje (${todayShift.date}) — ${todayShift.period}.`
    : next
      ? `Próximo plantão: ${next.onShift} em ${next.date} — ${next.period}.${next.swapForDate ? ` Troca em ${next.swapForDate}.` : ''}`
      : 'Nenhum plantão futuro cadastrado. Abra a escala para planejar o próximo ciclo.';
  res.json({
    title,
    body,
    tag: 'rgsa-plantao-alert',
    data: { url: '/?tab=escala' },
    createdAt: nowISO(),
  });
});

/* ------------------------------------------------------------------ */
/* Fallback e erros                                                    */
/* ------------------------------------------------------------------ */

api.use((req, res) => fail(res, 404, 'not_found', `Rota de API não encontrada: ${req.method} ${req.originalUrl}`));

app.use('/api', api);

app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(DIST, 'sw.js'));
});

app.use(
  express.static(DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('manifest.webmanifest') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.[0-9a-f]{8,}\.(js|css|woff2|png|svg)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res
      .status(503)
      .type('html')
      .send(
        '<h1>RG&SA PLANTÃO</h1><p>Front-end ainda não compilado. Rode <code>npm run build</code> e reinicie o servidor.</p>',
      );
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexPath);
});

app.use((err, req, res, _next) => {
  console.error('[erro]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: { code: 'internal_error', message: 'Erro interno no servidor. Nenhum dado foi alterado.' } });
});

app.listen(PORT, HOST, () => {
  console.log(`RG&SA PLANTÃO ${VERSION} — http://${HOST}:${PORT}`);
  console.log(`Banco: ${path.relative(ROOT, process.env.DB_PATH || path.join(DATA_DIR, 'plantao.db'))}`);
  console.log(`Front-end: ${fs.existsSync(DIST) ? 'client/dist' : 'não compilado (rode npm run build)'}`);
});

export { app };
