import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  CalendarDays,
  Clock3,
  Mail,
  Pencil,
  Phone,
  Plus,
  Repeat2,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { Avatar, EmptyState, useConfirm, useToast } from '../components/ui';
import { MemberForm } from '../components/MemberForm';
import { daysUntil, formatDateBR } from '../lib/calendar';
import { paletteFor } from '../lib/colors';
import type { Collaborator } from '../types';

export function TeamPage() {
  const { boot, month, archiveCollaborator } = useApp();
  const { lang, t } = useLang();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collaborator | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const collaborators = useMemo(
    () => (boot?.collaborators || []).filter((c) => (showArchived ? true : !c.deletedAt)),
    [boot, showArchived],
  );
  const canEdit = Boolean(boot?.permissions.canEdit);

  const statsFor = (name: string) => {
    const shifts = (boot?.shifts || []).filter((s) => !s.deletedAt && s.onShift === name);
    const monthShifts = shifts.filter((s) => s.date.startsWith(month) && s.status !== 'cancelado');
    const pending = monthShifts.filter((s) => !s.paymentDate);
    const swaps = monthShifts.filter((s) => s.swapForDate);
    const offs = (boot?.offDays || []).filter((o) => !o.deletedAt && o.name === name && o.date.startsWith(month));
    const cycle = boot?.cycles.find((c) => c.person === name);
    return { shifts, monthShifts, pending, swaps, offs, cycle };
  };

  const handleArchive = async (member: Collaborator) => {
    const ok = await confirm({
      title: t(`Arquivar ${member.name}?`, `Archive ${member.name}?`),
      message: t(
        'O plantonista sai da lista ativa, mas todos os plantões e folgas continuam salvos e visíveis no histórico e nos relatórios mensais.',
        'The member leaves the active list, but all shifts and off-days remain saved and visible in history and monthly reports.',
      ),
      confirmLabel: t('Arquivar', 'Archive'),
      tone: 'danger',
    });
    if (!ok) return;
    await archiveCollaborator(member.id);
  };

  return (
    <div className="stack gap-18">
      <div className="row wrap gap-12" style={{ justifyContent: 'space-between' }}>
        <div className="row gap-10">
          <div className="month-summary">
            <div className="summary-pill">
              <span className="v">{collaborators.filter((c) => !c.deletedAt).length}</span>
              <span className="l">{t('Ativos', 'Active')}</span>
            </div>
            <div className="summary-pill">
              <span className="v">{(boot?.collaborators || []).filter((c) => c.deletedAt).length}</span>
              <span className="l">{t('Arquivados', 'Archived')}</span>
            </div>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => setShowArchived((current) => !current)}>
            <Archive /> {showArchived ? t('Ocultar arquivados', 'Hide archived') : t('Mostrar arquivados', 'Show archived')}
          </button>
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> {t('Novo integrante', 'New member')}
            </button>
          )}
        </div>
      </div>

      {collaborators.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users />}
            title={t('Nenhum plantonista', 'No members yet')}
            description={t('Adicione o primeiro integrante da equipe para montar a escala.', 'Add the first team member to build the roster.')}
          />
        </div>
      ) : (
        <div className="dashboard-grid">
          {collaborators.map((member, index) => {
            const palette = paletteFor(member.colorHex);
            const stats = statsFor(member.name);
            return (
              <motion.article
                key={member.id}
                className="card col-4"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <div className="row gap-12">
                  <Avatar
                    name={member.name}
                    color={member.colorHex}
                    char={member.avatarChar}
                    size="lg"
                    title={member.name}
                  />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row gap-8 wrap">
                      <span className="strong" style={{ fontSize: 15 }}>{member.name}</span>
                      {member.deletedAt && <span className="badge danger">{t('Arquivado', 'Archived')}</span>}
                    </div>
                    <div className="small muted">{member.specialty || t('Plantonista', 'Team member')}</div>
                    <div className="row gap-8 tiny muted" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                      {member.phone && (
                        <span className="row gap-4">
                          <Phone size={11} /> {member.phone}
                        </span>
                      )}
                      {member.legacyId && <span className="badge outline">#{member.legacyId}</span>}
                    </div>
                  </div>
                  {canEdit && !member.deletedAt && (
                    <div className="stack gap-4">
                      <button
                        className="icon-btn sm"
                        onClick={() => {
                          setEditing(member);
                          setFormOpen(true);
                        }}
                        aria-label={t('Editar', 'Edit')}
                      >
                        <Pencil />
                      </button>
                      <button className="icon-btn sm danger" onClick={() => void handleArchive(member)} aria-label={t('Arquivar', 'Archive')}>
                        <Archive />
                      </button>
                    </div>
                  )}
                </div>

                <div className="row gap-8 wrap">
                  <span className="badge brand">
                    <CalendarDays size={11} /> {stats.monthShifts.length} {t('no mês', 'this month')}
                  </span>
                  <span className="badge">
                    <Repeat2 size={11} /> {stats.swaps.length} {t('trocas', 'swaps')}
                  </span>
                  <span className={`badge ${stats.pending.length ? 'gold' : 'success'}`}>
                    <Wallet size={11} /> {stats.pending.length ? `${stats.pending.length} ${t('a pagar', 'to pay')}` : t('pago', 'paid')}
                  </span>
                </div>

                <div className="stack gap-6">
                  <div className="row gap-8 small">
                    <Clock3 size={13} style={{ color: 'var(--ink-3)' }} />
                    <span className="muted">{t('Ciclo', 'Cycle')}:</span>
                    <span className="grow" style={{ textAlign: 'right' }}>
                      {stats.cycle?.last ? formatDateBR(stats.cycle.last.date, lang) : '—'} →{' '}
                      {stats.cycle?.next ? formatDateBR(stats.cycle.next.date, lang) : '—'}
                    </span>
                  </div>
                  {stats.cycle?.next && (
                    <div className="hint">
                      {daysUntil(stats.cycle.next.date) === 0
                        ? t('Plantão hoje', 'Shift today')
                        : t(`Próximo em ${daysUntil(stats.cycle.next.date)} dia(s)`, `Next in ${daysUntil(stats.cycle.next.date)} day(s)`)}
                      {' · '}
                      {stats.cycle.next.period}
                    </div>
                  )}
                  <div style={{ height: 1, background: 'var(--line)', margin: '2px 0' }} />
                  <div className="row gap-8 tiny muted" style={{ justifyContent: 'space-between' }}>
                    <span>{t('Total histórico', 'All-time shifts')}: {stats.shifts.length}</span>
                    <span>{t('Folgas no mês', 'Off-days this month')}: {stats.offs.length}</span>
                  </div>
                </div>

                <div className="row gap-6" style={{ marginTop: 'auto' }}>
                  <span className="badge outline" style={{ background: palette.soft, color: palette.ink, borderColor: 'transparent' }}>
                    {palette.label}
                  </span>
                  {member.deletedAt && <span className="tiny muted">{t('Histórico preservado', 'History preserved')}</span>}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t('Como a equipe é usada', 'How the team is used')}</div>
            <div className="card-sub">{t('regras aplicadas automaticamente', 'rules applied automatically')}</div>
          </div>
          <Sparkles size={16} />
        </div>
        <div className="dashboard-grid" style={{ gap: 12 }}>
          {[
            {
              title: t('Um plantão por dia', 'One shift per day'),
              text: t('Cada plantonista só pode ter um plantão por data — o app bloqueia duplicidade.', 'Each person can hold only one shift per date — duplicates are blocked.'),
            },
            {
              title: t('12x36 monitorado', '12x36 monitored'),
              text: t('Plantões em dias consecutivos geram alerta de descanso abaixo de 36h.', 'Shifts on consecutive days raise a sub-36h rest warning.'),
            },
            {
              title: t('Exclusão reversível', 'Reversible deletion'),
              text: t('Arquivar ou remover nunca apaga dados: tudo fica no histórico e no log de auditoria.', 'Archiving or deleting never erases data: everything stays in history and audit logs.'),
            },
          ].map((rule) => (
            <div className="col-4" key={rule.title}>
              <div className="rule-card">
                <div className="rule-icon">
                  <Users size={16} />
                </div>
                <div>
                  <div className="strong" style={{ fontSize: 12.5 }}>{rule.title}</div>
                  <div className="hint">{rule.text}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="banner" style={{ marginTop: 14 }}>
          <Mail />
          <div className="grow">
            {t('Novos acessos entram pelo cadastro e precisam de aprovação do administrador antes de editar a escala.', 'New access requests are created at signup and require admin approval before editing the roster.')}
          </div>
          {boot?.pendingApprovals ? (
            <button className="btn btn-sm btn-soft" onClick={() => toast('info', t('Aprovações', 'Approvals'), t('Abra o menu Aprovações para revisar.', 'Open the Approvals menu to review.'))}>
              {boot.pendingApprovals} {t('pendente(s)', 'pending')}
            </button>
          ) : null}
        </div>
      </div>

      <MemberForm open={formOpen} onClose={() => setFormOpen(false)} member={editing} />
    </div>
  );
}
