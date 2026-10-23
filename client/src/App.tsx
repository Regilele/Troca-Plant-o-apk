import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppProvider, useApp } from './state/AppContext';
import { LanguageProvider, useLang } from './lib/i18n';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { LoginPage } from './components/LoginPage';
import { Shell, type TabId } from './components/Shell';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { TeamPage } from './pages/TeamPage';
import { ReportsPage } from './pages/ReportsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShiftForm } from './components/ShiftForm';
import { OffDayForm } from './components/OffDayForm';
import { DayDrawer } from './components/DayDrawer';
import type { OffDay, Shift } from './types';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RG&SA] erro de interface', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="loading-screen">
          <div className="loading-inner">
            <div className="loading-mark" style={{ background: 'linear-gradient(140deg, #b42318, #7a1d13)' }}>
              <AlertTriangle size={26} />
            </div>
            <div>
              <h2>Algo saiu do previsto</h2>
              <p className="muted small" style={{ maxWidth: 380, marginTop: 8 }}>
                A interface encontrou um erro inesperado. Nenhum dado da escala foi alterado — recarregue para continuar.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw /> Recarregar o app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-inner">
        <div className="loading-mark">R&amp;</div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>RG&amp;SA PLANTÃO</h2>
          <p className="muted small" style={{ marginTop: 6 }}>Carregando a escala integrada…</p>
        </div>
        <div className="loading-bar">
          <span />
        </div>
      </div>
    </div>
  );
}

function Root() {
  const { boot, loading, error, user, refresh } = useApp();
  const { t } = useLang();
  const [tab, setTab] = useState<TabId>(() => {
    const param = new URLSearchParams(window.location.search).get('tab');
    const valid: TabId[] = ['visao', 'escala', 'equipe', 'relatorios', 'aprovacoes', 'ajustes'];
    return (valid.includes(param as TabId) ? param : 'visao') as TabId;
  });

  const [shiftForm, setShiftForm] = useState<{ open: boolean; shift: Shift | null; date: string | null }>({
    open: false,
    shift: null,
    date: null,
  });
  const [offForm, setOffForm] = useState<{ open: boolean; offDay: OffDay | null; date: string | null }>({
    open: false,
    offDay: null,
    date: null,
  });
  const [day, setDay] = useState<string | null>(null);

  const changeTab = useCallback((next: TabId) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'visao') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url);
    document.querySelector('.main-area')?.scrollTo?.({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (tab === 'aprovacoes' && user?.role !== 'admin') changeTab('visao');
  }, [tab, user, changeTab]);

  if (loading && !boot && !error) return <LoadingScreen />;

  if (!user) {
    if (error && !boot) {
      return (
        <div className="loading-screen">
          <div className="loading-inner">
            <div className="loading-mark" style={{ background: 'linear-gradient(140deg, #b42318, #7a1d13)' }}>
              <AlertTriangle size={26} />
            </div>
            <div>
              <h2>{t('Não foi possível carregar', 'Could not load')}</h2>
              <p className="muted small" style={{ maxWidth: 380, marginTop: 8 }}>
                {error || t('Verifique sua conexão e tente novamente.', 'Check your connection and try again.')}
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => void refresh()}>
              <RefreshCw /> {t('Tentar novamente', 'Try again')}
            </button>
          </div>
        </div>
      );
    }
    return <LoginPage />;
  }

  if (!boot) return <LoadingScreen />;

  const openShift = (shift: Shift) => {
    setDay(null);
    setShiftForm({ open: true, shift, date: shift.date });
  };

  return (
    <>
      <Shell tab={tab} onTab={changeTab}>
        {tab === 'visao' && (
          <DashboardPage
            onNewShift={() => setShiftForm({ open: true, shift: null, date: new Date().toISOString().slice(0, 10) })}
            onNewOffDay={() => setOffForm({ open: true, offDay: null, date: new Date().toISOString().slice(0, 10) })}
            onOpenShift={openShift}
            onGoReports={() => changeTab('relatorios')}
            onGoApprovals={() => changeTab('aprovacoes')}
            onGoCalendar={() => changeTab('escala')}
          />
        )}
        {tab === 'escala' && (
          <CalendarPage
            onDayClick={setDay}
            onNewShift={() => setShiftForm({ open: true, shift: null, date: null })}
            onNewOffDay={() => setOffForm({ open: true, offDay: null, date: null })}
            onOpenShift={openShift}
          />
        )}
        {tab === 'equipe' && <TeamPage />}
        {tab === 'relatorios' && <ReportsPage />}
        {tab === 'aprovacoes' && <ApprovalsPage />}
        {tab === 'ajustes' && <SettingsPage />}
      </Shell>

      <ShiftForm
        open={shiftForm.open}
        shift={shiftForm.shift}
        initialDate={shiftForm.date}
        onClose={() => setShiftForm({ open: false, shift: null, date: null })}
        onSaved={() => setDay(null)}
      />

      <OffDayForm
        open={offForm.open}
        offDay={offForm.offDay}
        initialDate={offForm.date}
        onClose={() => setOffForm({ open: false, offDay: null, date: null })}
        onSaved={() => setDay(null)}
      />

      <DayDrawer
        date={day}
        onClose={() => setDay(null)}
        onEditShift={openShift}
        onNewShift={(date) => {
          setDay(null);
          setShiftForm({ open: true, shift: null, date });
        }}
        onNewOffDay={(date) => {
          setDay(null);
          setOffForm({ open: true, offDay: null, date });
        }}
        onEditOffDay={(id) => {
          const off = boot.offDays.find((o) => o.id === id) || null;
          setDay(null);
          setOffForm({ open: true, offDay: off, date: off?.date || null });
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppProvider>
              <Root />
            </AppProvider>
          </ConfirmProvider>
        </ToastProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
