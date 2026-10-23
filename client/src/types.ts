export type Role = 'admin' | 'member' | 'guest';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface User {
  id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  role: Role;
  status: UserStatus;
  collaboratorId: number | null;
  isDemo: boolean;
  isGuest: boolean;
  label: string;
  createdAt?: string;
  lastLoginAt?: string | null;
  rejectionReason?: string | null;
}

export interface Collaborator {
  id: number;
  legacyId: number | null;
  name: string;
  colorHex: string;
  avatarChar: string;
  phone: string | null;
  specialty: string | null;
  active: boolean | number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Shift {
  id: number;
  legacyId: number | null;
  date: string;
  onShift: string;
  collaboratorId: number | null;
  period: string;
  swapForDate: string | null;
  paymentDate: string | null;
  atHome: string | null;
  status: 'confirmado' | 'pendente' | 'cancelado';
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OffDay {
  id: number;
  legacyId: number | null;
  date: string;
  name: string;
  collaboratorId: number | null;
  type: 'mensal' | 'compensatoria' | string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Swap {
  id: string;
  shiftId: number;
  date: string;
  onShift: string;
  swapForDate: string;
  counterpartId: number | null;
  counterpartName: string | null;
  reciprocal: boolean;
  status: 'confirmada' | 'pendente';
}

export interface Conflict {
  type: string;
  severity: 'warning' | 'error';
  name: string;
  dates: string[];
  message: string;
}

export interface Cycle {
  person: string;
  next: Shift | null;
  last: Shift | null;
  daysUntilNext: number | null;
  restDays: number | null;
  total: number;
}

export interface Integration {
  name: string;
  enabled: boolean;
  status: string;
  lastSyncAt: string | null;
  detail: string;
  label?: string;
  sample?: {
    temperature: number;
    windSpeed: number;
    description: string;
    city: string;
    observedAt: string;
  } | null;
  config?: Record<string, unknown>;
}

export interface Bootstrap {
  user: User;
  collaborators: Collaborator[];
  shifts: Shift[];
  offDays: OffDay[];
  swaps: Swap[];
  conflicts: Conflict[];
  stats: {
    shifts: number;
    swaps: number;
    offDays: number;
    pendingPayments: number;
    leader: { name: string; count: number } | null;
    perPerson: Record<string, number>;
  };
  cycles: Cycle[];
  settings: Record<string, string>;
  integrations: Integration[];
  legacy: { source: string; importedAt: string | null; counts: Record<string, number>; note: string };
  pendingApprovals: number;
  permissions: { canEdit: boolean; isAdmin: boolean; isGuest: boolean };
  options: { periods: string[]; offDayTypes: string[] };
  serverTime: string;
  version: string;
  defaultMonth: string;
}

export interface AuditEntry {
  id: number;
  actorId: number | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}
