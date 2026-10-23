import { db, nowISO, getMeta, setMeta } from './db.js';
import { integrations as listIntegrations } from './repo.js';

/**
 * Integrações — preservadas do APK original, porém isoladas e sem tocar em
 * produção por padrão.
 *
 *  - Open-Meteo: mesma API de clima do app original (somente leitura).
 *  - Firebase Realtime Database: desligado por padrão. Quando habilitado,
 *    escreve apenas em um namespace de staging (nunca no nó raiz do app).
 *  - WhatsApp / PIX / e-mail: links e conteúdo preservados no cliente.
 */

const RIO = { latitude: -22.9068, longitude: -43.1729, timezone: 'America/Sao_Paulo' };

export function weatherDescription(code) {
  const c = Number(code);
  if (c === 0) return 'Céu Limpo';
  if (c === 1 || c === 2 || c === 3) return 'Parcialmente Nublado';
  if (c === 45 || c === 48) return 'Nevoeiro';
  if (c >= 51 && c <= 57) return 'Garoa Fina';
  if (c >= 61 && c <= 67) return 'Chuva';
  if (c >= 71 && c <= 77) return 'Neve';
  if (c >= 80 && c <= 82) return 'Pancadas de Chuva';
  if (c >= 95 && c <= 99) return 'Tempestade';
  return 'Clima Estável';
}

function setIntegrationStatus(name, { enabled, status, detail, payload }) {
  const existing = db.prepare('SELECT name FROM integration_state WHERE name = ?').get(name);
  if (!existing) {
    db.prepare('INSERT INTO integration_state (name, enabled, status, detail, payload) VALUES (?, ?, ?, ?, ?)').run(
      name,
      enabled ? 1 : 0,
      status,
      detail,
      payload ? JSON.stringify(payload) : null,
    );
    return;
  }
  db.prepare(
    `UPDATE integration_state SET enabled = ?, status = ?, detail = ?, payload = ?, last_sync_at = ? WHERE name = ?`,
  ).run(enabled ? 1 : 0, status, detail, payload ? JSON.stringify(payload) : null, nowISO(), name);
}

export async function fetchRioWeather({ force = false } = {}) {
  const row = db.prepare('SELECT payload, last_sync_at AS lastSyncAt FROM integration_state WHERE name = ?').get('open-meteo');
  const cached = row?.payload ? JSON.parse(row.payload) : null;
  const cacheAge = row?.lastSyncAt ? Date.now() - new Date(row.lastSyncAt).getTime() : Infinity;

  if (!force && cached && cacheAge < 10 * 60 * 1000) {
    return { ok: true, source: 'cache', data: cached, fetchedAt: row.lastSyncAt, warning: null };
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${RIO.latitude}&longitude=${RIO.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=${encodeURIComponent(RIO.timezone)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Open-Meteo respondeu ${response.status}`);
    const json = await response.json();
    const current = json.current || {};
    const data = {
      temperature: Number(current.temperature_2m ?? 0),
      windSpeed: Number(current.wind_speed_10m ?? 0),
      weatherCode: Number(current.weather_code ?? 0),
      description: weatherDescription(current.weather_code ?? 0),
      city: 'Rio de Janeiro',
      observedAt: current.time || nowISO(),
    };
    setIntegrationStatus('open-meteo', {
      enabled: true,
      status: 'online',
      detail: 'Clima do Rio atualizado via Open-Meteo (somente leitura).',
      payload: data,
    });
    return { ok: true, source: 'live', data, fetchedAt: nowISO(), warning: null };
  } catch (error) {
    if (cached) {
      setIntegrationStatus('open-meteo', {
        enabled: true,
        status: 'degraded',
        detail: `Open-Meteo indisponível (${error.message}). Exibindo última leitura em cache — nenhum dado de escala foi afetado.`,
        payload: cached,
      });
      return {
        ok: true,
        source: 'stale-cache',
        data: cached,
        fetchedAt: row.lastSyncAt,
        warning: 'Sem conexão com a Open-Meteo. Exibindo a última temperatura conhecida.',
      };
    }
    setIntegrationStatus('open-meteo', {
      enabled: true,
      status: 'offline',
      detail: `Open-Meteo indisponível (${error.message}).`,
      payload: null,
    });
    return { ok: false, source: 'none', data: null, fetchedAt: null, warning: 'Clima indisponível no momento. A escala continua funcionando normalmente.' };
  }
}

export function firebaseConfig() {
  return {
    configured: Boolean(process.env.FIREBASE_DB_URL),
    enabled: process.env.FIREBASE_SYNC_ENABLED === 'true',
    hasToken: Boolean(process.env.FIREBASE_DB_SECRET),
    targetPath: process.env.FIREBASE_SYNC_PATH || 'apps/rgsa-plantao/staging',
    databaseUrlMasked: process.env.FIREBASE_DB_URL
      ? String(process.env.FIREBASE_DB_URL).replace(/^https?:\/\//, '').replace(/\/.*$/, '/…')
      : null,
    safeguard:
      'Escritas nunca acontecem no nó de produção. Por padrão a sincronização é um ensaio (dry-run) e o alvo é o namespace de staging.',
  };
}

/**
 * Sincronização Firebase. Sem FIREBASE_SYNC_ENABLED=true é apenas dry-run:
 * mostra o que seria enviado e não faz requisição de escrita.
 */
export async function firebaseSync({ confirm = false, payload }) {
  const config = firebaseConfig();
  if (!config.configured) {
    return {
      ok: false,
      dryRun: true,
      status: 'disabled',
      message: 'Firebase não configurado neste ambiente. A escala permanece local e íntegra.',
      config,
    };
  }
  if (!config.enabled) {
    return {
      ok: true,
      dryRun: true,
      status: 'disabled',
      message: 'Ensaio (dry-run): FIREBASE_SYNC_ENABLED não está ativo, nada foi enviado ao Firebase.',
      wouldPush: { shifts: payload.shifts.length, offDays: payload.offDays.length, collaborators: payload.collaborators.length },
      config,
    };
  }
  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      status: 'confirmation-required',
      message: 'Confirmação explícita necessária para enviar dados ao Firebase.',
      config,
    };
  }

  const url = `${String(process.env.FIREBASE_DB_URL).replace(/\/$/, '')}/${config.targetPath}.json${
    config.hasToken ? `?auth=${encodeURIComponent(process.env.FIREBASE_DB_SECRET)}` : ''
  }`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ syncedAt: nowISO(), source: 'rgsa-plantao-web', ...payload }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
    setIntegrationStatus('firebase-rtdb', {
      enabled: true,
      status: 'online',
      detail: `Sincronizado no namespace ${config.targetPath}.`,
      payload: null,
    });
    return { ok: true, dryRun: false, status: 'synced', message: `Dados enviados para ${config.targetPath}.`, config };
  } catch (error) {
    setIntegrationStatus('firebase-rtdb', {
      enabled: true,
      status: 'error',
      detail: `Falha ao sincronizar (${error.message}). Nenhum dado local foi alterado.`,
      payload: null,
    });
    return {
      ok: false,
      dryRun: false,
      status: 'error',
      message: `Falha ao sincronizar: ${error.message}. Nenhum dado local foi alterado.`,
      config,
    };
  }
}

export function integrationSnapshot() {
  return listIntegrations().map((row) => {
    if (row.name === 'open-meteo') {
      const weather = row.payload;
      return { ...row, label: 'Clima (Open-Meteo)', detail: row.detail, sample: weather || null };
    }
    if (row.name === 'firebase-rtdb') {
      return { ...row, label: 'Firebase Realtime DB', config: firebaseConfig(), detail: firebaseConfig().safeguard };
    }
    if (row.name === 'whatsapp-support') return { ...row, label: 'Suporte WhatsApp' };
    if (row.name === 'pdf-report') return { ...row, label: 'Relatório PDF' };
    return row;
  });
}

export function legacyInfo() {
  return {
    source: getMeta('legacy_source', 'desconhecido'),
    importedAt: getMeta('legacy_imported_at', null),
    counts: JSON.parse(getMeta('legacy_counts', '{}')),
    note:
      'Dados migrados do APK original (Room/SQLite). Nenhum registro foi apagado; exclusões no novo app são lógicas e reversíveis.',
  };
}

export { setMeta };
