export interface Palette {
  token: string;
  label: string;
  from: string;
  to: string;
  soft: string;
  ink: string;
}

/** Tokens originais do APK (bg-*-600) preservados + opções novas. */
export const PALETTE: Palette[] = [
  { token: 'bg-indigo-600', label: 'Índigo', from: '#4f46e5', to: '#6366f1', soft: 'rgba(79,70,229,0.14)', ink: '#3730a3' },
  { token: 'bg-emerald-600', label: 'Esmeralda', from: '#059669', to: '#10b981', soft: 'rgba(5,150,105,0.14)', ink: '#065f46' },
  { token: 'bg-purple-600', label: 'Violeta', from: '#9333ea', to: '#a855f7', soft: 'rgba(147,51,234,0.14)', ink: '#6b21a8' },
  { token: 'bg-amber-600', label: 'Âmbar', from: '#d97706', to: '#f59e0b', soft: 'rgba(217,119,6,0.16)', ink: '#92400e' },
  { token: 'bg-teal-600', label: 'Teal', from: '#01696f', to: '#02a2af', soft: 'rgba(1,105,111,0.14)', ink: '#01474c' },
  { token: 'bg-rose-600', label: 'Rosa', from: '#e11d48', to: '#f43f5e', soft: 'rgba(225,29,72,0.14)', ink: '#9f1239' },
  { token: 'bg-sky-600', label: 'Céu', from: '#0284c7', to: '#0ea5e9', soft: 'rgba(2,132,199,0.14)', ink: '#075985' },
  { token: 'bg-stone-600', label: 'Pedra', from: '#57534e', to: '#78716c', soft: 'rgba(87,83,78,0.14)', ink: '#292524' },
];

export function paletteFor(token: string | null | undefined): Palette {
  return PALETTE.find((p) => p.token === token) || PALETTE[4];
}

export function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}
