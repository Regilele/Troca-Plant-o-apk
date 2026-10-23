import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, getSessionToken, setSessionToken } from '../lib/api';
import { useToast } from '../components/ui';
import { applyUpdate, clearOfflineData, registerServiceWorker, showShiftNotification } from '../lib/pwa';
import { monthKey, todayISO } from '../lib/calendar';
import type {
  AuditEntry,
  Bootstrap,
  Collaborator,
  OffDay,
  Shift,
  User,
} from '../types';

type Theme = 'light' | 'dark';

interface AppContextValue {
  boot: Bootstrap | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  month: string;
  setMonth: (month: string) => void;
  goToMonth: (delta: number) => void;
  theme: Theme;
  toggleTheme: () => void;
  online: boolean;
  updateReady: boolean;
  applySWUpdate: () => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  signup: (payload: { name: string; email: string; phone: string; specialty: string; password: string }) => Promise<{ status: string; message: string }>;
  loginGuest: () => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  saveShift: (payload: Partial<Shift> & { acknowledgeWarnings?: boolean; force?: boolean }, id?: number) => Promise<void>;
  deleteShift: (id: number) => Promise<void>;
  restoreShift: (id: number) => Promise<void>;
  saveOffDay: (payload: Partial<OffDay>, id?: number) => Promise<void>;
  deleteOffDay: (id: number) => Promise<void>;
  saveCollaborator: (payload: Partial<Collaborator>, id?: number) => Promise<void>;
  archiveCollaborator: (id: number) => Promise<void>;
  approveUser: (id: number, role: 'admin' | 'member', collaboratorId?: number | null) => Promise<void>;
  rejectUser: (id: number, reason: string) => Promise<void>;
  setUserStatus: (id: number, status: 'approved' | 'suspended' | 'pending') => Promise<void>;
  setUserRole: (id: number, role: 'admin' | 'member') => Promise<void>;
  resetUserPassword: (id: number, newPassword: string) => Promise<void>;
  importData: (payload: unknown) => Promise<void>;
  exportData: () => Promise<void>;
  backup: () => Promise<void>;
  audit: (limit?: number) => Promise<AuditEntry[]>;
  syncFirebase: (confirm: boolean) => Promise<Record<string, unknown>>;
  refreshWeather: () => Promise<void>;
  sendNotification: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const t_roleSaved = (role: 'admin' | 'member') =>
  role === 'admin' ? 'Papel atualizado: administrador' : 'Papel atualizado: plantonista';

/** Normaliza o payload: visitantes não recebem coleções, então garantimos defaults. */
function normalizeBoot(data: Partial<Bootstrap> & { user: User | null }): Bootstrap {
  return {
    user: data.user as User,
    collaborators: data.collaborators || [],
    shifts: data.shifts || [],
    offDays: data.offDays || [],
    swaps: data.swaps || [],
    conflicts: data.conflicts || [],
    cycles: data.cycles || [],
    stats: data.stats || { shifts: 0, swaps: 0, offDays: 0, pendingPayments: 0, leader: null, perPerson: {} },
    settings: data.settings || {},
    integrations: data.integrations || [],
    legacy: data.legacy || { source: 'desconhecido', importedAt: null, counts: {}, note: '' },
    pendingApprovals: data.pendingApprovals || 0,
    permissions: data.permissions || { canEdit: false, isAdmin: false, isGuest: true },
    options: data.options || { periods: ['Diurno (12h)', 'Noturno (12h)'], offDayTypes: ['mensal', 'compensatoria'] },
    serverTime: data.serverTime || new Date().toISOString(),
    version: data.version || '2.0.0',
    defaultMonth: data.defaultMonth || new Date().toISOString().slice(0, 7),
  };
}
const THEME_KEY = 'rgsa.theme';

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthKey());
  const [online, setOnline] = useState(navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#07181b' : '#04262b');
  }, [theme]);

  useEffect(() => {
    registerServiceWorker();
    const onUpdate = (event: Event) => {
      registrationRef.current = (event as CustomEvent).detail?.registration || null;
      setUpdateReady(true);
    };
    const onOnline = () => {
      setOnline(true);
      toast('success', 'Conexão restabelecida', 'Sincronizando sua escala…');
      void refreshRef.current?.();
    };
    const onOffline = () => {
      setOnline(false);
      toast('warning', 'Você está offline', 'A escala salva no aparelho continua disponível.');
    };
    const onOfflineReady = () => toast('info', 'Pronto para usar offline', 'O app já pode ser aberto sem internet.');

    window.addEventListener('rgsa:update-available', onUpdate);
    window.addEventListener('rgsa:offline-ready', onOfflineReady as EventListener);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('rgsa:update-available', onUpdate);
      window.removeEventListener('rgsa:offline-ready', onOfflineReady as EventListener);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<Partial<Bootstrap> & { user: User | null }>('/api/bootstrap');
      setBoot(data.user ? normalizeBoot(data) : null);
      setUser(data.user || null);
      setError(null);
      if (data.user && data.user.role === 'admin' && data.pendingApprovals > 0) {
        // apenas estado; o aviso fica no menu de aprovações
      }
      return data;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível carregar a escala.';
      setError(message);
      return null;
    }
  }, []);

  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  refreshRef.current = refresh;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await api.get<Partial<Bootstrap> & { user: User | null }>('/api/bootstrap');
        if (!alive) return;
        // token salvo que não vale mais (expirado/revogado) é descartado
        if (!data.user && getSessionToken()) setSessionToken(null);
        setBoot(data.user ? normalizeBoot(data) : null);
        setUser(data.user || null);
        // Mês inicial: mês do próximo plantão; se a escala estiver no passado,
        // abre no mês do registro mais recente (assim os dados migrantes do APK
        // nunca ficam "escondidos" no primeiro acesso).
        const preferred = data.defaultMonth;
        const active = (data.shifts || []).filter((s) => !s.deletedAt && s.status !== 'cancelado');
        if (preferred) setMonth(preferred);
        else {
          const latest = active.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
          if (latest) setMonth(latest.date.slice(0, 7));
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Falha ao conectar.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleAuthSuccess = useCallback(
    async (data: { user: User; sessionToken?: string }) => {
      // Guarda o token antes de qualquer chamada: é ele que sustenta a sessão
      // quando o navegador bloqueia cookies (prévia em iframe / Safari).
      if (data.sessionToken) setSessionToken(data.sessionToken);
      setUser(data.user);
      // evita servir em offline dados de outra sessão
      await clearOfflineData();
      const bootData = await refresh();
      if (bootData?.user) {
        // Abre no mês com escala (dados migrantes do APK) em vez do mês corrente vazio.
        if (bootData.defaultMonth) setMonth(bootData.defaultMonth);
        setError(null);
        const container = document.querySelector('.content-scroll');
        container?.scrollTo?.({ top: 0 });
        return;
      }
      // Login aceito, mas a sessão não se manteve: avisa em vez de voltar mudo
      // para a tela de login.
      setSessionToken(null);
      setUser(null);
      setBoot(null);
      throw new ApiError(
        'O acesso foi validado, mas a sessão não pôde ser mantida neste navegador. Recarregue a página e tente novamente — se o problema continuar, use outro navegador ou saia do modo privado.',
        { code: 'session_lost', status: 401 },
      );
    },
    [refresh],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ user: User; sessionToken?: string }>('/api/auth/login', { email, password });
      await handleAuthSuccess(data);
      toast('success', `Bem-vindo(a), ${data.user.name.split(' ')[0]}!`, 'Sua escala foi carregada.');
      return data.user;
    },
    [handleAuthSuccess, toast],
  );

  const signup = useCallback(
    async (payload: { name: string; email: string; phone: string; specialty: string; password: string }) => {
      const data = await api.post<{ status: string; message: string }>('/api/auth/signup', payload);
      return data;
    },
    [],
  );

  const loginGuest = useCallback(async () => {
    const data = await api.post<{ user: User; sessionToken?: string }>('/api/auth/guest');
    await handleAuthSuccess(data);
    toast('info', 'Acesso de convidado', 'Você pode consultar a escala, mas não editar.');
  }, [handleAuthSuccess, toast]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setSessionToken(null);
      await clearOfflineData();
    }
    setBoot(null);
    setUser(null);
    toast('info', 'Sessão encerrada', 'Até logo!');
  }, [toast]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const data = await api.post<{ message: string }>('/api/auth/change-password', { currentPassword, newPassword });
      toast('success', 'Senha atualizada', data.message);
    },
    [toast],
  );

  const mutate = useCallback(
    async <T,>(path: string, options: { method?: 'POST' | 'PUT' | 'DELETE'; body?: unknown }, successMessage?: string) => {
      const data =
        options.method === 'PUT'
          ? await api.put<T>(path, options.body)
          : options.method === 'DELETE'
            ? await api.delete<T>(path)
            : await api.post<T>(path, options.body);
      await refresh();
      if (successMessage) toast('success', successMessage);
      return data;
    },
    [refresh, toast],
  );

  const saveShift = useCallback(
    async (payload: Partial<Shift> & { acknowledgeWarnings?: boolean; force?: boolean }, id?: number) => {
      const path = id ? `/api/shifts/${id}` : '/api/shifts';
      await mutate(path, { method: id ? 'PUT' : 'POST', body: payload }, id ? 'Plantão atualizado' : 'Plantão adicionado à escala');
    },
    [mutate],
  );

  const deleteShift = useCallback(
    async (id: number) => {
      await mutate(`/api/shifts/${id}`, { method: 'DELETE' }, 'Plantão removido da escala');
    },
    [mutate],
  );

  const restoreShift = useCallback(
    async (id: number) => {
      await mutate(`/api/shifts/${id}/restore`, { method: 'POST' }, 'Plantão restaurado');
    },
    [mutate],
  );

  const saveOffDay = useCallback(
    async (payload: Partial<OffDay>, id?: number) => {
      const path = id ? `/api/off-days/${id}` : '/api/off-days';
      await mutate(path, { method: id ? 'PUT' : 'POST', body: payload }, id ? 'Folga atualizada' : 'Folga registrada');
    },
    [mutate],
  );

  const deleteOffDay = useCallback(
    async (id: number) => {
      await mutate(`/api/off-days/${id}`, { method: 'DELETE' }, 'Folga removida');
    },
    [mutate],
  );

  const saveCollaborator = useCallback(
    async (payload: Partial<Collaborator>, id?: number) => {
      const path = id ? `/api/collaborators/${id}` : '/api/collaborators';
      await mutate(path, { method: id ? 'PUT' : 'POST', body: payload }, id ? 'Dados do plantonista atualizados' : 'Plantonista adicionado à equipe');
    },
    [mutate],
  );

  const archiveCollaborator = useCallback(
    async (id: number) => {
      await mutate(`/api/collaborators/${id}`, { method: 'DELETE' }, 'Plantonista arquivado (histórico preservado)');
    },
    [mutate],
  );

  const approveUser = useCallback(
    async (id: number, role: 'admin' | 'member', collaboratorId?: number | null) => {
      const data = await api.post<{ message: string }>(`/api/admin/users/${id}/approve`, { role, collaboratorId });
      await refresh();
      toast('success', 'Cadastro aprovado', data.message);
    },
    [refresh, toast],
  );

  const rejectUser = useCallback(
    async (id: number, reason: string) => {
      const data = await api.post<{ message: string }>(`/api/admin/users/${id}/reject`, { reason });
      await refresh();
      toast('info', 'Solicitação recusada', data.message);
    },
    [refresh, toast],
  );

  const setUserStatus = useCallback(
    async (id: number, status: 'approved' | 'suspended' | 'pending') => {
      await api.post(`/api/admin/users/${id}/status`, { status });
      await refresh();
      toast('success', 'Status atualizado', 'A alteração vale imediatamente para o acesso deste usuário.');
    },
    [refresh, toast],
  );

  const setUserRole = useCallback(
    async (id: number, role: 'admin' | 'member') => {
      const data = await api.post<{ message: string }>(`/api/admin/users/${id}/role`, { role });
      await refresh();
      toast('success', t_roleSaved(role), data.message);
    },
    [refresh, toast],
  );

  const resetUserPassword = useCallback(
    async (id: number, newPassword: string) => {
      const data = await api.post<{ message: string }>(`/api/admin/users/${id}/reset-password`, { newPassword });
      toast('success', 'Senha redefinida', data.message);
    },
    [toast],
  );

  const importData = useCallback(
    async (payload: unknown) => {
      const data = await api.post<{ message: string; inserted: Record<string, number> }>('/api/admin/import', { payload });
      await refresh();
      toast('success', 'Importação concluída', data.message);
    },
    [refresh, toast],
  );

  const exportData = useCallback(async () => {
    const data = await api.get<Record<string, unknown>>('/api/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rgsa-plantao-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('success', 'Backup exportado', 'O arquivo JSON contém toda a escala, folgas e histórico.');
  }, [toast]);

  const backup = useCallback(async () => {
    const data = await api.post<{ message: string; file: string }>('/api/admin/backup');
    toast('success', 'Backup do banco criado', `${data.file} · ${data.message}`);
  }, [toast]);

  const audit = useCallback(async (limit = 60) => {
    const data = await api.get<{ audit: AuditEntry[] }>(`/api/admin/audit?limit=${limit}`);
    return data.audit;
  }, []);

  const syncFirebase = useCallback(
    async (confirm: boolean) => {
      const data = await api.post<Record<string, unknown>>('/api/integrations/firebase/sync', { confirm });
      toast(
        data.ok ? 'success' : 'warning',
        'Sincronização Firebase',
        String(data.message || (data.dryRun ? 'Ensaio concluído sem enviar dados.' : 'Concluído.')),
      );
      return data;
    },
    [toast],
  );

  const refreshWeather = useCallback(async () => {
    try {
      await api.get('/api/integrations/weather?refresh=1');
      await refresh();
      toast('success', 'Clima atualizado', 'Temperatura do Rio sincronizada com a Open-Meteo.');
    } catch {
      toast('warning', 'Clima indisponível', 'A escala continua funcionando normalmente.');
    }
  }, [refresh, toast]);

  const sendNotification = useCallback(async () => {
    try {
      const payload = await api.get<{ title: string; body: string; tag: string; data: { url: string } }>('/api/notifications/payload');
      const ok = await showShiftNotification(payload);
      if (ok) toast('success', 'Notificação enviada', payload.body);
      else toast('warning', 'Permissão necessária', 'Autorize as notificações no navegador para receber os alertas de plantão.');
    } catch {
      toast('error', 'Não foi possível notificar', 'Tente novamente em instantes.');
    }
  }, [toast]);

  const goToMonth = useCallback((delta: number) => {
    setMonth((current) => {
      const [y, m] = current.split('-').map(Number);
      const date = new Date(y, m - 1 + delta, 1);
      return monthKey(date);
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      boot,
      user,
      loading,
      error,
      month,
      setMonth,
      goToMonth,
      theme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      online,
      updateReady,
      applySWUpdate: () => applyUpdate(registrationRef.current),
      refresh,
      login,
      signup,
      loginGuest,
      logout,
      changePassword,
      saveShift,
      deleteShift,
      restoreShift,
      saveOffDay,
      deleteOffDay,
      saveCollaborator,
      archiveCollaborator,
      approveUser,
      rejectUser,
      setUserStatus,
      setUserRole,
      resetUserPassword,
      importData,
      exportData,
      backup,
      audit,
      syncFirebase,
      refreshWeather,
      sendNotification,
    }),
    [
      boot, user, loading, error, month, goToMonth, theme, online, updateReady, refresh, login, signup,
      loginGuest, logout, changePassword, saveShift, deleteShift, restoreShift, saveOffDay, deleteOffDay,
      saveCollaborator, archiveCollaborator, approveUser, rejectUser, setUserStatus, setUserRole, resetUserPassword,
      importData, exportData, backup, audit, syncFirebase, refreshWeather, sendNotification,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
