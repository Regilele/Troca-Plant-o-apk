import { db, nowISO } from './db.js';
import { newSessionToken, sha256 } from './security.js';
import { getUserById } from './repo.js';

export const COOKIE_NAME = 'rgsa_session';
const SESSION_DAYS = 14;

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookieOptions(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 };
}

export function setSessionCookie(req, res, token) {
  const opts = cookieOptions(req);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${opts.path}`,
    `Max-Age=${Math.floor(opts.maxAge / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (opts.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req, res) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  );
}

export function createSession(req, { userId = null, role = 'guest', userAgent = '' }) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, role, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(sha256(token), userId, role, nowISO(), expires, String(userAgent).slice(0, 200));
  return { token, expires };
}

export function destroySession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function readSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const row = db
    .prepare('SELECT id, user_id AS userId, role, expires_at AS expiresAt FROM sessions WHERE token_hash = ?')
    .get(sha256(token));
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  if (!row.userId) {
    return {
      sessionId: row.id,
      user: { id: null, name: 'Plantonista Convidado', email: null, role: 'guest', status: 'approved', isGuest: true },
    };
  }
  const user = getUserById(row.userId);
  if (!user) return null;
  return { sessionId: row.id, user: { ...user, isGuest: false } };
}

/** Anexa `req.user` quando existe sessão válida — inclusive convidados. */
export function attachUser(req, _res, next) {
  const session = readSession(req);
  if (session) {
    req.user = session.user;
    req.sessionId = session.sessionId;
  }
  next();
}

export function requireApproved(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'Faça login para continuar.' } });
  }
  if (req.user.status !== 'approved') {
    return res.status(403).json({
      error: {
        code: 'not_approved',
        message: 'Sua conta ainda não foi aprovada pelo administrador.',
        status: req.user.status,
      },
    });
  }
  next();
}

export function requireEditor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'Faça login para continuar.' } });
  }
  if (req.user.isGuest) {
    return res.status(403).json({
      error: { code: 'guest_readonly', message: 'Acesso de convidado é somente leitura. Entre com uma conta aprovada para editar.' },
    });
  }
  if (req.user.status !== 'approved') {
    return res.status(403).json({ error: { code: 'not_approved', message: 'Conta aguardando aprovação do administrador.' } });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'Faça login para continuar.' } });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: { code: 'forbidden', message: 'Ação exclusiva do administrador.' } });
  }
  next();
}

const attempts = new Map();

export function rateLimitLogin(req, res, next) {
  const key = `${req.ip}:${String(req.body?.email || '').toLowerCase()}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (entry.length >= 8) {
    return res.status(429).json({
      error: { code: 'rate_limited', message: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
    });
  }
  attempts.set(key, entry);
  req.registerFailedAttempt = () => {
    const list = attempts.get(key) || [];
    list.push(Date.now());
    attempts.set(key, list);
  };
  req.clearFailedAttempts = () => attempts.delete(key);
  next();
}
