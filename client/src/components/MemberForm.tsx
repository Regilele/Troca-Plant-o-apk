import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, UserPlus } from 'lucide-react';
import { Modal, Field, ColorPicker } from './ui';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { initialsFor } from '../lib/colors';
import type { Collaborator } from '../types';

export function MemberForm({
  open,
  onClose,
  member,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  member?: Collaborator | null;
  onSaved?: () => void;
}) {
  const { saveCollaborator } = useApp();
  const { t } = useLang();
  const [form, setForm] = useState({ name: '', specialty: '', phone: '', colorHex: 'bg-teal-600', avatarChar: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(member?.id);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (member) {
      setForm({
        name: member.name,
        specialty: member.specialty || '',
        phone: member.phone || '',
        colorHex: member.colorHex,
        avatarChar: member.avatarChar,
      });
    } else {
      setForm({ name: '', specialty: '', phone: '', colorHex: 'bg-teal-600', avatarChar: '' });
    }
  }, [open, member]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await saveCollaborator(
        {
          name: form.name.trim(),
          specialty: form.specialty.trim() || null,
          phone: form.phone.trim() || null,
          colorHex: form.colorHex,
          avatarChar: form.avatarChar || initialsFor(form.name) || form.name.slice(0, 1).toUpperCase(),
        } as Partial<Collaborator>,
        member?.id,
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('Editar plantonista', 'Edit member') : t('Novo integrante', 'New member')}
      subtitle={t('A equipe do plantão aparece no calendário e nos relatórios.', 'Team members appear in the calendar and reports.')}
      icon={<UserPlus />}
    >
      <form className="stack gap-16" onSubmit={submit}>
        {error && (
          <div className="alert danger">
            <AlertTriangle />
            <div>{error}</div>
          </div>
        )}
        <Field label={t('Nome', 'Name')} required htmlFor="member-name">
          <input
            id="member-name"
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value, avatarChar: form.avatarChar || initialsFor(event.target.value) })}
            placeholder={t('Ex.: Camila Rocha', 'e.g. Camila Rocha')}
            required
          />
        </Field>
        <div className="form-grid">
          <Field label={t('Cargo / especialidade', 'Role / specialty')} htmlFor="member-specialty">
            <input
              id="member-specialty"
              className="input"
              value={form.specialty}
              onChange={(event) => setForm({ ...form, specialty: event.target.value })}
              placeholder={t('Ex.: Técnica de enfermagem', 'e.g. Nursing technician')}
            />
          </Field>
          <Field label={t('Telefone', 'Phone')} htmlFor="member-phone">
            <input
              id="member-phone"
              className="input"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="(21) 98888-7777"
              inputMode="tel"
            />
          </Field>
        </div>
        <Field
          label={t('Cor de identificação', 'Identification colour')}
          hint={t('As cores originais do app antigo foram preservadas para cada plantonista.', 'The original app colours were preserved for each member.')}
        >
          <ColorPicker value={form.colorHex} onChange={(token) => setForm({ ...form, colorHex: token })} />
        </Field>
        <Field label={t('Inicial exibida no avatar', 'Avatar initials')} htmlFor="member-avatar">
          <input
            id="member-avatar"
            className="input"
            value={form.avatarChar}
            onChange={(event) => setForm({ ...form, avatarChar: event.target.value.slice(0, 2).toUpperCase() })}
            maxLength={2}
            placeholder={initialsFor(form.name) || 'A'}
            style={{ maxWidth: 120 }}
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancelar', 'Cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <Check />}
            {isEdit ? t('Salvar alterações', 'Save changes') : t('Adicionar à equipe', 'Add to team')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
