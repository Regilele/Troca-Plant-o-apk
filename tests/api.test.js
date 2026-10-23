/**
 * Testes de integração da API.
 * Roda contra um servidor isolado com banco temporário — nunca toca em data/plantao.db.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;
const HEADERS = { 'content-type': 'application/json', 'x-requested-with': 'rgsa-plantao' };
let server;
let tmpDir;
let adminCookie = '';
let memberCookie = '';

async function call(method, path, { body, cookie, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...HEADERS, ...(cookie ? { cookie } : {}), ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, cookies: res.headers.getSetCookie?.() || [] };
}

async function login(email, password) {
  const res = await call('POST', '/api/auth/login', { body: { email, password } });
  const cookie = (res.cookies[0] || '').split(';')[0];
  return { ...res, cookie };
}

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rgsa-test-'));
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DB_PATH: join(tmpDir, 'test.db'),
      DATA_DIR: tmpDir,
      SEED_PATH: new URL('../data/legacy-seed.json', import.meta.url).pathname,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('servidor de teste não subiu');
});

after(() => {
  server?.kill('SIGTERM');
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

test('health responde com versão e contadores', async () => {
  const { status, data } = await call('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.ok(data.version);
  assert.equal(typeof data.database.shifts, 'number');
});

test('escrita sem cabeçalho de app é recusada (CSRF)', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@rgsa.plantao', password: 'Plantao@2026' }),
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'csrf');
});

test('bootstrap anônimo não vaza dados', async () => {
  const { status, data } = await call('GET', '/api/bootstrap');
  assert.equal(status, 200);
  assert.equal(data.user, null);
  assert.equal(data.shifts, undefined, 'nenhuma escala para visitante');
  assert.equal(data.collaborators, undefined, 'nenhum plantonista para visitante');
  assert.ok(data.publicSettings.appName);
});

test('login inválido devolve 401 sem revelar se o e-mail existe', async () => {
  const wrongPass = await login('admin@rgsa.plantao', 'errada');
  assert.equal(wrongPass.status, 401);
  assert.equal(wrongPass.data.error.code, 'invalid_credentials');
  const unknown = await login('ninguem@exemplo.com', 'Plantao@2026');
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error.code, 'invalid_credentials');
});

test('admin entra e recebe os dados migrados do APK', async () => {
  const res = await login('admin@rgsa.plantao', 'Plantao@2026');
  assert.equal(res.status, 200);
  assert.equal(res.data.user.role, 'admin');
  adminCookie = res.cookie;
  assert.ok(adminCookie.startsWith('rgsa_session='));

  const boot = await call('GET', '/api/bootstrap', { cookie: adminCookie });
  assert.equal(boot.status, 200);
  assert.equal(boot.data.collaborators.length, 4);
  assert.equal(boot.data.shifts.length, 6);
  assert.equal(boot.data.offDays.length, 2);
  assert.equal(boot.data.defaultMonth, '2026-06');
  const swap = boot.data.shifts.find((s) => s.date === '2026-06-03');
  assert.equal(swap.swapForDate, '2026-06-04');
  assert.equal(swap.paymentDate, null);
  assert.equal(swap.atHome, '-x-');
});

test('plantonista acessa a escala mas não administra', async () => {
  const res = await login('juliana@rgsa.plantao', 'Plantao@2026');
  assert.equal(res.status, 200);
  memberCookie = res.cookie;
  const denied = await call('GET', '/api/admin/users', { cookie: memberCookie });
  assert.equal(denied.status, 403);
});

test('convidado só lê', async () => {
  const guest = await call('POST', '/api/auth/guest');
  assert.equal(guest.status, 200);
  const cookie = (guest.cookies[0] || '').split(';')[0];
  const write = await call('POST', '/api/shifts', {
    cookie,
    body: { date: '2026-07-01', onShift: 'Agenor', period: 'Diurno (12h)' },
  });
  assert.equal(write.status, 403);
  assert.equal(write.data.error.code, 'guest_readonly');
});

test('cadastro novo nasce pendente e não entra na escala antes da aprovação', async () => {
  const res = await call('POST', '/api/auth/signup', {
    body: {
      name: 'Teste Visual',
      email: 'teste.visual@exemplo.com',
      password: 'Plantao@2026',
      phone: '21999990000',
      specialty: 'Técnico de Enfermagem',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.status, 'pending');
  assert.ok(!res.cookies.length, 'não deve abrir sessão para pendente');

  const loginAttempt = await login('teste.visual@exemplo.com', 'Plantao@2026');
  assert.equal(loginAttempt.status, 403);
  assert.equal(loginAttempt.data.error.code, 'pending_approval');

  const boot = await call('GET', '/api/bootstrap', { cookie: adminCookie });
  const list = await call('GET', '/api/admin/users', { cookie: adminCookie });
  const pendente = list.data.users.find((u) => u.email === 'teste.visual@exemplo.com');
  assert.equal(pendente.status, 'pending');
  assert.ok(boot.data.pendingApprovals >= 1);
});

test('e-mail duplicado no cadastro é recusado', async () => {
  const res = await call('POST', '/api/auth/signup', {
    body: { name: 'Repetido', email: 'teste.visual@exemplo.com', password: 'Plantao@2026' },
  });
  assert.equal(res.status, 409);
  assert.equal(res.data.error.code, 'email_taken');
});

test('senha fraca é recusada no cadastro', async () => {
  const res = await call('POST', '/api/auth/signup', {
    body: { name: 'Senha Curta', email: 'curta@exemplo.com', password: '123' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.error.code, 'invalid_input');
});

test('admin aprova o cadastro e o novo usuário entra', async () => {
  const list = await call('GET', '/api/admin/users', { cookie: adminCookie });
  const target = list.data.users.find((u) => u.email === 'teste.visual@exemplo.com');
  const res = await call('POST', `/api/admin/users/${target.id}/approve`, {
    cookie: adminCookie,
    body: { role: 'member', collaboratorId: null },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.status, 'approved');

  const loginAttempt = await login('teste.visual@exemplo.com', 'Plantao@2026');
  assert.equal(loginAttempt.status, 200);
  assert.equal(loginAttempt.data.user.role, 'member');
});

test('recusa guarda motivo e mantém histórico (sem apagar conta)', async () => {
  await call('POST', '/api/auth/signup', {
    body: { name: 'Recusado', email: 'recusado@exemplo.com', password: 'Plantao@2026' },
  });
  const list = await call('GET', '/api/admin/users', { cookie: adminCookie });
  const target = list.data.users.find((u) => u.email === 'recusado@exemplo.com');
  const res = await call('POST', `/api/admin/users/${target.id}/reject`, {
    cookie: adminCookie,
    body: { reason: 'Fora da equipe do plantão' },
  });
  assert.equal(res.status, 200);
  const after = await call('GET', '/api/admin/users', { cookie: adminCookie });
  const kept = after.data.users.find((u) => u.email === 'recusado@exemplo.com');
  assert.equal(kept.status, 'rejected');
  assert.equal(kept.rejectionReason, 'Fora da equipe do plantão');
});

test('não é possível remover o último administrador', async () => {
  const list = await call('GET', '/api/admin/users', { cookie: adminCookie });
  const admin = list.data.users.find((u) => u.role === 'admin');
  const res = await call('POST', `/api/admin/users/${admin.id}/role`, {
    cookie: adminCookie,
    body: { role: 'member' },
  });
  assert.equal(res.status, 400);
});

test('plantão criado guarda troca e pagamento separados', async () => {
  const res = await call('POST', '/api/shifts', {
    cookie: adminCookie,
    body: {
      date: '2026-07-10',
      onShift: 'Agenor',
      period: 'Diurno (12h)',
      swapForDate: '2026-07-11',
      paymentDate: '2026-07-20',
      notes: 'teste',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.shift.swapForDate, '2026-07-11');
  assert.equal(res.data.shift.paymentDate, '2026-07-20');

  const patched = await call('PUT', `/api/shifts/${res.data.shift.id}`, {
    cookie: adminCookie,
    body: { paymentDate: '2026-08-05' },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.shift.paymentDate, '2026-08-05');
  assert.equal(patched.data.shift.swapForDate, '2026-07-11', 'troca não pode ser tocada');
});

test('plantão duplicado é bloqueado com 400', async () => {
  const first = await call('POST', '/api/shifts', {
    cookie: adminCookie,
    body: { date: '2026-08-01', onShift: 'Marcos', period: 'Diurno (12h)' },
  });
  assert.equal(first.status, 201);

  const conflict = await call('POST', '/api/shifts', {
    cookie: adminCookie,
    body: { date: '2026-08-01', onShift: 'Marcos', period: 'Noturno (12h)' },
  });
  assert.equal(conflict.status, 400);
  assert.equal(conflict.data.error.code, 'invalid_input');
  assert.match(conflict.data.error.message, /já possui plantão/);
});

test('data de pagamento anterior ao turno pede confirmação, sem bloquear', async () => {
  const res = await call('POST', '/api/shifts', {
    cookie: adminCookie,
    body: { date: '2026-09-20', onShift: 'Juliana', period: 'Diurno (12h)', paymentDate: '2026-09-01' },
  });
  assert.equal(res.status, 409);
  assert.equal(res.data.error.code, 'rule_warnings');
  assert.ok(res.data.error.warnings.length > 0);

  const confirmed = await call('POST', '/api/shifts', {
    cookie: adminCookie,
    body: { date: '2026-09-20', onShift: 'Juliana', period: 'Diurno (12h)', paymentDate: '2026-09-01', acknowledgeWarnings: true },
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.shift.paymentDate, '2026-09-01');
});

test('exclusão é reversível e mantém o registro', async () => {
  const created = await call('POST', '/api/shifts', {
    cookie: adminCookie,
    body: { date: '2026-10-05', onShift: 'Juliana', period: 'Diurno (12h)' },
  });
  const id = created.data.shift.id;
  const del = await call('DELETE', `/api/shifts/${id}`, { cookie: adminCookie });
  assert.equal(del.status, 200);

  const boot = await call('GET', '/api/bootstrap', { cookie: adminCookie });
  assert.ok(!boot.data.shifts.some((s) => s.id === id), 'sai da escala');

  const audit = await call('GET', '/api/admin/audit', { cookie: adminCookie });
  assert.ok(audit.data.audit.some((e) => e.entity === 'shift' && e.entityId === id));
});

test('relatório mensal traz totais e folgas do mês', async () => {
  const res = await call('GET', '/api/reports/monthly?month=2026-06', { cookie: adminCookie });
  assert.equal(res.status, 200);
  assert.equal(res.data.month, '2026-06');
  assert.equal(res.data.report.stats.shifts, 6);
  assert.equal(res.data.report.stats.offDays, 2);
  assert.equal(res.data.report.stats.swaps, 6);
  assert.match(res.data.text, /RG&SA/i);
});

test('exportação completa contém todas as tabelas', async () => {
  const res = await call('GET', '/api/admin/export', { cookie: adminCookie });
  assert.equal(res.status, 200);
  for (const key of ['collaborators', 'shifts', 'offDays', 'users']) {
    assert.ok(Array.isArray(res.data[key]), `${key} presente`);
  }
  assert.ok(res.data.exportedAt);
});

test('importação valida o formato antes de tocar no banco', async () => {
  const bad = await call('POST', '/api/admin/import', { cookie: adminCookie, body: { foo: 'bar' } });
  assert.equal(bad.status, 400);
});

test('sessão funciona por token, sem cookie (prévia em iframe)', async () => {
  const res = await login('admin@rgsa.plantao', 'Plantao@2026');
  assert.equal(res.status, 200);
  assert.ok(res.data.sessionToken, 'login devolve sessionToken');

  // sem cookie algum: só o cabeçalho Authorization
  const boot = await call('GET', '/api/bootstrap', {
    headers: { authorization: `Bearer ${res.data.sessionToken}` },
  });
  assert.equal(boot.status, 200);
  assert.equal(boot.data.user.email, 'admin@rgsa.plantao');
  assert.equal(boot.data.shifts.length >= 6, true);

  // token inválido continua sendo recusado
  const bogus = await call('GET', '/api/bootstrap', { headers: { authorization: 'Bearer nao-existe' } });
  assert.equal(bogus.data.user, null);

  const out = await call('POST', '/api/auth/logout', {
    headers: { authorization: `Bearer ${res.data.sessionToken}` },
  });
  assert.equal(out.status, 200);
  const after = await call('GET', '/api/bootstrap', {
    headers: { authorization: `Bearer ${res.data.sessionToken}` },
  });
  assert.equal(after.data.user, null, 'logout revoga o token');
});

test('convidado também recebe token utilizável', async () => {
  const guest = await call('POST', '/api/auth/guest');
  assert.ok(guest.data.sessionToken);
  const boot = await call('GET', '/api/bootstrap', {
    headers: { authorization: `Bearer ${guest.data.sessionToken}` },
  });
  assert.equal(boot.data.user.isGuest, true);
  assert.equal(boot.data.permissions.canEdit, false);
});

test('logout invalida a sessão', async () => {
  const res = await call('POST', '/api/auth/logout', { cookie: memberCookie });
  assert.equal(res.status, 200);
  const after = await call('GET', '/api/auth/me', { cookie: memberCookie });
  assert.equal(after.data.user, null);
});
