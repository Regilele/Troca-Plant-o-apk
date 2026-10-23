import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Mail,
  Palmtree,
  Printer,
  Wallet,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { useToast, EmptyState } from '../components/ui';
import { formatDateBR, monthLabel } from '../lib/calendar';
import { generateMonthlyPdf } from '../lib/pdf';
import { api } from '../lib/api';

export function ReportsPage() {
  const { boot, month, setMonth, goToMonth } = useApp();
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const shifts = useMemo(
    () => (boot?.shifts || []).filter((s) => !s.deletedAt && s.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)),
    [boot, month],
  );
  const offDays = useMemo(
    () => (boot?.offDays || []).filter((o) => !o.deletedAt && o.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)),
    [boot, month],
  );
  const active = shifts.filter((s) => s.status !== 'cancelado');
  const pending = active.filter((s) => !s.paymentDate);
  const swaps = active.filter((s) => s.swapForDate);

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const file = await generateMonthlyPdf({
        month,
        shifts: boot?.shifts || [],
        offDays: boot?.offDays || [],
        collaborators: boot?.collaborators || [],
        lang,
        supportPhone: boot?.settings.support_phone_display || '(21) 98049-8068',
      });
      toast('success', t('PDF gerado', 'PDF generated'), file);
    } catch (error) {
      toast('error', t('Erro ao gerar PDF', 'PDF error'), (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const buildText = async () => {
    const data = await api.get<{ text: string }>(`/api/reports/monthly?month=${month}&lang=${lang}`);
    return data.text;
  };

  const sendEmail = async () => {
    setBusy('email');
    try {
      const text = await buildText();
      const subject = t(
        `Relatório Mensal de Escala - ${monthLabel(month, 'pt')}`,
        `Monthly Schedule Report - ${monthLabel(month, 'en')}`,
      );
      const mailto = `mailto:${boot?.settings.support_email || 'oliveira30regi@gmail.com'}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      window.location.href = mailto;
      toast('info', t('Cliente de e-mail aberto', 'Email client opened'), t('Revise o relatório e envie.', 'Review the report and send it.'));
    } catch {
      toast('error', t('Não foi possível montar o e-mail', 'Could not build the email'));
    } finally {
      setBusy(null);
    }
  };

  const copyText = async () => {
    setBusy('copy');
    try {
      const text = await buildText();
      await navigator.clipboard.writeText(text);
      toast('success', t('Relatório copiado', 'Report copied'), t('Cole no WhatsApp ou em qualquer lugar.', 'Paste it on WhatsApp or anywhere.'));
    } catch {
      toast('error', t('Copiar não suportado neste navegador', 'Copy not supported in this browser'));
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const header = [
      t('Data do turno', 'Shift date'),
      t('Plantonista', 'Member'),
      t('Período', 'Period'),
      t('Data de troca', 'Swap date'),
      t('Data de pagamento', 'Payment date'),
      t('Situação', 'Status'),
      t('Observações', 'Notes'),
    ];
    const rows = shifts.map((shift) => [
      shift.date,
      shift.onShift,
      shift.period,
      shift.swapForDate || '',
      shift.paymentDate || '',
      shift.status,
      (shift.notes || '').replace(/[\n;]/g, ' '),
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `escala-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast('success', t('CSV exportado', 'CSV exported'), t('Abre no Excel e no Google Sheets.', 'Opens in Excel and Google Sheets.'));
  };

  return (
    <div className="stack gap-18">
      <div className="card">
        <div className="calendar-toolbar" style={{ marginBottom: 16 }}>
          <div className="calendar-title-group">
            <button className="icon-btn" onClick={() => goToMonth(-1)} aria-label={t('Mês anterior', 'Previous month')}>
              <ChevronLeft />
            </button>
            <div>
              <div className="calendar-title">{monthLabel(month, lang)}</div>
              <div className="tiny muted">{t('Relatório mensal de escalas', 'Monthly roster report')}</div>
            </div>
            <button className="icon-btn" onClick={() => goToMonth(1)} aria-label={t('Próximo mês', 'Next month')}>
              <ChevronRight />
            </button>
            <input
              type="month"
              className="input"
              value={month}
              onChange={(event) => event.target.value && setMonth(event.target.value)}
              style={{ maxWidth: 180 }}
              aria-label={t('Escolher mês', 'Choose month')}
            />
          </div>
          <div className="calendar-actions">
            <button className="btn btn-outline btn-sm" onClick={exportCsv}>
              <Download /> CSV
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => void copyText()} disabled={busy === 'copy'}>
              <Copy /> {t('Copiar', 'Copy')}
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => void sendEmail()} disabled={busy === 'email'}>
              <Mail /> {t('E-mail', 'Email')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => void exportPdf()} disabled={busy === 'pdf'}>
              <FileText /> {t('Gerar PDF', 'Generate PDF')}
            </button>
          </div>
        </div>

        <div className="month-summary">
          <div className="summary-pill">
            <span className="v">{active.length}</span>
            <span className="l">{t('Plantões', 'Shifts')}</span>
          </div>
          <div className="summary-pill">
            <span className="v">{swaps.length}</span>
            <span className="l">{t('Trocas', 'Swaps')}</span>
          </div>
          <div className="summary-pill">
            <span className="v">{offDays.length}</span>
            <span className="l">{t('Folgas', 'Off-days')}</span>
          </div>
          <div className="summary-pill" style={{ background: 'var(--gold-soft)', borderColor: 'rgba(176,141,42,0.28)' }}>
            <span className="v">{pending.length}</span>
            <span className="l">{t('Pagamentos a definir', 'Payments pending')}</span>
          </div>
          <div className="summary-pill">
            <span className="v">{boot?.collaborators.filter((c) => !c.deletedAt).length}</span>
            <span className="l">{t('Plantonistas', 'Members')}</span>
          </div>
        </div>
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row wrap" style={{ padding: '16px 18px', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div className="card-title">{t('Plantões do mês', 'Shifts of the month')}</div>
            <div className="card-sub">
              {t('Troca e pagamento ficam em colunas independentes — nunca são derivados um do outro.', 'Swap and payment live in independent columns — never derived from each other.')}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => window.print()}>
            <Printer /> {t('Imprimir', 'Print')}
          </button>
        </div>
        {shifts.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title={t('Nenhum plantão no mês', 'No shifts this month')} description={t('Troque o mês ou cadastre um novo plantão.', 'Switch the month or create a new shift.')} />
        ) : (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Turno', 'Shift')}</th>
                  <th>{t('Plantonista', 'Member')}</th>
                  <th className="col-period">{t('Período', 'Period')}</th>
                  <th>{t('Troca', 'Swap')}</th>
                  <th>{t('Pagamento', 'Payment')}</th>
                  <th className="col-status">{t('Situação', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td className="cell-strong">{formatDateBR(shift.date, lang)}</td>
                    <td>{shift.onShift}</td>
                    <td className="col-period">{shift.period}</td>
                    <td>
                      {shift.swapForDate ? (
                        <span className="badge gold">{formatDateBR(shift.swapForDate, lang)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {shift.paymentDate ? (
                        <span className="badge success">
                          <Wallet size={11} /> {formatDateBR(shift.paymentDate, lang)}
                        </span>
                      ) : (
                        <span className="badge outline">{t('a definir', 'pending')}</span>
                      )}
                    </td>
                    <td className="col-status">
                      <span className={`badge ${shift.status === 'confirmado' ? 'brand' : shift.status === 'pendente' ? 'warning' : 'danger'}`}>
                        {shift.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="card col-6">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Folgas do mês', 'Off-days of the month')}</div>
              <div className="card-sub">{t('mensais e compensatórias', 'monthly and compensatory')}</div>
            </div>
            <Palmtree size={16} />
          </div>
          {offDays.length === 0 ? (
            <EmptyState icon={<Palmtree />} title={t('Nenhuma folga', 'No off-days')} />
          ) : (
            <div className="stack gap-8">
              {offDays.map((off) => (
                <div className="list-row" key={off.id}>
                  <div className="empty-icon" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--gold-soft)', color: 'var(--gold)' }}>
                    <Palmtree size={15} />
                  </div>
                  <div className="list-row-main">
                    <div className="list-row-title">{off.name}</div>
                    <div className="list-row-sub">{formatDateBR(off.date, lang)}</div>
                  </div>
                  <span className="badge gold">
                    {off.type === 'mensal' ? t('Mensal', 'Monthly') : t('Compensatória', 'Compensatory')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card col-6">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Conferência do relatório', 'Report checklist')}</div>
              <div className="card-sub">{t('o que vai no PDF e no e-mail', 'what goes into the PDF and email')}</div>
            </div>
            <CheckCircle2 size={16} />
          </div>
          <div className="stack gap-10">
            {[
              t('Datas no padrão brasileiro (dd/mm/aaaa).', 'Dates in Brazilian format (dd/mm/yyyy).'),
              t('Coluna de troca separada da coluna de pagamento.', 'Swap column separated from payment column.'),
              t('Folgas e plantões com cor de identificação do plantonista.', 'Shifts and off-days with the member’s colour.'),
              t('Rodapé com o suporte oficial (21) 98049-8068.', 'Footer with official support (21) 98049-8068.'),
              t('Pagamentos em branco aparecem como “a definir”.', 'Blank payments appear as “pending”.'),
            ].map((item) => (
              <div className="row gap-8 small" key={item}>
                <CheckCircle2 size={15} style={{ color: 'var(--success)', flex: '0 0 auto' }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="banner info" style={{ marginTop: 14 }}>
            <FileText />
            <div className="grow small">
              {t('O PDF é gerado no seu aparelho — nenhum dado sai do navegador.', 'The PDF is generated on your device — no data leaves the browser.')}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
