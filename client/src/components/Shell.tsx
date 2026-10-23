import { type ReactNode } from 'react';
import {
  ArrowDownToLine,
  CalendarDays,
  FileBarChart,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { useInstall } from '../lib/pwa';
import { Avatar } from './ui';
import { monthLabel } from '../lib/calendar';
import { paletteFor } from '../lib/colors';

export type TabId = 'visao' | 'escala' | 'equipe' | 'relatorios' | 'aprovacoes' | 'ajustes';

export interface NavItem {
  id: TabId;
  labelPt: string;
  labelEn: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'visao', labelPt: 'Visão geral', labelEn: 'Overview', icon: <LayoutDashboard /> },
  { id: 'escala', labelPt: 'Escala', labelEn: 'Roster', icon: <CalendarDays /> },
  { id: 'equipe', labelPt: 'Equipe', labelEn: 'Team', icon: <Users /> },
  { id: 'relatorios', labelPt: 'Relatórios', labelEn: 'Reports', icon: <FileBarChart /> },
  { id: 'aprovacoes', labelPt: 'Aprovações', labelEn: 'Approvals', icon: <ShieldCheck />, adminOnly: true },
  { id: 'ajustes', labelPt: 'Ajustes', labelEn: 'Settings', icon: <Settings2 /> },
];

const MOBILE_ITEMS: TabId[] = ['visao', 'escala', 'equipe', 'relatorios', 'ajustes'];

export function Shell({
  tab,
  onTab,
  children,
  actions,
}: {
  tab: TabId;
  onTab: (tab: TabId) => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { boot, user, logout, theme, toggleTheme, online, refresh, loading, updateReady, applySWUpdate } = useApp();
  const { lang, toggle: toggleLang, t } = useLang();
  const { canInstall, installed, platform } = useInstall();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'admin');
  const pending = boot?.pendingApprovals ?? 0;

  const titles: Record<TabId, { title: string; eyebrow: string }> = {
    visao: { title: t('Visão geral', 'Overview'), eyebrow: t('Painel do plantão', 'Shift dashboard') },
    escala: { title: t('Escala do mês', 'Monthly roster'), eyebrow: monthLabel(boot?.defaultMonth || '', lang).replace(' de ', ' de ') || t('Escala', 'Roster') },
    equipe: { title: t('Equipe do plantão', 'Shift team'), eyebrow: t('Plantonistas e ciclos', 'Members and cycles') },
    relatorios: { title: t('Relatórios', 'Reports'), eyebrow: t('PDF, e-mail e CSV', 'PDF, email and CSV') },
    aprovacoes: { title: t('Aprovações', 'Approvals'), eyebrow: t('Cadastros e auditoria', 'Signups and audit') },
    ajustes: { title: t('Ajustes', 'Settings'), eyebrow: t('App, dados e integrações', 'App, data and integrations') },
  };
  const heading = titles[tab];

  const navButton = (item: NavItem, mobile = false) => {
    const active = tab === item.id;
    const label = lang === 'pt' ? item.labelPt : item.labelEn;
    if (mobile) {
      return (
        <button
          key={item.id}
          data-tab={item.id}
          className={active ? 'active' : ''}
          onClick={() => onTab(item.id)}
          aria-current={active ? 'page' : undefined}
        >
          {item.icon}
          <span>{label.length > 12 ? label.slice(0, 10) : label}</span>
        </button>
      );
    }
    return (
      <button
        key={item.id}
        data-tab={item.id}
        className={`nav-item${active ? ' active' : ''}`}
        onClick={() => onTab(item.id)}
        aria-current={active ? 'page' : undefined}
        style={{ position: 'relative' }}
      >
        <span className="nav-icon" aria-hidden="true">{item.icon}</span>
        <span>{label}</span>
        {item.id === 'aprovacoes' && pending > 0 && <span className="nav-badge">{pending}</span>}
        {active && (
          <motion.span
            layoutId="nav-active"
            style={{ position: 'absolute', inset: 0, borderRadius: 13, zIndex: -1, background: 'linear-gradient(120deg, #d9f4f2, #a9e6ec)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          />
        )}
      </button>
    );
  };

  const profilePalette = paletteFor(boot?.collaborators.find((c) => c.id === user?.collaboratorId)?.colorHex);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R&amp;</div>
          <div>
            <div className="brand-name">RG&amp;SA PLANTÃO</div>
            <div className="brand-sub">Escala integrada</div>
          </div>
        </div>

        <nav className="side-nav" aria-label={t('Navegação principal', 'Main navigation')}>
          <div className="nav-section-label">{t('Painel', 'Dashboard')}</div>
          {items.filter((item) => ['visao', 'escala', 'equipe', 'relatorios'].includes(item.id)).map((item) => navButton(item))}
          <div className="nav-section-label">{t('Gestão', 'Management')}</div>
          {items.filter((item) => ['aprovacoes', 'ajustes'].includes(item.id)).map((item) => navButton(item))}
        </nav>

        <div className="sidebar-footer">
          {!installed && (
            <button className="install-pill" onClick={() => onTab('ajustes')}>
              <Smartphone size={17} />
              <span className="grow">
                {canInstall
                  ? t('Instalar o app no aparelho', 'Install app on device')
                  : t('Como instalar no celular', 'How to install on phone')}
              </span>
              <ArrowDownToLine size={14} />
            </button>
          )}
          <div className="user-card">
            <Avatar
              name={user?.name || 'Convidado'}
              color={boot?.collaborators.find((c) => c.id === user?.collaboratorId)?.colorHex || 'bg-teal-600'}
              char={(user?.name || 'G').slice(0, 1)}
              size="sm"
            />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="user-card-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div className="user-card-role">
                {user?.isGuest ? t('Convidado · leitura', 'Guest · read only') : user?.role === 'admin' ? t('Administrador', 'Admin') : t('Plantonista', 'Member')}
              </div>
            </div>
            <button
              className="icon-btn sm"
              style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)', color: '#cfe6e3', boxShadow: 'none' }}
              onClick={() => void logout()}
              aria-label={t('Sair', 'Sign out')}
              title={t('Sair', 'Sign out')}
            >
              <LogOut />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="mobile-topbar">
          <div className="row gap-8" style={{ minWidth: 0 }}>
            <div className="brand-mark">R&amp;</div>
            <div style={{ minWidth: 0 }}>
              <div className="brand-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                RG&amp;SA PLANTÃO
              </div>
              <div className="brand-sub">{t('Escala integrada', 'Integrated roster')}</div>
            </div>
          </div>
          <div className="mobile-topbar-actions">
            <button className="icon-btn sm" data-action="lang" onClick={toggleLang} aria-label="PT/EN">
              <Languages />
            </button>
            <button className="icon-btn sm" data-action="theme" onClick={toggleTheme} aria-label={t('Alternar tema', 'Toggle theme')}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <button className="icon-btn sm" onClick={() => void refresh()} aria-label={t('Atualizar', 'Refresh')}>
              <RefreshCw className={loading ? 'spin' : ''} />
            </button>
            {!installed && (
              <button className="icon-btn sm" onClick={() => onTab('ajustes')} aria-label={t('Instalar app', 'Install app')}>
                <Smartphone />
              </button>
            )}
          </div>
        </header>

        <header className="topbar">
          <div className="topbar-titles">
            <div className="topbar-eyebrow">{heading.eyebrow}</div>
            <h1 className="display">{heading.title}</h1>
          </div>
          <div className="topbar-actions">
            {actions}
            <button className="icon-btn" data-action="lang" onClick={toggleLang} aria-label="PT / EN" title="Português / English">
              <Languages />
            </button>
            <button className="icon-btn" data-action="theme" onClick={toggleTheme} aria-label={t('Alternar tema', 'Toggle theme')}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>

        <AnimatePresence>
          {!online && (
            <motion.div
              className="banner warning"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <WifiOff />
              <div className="grow">{t('Sem internet: você está vendo a última escala salva no aparelho.', 'Offline: showing the last roster saved on this device.')}</div>
            </motion.div>
          )}
          {updateReady && (
            <motion.div className="banner info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Zap />
              <div className="grow">{t('Nova versão disponível.', 'A new version is available.')}</div>
              <button className="btn btn-sm btn-primary" onClick={applySWUpdate}>
                {t('Atualizar agora', 'Update now')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="content-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {children}
        </main>

        <div className="row gap-8 small muted wrap" style={{ justifyContent: 'space-between', paddingTop: 6 }}>
          <span className="row gap-8">
            <UserRound size={13} /> {user?.name}
            {user?.isGuest && <span className="badge outline">{t('Convidado', 'Guest')}</span>}
            {user?.role === 'admin' && <span className="badge gold">{t('Admin', 'Admin')}</span>}
          </span>
          <span>
            {t('Dados migrados de', 'Data migrated from')} {boot?.legacy?.source || 'APK v1.0'} · v{boot?.version || '2.0.0'}
          </span>
        </div>
      </div>

      <nav className="mobile-nav" aria-label={t('Navegação', 'Navigation')}>
        {items
          .filter((item) => MOBILE_ITEMS.includes(item.id))
          .sort((a, b) => MOBILE_ITEMS.indexOf(a.id) - MOBILE_ITEMS.indexOf(b.id))
          .map((item) => navButton(item, true))}
      </nav>

      <style>{`
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1024px) {
          .mobile-nav button { position: relative; }
          .mobile-nav button.active::before {
            content: ''; position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
            width: 22px; height: 3px; border-radius: 999px;
            background: linear-gradient(90deg, var(--brand-2), var(--gold-2));
          }
        }
      `}</style>
    </div>
  );
}
