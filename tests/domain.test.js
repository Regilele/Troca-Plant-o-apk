import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSchedule,
  buildMonthGrid,
  buildSwapPairs,
  cycleInfo,
  diffDays,
  isISODate,
  monthBounds,
  monthStats,
  validateCollaborator,
  validateOffDay,
  validateShift,
} from '../server/domain.js';

const collaborators = [
  { id: 1, name: 'Reginaldo', colorHex: 'bg-indigo-600' },
  { id: 2, name: 'Agenor', colorHex: 'bg-emerald-600' },
];

// dados exatos migrados do APK
const legacyShifts = [
  { id: 1, date: '2026-06-03', onShift: 'Agenor', swapForDate: '2026-06-04', paymentDate: null, atHome: '-x-' },
  { id: 2, date: '2026-06-07', onShift: 'Agenor', swapForDate: '2026-06-14', paymentDate: null, atHome: 'Agenor' },
  { id: 3, date: '2026-06-21', onShift: 'Agenor', swapForDate: '2026-06-28', paymentDate: null, atHome: 'Agenor' },
  { id: 4, date: '2026-06-04', onShift: 'Reginaldo', swapForDate: '2026-06-03', paymentDate: null, atHome: '-x-' },
  { id: 5, date: '2026-06-14', onShift: 'Reginaldo', swapForDate: '2026-06-07', paymentDate: null, atHome: 'Reginaldo' },
  { id: 6, date: '2026-06-28', onShift: 'Reginaldo', swapForDate: '2026-06-21', paymentDate: null, atHome: 'Reginaldo' },
];

test('datas ISO são validadas de verdade (sem 31/02)', () => {
  assert.equal(isISODate('2026-06-03'), true);
  assert.equal(isISODate('2026-02-31'), false);
  assert.equal(isISODate('03/06/2026'), false);
  assert.equal(isISODate('2026-13-01'), false);
});

test('grade do calendário tem 6 semanas × 7 dias e nenhum dia do mês é cortado', () => {
  for (const month of ['2026-06', '2026-10', '2027-02', '2028-02']) {
    const weeks = buildMonthGrid(month, { shifts: legacyShifts, offDays: [] });
    assert.equal(weeks.length, 6, `6 semanas em ${month}`);
    assert.equal(weeks.flat().length, 42);
    const { days } = monthBounds(month);
    const inMonth = weeks.flat().filter((day) => day.inMonth);
    assert.equal(inMonth.length, days, `todos os ${days} dias aparecem em ${month}`);
    assert.equal(new Set(inMonth.map((d) => d.date)).size, days);
    assert.equal(inMonth[0].date, `${month}-01`);
    assert.equal(inMonth[inMonth.length - 1].date, `${month}-${String(days).padStart(2, '0')}`);
  }
});

test('eventos do calendário são agrupados por dia sem sobreposição', () => {
  const weeks = buildMonthGrid('2026-06', {
    shifts: legacyShifts,
    offDays: [{ id: 1, date: '2026-06-13', name: 'Agenor', type: 'mensal' }],
  });
  const flat = weeks.flat();
  assert.equal(flat.find((d) => d.date === '2026-06-03').shifts.length, 1);
  assert.equal(flat.find((d) => d.date === '2026-06-13').offDays.length, 1);
  assert.equal(flat.find((d) => d.date === '2026-06-04').shifts[0].onShift, 'Reginaldo');
});

test('data de troca e data de pagamento são campos independentes', () => {
  const base = { date: '2026-06-10', onShift: 'Agenor', period: 'Diurno (12h)' };

  const onlySwap = validateShift({ ...base, swapForDate: '2026-06-11', paymentDate: null }, { shifts: [], collaborators });
  assert.equal(onlySwap.ok, true);
  assert.equal(onlySwap.warnings.length, 0);

  const onlyPayment = validateShift({ ...base, paymentDate: '2026-07-05' }, { shifts: [], collaborators });
  assert.equal(onlyPayment.ok, true);

  const both = validateShift({ ...base, swapForDate: '2026-06-11', paymentDate: '2026-07-05' }, { shifts: [], collaborators });
  assert.equal(both.ok, true);

  // pagamento no mesmo dia da troca não cria vínculo nem erro
  const sameDay = validateShift({ ...base, swapForDate: '2026-06-12', paymentDate: '2026-06-12' }, { shifts: [], collaborators });
  assert.equal(sameDay.ok, true);
});

test('pagamento anterior ao turno gera alerta (não bloqueia)', () => {
  const result = validateShift(
    { date: '2026-06-20', onShift: 'Agenor', period: 'Diurno (12h)', paymentDate: '2026-06-10' },
    { shifts: [], collaborators },
  );
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /independentes/i);
});

test('troca na mesma data do turno é recusada', () => {
  const result = validateShift(
    { date: '2026-06-20', onShift: 'Agenor', period: 'Diurno (12h)', swapForDate: '2026-06-20' },
    { shifts: [], collaborators },
  );
  assert.equal(result.ok, false);
});

test('não permite dois plantões do mesmo plantonista no mesmo dia', () => {
  const result = validateShift(
    { date: '2026-06-03', onShift: 'Agenor', period: 'Noturno (12h)' },
    { shifts: legacyShifts, collaborators },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /já possui plantão/);
});

test('editar o próprio plantão não acusa duplicidade', () => {
  const result = validateShift(
    { date: '2026-06-03', onShift: 'Agenor', period: 'Diurno (12h)', swapForDate: '2026-06-04' },
    { shifts: legacyShifts, collaborators, ignoreId: 1 },
  );
  assert.equal(result.ok, true);
});

test('plantões em dias consecutivos geram alerta de 12x36', () => {
  const result = validateShift(
    { date: '2026-06-08', onShift: 'Agenor', period: 'Diurno (12h)' },
    { shifts: legacyShifts, collaborators },
  );
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => /36h/.test(w) || /36 horas/.test(w)));
});

test('período inválido e plantonista vazio são bloqueados', () => {
  const bad = validateShift({ date: '31/07/2026', onShift: '', period: 'Madrugada' }, { shifts: [], collaborators });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 3);
  assert.ok(bad.errors.some((e) => /data de turno/i.test(e)));
});

test('trocas recíprocas são reconhecidas como confirmadas', () => {
  const swaps = buildSwapPairs(legacyShifts);
  assert.equal(swaps.length, 6);
  assert.ok(swaps.every((swap) => swap.reciprocal === true));
  assert.ok(swaps.every((swap) => swap.status === 'confirmada'));
});

test('troca sem par é sinalizada pela análise', () => {
  const single = [{ id: 99, date: '2026-07-10', onShift: 'Agenor', swapForDate: '2026-07-11', status: 'confirmado' }];
  const analysis = analyzeSchedule(single);
  assert.ok(analysis.some((item) => item.type === 'troca-sem-par'));
  const swaps = buildSwapPairs(single);
  assert.equal(swaps[0].status, 'pendente');
  assert.equal(swaps[0].counterpartName, null);
});

test('análise detecta plantões duplicados e consecutivos', () => {
  const analysis = analyzeSchedule([
    { id: 1, date: '2026-07-01', onShift: 'Agenor', status: 'confirmado' },
    { id: 2, date: '2026-07-01', onShift: 'Agenor', status: 'confirmado' },
    { id: 3, date: '2026-07-02', onShift: 'Agenor', status: 'confirmado' },
  ]);
  assert.ok(analysis.some((item) => item.type === 'duplicado' && item.severity === 'error'));
  assert.ok(analysis.some((item) => item.type === '12x36' && item.severity === 'warning'));
});

test('plantões cancelados saem das estatísticas mas continuam no banco', () => {
  const stats = monthStats({
    shifts: [...legacyShifts, { id: 7, date: '2026-06-30', onShift: 'Agenor', status: 'cancelado' }],
    offDays: [{ id: 1, date: '2026-06-13', name: 'Agenor', type: 'mensal' }],
  });
  assert.equal(stats.shifts, 6);
  assert.equal(stats.offDays, 1);
  assert.equal(stats.swaps, 6);
  assert.equal(stats.pendingPayments, 6);
  assert.equal(stats.leader.name, 'Agenor');
  assert.equal(stats.leader.count, 3);
});

test('folga duplicada é bloqueada e folga mensal repetida gera alerta', () => {
  const offDays = [{ id: 1, date: '2026-06-13', name: 'Agenor', type: 'mensal' }];
  const duplicate = validateOffDay({ date: '2026-06-13', name: 'Agenor', type: 'mensal' }, { offDays });
  assert.equal(duplicate.ok, false);

  const second = validateOffDay({ date: '2026-06-25', name: 'Agenor', type: 'mensal' }, { offDays });
  assert.equal(second.ok, true);
  assert.equal(second.warnings.length, 1);

  const extra = validateOffDay({ date: '2026-06-25', name: 'Agenor', type: 'compensatoria' }, { offDays });
  assert.equal(extra.ok, true);
  assert.equal(extra.warnings.length, 0);
});

test('tipo de folga inválido é recusado', () => {
  const result = validateOffDay({ date: '2026-06-25', name: 'Agenor', type: 'ferias' }, { offDays: [] });
  assert.equal(result.ok, false);
});

test('cadastro de plantonista duplicado (case-insensitive) é bloqueado', () => {
  const result = validateCollaborator({ name: 'agenor' }, { collaborators });
  assert.equal(result.ok, false);
  const ok = validateCollaborator({ name: 'Camila' }, { collaborators });
  assert.equal(ok.ok, true);
});

test('ciclo individual calcula próximo plantão e descanso', () => {
  const info = cycleInfo(legacyShifts, 'Agenor', '2026-06-10');
  assert.equal(info.last.date, '2026-06-07');
  assert.equal(info.next.date, '2026-06-21');
  assert.equal(info.daysUntilNext, 11);
  assert.equal(info.total, 3);
});

test('diferença de dias ignora fuso horário', () => {
  assert.equal(diffDays('2026-06-03', '2026-06-04'), 1);
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
  assert.equal(diffDays('2026-06-03', '2026-06-03'), 0);
});

test('fevereiro bissexto é tratado corretamente', () => {
  assert.deepEqual(monthBounds('2028-02'), { start: '2028-02-01', end: '2028-02-29', days: 29, year: 2028, month: 2 });
  assert.deepEqual(monthBounds('2026-02'), { start: '2026-02-01', end: '2026-02-28', days: 28, year: 2026, month: 2 });
});
