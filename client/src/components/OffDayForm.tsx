import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Palmtree, Trash2 } from 'lucide-react';
import { Modal, Field, useConfirm } from './ui';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { formatDateBR } from '../lib/calendar';
import type { OffDay } from '../types';

export function OffDayForm({
  open,
  onClose,
  offDay,
  initialDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  offDay?: OffDay | null;
  initialDate?: string | null;
  onSaved?: () => void;
}) {
  const { boot, saveOffDay, deleteOffDay } = useApp();
  const { t, lang } = useLang();
  const confirm = useConfirm();
  const [form, setForm] = useState<Partial<OffDay>>({ date: '', name: '', type: 'mensal', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collaborators = useMemo(() => (boot?.collaborators || []).filter((c) => !c.deletedAt), [boot]);
  const isEdit = Boolean(offDay?.id);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (offDay) {
      setForm({ date: offDay.date, name: offDay.name, type: offDay.type, notes: offDay.notes || '' });
    } else {
      setForm({
        date: initialDate || new Date().toISOString().slice(0, 10),
        name: collaborators[0]?.name || '',
        type: 'mensal',
        notes: '',
      });
    }
  }, [open, offDay, initialDate, collaborators]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.date || !form.name) {
      setError(t('Informe a data e o plantonista.', 'Choose the date and the member.'));
      return;
    }
    setBusy(true);
    try {
      await saveOffDay(
        { date: form.date, name: form.name, type: form.type, notes: form.notes || null },
        offDay?.id,
      );
      onSaved?.();
      onClose();
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'rule_warnings') {
        const proceed = await confirm({
          title: t('Folga já registrada no mês', 'Leave already registered this month'),
          message: apiError.warnings[0] || apiError.message,
          confirmLabel: t('Registrar mesmo assim', 'Register anyway'),
        });
        if (proceed) {
          try {
            await saveOffDay(
              { date: form.date, name: form.name, type: form.type, notes: form.notes || null, acknowledgeWarnings: true } as Partial<OffDay>,
              offDay?.id,
            );
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
    if (!offDay) return;
    const ok = await confirm({
      title: t('Remover esta folga?', 'Remove this off-day?'),
      message: t(
        'A folga sai da escala ativa, mas permanece no histórico e pode ser restaurada.',
        'The off-day leaves the active roster but stays in the history and can be restored.',
      ),
      confirmLabel: t('Remover folga', 'Remove off-day'),
      tone: 'danger',
    });
    if (!ok) return;
    await deleteOffDay(offDay.id);
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('Editar folga', 'Edit off-day') : t('Nova folga', 'New off-day')}
      subtitle={form.date ? formatDateBR(form.date, lang) : undefined}
      icon={<Palmtree />}
    >
      <form className="stack gap-16" onSubmit={submit}>
        {error && (
          <div className="alert danger">
            <AlertTriangle />
            <div>{error}</div>
          </div>
        )}
        <div className="form-grid">
          <Field label={t('Data da folga', 'Off-day date')} required htmlFor="off-date">
            <input
              id="off-date"
              className="input"
              type="date"
              value={form.date || ''}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              required
            />
          </Field>
          <Field label={t('Tipo de folga', 'Leave type')} required htmlFor="off-type">
            <select
              id="off-type"
              className="select"
              value={form.type || 'mensal'}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
            >
              <option value="mensal">{t('Mensal obrigatória', 'Monthly leave')}</option>
              <option value="compensatoria">{t('Compensatória extra', 'Extra time off')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('Plantonista', 'Member')} required htmlFor="off-name">
          <select
            id="off-name"
            className="select"
            value={form.name || ''}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          >
            <option value="">{t('Selecione…', 'Select…')}</option>
            {collaborators.map((collaborator) => (
              <option key={collaborator.id} value={collaborator.name}>
                {collaborator.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Observações', 'Notes')} htmlFor="off-notes">
          <textarea
            id="off-notes"
            className="textarea"
            value={form.notes || ''}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            maxLength={500}
            placeholder={t('Opcional', 'Optional')}
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
              {isEdit ? t('Salvar', 'Save') : t('Registrar folga', 'Register off-day')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
