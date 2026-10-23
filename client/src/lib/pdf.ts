import type { Collaborator, OffDay, Shift } from '../types';
import { formatDateBR, monthLabel } from './calendar';

interface PdfOptions {
  month: string;
  shifts: Shift[];
  offDays: OffDay[];
  collaborators: Collaborator[];
  lang: 'pt' | 'en';
  supportPhone: string;
}

export async function generateMonthlyPdf({ month, shifts, offDays, collaborators, lang, supportPhone }: PdfOptions) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  const teal: [number, number, number] = [1, 105, 111];
  const dark: [number, number, number] = [4, 38, 43];
  const gold: [number, number, number] = [201, 162, 66];
  const grey: [number, number, number] = [100, 116, 116];

  // cabeçalho
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 96, 'F');
  doc.setFillColor(...teal);
  doc.circle(margin + 22, 46, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RG&SA', margin + 22, 51, { align: 'center' });
  doc.setFontSize(17);
  doc.text('RG&SA PLANTÃO', margin + 56, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(200, 226, 224);
  doc.text(
    lang === 'en' ? 'Monthly schedule report' : 'Relatório mensal de escalas',
    margin + 56,
    58,
  );
  doc.setTextColor(...gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(monthLabel(month, lang).toUpperCase(), pageWidth - margin, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 226, 224);
  doc.text(
    lang === 'en' ? 'Shift date and payment date are independent' : 'Data do turno e data de pagamento são independentes',
    pageWidth - margin,
    58,
    { align: 'right' },
  );

  let y = 122;
  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(lang === 'en' ? 'Shifts' : 'Plantões', margin, y);
  y += 8;
  doc.setDrawColor(225, 232, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  const columns = [
    { key: 'date', label: lang === 'en' ? 'Shift' : 'Turno', x: margin, w: 62 },
    { key: 'person', label: lang === 'en' ? 'On duty' : 'Plantonista', x: margin + 64, w: 104 },
    { key: 'period', label: lang === 'en' ? 'Period' : 'Período', x: margin + 170, w: 82 },
    { key: 'swap', label: lang === 'en' ? 'Swap' : 'Troca', x: margin + 254, w: 66 },
    { key: 'payment', label: lang === 'en' ? 'Payment' : 'Pagamento', x: margin + 322, w: 78 },
    { key: 'status', label: lang === 'en' ? 'Status' : 'Situação', x: margin + 402, w: 74 },
  ];

  const drawTableHeader = () => {
    doc.setFillColor(240, 246, 245);
    doc.rect(margin, y - 11, pageWidth - margin * 2, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...grey);
    for (const col of columns) doc.text(col.label.toUpperCase(), col.x, y + 2);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...dark);
  };

  drawTableHeader();

  const monthShifts = shifts
    .filter((s) => !s.deletedAt && s.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);

  for (const shift of monthShifts) {
    if (y > pageHeight - 120) {
      doc.addPage();
      y = 60;
      drawTableHeader();
    }
    const color = collaborators.find((c) => c.name === shift.onShift)?.colorHex || 'bg-teal-600';
    const palette: Record<string, [number, number, number]> = {
      'bg-indigo-600': [79, 70, 229],
      'bg-emerald-600': [5, 150, 105],
      'bg-purple-600': [147, 51, 234],
      'bg-amber-600': [217, 119, 6],
      'bg-teal-600': [1, 105, 111],
      'bg-rose-600': [225, 29, 72],
      'bg-sky-600': [2, 132, 199],
      'bg-stone-600': [87, 83, 78],
    };
    const rgb = palette[color] || [1, 105, 111];
    doc.setFillColor(...rgb);
    doc.circle(columns[1].x - 8, y - 3, 3.4, 'F');

    doc.text(formatDateBR(shift.date), columns[0].x, y);
    doc.setFont('helvetica', 'bold');
    doc.text(shift.onShift, columns[1].x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(shift.period.replace(' (12h)', ' 12h'), columns[2].x, y);
    doc.text(shift.swapForDate ? formatDateBR(shift.swapForDate) : '—', columns[3].x, y);
    doc.text(shift.paymentDate ? formatDateBR(shift.paymentDate) : lang === 'en' ? 'Pending' : 'A definir', columns[4].x, y);
    let statusLabel = shift.status;
    let statusColor: [number, number, number] = [6, 95, 70];
    if (shift.status === 'pendente' || !shift.paymentDate) {
      statusColor = [146, 64, 14];
    }
    if (shift.status === 'cancelado') statusColor = [159, 18, 57];
    doc.setTextColor(...statusColor);
    doc.setFontSize(8);
    doc.text(shift.status, columns[5].x, y);
    doc.setTextColor(...dark);
    doc.setFontSize(9);
    if (shift.notes) {
      y += 12;
      doc.setTextColor(...grey);
      doc.setFontSize(7.5);
      doc.text(String(shift.notes).slice(0, 110), columns[1].x, y);
      doc.setTextColor(...dark);
      doc.setFontSize(9);
    }
    y += 18;
    doc.setDrawColor(240, 244, 243);
    doc.line(margin, y - 6, pageWidth - margin, y - 6);
  }

  if (monthShifts.length === 0) {
    doc.setTextColor(...grey);
    doc.text(lang === 'en' ? 'No shifts scheduled in this period.' : 'Nenhum plantão agendado para o período.', margin, y);
    y += 20;
  }

  y += 12;
  if (y > pageHeight - 140) {
    doc.addPage();
    y = 60;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text(lang === 'en' ? 'Off-days' : 'Folgas', margin, y);
  y += 8;
  doc.setDrawColor(225, 232, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const monthOff = offDays.filter((o) => !o.deletedAt && o.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  for (const off of monthOff) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = 60;
    }
    doc.setTextColor(...dark);
    doc.text(formatDateBR(off.date), margin, y);
    doc.text(off.name, margin + 80, y);
    doc.text(off.type === 'mensal' ? (lang === 'en' ? 'Monthly leave' : 'Folga mensal') : lang === 'en' ? 'Extra time off' : 'Compensatória', margin + 190, y);
    y += 16;
  }
  if (monthOff.length === 0) {
    doc.setTextColor(...grey);
    doc.text(lang === 'en' ? 'No off-days in this period.' : 'Nenhuma folga cadastrada no período.', margin, y);
    y += 20;
  }

  // rodapé
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(225, 232, 230);
    doc.line(margin, pageHeight - 56, pageWidth - margin, pageHeight - 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text(
      lang === 'en'
        ? `Support: ${supportPhone} · Generated by RG&SA PLANTÃO on ${new Date().toLocaleString('en-US')}`
        : `Suporte: ${supportPhone} · Gerado pelo RG&SA PLANTÃO em ${new Date().toLocaleString('pt-BR')}`,
      margin,
      pageHeight - 40,
    );
    doc.text(`${p}/${totalPages}`, pageWidth - margin, pageHeight - 40, { align: 'right' });
    doc.setTextColor(...gold);
    doc.setFont('helvetica', 'bold');
    doc.text(
      lang === 'en' ? 'Shift and payment dates are tracked separately' : 'Datas de troca e de pagamento são controladas separadamente',
      margin,
      pageHeight - 27,
    );
  }

  const filename = `Relatorio_Escalas_${month}${lang === 'en' ? '_EN' : ''}.pdf`;
  doc.save(filename);
  return filename;
}
