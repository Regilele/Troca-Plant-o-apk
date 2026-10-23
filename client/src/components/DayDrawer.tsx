import { useMemo } from 'react';
import {
  AlarmClock,
  ArrowRight,
  CalendarPlus,
  Info,
  Palmtree,
  Pencil,
  Repeat2,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Drawer, Avatar, useConfirm, useToast } from './ui';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { formatDateBR, formatDateLong, daysUntil } from '../lib/calendar';
import type { Shift } from '../types';

export function DayDrawer({
  date,
  onClose,
  onEditShift,
  onNewShift,
  onNewOffDay,
  onEditOffDay,
}: {
  date: string | null;
  onClose: () => void;
  onEditShift: (shift: Shift) => void;
  onNewShift: (date: string) => void;
  onNewOffDay: (date: string) => void;
  onEditOffDay: (id: number) => void;
}) {
  const { boot, deleteShift, deleteOffDay } = useApp();
  const { lang, t } = useLang();
  const confirm = useConfirm();
  const { toast } = useToast();

  const shifts = useMemo(
    () => (boot?.shifts || []).filter((s) => s.date === date && !s.deletedAt),
    [boot, date],
  );
  const offDays = useMemo(
    () => (boot?.offDays || []).filter((o) => o.date === date && !o.deletedAt),
    [boot, date],
  );
  const conflicts = useMemo(
    () => (boot?.conflicts || []).filter((c) => date && c.dates.includes(date)),
    [boot, date],
  );

  const removeShift = async (shift: Shift) => {
    const ok = await confirm({
      title: t('Remover plantão?', 'Remove shift?'),
      message: t(
        `O plantão de ${shift.onShift} em ${formatDateBR(shift.date)} fica no histórico e pode ser restaurado pelo administrador.`,
        `${shift.onShift}'s shift on ${formatDateBR(shift.date, 'en')} stays in history and can be restored by an admin.`,
      ),
      confirmLabel: t('Remover', 'Remove'),
      tone: 'danger',
    });
    if (!ok) return;
    await deleteShift(shift.id);
    toast('success', t('Plantão removido', 'Shift removed'));
  };

  const removeOff = async (id: number) => {
    const ok = await confirm({
      title: t('Remover folga?', 'Remove off-day?'),
      message: t('A folga fica no histórico e pode ser restaurada.', 'The off-day stays in history and can be restored.'),
      confirmLabel: t('Remover', 'Remove'),
      tone: 'danger',
    });
    if (!ok) return;
    await deleteOffDay(id);
  };

  const editable = Boolean(boot?.permissions.canEdit);

  return (
    <Drawer
      open={Boolean(date)}
      onClose={onClose}
      title={date ? formatDateBR(date, lang) : ''}
      subtitle={date ? formatDateLong(date, lang) : undefined}
      icon={
        <div className="empty-icon" style={{ width: 40, height: 40, borderRadius: 13, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
          <CalendarPlus size={18} />
        </div>
      }
    >
      {date && daysUntil(date) >= 0 && (
        <div className="banner info">
          <AlarmClock />
          <div className="grow">
            {daysUntil(date) === 0
              ? t('Este é o dia de hoje.', 'This is today.')
              : t(`Faltam ${daysUntil(date)} dia(s) para esta data.`, `${daysUntil(date)} day(s) to this date.`)}
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="stack gap-8">
          {conflicts.map((conflict, index) => (
            <div className="alert danger" key={`${conflict.type}-${index}`}>
              <Info />
              <div>{conflict.message}</div>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="card-title" style={{ fontSize: 13 }}>{t('Plantões', 'Shifts')}</div>
        {editable && (
          <button className="btn btn-sm btn-soft" onClick={() => onNewShift(date)}>
            <CalendarPlus /> {t('Novo', 'New')}
          </button>
        )}
      </div>

      {shifts.length === 0 ? (
        <div className="empty" style={{ padding: '22px 12px' }}>
          <div className="empty-icon"><CalendarPlus /></div>
          <p className="small">{t('Nenhum plantão neste dia.', 'No shift on this day.')}</p>
        </div>
      ) : (
        <div className="stack gap-10">
          {shifts.map((shift) => {
            const collaborator = boot?.collaborators.find((c) => c.name === shift.onShift);
            return (
              <div className="card" key={shift.id} style={{ padding: 14, boxShadow: 'none' }}>
                <div className="row gap-12">
                  <Avatar name={shift.onShift} color={collaborator?.colorHex} char={collaborator?.avatarChar} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row gap-8 wrap">
                      <span className="strong" style={{ fontSize: 13.5 }}>{shift.onShift}</span>
                      <span className="badge brand">{shift.period}</span>
                      {shift.status === 'pendente' && <span className="badge warning">{t('Pendente', 'Pending')}</span>}
                      {shift.status === 'cancelado' && <span className="badge danger">{t('Cancelado', 'Cancelled')}</span>}
                    </div>
                    <div className="list-row-sub" style={{ marginTop: 6 }}>
                      <span className="row gap-4">
                        <Repeat2 size={12} />
                        {shift.swapForDate ? formatDateBR(shift.swapForDate, lang) : t('sem troca', 'no swap')}
                      </span>
                      <span className="row gap-4">
                        <Wallet size={12} />
                        {shift.paymentDate ? formatDateBR(shift.paymentDate, lang) : t('pagamento a definir', 'payment pending')}
                      </span>
                    </div>
                    {shift.notes && <div className="hint" style={{ marginTop: 6 }}>{shift.notes}</div>}
                  </div>
                  {editable && (
                    <div className="stack gap-4">
                      <button className="icon-btn sm" onClick={() => onEditShift(shift)} aria-label={t('Editar', 'Edit')}>
                        <Pencil />
                      </button>
                      <button className="icon-btn sm danger" onClick={() => void removeShift(shift)} aria-label={t('Remover', 'Remove')}>
                        <Trash2 />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <hr className="divider" />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="card-title" style={{ fontSize: 13 }}>{t('Folgas', 'Off-days')}</div>
        {editable && (
          <button className="btn btn-sm btn-soft" onClick={() => onNewOffDay(date)}>
            <Palmtree /> {t('Nova folga', 'New off-day')}
          </button>
        )}
      </div>

      {offDays.length === 0 ? (
        <div className="empty" style={{ padding: '22px 12px' }}>
          <div className="empty-icon"><Palmtree /></div>
          <p className="small">{t('Nenhuma folga neste dia.', 'No off-day on this day.')}</p>
        </div>
      ) : (
        <div className="stack gap-8">
          {offDays.map((off) => (
            <div className="list-row" key={off.id}>
              <div className="empty-icon" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--gold-soft)', color: 'var(--gold)' }}>
                <Palmtree size={15} />
              </div>
              <div className="list-row-main">
                <div className="list-row-title">{off.name}</div>
                <div className="list-row-sub">
                  <span>{off.type === 'mensal' ? t('Folga mensal', 'Monthly leave') : t('Compensatória', 'Extra time off')}</span>
                </div>
              </div>
              {editable && (
                <div className="list-row-actions">
                  <button className="icon-btn sm" onClick={() => onEditOffDay(off.id)} aria-label={t('Editar folga', 'Edit off-day')}>
                    <Pencil />
                  </button>
                  <button className="icon-btn sm danger" onClick={() => void removeOff(off.id)} aria-label={t('Remover folga', 'Remove off-day')}>
                    <Trash2 />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!editable && (
        <div className="alert info">
          <Info />
          <div>
            {t('Seu acesso é somente leitura. Fale com o administrador para editar a escala.', 'Your access is read-only. Ask the admin to edit the roster.')}
          </div>
        </div>
      )}

      {editable && (
        <button className="btn btn-outline btn-block" onClick={() => onNewShift(date)}>
          <CalendarPlus /> {t('Adicionar plantão neste dia', 'Add shift on this day')} <ArrowRight size={15} />
        </button>
      )}
    </Drawer>
  );
}
