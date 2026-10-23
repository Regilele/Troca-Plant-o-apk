import type { OffDay, Shift } from '../types';

export const WEEKDAYS_SHORT_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const WEEKDAYS_SHORT_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toISO(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return monthKey(date);
}

export function monthLabel(month: string, lang: 'pt' | 'en' = 'pt') {
  const [y, m] = month.split('-').map(Number);
  const names = lang === 'en' ? MONTHS_EN : MONTHS_PT;
  return `${names[m - 1]} ${lang === 'en' ? '' : 'de '}${y}`.trim();
}

export function formatDateBR(iso: string | null | undefined, lang: 'pt' | 'en' = 'pt') {
  if (!iso) return '—';
  const date = parseISODate(iso);
  if (lang === 'en') {
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Telefone brasileiro legível: 5521980498068 → +55 (21) 98049-8068 */
export function formatPhone(value: string | null | undefined) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return value;
}

export function formatDateLong(iso: string, lang: 'pt' | 'en' = 'pt') {
  const date = parseISODate(iso);
  return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

export function diffDays(a: string, b: string) {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

export function daysUntil(iso: string) {
  return diffDays(todayISO(), iso);
}

export interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  weekend: boolean;
  shifts: Shift[];
  offDays: OffDay[];
}

export function buildMonthWeeks(month: string, shifts: Shift[], offDays: OffDay[]): CalendarDay[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = first.getDay();
  const start = new Date(y, m - 1, 1 - offset);
  const shiftMap = new Map<string, Shift[]>();
  const offMap = new Map<string, OffDay[]>();
  const activeShifts = shifts.filter((s) => !s.deletedAt);
  const activeOffs = offDays.filter((o) => !o.deletedAt);
  for (const s of activeShifts) {
    if (!shiftMap.has(s.date)) shiftMap.set(s.date, []);
    shiftMap.get(s.date)!.push(s);
  }
  for (const o of activeOffs) {
    if (!offMap.has(o.date)) offMap.set(o.date, []);
    offMap.get(o.date)!.push(o);
  }
  const today = todayISO();
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + w * 7 + d);
      const iso = toISO(current);
      week.push({
        date: iso,
        day: current.getDate(),
        inMonth: current.getMonth() === m - 1,
        isToday: iso === today,
        weekend: current.getDay() === 0 || current.getDay() === 6,
        shifts: (shiftMap.get(iso) || []).slice().sort((a, b) => a.onShift.localeCompare(b.onShift)),
        offDays: offMap.get(iso) || [],
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export function dateRangeOfMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const last = new Date(y, m, 0).getDate();
  return { start, end: `${month}-${pad(last)}` };
}
