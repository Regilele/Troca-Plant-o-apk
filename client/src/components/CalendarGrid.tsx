import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarPlus, Check, Palmtree, Repeat2, Wallet } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { buildMonthWeeks, formatDateBR, WEEKDAYS_SHORT_EN, WEEKDAYS_SHORT_PT } from '../lib/calendar';
import { paletteFor } from '../lib/colors';
import type { Collaborator, OffDay, Shift } from '../types';

interface Props {
  month: string;
  shifts: Shift[];
  offDays: OffDay[];
  collaborators: Collaborator[];
  selectedPeople: string[];
  conflicts: { dates: string[] }[];
  nextShiftId?: number | null;
  onDayClick: (date: string) => void;
  compact?: boolean;
}

export function CalendarGrid({
  month,
  shifts,
  offDays,
  collaborators,
  selectedPeople,
  conflicts,
  nextShiftId,
  onDayClick,
}: Props) {
  const { lang, t } = useLang();
  const weekdays = lang === 'en' ? WEEKDAYS_SHORT_EN : WEEKDAYS_SHORT_PT;

  const filteredShifts = useMemo(
    () => shifts.filter((s) => !s.deletedAt && (selectedPeople.length === 0 || selectedPeople.includes(s.onShift))),
    [shifts, selectedPeople],
  );
  const filteredOffs = useMemo(
    () => offDays.filter((o) => !o.deletedAt && (selectedPeople.length === 0 || selectedPeople.includes(o.name))),
    [offDays, selectedPeople],
  );

  const weeks = useMemo(() => buildMonthWeeks(month, filteredShifts, filteredOffs), [month, filteredShifts, filteredOffs]);
  const conflictDates = useMemo(() => new Set(conflicts.flatMap((c) => c.dates)), [conflicts]);
  const paymentDates = useMemo(
    () => new Set(filteredShifts.filter((s) => s.paymentDate).map((s) => s.paymentDate as string)),
    [filteredShifts],
  );

  const colorOf = (name: string) => collaborators.find((c) => c.name === name)?.colorHex;

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="calendar-board">
      <div className="calendar-head" role="row">
        {weekdays.map((day, index) => (
          <div key={day} className={index === 0 || index === 6 ? 'weekend' : ''} role="columnheader">
            {day}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <motion.div
          key={`${month}-${weekIndex}`}
          className="calendar-week"
          role="row"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: Math.min(weekIndex * 0.035, 0.2), ease: [0.22, 1, 0.36, 1] }}
        >
          {week.map((day) => {
            const hasConflict = conflictDates.has(day.date);
            const hasPayment = paymentDates.has(day.date);
            const isNext = day.shifts.some((s) => s.id === nextShiftId);
            const visibleShifts = day.shifts.slice(0, 3);
            const hidden = day.shifts.length - visibleShifts.length;

            return (
              <button
                key={day.date}
                type="button"
                className={[
                  'day-cell',
                  day.inMonth ? '' : 'is-out',
                  day.isToday ? 'is-today' : '',
                  day.weekend ? 'is-weekend' : '',
                  isNext ? 'has-next' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onDayClick(day.date)}
                aria-label={`${formatDateBR(day.date, lang)} — ${day.shifts.length} ${t('plantões', 'shifts')}, ${day.offDays.length} ${t('folgas', 'off-days')}`}
              >
                <div className="day-top">
                  <span className="day-num">{day.day}</span>
                  {(hasConflict || hasPayment) && (
                    <span className="day-flags">
                      {hasConflict && <span className="day-flag conflict" title={t('Conflito de escala', 'Roster conflict')} />}
                      {hasPayment && <span className="day-flag pay" title={t('Pagamento previsto', 'Payment scheduled')} />}
                    </span>
                  )}
                </div>
                <div className="day-events">
                  {visibleShifts.map((shift) => {
                    const palette = paletteFor(colorOf(shift.onShift));
                    return (
                      <span
                        key={shift.id}
                        className={[
                          'shift-chip',
                          shift.swapForDate ? 'is-swap' : '',
                          shift.status === 'pendente' ? 'is-pending' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          background: palette.soft,
                          color: palette.ink,
                          borderColor: shift.id === nextShiftId ? 'rgba(176,141,42,0.65)' : 'transparent',
                        }}
                        title={`${shift.onShift} · ${shift.period}${shift.swapForDate ? ` · ${t('troca', 'swap')} ${formatDateBR(shift.swapForDate, lang)}` : ''}${shift.paymentDate ? ` · ${t('pagamento', 'payment')} ${formatDateBR(shift.paymentDate, lang)}` : ` · ${t('pagamento a definir', 'payment pending')}`}`}
                      >
                        <span className="dot" style={{ background: palette.from }} />
                        <span className="chip-main">
                          <span className="who">
                            {shift.onShift}
                            {shift.id === nextShiftId && <Check className="swap-i" style={{ color: 'var(--gold)' }} />}
                          </span>
                          <span className="chip-meta">
                            {shift.swapForDate && (
                              <span className="chip-meta-item">
                                <Repeat2 size={9} /> {formatDateBR(shift.swapForDate, lang)}
                              </span>
                            )}
                            <span className="chip-meta-item">
                              <Wallet size={9} />
                              {shift.paymentDate ? formatDateBR(shift.paymentDate, lang) : t('a definir', 'pending')}
                            </span>
                          </span>
                        </span>
                      </span>
                    );
                  })}
                  {hidden > 0 && <span className="day-more">+{hidden}</span>}
                  {day.offDays.slice(0, 2).map((off) => (
                    <span
                      key={`off-${off.id}`}
                      className="shift-chip is-off"
                      title={`${t('Folga', 'Off-day')} · ${off.name} · ${off.type}`}
                    >
                      <Palmtree style={{ width: 9, height: 9 }} />
                      <span className="who">{off.name}</span>
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </motion.div>
      ))}
      <div className="calendar-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--brand)' }} /> {t('Plantão do dia', 'Shift')}
        </span>
        <span className="legend-item">
          <Repeat2 size={11} /> {t('Troca registrada', 'Swap logged')}
        </span>
        <span className="legend-item">
          <Wallet size={11} /> {t('Pagamento previsto', 'Payment scheduled')}
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--danger)' }} /> {t('Alerta de conformidade', 'Compliance warning')}
        </span>
        <span className="legend-item">
          <Palmtree size={11} /> {t('Folga', 'Off-day')}
        </span>
        <span className="legend-item" style={{ marginLeft: 'auto', opacity: 0.8 }}>
          <CalendarPlus size={11} /> {t('Toque em um dia para editar', 'Tap a day to edit')}
        </span>
      </div>
    </div>
  );
}

export function Agenda({
  month,
  shifts,
  offDays,
  collaborators,
  selectedPeople,
  onDayClick,
}: Omit<Props, 'conflicts' | 'nextShiftId' | 'compact'>) {
  const { lang, t } = useLang();
  const filteredShifts = shifts.filter((s) => !s.deletedAt && (selectedPeople.length === 0 || selectedPeople.includes(s.onShift)));
  const filteredOffs = offDays.filter((o) => !o.deletedAt && (selectedPeople.length === 0 || selectedPeople.includes(o.name)));

  const byDate = new Map<string, { shifts: Shift[]; offDays: OffDay[] }>();
  for (const shift of filteredShifts) {
    if (!shift.date.startsWith(month)) continue;
    const entry = byDate.get(shift.date) || { shifts: [], offDays: [] };
    entry.shifts.push(shift);
    byDate.set(shift.date, entry);
  }
  for (const off of filteredOffs) {
    if (!off.date.startsWith(month)) continue;
    const entry = byDate.get(off.date) || { shifts: [], offDays: [] };
    entry.offDays.push(off);
    byDate.set(off.date, entry);
  }
  const dates = [...byDate.keys()].sort();

  if (dates.length === 0) {
    return (
      <div className="empty agenda-empty">
        <div className="empty-icon">
          <CalendarPlus />
        </div>
        <h4>{t('Nenhum registro neste mês', 'No records this month')}</h4>
        <p className="small">{t('Toque em um dia na grade ou use “Novo plantão”.', 'Tap a day in the grid or use “New shift”.')}</p>
      </div>
    );
  }

  return (
    <div className="agenda">
      {dates.map((date) => {
        const entry = byDate.get(date)!;
        const [y, m, d] = date.split('-');
        const weekday = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(
          lang === 'en' ? 'en-US' : 'pt-BR',
          { weekday: 'short' },
        );
        return (
          <div className="agenda-day" key={date}>
            <button className="agenda-date" onClick={() => onDayClick(date)} type="button">
              <div className="d">{d}</div>
              <div className="w">{weekday.replace('.', '')}</div>
            </button>
            <div className="agenda-items">
              {entry.shifts.map((shift) => {
                const palette = paletteFor(collaborators.find((c) => c.name === shift.onShift)?.colorHex);
                return (
                  <button
                    key={shift.id}
                    className="agenda-item"
                    onClick={() => onDayClick(date)}
                    type="button"
                    style={{ ['--agenda-accent' as string]: palette.from }}
                  >
                    <span className="avatar sm" style={{ background: `linear-gradient(140deg, ${palette.from}, ${palette.to})` }}>
                      {shift.onShift.slice(0, 1)}
                    </span>
                    <span className="grow">
                      <span className="agenda-item-name">{shift.onShift}</span>
                      <span className="agenda-item-sub">
                        {shift.period}
                        {shift.swapForDate ? ` · ${t('troca', 'swap')} ${formatDateBR(shift.swapForDate, lang)}` : ''}
                        {shift.paymentDate ? ` · ${t('pagamento', 'payment')} ${formatDateBR(shift.paymentDate, lang)}` : ` · ${t('pagamento a definir', 'payment pending')}`}
                      </span>
                    </span>
                    {shift.swapForDate && <span className="badge gold">{t('Troca', 'Swap')}</span>}
                    {!shift.paymentDate && <span className="badge outline">{t('Pagar', 'Pay')}</span>}
                  </button>
                );
              })}
              {entry.offDays.map((off) => (
                <button key={`off-${off.id}`} className="agenda-item" onClick={() => onDayClick(date)} type="button">
                  <span className="avatar sm" style={{ background: 'linear-gradient(140deg, var(--gold), var(--gold-2))', color: '#2c2104' }}>
                    <Palmtree size={12} />
                  </span>
                  <span className="grow">
                    <span className="agenda-item-name">{off.name}</span>
                    <span className="agenda-item-sub">
                      {off.type === 'mensal' ? t('Folga mensal', 'Monthly leave') : t('Compensatória', 'Extra time off')}
                    </span>
                  </span>
                  <span className="badge gold">{t('Folga', 'Off-day')}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
