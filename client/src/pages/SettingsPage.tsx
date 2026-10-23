import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CloudSun,
  Database,
  Download,
  FileUp,
  HardDriveDownload,
  Info,
  KeyRound,
  Languages,
  Loader2,
  MessageCircle,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Wallet,
  Wind,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { formatPhone } from '../lib/calendar';
import { useLang } from '../lib/i18n';
import { Field, useConfirm, useToast } from '../components/ui';
import { InstallCard } from '../components/InstallCard';
import { ApiError } from '../lib/api';

export function SettingsPage() {
  const {
    boot,
    user,
    theme,
    toggleTheme,
    changePassword,
    logout,
    exportData,
    backup,
    importData,
    refreshWeather,
    syncFirebase,
    sendNotification,
    online,
  } = useApp();
  const { lang, toggle: toggleLang, setLang, t } = useLang();
  const { toast } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fbResult, setFbResult] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';
  const weather = boot?.integrations?.find((i) => i.name === 'open-meteo');
  const firebase = boot?.integrations?.find((i) => i.name === 'firebase-rtdb');

  useEffect(() => {
    if (boot?.user?.name) setCurrentPassword('');
  }, [boot?.user?.name]);

  const handlePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast('warning', t('Senha curta', 'Password too short'), t('Use pelo menos 8 caracteres.', 'Use at least 8 characters.'));
      return;
    }
    setBusy('password');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      toast('error', t('Não foi possível alterar', 'Could not change'), (error as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const ok = await confirm({
        title: t('Importar dados?', 'Import data?'),
        message: t(
          'A importação apenas adiciona registros que ainda não existem. Nada é apagado nem sobrescrito. Você pode exportar um backup antes.',
          'Importing only adds records that do not exist yet. Nothing is deleted or overwritten. You can export a backup first.',
        ),
        confirmLabel: t('Importar', 'Import'),
      });
      if (!ok) return;
      setBusy('import');
      await importData(parsed);
    } catch (error) {
      toast('error', t('Arquivo inválido', 'Invalid file'), (error as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleFirebase = async () => {
    setBusy('firebase');
    try {
      const result = await syncFirebase(false);
      setFbResult(String(result.message || ''));
    } catch (error) {
      toast('error', t('Falha na integração', 'Integration failed'), (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack gap-18">
      <div className="dashboard-grid">
        <section className="card col-7">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Sua conta', 'Your account')}</div>
              <div className="card-sub">{t('perfil e segurança', 'profile and security')}</div>
            </div>
            <div className="badge gold">
              <BadgeCheck size={12} /> {user?.isGuest ? t('Convidado', 'Guest') : user?.role === 'admin' ? t('Administrador', 'Admin') : t('Plantonista', 'Member')}
            </div>
          </div>
          <div className="stack gap-12">
            <div className="setting-row">
              <div className="grow">
                <div className="setting-title">{user?.name}</div>
                <div className="setting-sub">{user?.email || t('Acesso somente leitura', 'Read-only access')}</div>
              </div>
              <span className={`badge ${user?.status === 'approved' ? 'success' : 'warning'}`}>
                {user?.status === 'approved' ? t('Aprovado', 'Approved') : user?.status}
              </span>
            </div>
            <div className="setting-row">
              <div className="grow">
                <div className="setting-title">{t('Cargo / especialidade', 'Role / specialty')}</div>
                <div className="setting-sub">{user?.specialty || t('Não informado no cadastro', 'Not informed')}</div>
              </div>
              <span className="tiny muted">{user?.phone ? formatPhone(user.phone) : t('sem telefone', 'no phone')}</span>
            </div>
            {user?.collaboratorId && (
              <div className="setting-row">
                <div className="grow">
                  <div className="setting-title">{t('Vínculo na escala', 'Roster link')}</div>
                  <div className="setting-sub">{boot?.collaborators.find((c) => c.id === user.collaboratorId)?.name}</div>
                </div>
                <span className="badge success">{t('Ativo', 'Active')}</span>
              </div>
            )}
          </div>

          {!user?.isGuest && (
            <form className="stack gap-12" onSubmit={handlePassword} style={{ marginTop: 16 }}>
              <hr className="divider" style={{ margin: '6px 0 4px' }} />
              <div className="strong" style={{ fontSize: 13 }}>{t('Alterar senha', 'Change password')}</div>
              <div className="form-grid">
                <Field label={t('Senha atual', 'Current password')}>
                  <input
                    className="input"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field label={t('Nova senha', 'New password')} hint={t('mínimo 8 caracteres', 'min. 8 characters')}>
                  <input
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </div>
              <div className="row gap-8" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-outline btn-sm" disabled={busy === 'password'}>
                  {busy === 'password' ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound />}
                  {t('Salvar nova senha', 'Save new password')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>
                  {t('Sair da conta', 'Sign out')}
                </button>
              </div>
            </form>
          )}
        </section>

        <div className="col-5 stack gap-18">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{t('Aparência', 'Appearance')}</div>
                <div className="card-sub">{t('tema e idioma', 'theme and language')}</div>
              </div>
              <Palette size={16} />
            </div>
            <div className="setting-row">
              <div className="rule-icon">{theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}</div>
              <div className="grow">
                <div className="setting-title">{t('Tema escuro', 'Dark theme')}</div>
                <div className="setting-sub">{t('A escolha fica salva neste aparelho.', 'Your choice is saved on this device.')}</div>
              </div>
              <button
                type="button"
                className="switch"
                data-on={theme === 'dark'}
                onClick={toggleTheme}
                aria-pressed={theme === 'dark'}
                aria-label={t('Alternar tema', 'Toggle theme')}
              />
            </div>
            <div className="setting-row">
              <div className="rule-icon">
                <Languages size={16} />
              </div>
              <div className="grow">
                <div className="setting-title">{t('Idioma', 'Language')}</div>
                <div className="setting-sub">{t('Português e inglês completos.', 'Full Portuguese and English.')}</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={toggleLang}>
                {lang === 'pt' ? 'Português' : 'English'}
              </button>
            </div>
            <div className="setting-row" style={{ borderBottom: 0 }}>
              <div className="rule-icon">
                <Bell size={16} />
              </div>
              <div className="grow">
                <div className="setting-title">{t('Notificações de plantão', 'Shift notifications')}</div>
                <div className="setting-sub">{t('Receba o resumo do próximo plantão.', 'Get the next shift summary.')}</div>
              </div>
              <button type="button" className="btn btn-sm btn-soft" onClick={() => void sendNotification()}>
                {t('Testar', 'Test')}
              </button>
            </div>
          </section>

          <InstallCard />
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card col-6">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Integrações', 'Integrations')}</div>
              <div className="card-sub">{t('preservadas do APK, isoladas da produção', 'carried from the APK, isolated from production')}</div>
            </div>
            <ShieldCheck size={16} />
          </div>
          <div className="stack gap-10">
            <div className="integration-card">
              <div className="integration-head">
                <div className="integration-name">
                  <span className={`status-dot ${weather?.status || 'offline'}`} /> {t('Clima — Open-Meteo', 'Weather — Open-Meteo')}
                </div>
                <span className={`badge ${weather?.status === 'online' ? 'success' : weather?.status === 'degraded' ? 'warning' : 'outline'}`}>
                  {weather?.status || 'offline'}
                </span>
              </div>
              <div className="hint">{weather?.detail}</div>
              {weather?.sample && (
                <div className="row gap-10" style={{ marginTop: 4 }}>
                  <span className="row gap-4 small">
                    <CloudSun size={13} /> {Math.round(weather.sample.temperature)}°C
                  </span>
                  <span className="row gap-4 small muted">
                    <Wind size={13} /> {Math.round(weather.sample.windSpeed)} km/h
                  </span>
                  <span className="small muted">{weather.sample.description}</span>
                </div>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => void refreshWeather()} style={{ alignSelf: 'flex-start' }}>
                <RefreshCw /> {t('Atualizar agora', 'Refresh now')}
              </button>
            </div>

            <div className="integration-card">
              <div className="integration-head">
                <div className="integration-name">
                  <span className={`status-dot ${firebase?.enabled ? 'online' : 'disabled'}`} /> Firebase Realtime DB
                </div>
                <span className="badge outline">{firebase?.enabled ? t('Ligado', 'On') : t('Desligado', 'Off')}</span>
              </div>
              <div className="hint">{firebase?.detail}</div>
              {fbResult && <div className="alert info" style={{ fontSize: 11.5 }}>{fbResult}</div>}
              <button className="btn btn-sm btn-outline" onClick={() => void handleFirebase()} disabled={busy === 'firebase'} style={{ alignSelf: 'flex-start' }}>
                {busy === 'firebase' ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <Database />}
                {t('Testar sincronização (dry-run)', 'Test sync (dry-run)')}
              </button>
            </div>

            <div className="integration-card">
              <div className="integration-head">
                <div className="integration-name">
                  <span className="status-dot online" /> {t('Suporte e PIX', 'Support and PIX')}
                </div>
                <span className="badge success">{online ? t('conectado', 'online') : t('offline', 'offline')}</span>
              </div>
              <div className="hint">
                {t('WhatsApp oficial (21) 98049-8068 e chave PIX preservados do aplicativo original.', 'Official WhatsApp (21) 98049-8068 and PIX key preserved from the original app.')}
              </div>
              <div className="row gap-8 wrap">
                <a className="btn btn-sm btn-outline" href="https://wa.me/5521980498068" target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(boot?.settings.pix_key || '21980498068');
                      toast('success', t('Chave PIX copiada', 'PIX key copied'), boot?.settings.pix_key || '21980498068');
                    } catch {
                      toast('warning', t('Copie manualmente', 'Copy manually'), boot?.settings.pix_key || '21980498068');
                    }
                  }}
                >
                  <Wallet /> {t('Copiar PIX', 'Copy PIX')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card col-6">
          <div className="card-head">
            <div>
              <div className="card-title">{t('Dados e segurança', 'Data and safety')}</div>
              <div className="card-sub">{t('backup, exportação e importação sem perdas', 'backup, export and lossless import')}</div>
            </div>
            <HardDriveDownload size={16} />
          </div>

          {isAdmin ? (
            <div className="stack gap-10">
              <div className="setting-row">
                <div className="rule-icon"><Download size={16} /></div>
                <div className="grow">
                  <div className="setting-title">{t('Exportar backup completo', 'Export full backup')}</div>
                  <div className="setting-sub">{t('JSON com escala, folgas, acessos e configurações.', 'JSON with roster, off-days, accounts and settings.')}</div>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => void exportData()}>
                  {t('Exportar', 'Export')}
                </button>
              </div>
              <div className="setting-row">
                <div className="rule-icon"><Database size={16} /></div>
                <div className="grow">
                  <div className="setting-title">{t('Snapshot do banco', 'Database snapshot')}</div>
                  <div className="setting-sub">{t('Cópia local do arquivo SQLite (mantemos as 10 últimas).', 'Local SQLite file copy (we keep the last 10).')}</div>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => void backup()}>
                  {t('Criar', 'Create')}
                </button>
              </div>
              <div className="setting-row">
                <div className="rule-icon"><FileUp size={16} /></div>
                <div className="grow">
                  <div className="setting-title">{t('Importar dados', 'Import data')}</div>
                  <div className="setting-sub">{t('Adiciona apenas registros novos — nunca apaga nada.', 'Only adds new records — never deletes anything.')}</div>
                </div>
                <button className="btn btn-sm btn-outline" onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>
                  {busy === 'import' ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} /> : <FileUp />}
                  {t('Importar', 'Import')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImport(file);
                  }}
                />
              </div>
              <div className="alert info">
                <Info />
                <div>
                  {t('Migração original', 'Original migration')}: {boot?.legacy?.counts?.shifts ?? 6} {t('plantões', 'shifts')},{' '}
                  {boot?.legacy?.counts?.offDays ?? 2} {t('folgas', 'off-days')},{' '}
                  {boot?.legacy?.counts?.collaborators ?? 4} {t('plantonistas', 'members')} — {boot?.legacy?.source}
                </div>
              </div>
            </div>
          ) : (
            <div className="alert info">
              <ShieldCheck />
              <div>{t('Backups e importação são exclusivos do administrador. Peça a ele um export quando precisar.', 'Backups and imports are admin-only. Ask the admin for an export when needed.')}</div>
            </div>
          )}

          <hr className="divider" />
          <div className="stack gap-8">
            <div className="row gap-8 small muted">
              <ShieldCheck size={14} /> {t('Exclusões são lógicas: nada é apagado do banco.', 'Deletions are logical: nothing is erased from the database.')}
            </div>
            <div className="row gap-8 small muted">
              <Sparkles size={14} /> {t('Senhas com hash scrypt; sessão em cookie httpOnly.', 'Passwords hashed with scrypt; session in httpOnly cookie.')}
            </div>
            <div className="row gap-8 small muted">
              <Smartphone size={14} /> {t('PWA instalável com cache offline da última escala.', 'Installable PWA with offline cache of the last roster.')}
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t('Conformidade e suporte', 'Compliance and support')}</div>
            <div className="card-sub">{t('regras preservadas do app original', 'rules preserved from the original app')}</div>
          </div>
          <ShieldCheck size={16} />
        </div>
        <div className="dashboard-grid" style={{ gap: 14 }}>
          <div className="col-4">
            <div className="rule-card">
              <div className="rule-icon"><Info size={16} /></div>
              <div>
                <div className="strong" style={{ fontSize: 12.5 }}>{t('Regra 12x36', '12x36 rule')}</div>
                <div className="hint">{t('12 horas de trabalho e 36 horas de descanso ininterruptas.', '12 working hours and 36 uninterrupted resting hours.')}</div>
              </div>
            </div>
          </div>
          <div className="col-4">
            <div className="rule-card">
              <div className="rule-icon"><ShieldCheck size={16} /></div>
              <div>
                <div className="strong" style={{ fontSize: 12.5 }}>{t('Interjornada (Art. 66 CLT)', 'Inter-shift rest (CLT Art. 66)')}</div>
                <div className="hint">{t('Descanso mínimo legal de 11h consecutivas entre plantões.', 'Legal minimum of 11 consecutive hours between shifts.')}</div>
              </div>
            </div>
          </div>
          <div className="col-4">
            <div className="rule-card">
              <div className="rule-icon"><Wallet size={16} /></div>
              <div>
                <div className="strong" style={{ fontSize: 12.5 }}>{t('Troca ≠ pagamento', 'Swap ≠ payment')}</div>
                <div className="hint">{t('Campos independentes: alterar um nunca altera o outro.', 'Independent fields: changing one never changes the other.')}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="banner" style={{ marginTop: 16, flexWrap: 'wrap' }}>
          <MessageCircle />
          <div className="grow">
            {t('Suporte oficial', 'Official support')}: {boot?.settings.support_phone_display} ·{' '}
            <a href={`mailto:${boot?.settings.support_email}`}>{boot?.settings.support_email}</a>
          </div>
          <span className="badge outline">v{boot?.version}</span>
          <span className="badge outline">{lang === 'pt' ? 'Português' : 'English'}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>
            <Languages /> {t('Trocar idioma', 'Switch language')}
          </button>
        </div>
      </section>
    </div>
  );
}
