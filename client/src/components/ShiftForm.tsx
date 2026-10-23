import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  Loader2,
  Repeat2,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Modal, Field, useConfirm, useToast } from './ui';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { formatDateBR, monthLabel } from '../lib/calendar';
import type { Shift } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  shift?: Shift | null;
  initialDate?: string | null;
  onSaved?: () => void;
}

const EMPTY: Partial<Shift> = {
  date: '',
  onShift: '',
  period: 'Diurno (12h)',
  swapForDate: null,
  paymentDate: null,
  atHome: '-x-',
  status: 'confirmado',
  notes: '',
};

export function ShiftForm({ open, onClose, shift, initialDate, onSaved }: Props) {
  const { boot, saveShift, deleteShift } = useApp();
  const { t, lang } = useLang();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<Partial<Shift>>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collaborators = useMemo(() => (boot?.collaborators || []).filter((c) => !c.deletedAt), [boot]);
  const periods = boot?.options.periods || ['Diurno (12h)', 'Noturno (12h)'];
  const isEdit = Boolean(shift?.id);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (shift) {
      setForm({
        date: shift.date,
        onShift: shift.onShift,
        period: shift.period,
        swapForDate: shift.swapForDate,
        paymentDate: shift.paymentDate,
        atHome: shift.atHome || '-x-',
        status: shift.status,
        notes: shift.notes || '',
      });
    } else {
      setForm({
        ...EMPTY,
        date: initialDate || new Date().toISOString().slice(0, 10),
        onShift: collaborators[0]?.name || '',
        period: periods[0],
      });
    }
  }, [open, shift, initialDate, collaborators, periods]);

  const selected = collaborators.find((c) => c.name === form.onShift);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError(null);
    if (!form.date || !form.onShift) {
      setError(t('Informe a data do turno e o plantonista.', 'Choose the shift date and the person on duty.'));
      return;
    }
    setBusy(true);
    try {
      await saveShift(
        {
          date: form.date,
          onShift: form.onShift,
          collaboratorId: selected?.id ?? null,
          period: form.period,
          swapForDate: form.swapForDate || null,
          paymentDate: form.paymentDate || null,
          atHome: form.atHome || null,
          status: form.status,
          notes: form.notes || null,
        },
        shift?.id,
      );
      onSaved?.();
      onClose();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'rule_warnings') {
        const proceed = await confirm({
          title: t('Atenção às regras de escala', 'Schedule rules warning'),
          message: t(
            'Este plantão gera um alerta de conformidade. Nada foi salvo ainda.',
            'This shift raises a compliance warning. Nothing has been saved yet.',
          ),
          details: apiError.warnings,
          confirmLabel: t('Salvar mesmo assim', 'Save anyway'),
          tone: 'danger',
        });
        if (proceed) {
          try {
            await saveShift(
              {
                date: form.date,
                onShift: form.onShift,
                collaboratorId: selected?.id ?? null,
                period: form.period,
                swapForDate: form.swapForDate || null,
                paymentDate: form.paymentDate || null,
                atHome: form.atHome || null,
                status: form.status,
                notes: form.notes || null,
                acknowledgeWarnings: true,
              },
              shift?.id,
            );
            toast('warning', t('Salvo com alerta registrado', 'Saved with warning logged'), t('O alerta fica no histórico de auditoria.', 'The warning is kept in the audit trail.'));
            onSaved?.();
            onClose();
          } catch (inner) {
            setError((inner as ApiError).message);
          }
        }
      } else {
        setError(apiError.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!shift) return;
    const ok = await confirm({
      title: t('Remover este plantão?', 'Remove this shift?'),
      message: t(
        `O plantão de ${shift.onShift} em ${formatDateBR(shift.date)} sai da escala ativa, mas fica salvo no histórico e pode ser restaurado pelo administrador.`,
        `${shift.onShift}'s shift on ${formatDateBR(shift.date, 'en')} leaves the active roster but stays in the history and can be restored by an admin.`,
      ),
      confirmLabel: t('Remover da escala', 'Remove from roster'),
      tone: 'danger',
    });
    if (!ok) return;
    await deleteShift(shift.id);
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('Editar plantão', 'Edit shift') : t('Novo plantão', 'New shift')}
      subtitle={
        form.date
          ? `${formatDateBR(form.date, lang)} · ${monthLabel(form.date.slice(0, 7), lang)}`
          : t('Escolha a data e o plantonista', 'Pick the date and the person on duty')
      }
      icon={<CalendarDays />}
    >
      <form className="stack gap-16" onSubmit={submit}>
        {error && (
          <div className="alert danger">
            <AlertTriangle />
            <div>{error}</div>
          </div>
        )}

        <div className="form-grid">
          <Field label={t('Data do turno', 'Shift date')} required htmlFor="shift-date">
            <input
              id="shift-date"
              className="input"
              type="date"
              value={form.date || ''}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              required
            />
          </Field>
          <Field label={t('Período', 'Period')} required htmlFor="shift-period">
            <select
              id="shift-period"
              className="select"
              value={form.period}
              onChange={(event) => setForm({ ...form, period: event.target.value })}
            >
              {periods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t('Plantonista escalado', 'Assigned member')} required htmlFor="shift-person">
          <select
            id="shift-person"
            className="select"
            value={form.onShift || ''}
            onChange={(event) => {
              const name = event.target.value;
              setForm({
                ...form,
                onShift: name,
                atHome: form.atHome && form.atHome !== '-x-' ? name : form.atHome,
              });
            }}
          >
            <option value="">{t('Selecione…', 'Select…')}</option>
            {collaborators.map((collaborator) => (
              <option key={collaborator.id} value={collaborator.name}>
                {collaborator.name}
                {collaborator.specialty ? ` · ${collaborator.specialty}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div
          className="card"
          style={{
            padding: 16,
            background: 'var(--gold-soft)',
            borderColor: 'rgba(176,141,42,0.28)',
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div className="row gap-8">
            <div className="rule-icon" style={{ background: 'rgba(176,141,42,0.16)' }}>
              <Wallet />
            </div>
            <div className="grow">
              <div className="strong" style={{ fontSize: 13 }}>
                {t('Pagamento — campo independente', 'Payment — independent field')}
              </div>
              <div className="hint">
                {t(
                  'A data de pagamento não é calculada a partir do turno nem da troca. Preencha quando o repasse estiver definido; deixar em branco significa “a definir”.',
                  'The payment date is never derived from the shift or swap date. Fill it in when the payout is defined; leaving it blank means “to be defined”.',
                )}
              </div>
            </div>
          </div>
          <div className="form-grid">
            <Field label={t('Data de pagamento', 'Payment date')} htmlFor="shift-payment">
              <input
                id="shift-payment"
                className="input"
                type="date"
                value={form.paymentDate || ''}
                onChange={(event) => setForm({ ...form, paymentDate: event.target.value || null })}
              />
            </Field>
            <Field label={t('Data de troca (opcional)', 'Swap date (optional)')} htmlFor="shift-swap">
              <div className="input-icon">
                <Repeat2 />
                <input
                  id="shift-swap"
                  className="input"
                  type="date"
                  value={form.swapForDate || ''}
                  onChange={(event) => setForm({ ...form, swapForDate: event.target.value || null })}
                />
              </div>
            </Field>
          </div>
          <div className="hint" style={{ display: 'flex', gap: 6 }}>
            <CalendarClock size={13} style={{ flex: '0 0 auto', marginTop: 2 }} />
            {form.swapForDate
              ? t(
                  `Troca registrada: ${formatDateBR(form.date, lang)} ⇄ ${formatDateBR(form.swapForDate, lang)}. O pagamento continua em ${form.paymentDate ? formatDateBR(form.paymentDate, lang) : '“a definir”'}.`,
                  `Swap logged: ${formatDateBR(form.date, 'en')} ⇄ ${formatDateBR(form.swapForDate, 'en')}. Payment remains ${form.paymentDate ? formatDateBR(form.paymentDate, 'en') : '“to be defined”'}.`,
                )
              : t(
                  'Sem troca neste plantão. A data de pagamento é gravada separadamente no banco.',
                  'No swap on this shift. The payment date is stored separately in the database.',
                )}
          </div>
        </div>

        <div className="form-grid">
          <Field
            label={t('Permanência', 'Whereabouts')}
            hint={t('“Em serviço” equivale ao valor original -x- do app antigo.', '“On duty” matches the original -x- value from the old app.')}
            htmlFor="shift-home"
          >
            <select
              id="shift-home"
              className="select"
              value={form.atHome || '-x-'}
              onChange={(event) => setForm({ ...form, atHome: event.target.value })}
            >
              <option value="-x-">{t('Em serviço (-x-)', 'On duty (-x-)')}</option>
              {collaborators.map((collaborator) => (
                <option key={collaborator.id} value={collaborator.name}>
                  {t('Em casa', 'At home')} · {collaborator.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Situação', 'Status')} htmlFor="shift-status">
            <select
              id="shift-status"
              className="select"
              value={form.status || 'confirmado'}
              onChange={(event) => setForm({ ...form, status: event.target.value as Shift['status'] })}
            >
              <option value="confirmado">{t('Confirmado', 'Confirmed')}</option>
              <option value="pendente">{t('Pendente', 'Pending')}</option>
              <option value="cancelado">{t('Cancelado', 'Cancelled')}</option>
            </select>
          </Field>
        </div>

        <Field label={t('Observações', 'Notes')} htmlFor="shift-notes">
          <textarea
            id="shift-notes"
            className="textarea"
            value={form.notes || ''}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder={t('Ex.: troca combinada com a Juliana no plantão de 14/06.', 'e.g. swap agreed with Juliana on the 14/06 shift.')}
            maxLength={500}
          />
        </Field>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            {isEdit && (
              <button type="button" className="btn btn-danger-soft" onClick={handleDelete}>
                <Trash2 /> {t('Remover', 'Remove')}
              </button>
            )}
          </div>
          <div className="row gap-8">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('Cancelar', 'Cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <Check />}
              {isEdit ? t('Salvar alterações', 'Save changes') : t('Adicionar à escala', 'Add to roster')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
