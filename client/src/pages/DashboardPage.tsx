import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AlarmClock,
  ArrowRight,
  BellRing,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  CloudSun,
  FileBarChart,
  Moon,
  Palmtree,
  Repeat2,
  ShieldAlert,
  Sparkles,
  SunMedium,
  Wallet,
  Wind,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { Avatar, EmptyState } from '../components/ui';
import { InstallCard } from '../components/InstallCard';
import { daysUntil, formatDateBR, monthLabel, monthKey } from '../lib/calendar';
import { paletteFor } from '../lib/colors';
import type { Shift } from '../types';

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function DashboardPage({
  onNewShift,
  onNewOffDay,
  onOpenShift,
  onGoReports,
  onGoApprovals,
  onGoCalendar,
}: {
  onNewShift: () => void;
  onNewOffDay: () => void;
  onOpenShift: (shift: Shift) => void;
  onGoReports: () => void;
  onGoApprovals: () => void;
  onGoCalendar: () => void;
}) {
  const { boot, month, user, sendNotification, refreshWeather } = useApp();
  const { lang, t } = useLang();

  const today = new Date().toISOString().slice(0, 10);

  const monthShifts = useMemo(
    () => (boot?.shifts || []).filter((s) => !s.deletedAt && s.date.startsWith(month) && s.status !== 'cancelado'),
    [boot, month],
  );
  const monthOff = useMemo(
    () => (boot?.offDays || []).filter((o) => !o.deletedAt && o.date.startsWith(month)),
    [boot, month],
  );

  const nextShift = useMemo(
    () =>
      (boot?.shifts || [])
        .filter((s) => !s.deletedAt && s.status !== 'cancelado' && s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null,
    [boot, today],
  );

  const upcoming = useMemo(
    () =>
      (boot?.shifts || [])
        .filter((s) => !s.deletedAt && s.status !== 'cancelado' && s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5),
    [boot, today],
  );

  const swaps = useMemo(() => (boot?.swaps || []).filter((s) => s.date.startsWith(month)), [boot, month]);
  const pendingPayments = monthShifts.filter((s) => !s.paymentDate);
  const conflicts = boot?.conflicts || [];
  const weather = boot?.integrations?.find((i) => i.name === 'open-meteo')?.sample;
  const weatherStatus = boot?.integrations?.find((i) => i.name === 'open-meteo')?.status;

  const perPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const shift of monthShifts) map.set(shift.onShift, (map.get(shift.onShift) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthShifts]);

  const lastShift = useMemo(
    () =>
      (boot?.shifts || [])
        .filter((s) => !s.deletedAt && s.status !== 'cancelado' && s.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null,
    [boot, today],
  );
  const recentShifts = useMemo(
    () =>
      (boot?.shifts || [])
        .filter((s) => !s.deletedAt && s.status !== 'cancelado')
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [boot],
  );

  const heroShift = nextShift || lastShift;
  const upcomingList = upcoming.length > 0 ? upcoming : recentShifts;

  const leader = perPerson[0];
  const nextPalette = paletteFor(boot?.collaborators.find((c) => c.name === heroShift?.onShift)?.colorHex);
  const daysToNext = nextShift ? daysUntil(nextShift.date) : null;
  const daysSinceLast = lastShift ? Math.max(0, -daysUntil(lastShift.date)) : null;
  const myCycle = boot?.cycles.find((cycle) => cycle.person === user?.name);

  const stats = [
    {
      label: t('Plantões no mês', 'Shifts this month'),
      value: monthShifts.length,
      sub: monthLabel(month, lang),
      icon: <CalendarDays />,
      accent: true,
    },
    {
      label: t('Trocas', 'Swaps'),
      value: swaps.length,
      sub: t('data de troca ≠ pagamento', 'swap date ≠ payment date'),
      icon: <Repeat2 />,
    },
    {
      label: t('Folgas', 'Off-days'),
      value: monthOff.length,
      sub: monthLabel(month, lang),
      icon: <Palmtree />,
    },
    {
      label: t('A pagar', 'To pay'),
      value: pendingPayments.length,
      sub: t('campo independente do turno', 'independent of shift'),
      icon: <Wallet />,
    },
  ];

  const monthsWithData = useMemo(() => {
    const set = new Set<string>();
    for (const shift of boot?.shifts || []) if (!shift.deletedAt) set.add(shift.date.slice(0, 7));
    return [...set].sort();
  }, [boot]);
  const monthHasData = (boot?.shifts || []).some((s) => !s.deletedAt && s.date.startsWith(month));

  return (
    <div className="dashboard-grid">
      {!monthHasData && monthsWithData.length > 0 && (
        <div className="col-12 banner warning">
          <CalendarDays />
          <div className="grow">
            {t(
              `O mês aberto (${monthLabel(month, 'pt')}) não tem plantões. A escala migrada do app está em ${monthLabel(monthsWithData[monthsWithData.length - 1], 'pt')}.`,
              `The open month (${monthLabel(month, 'en')}) has no shifts. The roster migrated from the app is in ${monthLabel(monthsWithData[monthsWithData.length - 1], 'en')}.`,
            )}
          </div>
          <button className="btn btn-sm btn-primary" onClick={onGoCalendar}>
            {t('Abrir escala', 'Open roster')}
          </button>
        </div>
      )}
      <motion.section className="card card-brand hero-next col-7" {...fadeUp} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <div>
          <div className="hero-eyebrow">
            {nextShift ? t('Próximo plantão', 'Next shift') : t('Última escala registrada', 'Last recorded shift')}
          </div>
          {heroShift ? (
            <>
              <div className="hero-person">
                <Avatar
                  name={heroShift.onShift}
                  color={boot?.collaborators.find((c) => c.name === heroShift.onShift)?.colorHex}
                  char={boot?.collaborators.find((c) => c.name === heroShift.onShift)?.avatarChar}
                  size="lg"
                />
                <div style={{ minWidth: 0 }}>
                  <div className="hero-name">{heroShift.onShift}</div>
                  <div className="hero-meta">
                    <span className="badge">
                      <CalendarDays size={12} /> {formatDateBR(heroShift.date, lang)}
                    </span>
                    <span className="badge">
                      {heroShift.period.startsWith('Noturno') ? <Moon size={12} /> : <SunMedium size={12} />}
                      {heroShift.period}
                    </span>
                    {heroShift.swapForDate && (
                      <span className="badge">
                        <Repeat2 size={12} /> {t('troca', 'swap')} {formatDateBR(heroShift.swapForDate, lang)}
                      </span>
                    )}
                    <span className="badge">
                      <Wallet size={12} /> {heroShift.paymentDate ? formatDateBR(heroShift.paymentDate, lang) : t('pagamento a definir', 'payment pending')}
                    </span>
                  </div>
                </div>
              </div>
              {nextShift ? (
                <div className="hero-countdown">
                  <div className="countdown-big">{daysToNext === 0 ? t('Hoje', 'Today') : daysToNext}</div>
                  <div className="countdown-label">
                    {daysToNext === 0
                      ? t('É hoje. Bom plantão!', 'It is today. Have a great shift!')
                      : daysToNext === 1
                        ? t('dia para o próximo plantão', 'day until the next shift')
                        : t('dias para o próximo plantão', 'days until the next shift')}
                  </div>
                </div>
              ) : (
                <div className="hero-fallback">
                  <div className="hero-fallback-row">
                    <Clock3 size={16} />
                    <span>
                      {daysSinceLast === 0
                        ? t('Este é o plantão de hoje.', 'This is today’s shift.')
                        : t(
                            `${daysSinceLast} ${daysSinceLast === 1 ? 'dia' : 'dias'} desde o último plantão — cadastre o próximo para retomar a contagem regressiva.`,
                            `${daysSinceLast} ${daysSinceLast === 1 ? 'day' : 'days'} since the last shift — add the next one to resume the countdown.`,
                          )}
                    </span>
                  </div>
                  <div className="row gap-8 wrap">
                    <button className="btn btn-gold btn-sm" onClick={onNewShift}>
                      <CalendarPlus /> {t('Adicionar plantão', 'Add shift')}
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ color: '#cfe9e6' }} onClick={onGoCalendar}>
                      {t('Ver escala', 'Open roster')} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="hero-person" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              <div className="hero-name" style={{ fontSize: '1.6rem' }}>{t('Nenhum plantão cadastrado', 'No shifts yet')}</div>
              <p style={{ color: '#a9c8c5', fontSize: 13, maxWidth: 340 }}>
                {t('Comece cadastrando o primeiro plantão da equipe.', 'Start by adding the first shift for the team.')}
              </p>
              <button className="btn btn-gold btn-sm" onClick={onNewShift}>
                <CalendarPlus /> {t('Adicionar plantão', 'Add shift')}
              </button>
            </div>
          )}
        </div>
        <div className="hero-strip">
          <div className="hero-strip-item">
            <span className="hero-strip-value">{monthShifts.length}</span>
            <span className="hero-strip-label">{t('plantões no mês', 'shifts this month')}</span>
          </div>
          <div className="hero-strip-item">
            <span className="hero-strip-value">{swaps.length}</span>
            <span className="hero-strip-label">{t('trocas registradas', 'recorded swaps')}</span>
          </div>
          <div className="hero-strip-item">
            <span className="hero-strip-value">{pendingPayments.length}</span>
            <span className="hero-strip-label">{t('pagamentos a definir', 'payments pending')}</span>
          </div>
        </div>
        <div className="hero-ring" aria-hidden="true">
          {heroShift?.period.startsWith('Noturno') ? <Moon /> : <AlarmClock />}
        </div>
        {nextPalette && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(600px 300px at 10% 120%, ${nextPalette.from}22, transparent 65%)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </motion.section>

      <motion.section className="col-5 stack gap-16" {...fadeUp} transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-head">
            <div>
              <div className="card-title">{t('Resumo de', 'Summary of')} {monthLabel(month, lang)}</div>
              <div className="card-sub">{t('Dados vindos do APK original, sem perdas.', 'Data carried over from the original APK, nothing lost.')}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={onGoCalendar}>
              {t('Ver escala', 'Open roster')} <ArrowRight size={14} />
            </button>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            {stats.map((stat) => (
              <div className={`stat${stat.accent ? ' accent' : ''}`} key={stat.label}>
                <div className="stat-icon">{stat.icon}</div>
                <div className="stat-label">{stat.label}</div>
                <div className="stat-value">{stat.value}</div>
                <small>{stat.sub}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="card weather-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="card-title">{t('Clima no Rio', 'Rio weather')}</div>
              <div className="card-sub">
                {t('Open-Meteo · integração original preservada', 'Open-Meteo · original integration preserved')}
              </div>
            </div>
            <button className="icon-btn sm" onClick={() => void refreshWeather()} aria-label={t('Atualizar clima', 'Refresh weather')}>
              <CloudSun />
            </button>
          </div>
          {weather ? (
            <div className="weather-main">
              <div className="weather-icon">
                <CloudSun />
              </div>
              <div>
                <div className="weather-temp">{Math.round(weather.temperature)}°C</div>
                <div className="small muted">{weather.description}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div className="badge">
                  <Wind size={12} /> {Math.round(weather.windSpeed)} km/h
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  {weatherStatus === 'degraded' ? t('cache (offline)', 'cached (offline)') : t('agora', 'now')}
                </div>
              </div>
            </div>
          ) : (
            <div className="banner">
              <CloudSun />
              <div className="grow">{t('Clima indisponível — a escala não é afetada.', 'Weather unavailable — the roster is unaffected.')}</div>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section className="card col-4" {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }}>
        <div className="card-head">
          <div>
            <div className="card-title">{t('Distribuição da equipe', 'Team distribution')}</div>
            <div className="card-sub">{t('plantões por pessoa no mês', 'shifts per person this month')}</div>
          </div>
          <span className="badge brand">{monthShifts.length}</span>
        </div>
        <div className="team-strip">
          {perPerson.length === 0 && <EmptyState icon={<CalendarDays />} title={t('Sem plantões no mês', 'No shifts this month')} />}
          {perPerson.map(([name, count]) => {
            const palette = paletteFor(boot?.collaborators.find((c) => c.name === name)?.colorHex);
            const max = leader?.[1] || 1;
            return (
              <div className="team-row" key={name}>
                <Avatar name={name} color={palette.token} char={boot?.collaborators.find((c) => c.name === name)?.avatarChar} size="sm" />
                <div className="grow">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className="team-row-name">{name}</span>
                    <span className="small muted mono">{count}</span>
                  </div>
                  <div className="team-bar">
                    <span style={{ width: `${Math.max(8, (count / max) * 100)}%`, background: `linear-gradient(90deg, ${palette.from}, ${palette.to})` }} />
                  </div>
                </div>
              </div>
            );
          })}
          {leader && (
            <div className="banner info" style={{ marginTop: 6 }}>
              <Sparkles />
              <div className="grow small">
                {t('Líder do mês', 'Leader of the month')}: <strong>{leader[0]}</strong> · {leader[1]} {t('plantões', 'shifts')}
              </div>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section className="card col-4" {...fadeUp} transition={{ duration: 0.5, delay: 0.14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">{t('Conformidade da escala', 'Roster compliance')}</div>
            <div className="card-sub">{t('12x36 e interjornada de 11h', '12x36 and 11h inter-shift rest')}</div>
          </div>
          <span className={`badge ${conflicts.length ? 'warning' : 'success'}`}>
            {conflicts.length ? `${conflicts.length}` : <CheckCircle2 size={12} />}
            {t(' alertas', ' alerts')}
          </span>
        </div>
        <div className="stack gap-10">
          <div className="rule-card">
            <div className="rule-icon"><Clock3 /></div>
            <div>
              <div className="strong" style={{ fontSize: 12.5 }}>{t('Regra 12x36', '12x36 rule')}</div>
              <div className="hint">{t('12 horas de trabalho e 36 horas de descanso ininterruptas.', '12 working hours followed by 36 uninterrupted resting hours.')}</div>
            </div>
          </div>
          <div className="rule-card">
            <div className="rule-icon"><ShieldAlert /></div>
            <div>
              <div className="strong" style={{ fontSize: 12.5 }}>{t('Interjornada (Art. 66 CLT)', 'Inter-shift rest (CLT Art. 66)')}</div>
              <div className="hint">{t('Descanso mínimo de 11 horas consecutivas entre plantões.', 'Minimum of 11 consecutive hours between shifts.')}</div>
            </div>
          </div>
          {conflicts.slice(0, 3).map((conflict, index) => (
            <div className={`alert ${conflict.severity === 'error' ? 'danger' : 'warning'}`} key={`${conflict.type}-${index}`}>
              <ShieldAlert />
              <div>{conflict.message}</div>
            </div>
          ))}
          {conflicts.length === 0 && (
            <div className="alert success">
              <CheckCircle2 />
              <div>{t('Nenhum conflito detectado na escala atual.', 'No conflicts detected in the current roster.')}</div>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section className="card col-4" {...fadeUp} transition={{ duration: 0.5, delay: 0.18 }}>
        <div className="card-head">
          <div>
            <div className="card-title">
              {upcoming.length > 0 ? t('Próximos plantões', 'Upcoming shifts') : t('Plantões recentes', 'Recent shifts')}
            </div>
            <div className="card-sub">{t('toque para editar', 'tap to edit')}</div>
          </div>
          <button className="icon-btn sm" onClick={onGoCalendar} aria-label={t('Abrir escala', 'Open roster')}>
            <ArrowRight />
          </button>
        </div>
        {upcomingList.length === 0 ? (
          <EmptyState icon={<CalendarPlus />} title={t('Agenda livre', 'Nothing scheduled')} description={t('Adicione um plantão para começar.', 'Add a shift to get started.')} />
        ) : (
          <div className="stack gap-8">
            {upcomingList.map((shift) => {
              const palette = paletteFor(boot?.collaborators.find((c) => c.name === shift.onShift)?.colorHex);
              return (
                <button key={shift.id} className="list-row" onClick={() => onOpenShift(shift)} style={{ textAlign: 'left' }}>
                  <Avatar name={shift.onShift} color={palette.token} char={boot?.collaborators.find((c) => c.name === shift.onShift)?.avatarChar} size="sm" />
                  <div className="list-row-main">
                    <div className="list-row-title">{shift.onShift}</div>
                    <div className="list-row-sub">
                      <span>{formatDateBR(shift.date, lang)}</span>
                      <span>{shift.period}</span>
                    </div>
                  </div>
                  <span className={`badge ${shift.paymentDate ? 'success' : 'outline'}`}>
                    {shift.paymentDate ? <Wallet size={11} /> : <Clock3 size={11} />}
                    {shift.paymentDate ? formatDateBR(shift.paymentDate, lang).slice(0, 5) : t('a definir', 'pending')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </motion.section>

      <motion.section className="card col-8" {...fadeUp} transition={{ duration: 0.5, delay: 0.22 }}>
        <div className="card-head">
          <div>
            <div className="card-title">{t('Ações rápidas', 'Quick actions')}</div>
            <div className="card-sub">{t('fluxo do plantão em um toque', 'one-tap shift workflow')}</div>
          </div>
        </div>
        <div className="row gap-8 wrap">
          {boot?.permissions.canEdit ? (
            <>
              <button className="btn btn-primary" onClick={onNewShift}>
                <CalendarPlus /> {t('Novo plantão', 'New shift')}
              </button>
              <button className="btn btn-outline" onClick={onNewOffDay}>
                <Palmtree /> {t('Nova folga', 'New off-day')}
              </button>
            </>
          ) : (
            <button className="btn btn-outline" onClick={onGoCalendar}>
              <CalendarDays /> {t('Ver escala completa', 'Open full roster')}
            </button>
          )}
          <button className="btn btn-outline" onClick={onGoReports}>
            <FileBarChart /> {t('Relatório e PDF', 'Report & PDF')}
          </button>
          <button className="btn btn-outline" onClick={() => void sendNotification()}>
            <BellRing /> {t('Testar alerta', 'Test alert')}
          </button>
          {user?.role === 'admin' && (
            <button className="btn btn-soft" onClick={onGoApprovals}>
              <ShieldAlert /> {t('Aprovações', 'Approvals')}
              {(boot?.pendingApprovals || 0) > 0 && <span className="badge gold" style={{ marginLeft: 4 }}>{boot?.pendingApprovals}</span>}
            </button>
          )}
        </div>
        {myCycle && myCycle.person === user?.name && (
          <div className="banner" style={{ marginTop: 16 }}>
            <Clock3 />
            <div className="grow">
              {t('Seu ciclo', 'Your cycle')}: {myCycle.last ? `${t('último plantão', 'last shift')} ${formatDateBR(myCycle.last.date, lang)}` : t('sem plantão anterior', 'no previous shift')} ·{' '}
              {myCycle.next ? `${t('próximo', 'next')} ${formatDateBR(myCycle.next.date, lang)}` : t('sem próximo plantão', 'no upcoming shift')}
            </div>
          </div>
        )}
      </motion.section>

      <div className="col-4">
        <InstallCard compact />
      </div>

      <section className="card col-12" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row wrap" style={{ gap: 16, padding: 18, justifyContent: 'space-between' }}>
          <div>
            <div className="card-title">{t('Origem dos dados', 'Data provenance')}</div>
            <div className="card-sub">{boot?.legacy?.note}</div>
          </div>
          <div className="row gap-8 wrap">
            <span className="badge outline">{t('Fonte', 'Source')}: {boot?.legacy?.source || 'APK v1.0'}</span>
            <span className="badge success">
              <CheckCircle2 size={12} /> {boot?.legacy?.counts?.shifts ?? 6} {t('plantões', 'shifts')}
            </span>
            <span className="badge success">
              <CheckCircle2 size={12} /> {boot?.legacy?.counts?.offDays ?? 2} {t('folgas', 'off-days')}
            </span>
            <span className="badge success">
              <CheckCircle2 size={12} /> {boot?.legacy?.counts?.collaborators ?? 4} {t('plantonistas', 'members')}
            </span>
          </div>
        </div>
      </section>

      <style>{`
        .gap-10 { gap: 10px; }
      `}</style>
    </div>
  );
}
