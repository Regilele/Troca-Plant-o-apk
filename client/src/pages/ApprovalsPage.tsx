import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpDown,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  History,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { Avatar, EmptyState, Modal, Field, useConfirm, useToast } from '../components/ui';
import type { AuditEntry, User } from '../types';

const ACTION_LABEL: Record<string, { pt: string; en: string }> = {
  signup_requested: { pt: 'solicitou cadastro', en: 'requested access' },
  approve: { pt: 'aprovou acesso', en: 'approved access' },
  reject: { pt: 'recusou solicitação', en: 'rejected request' },
  set_status: { pt: 'alterou status', en: 'changed status' },
  reset_password: { pt: 'redefiniu a senha', en: 'reset password' },
  login: { pt: 'entrou no app', en: 'signed in' },
  logout: { pt: 'saiu do app', en: 'signed out' },
  guest_login: { pt: 'entrou como convidado', en: 'signed in as guest' },
  create: { pt: 'criou registro', en: 'created record' },
  update: { pt: 'atualizou registro', en: 'updated record' },
  soft_delete: { pt: 'removeu registro', en: 'removed record' },
  restore: { pt: 'restaurou registro', en: 'restored record' },
  import: { pt: 'importou dados', en: 'imported data' },
  export: { pt: 'exportou backup', en: 'exported backup' },
  backup: { pt: 'criou backup', en: 'created backup' },
  seed: { pt: 'migrou dados do APK', en: 'migrated APK data' },
  integration_sync: { pt: 'sincronizou integração', en: 'synced integration' },
  change_password: { pt: 'alterou a senha', en: 'changed password' },
};

export function ApprovalsPage() {
  const { boot, user, approveUser, rejectUser, setUserStatus, setUserRole, resetUserPassword, audit } = useApp();
  const { lang, t } = useLang();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<User | null>(null);
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [collaboratorId, setCollaboratorId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ users: list }, entries] = await Promise.all([
        fetch('/api/admin/users', { headers: { 'x-requested-with': 'rgsa-plantao' }, credentials: 'include' }).then((r) => r.json()),
        audit(60),
      ]);
      setUsers(list || []);
      setLogs(entries);
    } catch {
      toast('error', t('Não foi possível carregar aprovações', 'Could not load approvals'));
    } finally {
      setLoading(false);
    }
  }, [audit, t, toast]);

  useEffect(() => {
    void load();
  }, [load, boot?.pendingApprovals]);

  const pending = useMemo(() => users.filter((u) => u.status === 'pending'), [users]);
  const others = useMemo(
    () => users.filter((u) => u.status !== 'pending').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [users],
  );

  const openApprove = (candidate: User) => {
    setTarget(candidate);
    setRole('member');
    setCollaboratorId('');
  };

  const doApprove = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await approveUser(target.id!, role, collaboratorId ? Number(collaboratorId) : null);
      setTarget(null);
      await load();
    } catch (error) {
      toast('error', t('Falha ao aprovar', 'Approval failed'), (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejecting) return;
    setBusy(true);
    try {
      await rejectUser(rejecting.id!, reason);
      setRejecting(null);
      setReason('');
      await load();
    } catch (error) {
      toast('error', t('Falha ao recusar', 'Rejection failed'), (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) {
      toast('warning', t('Senha curta', 'Password too short'), t('Use pelo menos 8 caracteres.', 'Use at least 8 characters.'));
      return;
    }
    setBusy(true);
    try {
      await resetUserPassword(resetTarget.id!, newPassword);
      setResetTarget(null);
      setNewPassword('');
    } catch (error) {
      toast('error', t('Falha ao redefinir', 'Reset failed'), (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSuspend = async (candidate: User) => {
    const next = candidate.status === 'suspended' ? 'approved' : 'suspended';
    const ok = await confirm({
      title: next === 'suspended' ? t('Suspender acesso?', 'Suspend access?') : t('Reativar acesso?', 'Reactivate access?'),
      message:
        next === 'suspended'
          ? t(
              `${candidate.name} perderá o acesso imediatamente. A escala e os registros dele continuam intactos.`,
              `${candidate.name} loses access immediately. Their roster records stay intact.`,
            )
          : t(`${candidate.name} poderá entrar novamente na escala.`, `${candidate.name} will be able to sign in again.`),
      confirmLabel: next === 'suspended' ? t('Suspender', 'Suspend') : t('Reativar', 'Reactivate'),
      tone: next === 'suspended' ? 'danger' : 'primary',
    });
    if (!ok) return;
    await setUserStatus(candidate.id!, next);
    await load();
  };

  const toggleRole = async (candidate: User) => {
    const next = candidate.role === 'admin' ? 'member' : 'admin';
    const ok = await confirm({
      title: next === 'admin' ? t('Promover a administrador?', 'Promote to admin?') : t('Rebaixar para plantonista?', 'Change to member?'),
      message:
        next === 'admin'
          ? t(
              `${candidate.name} poderá aprovar cadastros, ver auditoria e rodar integrações.`,
              `${candidate.name} will be able to approve signups, view the audit trail and run integrations.`,
            )
          : t(
              `${candidate.name} perde os poderes administrativos, mas mantém o acesso à escala.`,
              `${candidate.name} loses admin powers but keeps roster access.`,
            ),
      confirmLabel: next === 'admin' ? t('Promover', 'Promote') : t('Confirmar', 'Confirm'),
      tone: 'primary',
    });
    if (!ok) return;
    try {
      await setUserRole(candidate.id!, next);
      await load();
    } catch (error) {
      toast('error', t('Não foi possível alterar o papel', 'Could not change role'), (error as Error).message);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'approved') return <span className="badge success"><CheckCircle2 size={11} /> {t('Ativo', 'Active')}</span>;
    if (status === 'pending') return <span className="badge warning"><Clock3 size={11} /> {t('Pendente', 'Pending')}</span>;
    if (status === 'rejected') return <span className="badge danger"><UserX size={11} /> {t('Recusado', 'Rejected')}</span>;
    return <span className="badge danger">{t('Suspenso', 'Suspended')}</span>;
  };

  if (user?.role !== 'admin') {
    return (
      <div className="card">
        <EmptyState icon={<ShieldCheck />} title={t('Área do administrador', 'Admin area')} description={t('Somente administradores aprovam cadastros.', 'Only admins approve accounts.')} />
      </div>
    );
  }

  return (
    <div className="stack gap-18">
      <div className="month-summary">
        <div className="summary-pill" style={{ background: 'var(--warning-soft)', borderColor: 'rgba(154,103,0,0.25)' }}>
          <span className="v">{pending.length}</span>
          <span className="l">{t('Aguardando', 'Pending')}</span>
        </div>
        <div className="summary-pill">
          <span className="v">{users.filter((u) => u.status === 'approved').length}</span>
          <span className="l">{t('Ativos', 'Active')}</span>
        </div>
        <div className="summary-pill">
          <span className="v">{users.filter((u) => u.role === 'admin').length}</span>
          <span className="l">{t('Admins', 'Admins')}</span>
        </div>
        <div className="summary-pill">
          <span className="v">{logs.length}</span>
          <span className="l">{t('Eventos recentes', 'Recent events')}</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t('Solicitações de cadastro', 'Access requests')}</div>
            <div className="card-sub">
              {t('Fluxo novo: o cadastro só entra na escala depois da sua aprovação.', 'New flow: accounts join the roster only after your approval.')}
            </div>
          </div>
          <span className="badge warning">
            <Clock3 size={12} /> {pending.length}
          </span>
        </div>

        {loading ? (
          <div className="stack gap-8">
            <div className="skeleton" style={{ height: 74 }} />
            <div className="skeleton" style={{ height: 74 }} />
          </div>
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<UserCheck />}
            title={t('Nenhuma solicitação pendente', 'No pending requests')}
            description={t('Quando alguém criar cadastro, aparece aqui para aprovação.', 'When someone signs up, their request appears here for approval.')}
          />
        ) : (
          <div className="stack gap-12">
            {pending.map((candidate, index) => (
              <motion.div
                className="request-card"
                key={candidate.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="request-head">
                  <Avatar name={candidate.name} color="bg-amber-600" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row gap-8 wrap">
                      <span className="strong">{candidate.name}</span>
                      {statusBadge(candidate.status)}
                    </div>
                    <div className="request-meta">
                      <span className="row gap-4"><Mail size={11} /> {candidate.email}</span>
                      {candidate.phone && <span className="row gap-4"><Phone size={11} /> {candidate.phone}</span>}
                      <span>{candidate.specialty || t('Sem cargo informado', 'No role given')}</span>
                    </div>
                  </div>
                </div>
                <div className="request-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => openApprove(candidate)}>
                    <Check /> {t('Aprovar acesso', 'Approve')}
                  </button>
                  <button
                    className="btn btn-sm btn-danger-soft"
                    onClick={() => {
                      setRejecting(candidate);
                      setReason('');
                    }}
                  >
                    <UserX /> {t('Recusar', 'Reject')}
                  </button>
                  <span className="tiny muted" style={{ alignSelf: 'center' }}>
                    {t('Criado em', 'Created at')} {candidate.createdAt ? new Date(candidate.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR') : '—'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="card col-7" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row wrap" style={{ padding: '16px 18px', justifyContent: 'space-between' }}>
            <div>
              <div className="card-title">{t('Todos os acessos', 'All accounts')}</div>
              <div className="card-sub">{t('aprovados, suspensos e recusados', 'approved, suspended and rejected')}</div>
            </div>
            <Users size={16} />
          </div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Pessoa', 'Person')}</th>
                  <th>{t('Papel', 'Role')}</th>
                  <th>{t('Status', 'Status')}</th>
                  <th>{t('Último acesso', 'Last login')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {others.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <div className="row gap-8">
                        <Avatar name={candidate.name} color={candidate.role === 'admin' ? 'bg-indigo-600' : 'bg-teal-600'} size="sm" />
                        <div>
                          <div className="cell-strong">{candidate.name}</div>
                          <div className="cell-sub">{candidate.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${candidate.role === 'admin' ? 'gold' : 'outline'}`}>
                        {candidate.role === 'admin' ? t('Administrador', 'Admin') : t('Plantonista', 'Member')}
                      </span>
                    </td>
                    <td>{statusBadge(candidate.status)}</td>
                    <td className="cell-sub">
                      {candidate.lastLoginAt ? new Date(candidate.lastLoginAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR') : '—'}
                    </td>
                    <td>
                      <div className="row gap-6" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="icon-btn sm"
                          title={t('Redefinir senha', 'Reset password')}
                          aria-label={t('Redefinir senha', 'Reset password')}
                          onClick={() => setResetTarget(candidate)}
                        >
                          <KeyRound />
                        </button>
                        {candidate.id !== user?.id && (
                          <button
                            className="icon-btn sm"
                            title={candidate.role === 'admin' ? t('Tornar plantonista', 'Make member') : t('Tornar administrador', 'Make admin')}
                            aria-label={candidate.role === 'admin' ? t('Tornar plantonista', 'Make member') : t('Tornar administrador', 'Make admin')}
                            onClick={() => void toggleRole(candidate)}
                          >
                            <ArrowUpDown />
                          </button>
                        )}
                        {candidate.id !== user?.id && candidate.role !== 'admin' && (
                          <button
                            className={`icon-btn sm${candidate.status === 'suspended' ? '' : ' danger'}`}
                            title={candidate.status === 'suspended' ? t('Reativar', 'Reactivate') : t('Suspender', 'Suspend')}
                            aria-label={candidate.status === 'suspended' ? t('Reativar', 'Reactivate') : t('Suspender', 'Suspend')}
                            onClick={() => void toggleSuspend(candidate)}
                          >
                            {candidate.status === 'suspended' ? <BadgeCheck /> : <UserX />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card col-5">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Histórico de auditoria', 'Audit trail')}</div>
              <div className="card-sub">{t('quem fez o quê, e quando', 'who did what, and when')}</div>
            </div>
            <History size={16} />
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {logs.length === 0 && <EmptyState icon={<History />} title={t('Sem eventos', 'No events')} />}
            {logs.map((entry) => {
              const label = ACTION_LABEL[entry.action] || { pt: entry.action, en: entry.action };
              return (
                <div className="audit-row" key={entry.id}>
                  <span className="audit-dot" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong>{entry.actorEmail || t('Sistema', 'System')}</strong> {lang === 'en' ? label.en : label.pt}
                      {entry.entityId ? ` #${entry.entityId}` : ''}
                    </div>
                    <div className="audit-when">
                      {new Date(entry.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR')} · {entry.entity}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="alert info">
        <AlertTriangle />
        <div>
          {t(
            'Recusar ou suspender nunca apaga plantões: o histórico da escala e os relatórios continuam íntegros. E-mails de aprovação são simulados nesta prévia — nada é enviado a produção.',
            'Rejecting or suspending never deletes shifts: roster history and reports remain intact. Approval e-mails are simulated in this preview — nothing is sent to production.',
          )}
        </div>
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={t('Aprovar cadastro', 'Approve account')}
        subtitle={target ? `${target.name} · ${target.email}` : undefined}
        icon={<UserCheck />}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setTarget(null)}>
              {t('Cancelar', 'Cancel')}
            </button>
            <button className="btn btn-primary" onClick={() => void doApprove()} disabled={busy}>
              {busy ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <Check />} {t('Aprovar', 'Approve')}
            </button>
          </>
        }
      >
        <div className="stack gap-16">
          <Field label={t('Papel no app', 'Role in the app')}>
            <select className="select" value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'member')}>
              <option value="member">{t('Plantonista (edita a escala)', 'Member (edits the roster)')}</option>
              <option value="admin">{t('Administrador (aprova acessos e integrações)', 'Administrator (approves access and integrations)')}</option>
            </select>
          </Field>
          <Field
            label={t('Vincular a um plantonista (opcional)', 'Link to a team member (optional)')}
            hint={t('O vínculo liga a conta ao nome que aparece no calendário.', 'The link ties the account to the name shown in the calendar.')}
          >
            <select className="select" value={collaboratorId} onChange={(event) => setCollaboratorId(event.target.value)}>
              <option value="">{t('Não vincular agora', 'Do not link now')}</option>
              {(boot?.collaborators || []).filter((c) => !c.deletedAt).map((collaborator) => (
                <option key={collaborator.id} value={collaborator.id}>
                  {collaborator.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="alert info">
            <ShieldCheck />
            <div>{t('A aprovação é registrada no histórico com o seu usuário e data/hora.', 'The approval is written to the audit trail with your user and timestamp.')}</div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={t('Recusar solicitação', 'Reject request')}
        subtitle={rejecting?.email}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRejecting(null)}>
              {t('Cancelar', 'Cancel')}
            </button>
            <button className="btn btn-danger" onClick={() => void doReject()} disabled={busy}>
              {t('Recusar', 'Reject')}
            </button>
          </>
        }
      >
        <Field label={t('Motivo (aparece para o solicitante)', 'Reason (shown to the requester)')}>
          <textarea
            className="textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('Ex.: procure a coordenação para validar seu registro.', 'e.g. contact the coordination to validate your licence.')}
            maxLength={300}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={t('Redefinir senha', 'Reset password')}
        subtitle={resetTarget?.email}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setResetTarget(null)}>
              {t('Cancelar', 'Cancel')}
            </button>
            <button className="btn btn-primary" onClick={() => void doReset()} disabled={busy}>
              <KeyRound /> {t('Redefinir', 'Reset')}
            </button>
          </>
        }
      >
        <Field label={t('Nova senha', 'New password')} hint={t('Mínimo de 8 caracteres. As sessões antigas são encerradas.', 'At least 8 characters. Old sessions are closed.')}>
          <input
            className="input"
            type="text"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>
      </Modal>
    </div>
  );
}
