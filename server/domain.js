/**
 * Regras de negócio do calendário — módulo puro (sem banco), coberto por testes.
 *
 * Regras preservadas do APK original:
 *  - 12x36: 12 horas de trabalho e 36 horas de descanso ininterruptas (CLT).
 *  - Interjornada mínima de 11h (Art. 66 CLT).
 *  - Um plantão por plantonista por dia.
 *  - Troca é identificada por `swapForDate` (data de compensação) e `atHome`.
 *  - `-x-` significa "ocupado" (não está em casa); um nome significa "em casa".
 *
 * Regra nova e crítica:
 *  - `date` (data do turno), `swapForDate` (data de troca) e `paymentDate`
 *    (data de pagamento) são campos INDEPENDENTES. Nenhum é derivado do outro.
 */

export const PERIODS = ['Diurno (12h)', 'Noturno (12h)'];
export const OFFDAY_TYPES = ['mensal', 'compensatoria'];
export const STATUSES = ['confirmado', 'pendente', 'cancelado'];
export const HOME_OCCUPIED = '-x-';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toUTC(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function monthOf(isoDate) {
  return isoDate.slice(0, 7);
}

export function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthBounds(month) {
  if (!isMonth(month)) throw new Error('Mês inválido (use YYYY-MM)');
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, days: lastDay, year: y, month: m };
}

/** Matriz de 6 semanas (domingo → sábado), sempre 42 células, sem corte de dias. */
export function buildMonthGrid(month, events = {}) {
  const { year, month: m } = monthBounds(month);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const offset = first.getUTCDay();
  const gridStart = new Date(Date.UTC(year, m - 1, 1 - offset));
  const shiftsByDate = groupByDate(events.shifts || []);
  const offDaysByDate = groupByDate(events.offDays || []);
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const current = new Date(gridStart.getTime() + (w * 7 + d) * 86400000);
      const iso = current.toISOString().slice(0, 10);
      week.push({
        date: iso,
        day: current.getUTCDate(),
        inMonth: current.getUTCMonth() === m - 1,
        isToday: iso === todayISO,
        weekend: current.getUTCDay() === 0 || current.getUTCDay() === 6,
        shifts: shiftsByDate.get(iso) || [],
        offDays: offDaysByDate.get(iso) || [],
      });
    }
    weeks.push(week);
  }
  return weeks;
}

function groupByDate(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.date)) map.set(row.date, []);
    map.get(row.date).push(row);
  }
  return map;
}

/**
 * Valida um plantão. `errors` bloqueiam, `warnings` são alertas de regra de
 * negócio que o administrador pode aceitar (ex.: escala especial).
 */
export function validateShift(input, context = {}) {
  const errors = [];
  const warnings = [];
  const shifts = (context.shifts || []).filter(
    (s) => !s.deletedAt && s.status !== 'cancelado' && s.id !== context.ignoreId,
  );
  const collaborators = context.collaborators || [];

  if (!isISODate(input.date)) errors.push('Informe uma data de turno válida (AAAA-MM-DD).');
  if (!input.onShift || String(input.onShift).trim().length < 2) {
    errors.push('Selecione o plantonista escalado.');
  }
  if (!PERIODS.includes(input.period)) {
    errors.push(`Período inválido. Use: ${PERIODS.join(' ou ')}.`);
  }
  if (input.status && !STATUSES.includes(input.status)) {
    errors.push('Situação inválida.');
  }

  if (input.swapForDate != null && input.swapForDate !== '') {
    if (!isISODate(input.swapForDate)) errors.push('Data de troca inválida.');
    else if (input.swapForDate === input.date) errors.push('A data de troca não pode ser igual à data do turno.');
  }

  if (input.paymentDate != null && input.paymentDate !== '') {
    if (!isISODate(input.paymentDate)) errors.push('Data de pagamento inválida.');
    else if (isISODate(input.date) && diffDays(input.date, input.paymentDate) < 0) {
      warnings.push('A data de pagamento é anterior à data do turno — confirme se é intencional. Pagamento e troca são campos independentes.');
    }
  }

  if (input.atHome != null && input.atHome !== '') {
    const names = collaborators.map((c) => c.name);
    if (input.atHome !== HOME_OCCUPIED && input.atHome !== '-' && !names.includes(input.atHome)) {
      warnings.push(`"${input.atHome}" não está na equipe cadastrada (campo "fica em casa").`);
    }
  }

  if (errors.length === 0) {
    const duplicates = shifts.filter((s) => s.date === input.date && s.onShift === input.onShift);
    if (duplicates.length > 0) {
      errors.push(`${input.onShift} já possui plantão em ${input.date}.`);
    }

    const samePerson = shifts
      .filter((s) => s.onShift === input.onShift)
      .map((s) => s.date)
      .concat([input.date])
      .sort();

    const idx = samePerson.indexOf(input.date);
    const prev = samePerson[idx - 1];
    const next = samePerson[idx + 1];
    if (prev && diffDays(prev, input.date) < 2) {
      warnings.push(
        `Intervalo de ${diffDays(prev, input.date) * 24}h em relação ao plantão de ${prev}: abaixo do descanso de 36h da escala 12x36.`,
      );
    }
    if (next && diffDays(input.date, next) < 2) {
      warnings.push(
        `Intervalo de ${diffDays(input.date, next) * 24}h até o plantão de ${next}: abaixo do descanso de 36h da escala 12x36.`,
      );
    }
    if (prev && diffDays(prev, input.date) === 1 && input.period === 'Diurno (12h)') {
      warnings.push('Plantão diurno no dia seguinte a um plantão de 12h: confira a interjornada mínima de 11h (Art. 66 CLT).');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateOffDay(input, context = {}) {
  const errors = [];
  const warnings = [];
  if (!isISODate(input.date)) errors.push('Informe uma data de folga válida.');
  if (!input.name || String(input.name).trim().length < 2) errors.push('Selecione o plantonista.');
  if (!OFFDAY_TYPES.includes(input.type)) errors.push('Tipo de folga inválido (mensal ou compensatoria).');

  const offDays = (context.offDays || []).filter((o) => !o.deletedAt && o.id !== context.ignoreId);
  if (errors.length === 0 && offDays.some((o) => o.date === input.date && o.name === input.name)) {
    errors.push(`${input.name} já possui folga em ${input.date}.`);
  }
  if (input.type === 'mensal' && errors.length === 0 && isISODate(input.date)) {
    const sameMonth = offDays.filter(
      (o) => o.name === input.name && o.type === 'mensal' && monthOf(o.date) === monthOf(input.date),
    );
    if (sameMonth.length > 0) {
      warnings.push(`${input.name} já tem folga mensal em ${monthOf(input.date)} (${sameMonth[0].date}).`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function validateCollaborator(input, context = {}) {
  const errors = [];
  if (!input.name || String(input.name).trim().length < 2) errors.push('Informe o nome do plantonista.');
  const others = (context.collaborators || []).filter((c) => !c.deletedAt && c.id !== context.ignoreId);
  if (errors.length === 0 && others.some((c) => c.name.toLowerCase() === String(input.name).trim().toLowerCase())) {
    errors.push('Já existe um plantonista com esse nome na equipe.');
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

/** Pares de troca: A cede 03/06 para B e B cede 04/06 para A. */
export function buildSwapPairs(shifts) {
  const active = shifts.filter((s) => !s.deletedAt && s.status !== 'cancelado');
  const byDate = new Map(active.map((s) => [s.date, s]));
  return active
    .filter((s) => s.swapForDate)
    .map((s) => {
      const counterpart = byDate.get(s.swapForDate);
      const reciprocal = Boolean(counterpart && counterpart.swapForDate === s.date);
      return {
        id: `swap-${s.id}`,
        shiftId: s.id,
        date: s.date,
        onShift: s.onShift,
        swapForDate: s.swapForDate,
        counterpartId: counterpart?.id ?? null,
        counterpartName: counterpart?.onShift ?? null,
        reciprocal,
        status: reciprocal ? 'confirmada' : 'pendente',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Detecta conflitos em toda a escala (usado no painel de conformidade e no
 * calendário). Não altera dados: só sinaliza.
 */
export function analyzeSchedule(shifts) {
  const active = shifts.filter((s) => !s.deletedAt && s.status !== 'cancelado');
  const byPerson = new Map();
  for (const s of active) {
    if (!byPerson.has(s.onShift)) byPerson.set(s.onShift, []);
    byPerson.get(s.onShift).push(s);
  }
  const conflicts = [];
  for (const [name, list] of byPerson) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = diffDays(sorted[i - 1].date, sorted[i].date);
      if (gap === 0) {
        conflicts.push({
          type: 'duplicado',
          severity: 'error',
          name,
          dates: [sorted[i - 1].date, sorted[i].date],
          message: `${name} tem dois plantões no mesmo dia (${sorted[i].date}).`,
        });
      } else if (gap === 1) {
        conflicts.push({
          type: '12x36',
          severity: 'warning',
          name,
          dates: [sorted[i - 1].date, sorted[i].date],
          message: `${name} tem plantões em dias consecutivos (${sorted[i - 1].date} → ${sorted[i].date}): descanso abaixo das 36h da escala 12x36 e risco de ferir a interjornada de 11h.`,
        });
      }
    }
  }
  const swaps = buildSwapPairs(active);
  for (const swap of swaps) {
    if (!swap.counterpartId) {
      conflicts.push({
        type: 'troca-sem-par',
        severity: 'warning',
        name: swap.onShift,
        dates: [swap.date],
        message: `Troca de ${swap.onShift} em ${swap.date} para ${swap.swapForDate} ainda não tem plantão correspondente.`,
      });
    }
  }
  return conflicts;
}

export function monthStats({ shifts, offDays }) {
  const active = shifts.filter((s) => !s.deletedAt && s.status !== 'cancelado');
  const perPerson = new Map();
  for (const s of active) perPerson.set(s.onShift, (perPerson.get(s.onShift) || 0) + 1);
  let leader = null;
  for (const [name, count] of perPerson) {
    if (!leader || count > leader.count) leader = { name, count };
  }
  return {
    shifts: active.length,
    swaps: active.filter((s) => s.swapForDate).length,
    offDays: offDays.filter((o) => !o.deletedAt).length,
    pendingPayments: active.filter((s) => !s.paymentDate).length,
    leader,
    perPerson: Object.fromEntries(perPerson),
  };
}

/** Ciclo individual 12x36: próximo plantão, último plantão e descanso. */
export function cycleInfo(shifts, person, todayISO) {
  const list = shifts
    .filter((s) => !s.deletedAt && s.status !== 'cancelado' && s.onShift === person)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = list.filter((s) => s.date >= todayISO);
  const past = list.filter((s) => s.date < todayISO);
  const next = upcoming[0] || null;
  const last = past[past.length - 1] || null;
  return {
    person,
    next,
    last,
    daysUntilNext: next ? diffDays(todayISO, next.date) : null,
    restDays: last ? diffDays(last.date, todayISO) : null,
    total: list.length,
  };
}

export function normalizeMonthlyReport({ month, shifts, offDays, collaborators }) {
  const { start, end } = monthBounds(month);
  const rows = shifts
    .filter((s) => !s.deletedAt && s.date >= start && s.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      date: s.date,
      onShift: s.onShift,
      period: s.period,
      swapForDate: s.swapForDate || null,
      paymentDate: s.paymentDate || null,
      atHome: s.atHome || null,
      status: s.status,
      notes: s.notes || null,
      collaboratorColor: collaborators.find((c) => c.name === s.onShift)?.colorHex || 'bg-teal-600',
    }));
  const leaves = offDays
    .filter((o) => !o.deletedAt && o.date >= start && o.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => ({ date: o.date, name: o.name, type: o.type, notes: o.notes || null }));
  return { month, ...monthBounds(month), shifts: rows, offDays: leaves, stats: monthStats({ shifts: rows, offDays: leaves }) };
}
