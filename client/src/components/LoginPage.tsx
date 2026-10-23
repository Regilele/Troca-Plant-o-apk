import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Languages,
  Loader2,
  LogIn,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserPlus,
  UserRound,
  Wallet,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useLang } from '../lib/i18n';
import { useToast } from './ui';
import { ApiError } from '../lib/api';
import { daysUntil, monthLabel, monthKey, WEEKDAYS_SHORT_PT } from '../lib/calendar';
import { useInstall } from '../lib/pwa';

type Mode = 'login' | 'signup';
type PendingState = null | { name: string; email: string; message: string };

function MiniCalendar() {
  const { boot } = useApp();
  const month = monthKey();
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const shiftsByDay = new Map<number, string>();
  const offsByDay = new Set<number>();
  for (const shift of boot?.shifts || []) {
    if (shift.date.startsWith(month)) shiftsByDay.set(Number(shift.date.slice(8)), shift.onShift);
  }
  for (const off of boot?.offDays || []) {
    if (off.date.startsWith(month)) offsByDay.add(Number(off.date.slice(8)));
  }
  const today = new Date().getDate();
  return (
    <div className="auth-mini-cal" aria-hidden="true">
      {WEEKDAYS_SHORT_PT.map((day) => (
        <span key={day} style={{ fontSize: 7.5, letterSpacing: '0.08em', color: '#6d9290', fontWeight: 700 }}>
          {day.slice(0, 1)}
        </span>
      ))}
      {cells.slice(0, 42).map((day, index) => {
        if (day === null) return <span key={`empty-${index}`} />;
        const has = shiftsByDay.has(day);
        const off = offsByDay.has(day);
        return (
          <span key={day} className={`${has ? 'has' : ''} ${off ? 'has-gold' : ''} ${day === today ? 'today' : ''}`}>
            {day}
          </span>
        );
      })}
    </div>
  );
}

export function LoginPage() {
  const { login, signup, loginGuest, theme, toggleTheme, month, boot } = useApp();
  const { lang, toggle: toggleLang, t } = useLang();
  const { toast } = useToast();
  const { canInstall, install, platform } = useInstall();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'login' | 'signup' | 'guest' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingState>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const nextShift = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (boot?.shifts || [])
      .filter((s) => !s.deletedAt && s.status !== 'cancelado' && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [boot]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError(t('Informe e-mail e senha para entrar.', 'Enter your email and password.'));
      return;
    }
    setBusy('login');
    try {
      await login(email.trim(), password);
    } catch (error) {
      const err = error as ApiError;
      setFormError(err.message);
      if (err.code === 'pending_approval') {
        setPending({ name: '', email: email.trim(), message: err.message });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!name.trim() || !email.trim() || password.length < 8) {
      setFormError(
        t('Preencha nome, e-mail e uma senha com pelo menos 8 caracteres.', 'Fill in name, email and a password with at least 8 characters.'),
      );
      return;
    }
    setBusy('signup');
    try {
      const result = await signup({ name: name.trim(), email: email.trim(), phone, specialty, password });
      setPending({ name: name.trim(), email: email.trim(), message: result.message });
      setPassword('');
    } catch (error) {
      const err = error as ApiError;
      setFormError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleGuest = async () => {
    setBusy('guest');
    try {
      await loginGuest();
    } catch (error) {
      toast('error', 'Acesso de convidado indisponível', (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-hero">
        <div className="brand">
          <div className="brand-mark">R&amp;</div>
          <div>
            <div className="brand-name">RG&amp;SA PLANTÃO</div>
            <div className="brand-sub">Escala integrada · desde 2024</div>
          </div>
        </div>

        <div className="stack gap-16">
          <h1 className="auth-title">
            {lang === 'pt' ? (
              <>
                Sua escala <em>impecável</em>, do plantão ao pagamento.
              </>
            ) : (
              <>
                Your roster, <em>flawless</em> — from shift to payment.
              </>
            )}
          </h1>
          <p className="auth-lead">
            {lang === 'pt'
              ? 'Plantões 12x36, trocas, folgas e datas de pagamento organizados em um só painel — com aprovação do administrador para cada novo plantonista.'
              : '12x36 shifts, swaps, off-days and payment dates in one panel — with admin approval for every new team member.'}
          </p>
        </div>

        <div className="auth-points">
          {[
            {
              icon: <CalendarDays />,
              pt: 'Calendário mensal completo, sem cortes nem sobreposição',
              en: 'Full monthly calendar, no clipping or overlap',
            },
            {
              icon: <Wallet />,
              pt: 'Data da troca e data do pagamento em campos separados',
              en: 'Swap date and payment date in separate fields',
            },
            {
              icon: <ShieldCheck />,
              pt: 'Cadastro só entra na escala após aprovação do admin',
              en: 'New accounts join only after admin approval',
            },
            {
              icon: <Sparkles />,
              pt: 'Instale no celular e consulte mesmo offline',
              en: 'Install on your phone and check it offline',
            },
          ].map((item) => (
            <div className="auth-point" key={item.pt}>
              <div className="auth-point-icon">{item.icon}</div>
              <div>{lang === 'pt' ? item.pt : item.en}</div>
            </div>
          ))}
        </div>

        <div className="auth-hero-footer">
          <MiniCalendar />
          <div className="auth-stats">
            <div className="auth-stat">
              <div className="v">{boot?.collaborators?.length ?? 4}</div>
              <div className="l">{lang === 'pt' ? 'Plantonistas' : 'Members'}</div>
            </div>
            <div className="auth-stat">
              <div className="v">{boot?.shifts?.length ?? 6}</div>
              <div className="l">{lang === 'pt' ? 'Plantões' : 'Shifts'}</div>
            </div>
            <div className="auth-stat">
              <div className="v">{monthLabel(month, lang).split(' ')[0]}</div>
              <div className="l">{lang === 'pt' ? 'Mês ativo' : 'Active month'}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="brand-mark" style={{ width: 40, height: 40, borderRadius: 13, fontSize: 17 }}>R&amp;</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>RG&amp;SA PLANTÃO</div>
              <div className="muted" style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {lang === 'pt' ? 'Escala integrada' : 'Integrated roster'}
              </div>
            </div>
            <div className="grow" />
            <button className="icon-btn sm" onClick={toggleLang} aria-label="Alterar idioma" title="PT / EN">
              <Languages />
            </button>
            <button className="icon-btn sm" onClick={toggleTheme} aria-label="Alterar tema">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
          </div>

          <div className="row gap-8" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
            <span className="badge gold">
              <Sparkles size={12} /> {lang === 'pt' ? 'Prévia segura · sem produção' : 'Safe preview · not production'}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {pending ? (
              <motion.div
                key="pending"
                className="auth-status"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <div className="auth-success-mark">
                  <Clock3 />
                </div>
                <div>
                  <div className="auth-title-sm">{t('Cadastro enviado!', 'Request sent!')}</div>
                  <p className="muted small" style={{ marginTop: 6 }}>
                    {t(
                      'Sua solicitação está na fila de aprovação do administrador. O acesso é liberado assim que ele aprovar — você não precisa fazer nada.',
                      'Your request is in the admin approval queue. Access is unlocked as soon as it is approved — you do not need to do anything.',
                    )}
                  </p>
                </div>
                <div className="card" style={{ padding: 16, boxShadow: 'none', background: 'var(--bg-soft)' }}>
                  <div className="timeline">
                    <div className="timeline-item">
                      <div className="timeline-dot done"><CheckCircle2 /></div>
                      <div>
                        <div className="timeline-title">{t('Solicitação recebida', 'Request received')}</div>
                        <div className="timeline-sub">{pending.email}</div>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <div className="timeline-dot current"><Clock3 /></div>
                      <div>
                        <div className="timeline-title">{t('Aguardando aprovação do administrador', 'Awaiting admin approval')}</div>
                        <div className="timeline-sub">
                          {t('O administrador revisa e libera o acesso ao painel.', 'The admin reviews and unlocks dashboard access.')}
                        </div>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <div className="timeline-dot"><LogIn /></div>
                      <div>
                        <div className="timeline-title">{t('Acesso liberado', 'Access granted')}</div>
                        <div className="timeline-sub">{t('Entre com seu e-mail e senha.', 'Sign in with your email and password.')}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="auth-demo">
                  {t(
                    'Dica para testar agora: o administrador já tem uma solicitação pendente (Camila Rocha) para aprovar no menu "Aprovações".',
                    'Tip to test now: the admin already has a pending request (Camila Rocha) to approve in the "Approvals" menu.',
                  )}
                </div>
                <button
                  className="btn btn-primary btn-block btn-lg"
                  onClick={() => {
                    setPending(null);
                    setMode('login');
                    setEmail(pending.email);
                  }}
                >
                  <LogIn /> {t('Já fui aprovado — entrar', 'I am approved — sign in')}
                </button>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <div className="auth-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    className={mode === 'login' ? 'active' : ''}
                    onClick={() => {
                      setMode('login');
                      setFormError(null);
                    }}
                  >
                    {t('Entrar', 'Sign in')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'signup'}
                    className={mode === 'signup' ? 'active' : ''}
                    onClick={() => {
                      setMode('signup');
                      setFormError(null);
                    }}
                  >
                    {t('Criar cadastro', 'Create account')}
                  </button>
                </div>

                <div className="stack gap-8" style={{ marginBottom: 18 }}>
                  <div className="auth-title-sm">
                    {mode === 'login'
                      ? t('Bem-vindo de volta!', 'Welcome back!')
                      : t('Solicitar acesso', 'Request access')}
                  </div>
                  <p className="muted small">
                    {mode === 'login'
                      ? t('Acesse a escala unificada do plantão.', 'Access the unified shift calendar.')
                      : t('Crie sua conta: o administrador aprova e libera o acesso.', 'Create your account: the admin approves and unlocks access.')}
                  </p>
                </div>

                {formError && (
                  <div className="alert danger" style={{ marginBottom: 14 }}>
                    <ShieldCheck />
                    <div>{formError}</div>
                  </div>
                )}

                <form className="auth-form" onSubmit={mode === 'login' ? handleLogin : handleSignup}>
                  {mode === 'signup' && (
                    <>
                      <div className="field">
                        <label className="label" htmlFor="signup-name">
                          {t('Nome completo', 'Full name')} <span className="req">*</span>
                        </label>
                        <div className="input-icon">
                          <UserRound />
                          <input
                            id="signup-name"
                            className="input"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t('Ex.: Camila Rocha', 'e.g. Camila Rocha')}
                            autoComplete="name"
                            required
                          />
                        </div>
                      </div>
                      <div className="form-grid">
                        <div className="field">
                          <label className="label" htmlFor="signup-phone">
                            {t('Telefone', 'Phone')}
                          </label>
                          <input
                            id="signup-phone"
                            className="input"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="(21) 98888-7777"
                            inputMode="tel"
                            autoComplete="tel"
                          />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor="signup-specialty">
                            {t('Cargo / especialidade', 'Role / specialty')}
                          </label>
                          <input
                            id="signup-specialty"
                            className="input"
                            value={specialty}
                            onChange={(event) => setSpecialty(event.target.value)}
                            placeholder={t('Ex.: Enfermeira', 'e.g. Nurse')}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="field">
                    <label className="label" htmlFor="auth-email">
                      {t('E-mail', 'Email')} <span className="req">*</span>
                    </label>
                    <div className="input-icon">
                      <Mail />
                      <input
                        id="auth-email"
                        className="input"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="voce@exemplo.com"
                        autoComplete="email"
                        inputMode="email"
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="auth-password">
                      {t('Senha', 'Password')} <span className="req">*</span>
                    </label>
                    <div className="input-icon">
                      <KeyRound />
                      <input
                        id="auth-password"
                        className="input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={mode === 'signup' ? t('Mínimo de 8 caracteres', 'At least 8 characters') : '••••••••'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                        style={{ paddingRight: 44 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? t('Ocultar senha', 'Hide password') : t('Mostrar senha', 'Show password')}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 0,
                          background: 'transparent',
                          color: 'var(--ink-3)',
                          padding: 6,
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {mode === 'login' && (
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <span className="tiny muted">
                        {nextShift
                          ? t(`Próximo plantão em ${daysUntil(nextShift.date)} dia(s)`, `Next shift in ${daysUntil(nextShift.date)} day(s)`)
                          : t('Nenhum plantão futuro', 'No upcoming shift')}
                      </span>
                      <button
                        type="button"
                        className="tiny"
                        style={{ background: 'transparent', border: 0, color: 'var(--brand)', fontWeight: 600 }}
                        onClick={() => setShowRecovery(true)}
                      >
                        {t('Esqueci minha senha', 'Forgot password')}
                      </button>
                    </div>
                  )}

                  <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy !== null}>
                    {busy === 'login' || busy === 'signup' ? (
                      <Loader2 className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : mode === 'login' ? (
                      <LogIn />
                    ) : (
                      <UserPlus />
                    )}
                    {mode === 'login' ? t('Entrar na escala', 'Sign in') : t('Enviar para aprovação', 'Send for approval')}
                  </button>
                </form>

                <div className="auth-divider">{t('ou', 'or')}</div>

                <button type="button" className="btn btn-outline btn-block" onClick={handleGuest} disabled={busy !== null}>
                  {busy === 'guest' ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <Eye />}
                  {t('Entrar como convidado (somente leitura)', 'Continue as guest (read only)')}
                </button>

                <div className="auth-demo">
                  <strong>{t('Contas de demonstração', 'Demo accounts')}</strong>
                  <div style={{ marginTop: 4 }}>
                    {t('Admin', 'Admin')}: <code>admin@rgsa.plantao</code> ·{' '}
                    {t('Plantonista', 'Member')}: <code>juliana@rgsa.plantao</code>
                    <br />
                    {t('Senha', 'Password')}: <code>Plantao@2026</code>
                  </div>
                </div>

                {platform === 'ios' && (
                  <p className="auth-footnote" style={{ marginTop: 12 }}>
                    {t(
                      'No iPhone: toque em Compartilhar → “Adicionar à Tela de Início” para instalar.',
                      'On iPhone: tap Share → “Add to Home Screen” to install.',
                    )}
                  </p>
                )}
                {canInstall && (
                  <button type="button" className="btn btn-soft btn-block" style={{ marginTop: 12 }} onClick={() => void install()}>
                    <Sparkles /> {t('Instalar aplicativo neste aparelho', 'Install app on this device')}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {showRecovery && (
            <div className="alert info" style={{ marginTop: 16 }}>
              <Mail />
              <div>
                <div className="strong">{t('Recuperação de acesso', 'Access recovery')}</div>
                <div className="small" style={{ marginTop: 3 }}>
                  {t(
                    'A redefinição é feita pelo administrador do plantão para manter a escala segura. Fale com o suporte: ',
                    'Password resets are handled by the shift admin to keep the roster secure. Contact support: ',
                  )}
                  <a href="https://wa.me/5521980498068" target="_blank" rel="noreferrer">
                    (21) 98049-8068
                  </a>
                </div>
              </div>
              <button className="icon-btn sm" onClick={() => setShowRecovery(false)} aria-label={t('Fechar', 'Close')}>
                ✕
              </button>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 20, gap: 8 }}>
            <span className="tiny muted">© {new Date().getFullYear()} RG&amp;SA PLANTÃO</span>
            <button
              type="button"
              className="tiny row gap-4"
              style={{ background: 'transparent', border: 0, color: 'var(--ink-3)' }}
              onClick={toggleLang}
            >
              <Languages size={12} /> {lang === 'pt' ? 'Português' : 'English'}
              <ArrowRight size={11} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
