import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  Palmtree,
  Repeat2,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { CalendarGrid, Agenda } from '../components/CalendarGrid';
import { Avatar, EmptyState, Segmented } from '../components/ui';
import { formatDateBR, monthLabel, monthKey } from '../lib/calendar';
import { paletteFor } from '../lib/colors';
import { generateMonthlyPdf } from '../lib/pdf';
import { useToast } from '../components/ui';
import type { Shift } from '../types';


/** Aviso quando o mês aberto não tem escala, mas existem outros meses com dados. */
function MonthHint({ month }: { month: string }) {
  const { boot, setMonth } = useApp();
  const { t, lang } = useLang();
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const shift of boot?.shifts || []) if (!shift.deletedAt) set.add(shift.date.slice(0, 7));
    return [...set].sort();
  }, [boot]);
  const hasData = (boot?.shifts || []).some((s) => !s.deletedAt && s.date.startsWith(month));
  if (hasData || months.length === 0) return null;
  const nearest = months[months.length - 1];
  return (
    <div className="banner warning">
      <CalendarDays />
      <div className="grow">
        {t(
          `Nenhum plantão em ${monthLabel(month, 'pt')}. A escala migrada do app está em ${monthLabel(nearest, 'pt')}.`,
          `No shifts in ${monthLabel(month, 'en')}. The roster migrated from the app is in ${monthLabel(nearest, 'en')}.`,
        )}
      </div>
      <button className="btn btn-sm btn-primary" onClick={() => setMonth(nearest)}>
        {t('Ir para', 'Go to')} {monthLabel(nearest, lang)}
      </button>
    </div>
  );
}

export function CalendarPage({
  onDayClick,
  onNewShift,
  onNewOffDay,
  onOpenShift,
}: {
  onDayClick: (date: string) => void;
  onNewShift: () => void;
  onNewOffDay: () => void;
  onOpenShift: (shift: Shift) => void;
}) {
  const { boot, month, setMonth, goToMonth } = useApp();
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [view, setView] = useState<'grid' | 'list'>(() =>
    window.matchMedia?.('(max-width: 760px)').matches ? 'list' : 'grid',
  );
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [showAllTeam, setShowAllTeam] = useState(false);

  const collaborators = useMemo(() => (boot?.collaborators || []).filter((c) => !c.deletedAt), [boot]);
  const monthShifts = useMemo(
    () => (boot?.shifts || []).filter((s) => !s.deletedAt && s.date.startsWith(month)),
    [boot, month],
  );
  const monthOff = useMemo(
    () => (boot?.offDays || []).filter((o) => !o.deletedAt && o.date.startsWith(month)),
    [boot, month],
  );
  const activeShifts = monthShifts.filter((s) => s.status !== 'cancelado');
  const swaps = (boot?.swaps || []).filter((s) => s.date.startsWith(month));
  const pendingPayments = activeShifts.filter((s) => !s.paymentDate);
  const conflicts = (boot?.conflicts || []).filter((c) => c.dates.some((date) => date.startsWith(month)));

  const nextShift = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (boot?.shifts || [])
      .filter((s) => !s.deletedAt && s.status !== 'cancelado' && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [boot]);

  const togglePerson = (name: string) => {
    setSelectedPeople((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  };

  const jumpToday = () => {
    const current = monthKey();
    setMonth(current);
    if (nextShift) setMonth(nextShift.date.slice(0, 7));
  };

  const exportPdf = async () => {
    try {
      await generateMonthlyPdf({
        month,
        shifts: boot?.shifts || [],
        offDays: boot?.offDays || [],
        collaborators,
        lang,
        supportPhone: boot?.settings.support_phone_display || '(21) 98049-8068',
      });
      toast('success', t('PDF gerado', 'PDF generated'), t('O arquivo foi baixado com as datas de troca e pagamento separadas.', 'The file was downloaded with swap and payment dates kept apart.'));
    } catch (error) {
      toast('error', t('Erro ao gerar PDF', 'PDF error'), (error as Error).message);
    }
  };

  return (
    <div className="stack gap-18">
      <MonthHint month={month} />
      <div className="card" style={{ paddingBottom: 14 }}>
        <div className="calendar-toolbar" style={{ marginBottom: 0 }}>
          <div className="calendar-title-group">
            <button className="icon-btn" onClick={() => goToMonth(-1)} aria-label={t('Mês anterior', 'Previous month')}>
              <ChevronLeft />
            </button>
            <div>
              <div className="calendar-title">{monthLabel(month, lang)}</div>
              <div className="tiny muted">
                {activeShifts.length} {t('plantões', 'shifts')} · {monthOff.length} {t('folgas', 'off-days')} · {swaps.length} {t('trocas', 'swaps')}
              </div>
            </div>
            <button className="icon-btn" onClick={() => goToMonth(1)} aria-label={t('Próximo mês', 'Next month')}>
              <ChevronRight />
            </button>
            <button className="btn btn-sm btn-ghost" onClick={jumpToday}>
              <CalendarDays /> {t('Hoje', 'Today')}
            </button>
          </div>
          <div className="calendar-actions">
            <Segmented
              value={view}
              onChange={setView}
              ariaLabel={t('Modo de visualização', 'View mode')}
              options={[
                { value: 'grid', label: t('Grade', 'Grid'), icon: <LayoutGrid /> },
                { value: 'list', label: t('Lista', 'List'), icon: <List /> },
              ]}
            />
            {boot?.permissions.canEdit && (
              <>
                <button className="btn btn-outline btn-sm" onClick={onNewOffDay}>
                  <Palmtree /> {t('Folga', 'Off-day')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={onNewShift}>
                  <CalendarPlus /> {t('Plantão', 'Shift')}
                </button>
              </>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => void exportPdf()}>
              <Download /> <span>{t('PDF', 'PDF')}</span>
            </button>
          </div>
        </div>

        <div className="filters-bar" style={{ marginTop: 14, marginBottom: 0 }}>
          <span className="tiny muted row gap-4" style={{ flex: '0 0 auto' }}>
            <Users size={13} /> {t('Equipe', 'Team')}
          </span>
          <button
            className={`chip${selectedPeople.length === 0 ? ' active' : ''}`}
            onClick={() => setSelectedPeople([])}
          >
            {t('Todos', 'All')}
          </button>
          {collaborators.map((person) => {
            const palette = paletteFor(person.colorHex);
            const active = selectedPeople.includes(person.name);
            const count = activeShifts.filter((s) => s.onShift === person.name).length;
            return (
              <button key={person.id} className={`chip${active ? ' active' : ''}`} onClick={() => togglePerson(person.name)}>
                <span className="dot" style={{ background: palette.from }} />
                {person.name}
                <span className="tiny" style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
          {selectedPeople.length > 0 && (
            <button className="chip" onClick={() => setSelectedPeople([])}>
              {t('Limpar', 'Clear')} ✕
            </button>
          )}
        </div>
      </div>

      <div className="row gap-10 wrap" style={{ justifyContent: 'space-between' }}>
        <div className="month-summary">
          <div className="summary-pill">
            <span className="v">{activeShifts.length}</span>
            <span className="l">{t('Plantões', 'Shifts')}</span>
          </div>
          <div className="summary-pill">
            <span className="v">{swaps.length}</span>
            <span className="l">{t('Trocas', 'Swaps')}</span>
          </div>
          <div className="summary-pill">
            <span className="v">{monthOff.length}</span>
            <span className="l">{t('Folgas', 'Off-days')}</span>
          </div>
          <div className="summary-pill" style={{ borderColor: 'rgba(176,141,42,0.3)', background: 'var(--gold-soft)' }}>
            <span className="v">{pendingPayments.length}</span>
            <span className="l">{t('Pagar', 'To pay')}</span>
          </div>
          <div className="summary-pill" style={{ borderColor: conflicts.length ? 'rgba(180,35,24,0.3)' : undefined }}>
            <span className="v">{conflicts.length}</span>
            <span className="l">{t('Alertas', 'Alerts')}</span>
          </div>
        </div>
        <div className="row gap-8 small muted">
          <span className="row gap-4">
            <Repeat2 size={13} /> {t('Troca e pagamento em colunas próprias', 'Swap and payment in separate columns')}
          </span>
        </div>
      </div>

      <motion.div key={`${month}-${view}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {view === 'grid' ? (
          <CalendarGrid
            month={month}
            shifts={boot?.shifts || []}
            offDays={boot?.offDays || []}
            collaborators={collaborators}
            selectedPeople={selectedPeople}
            conflicts={boot?.conflicts || []}
            nextShiftId={nextShift?.id ?? null}
            onDayClick={onDayClick}
          />
        ) : (
          <div className="card">
            <Agenda
              month={month}
              shifts={boot?.shifts || []}
              offDays={boot?.offDays || []}
              collaborators={collaborators}
              selectedPeople={selectedPeople}
              onDayClick={onDayClick}
            />
          </div>
        )}
      </motion.div>

      <div className="dashboard-grid">
        <section className="card col-6">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Trocas do mês', 'Swaps this month')}</div>
              <div className="card-sub">{t('data da troca ≠ data do pagamento', 'swap date ≠ payment date')}</div>
            </div>
            <span className="badge gold">{swaps.length}</span>
          </div>
          {swaps.length === 0 ? (
            <EmptyState icon={<Repeat2 />} title={t('Nenhuma troca no mês', 'No swaps this month')} description={t('Ao editar um plantão, informe a data de troca — ela fica separada do pagamento.', 'When editing a shift, set the swap date — it stays separate from payment.')} />
          ) : (
            <div className="stack gap-8">
              {swaps.map((swap) => {
                const shift = boot?.shifts.find((s) => s.id === swap.shiftId);
                return (
                  <button key={swap.id} className="list-row" onClick={() => shift && onOpenShift(shift)} style={{ textAlign: 'left' }}>
                    <Avatar name={swap.onShift} color={boot?.collaborators.find((c) => c.name === swap.onShift)?.colorHex} size="sm" />
                    <div className="list-row-main">
                      <div className="list-row-title">
                        {swap.onShift} <span className="muted small">·</span> {formatDateBR(swap.date, lang)}
                        <span className="badge gold">
                          <Repeat2 size={11} /> {formatDateBR(swap.swapForDate, lang)}
                        </span>
                      </div>
                      <div className="list-row-sub">
                        <span>
                          {t('Pagamento', 'Payment')}: {shift?.paymentDate ? formatDateBR(shift.paymentDate, lang) : t('a definir', 'pending')}
                        </span>
                        <span>{swap.reciprocal ? t('par confirmado', 'matched pair') : t('aguardando par', 'awaiting pair')}</span>
                      </div>
                    </div>
                    <span className={`badge ${swap.reciprocal ? 'success' : 'warning'}`}>
                      {swap.reciprocal ? t('Confirmada', 'Confirmed') : t('Pendente', 'Pending')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="card col-6">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Pagamentos do mês', 'Payments this month')}</div>
              <div className="card-sub">{t('independentes da data do plantão', 'independent from the shift date')}</div>
            </div>
            <Wallet size={16} />
          </div>
          {activeShifts.length === 0 ? (
            <EmptyState icon={<Wallet />} title={t('Sem plantões', 'No shifts')} />
          ) : (
            <div className="stack gap-8">
              {activeShifts
                .slice()
                .sort((a, b) => (a.paymentDate || '9999').localeCompare(b.paymentDate || '9999'))
                .slice(0, 6)
                .map((shift) => (
                  <button key={shift.id} className="list-row" onClick={() => onOpenShift(shift)} style={{ textAlign: 'left' }}>
                    <div className="empty-icon" style={{ width: 34, height: 34, borderRadius: 11, background: shift.paymentDate ? 'var(--success-soft)' : 'var(--gold-soft)', color: shift.paymentDate ? 'var(--success)' : 'var(--gold)' }}>
                      <Wallet size={15} />
                    </div>
                    <div className="list-row-main">
                      <div className="list-row-title">{shift.onShift}</div>
                      <div className="list-row-sub">
                        <span>{t('Turno', 'Shift')}: {formatDateBR(shift.date, lang)}</span>
                        <span>{t('Troca', 'Swap')}: {shift.swapForDate ? formatDateBR(shift.swapForDate, lang) : '—'}</span>
                      </div>
                    </div>
                    <span className={`badge ${shift.paymentDate ? 'success' : 'outline'}`}>
                      {shift.paymentDate ? formatDateBR(shift.paymentDate, lang) : t('a definir', 'pending')}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </section>

        {conflicts.length > 0 && (
          <section className="card col-12">
            <div className="card-head">
              <div>
                <div className="card-title">{t('Alertas de conformidade', 'Compliance alerts')}</div>
                <div className="card-sub">{t('A escala é preservada; apenas sinalizamos para ajuste.', 'The roster is preserved; we only flag it for review.')}</div>
              </div>
              <ShieldAlert size={16} />
            </div>
            <div className="stack gap-8">
              {conflicts.map((conflict, index) => (
                <div className={`alert ${conflict.severity === 'error' ? 'danger' : 'warning'}`} key={`${conflict.type}-${index}`}>
                  <ShieldAlert />
                  <div className="grow">{conflict.message}</div>
                  <button className="btn btn-sm btn-ghost" onClick={() => setMonth(conflict.dates[0].slice(0, 7))}>
                    {t('Ver mês', 'View month')} <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="row gap-8 small muted wrap" style={{ justifyContent: 'space-between' }}>
        <span className="row gap-6">
          <ArrowLeft size={13} />
          {t('Dica: toque em qualquer dia para abrir os detalhes e editar.', 'Tip: tap any day to open details and edit.')}
        </span>
        <span>
          {t('Grade completa com 6 semanas — nenhum dia é cortado.', 'Full 6-week grid — no day is ever clipped.')}
        </span>
      </div>
    </div>
  );
}
