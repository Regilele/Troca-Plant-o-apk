import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/** Hash de senha com scrypt (sem dependências nativas). Formato: scrypt$N$r$p$salt$hash */
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('A senha precisa ter no mínimo 8 caracteres.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex');
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = scryptSync(String(password), salt, KEY_LEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function randomId() {
  return randomBytes(12).toString('hex');
}
