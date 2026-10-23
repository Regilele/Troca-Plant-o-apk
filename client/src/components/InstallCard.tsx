import { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Download,
  Info,
  MonitorSmartphone,
  Share,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { useInstall, notificationPermission, requestNotifications, showShiftNotification } from '../lib/pwa';
import { useLang } from '../lib/i18n';
import { useApp } from '../state/AppContext';
import { useToast } from './ui';

export function InstallCard({ compact = false }: { compact?: boolean }) {
  const { canInstall, installed, isStandalone, platform, install } = useInstall();
  const { t } = useLang();
  const { sendNotification, online } = useApp();
  const { toast } = useToast();
  const [permission, setPermission] = useState(notificationPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  const handleInstall = async () => {
    setBusy(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        toast('success', t('App instalado!', 'App installed!'), t('Procure o ícone RG&SA PLANTÃO na tela inicial.', 'Look for the RG&SA PLANTÃO icon on your home screen.'));
      } else if (outcome === 'unavailable') {
        toast(
          'info',
          t('Instalação pelo navegador', 'Install via browser'),
          platform === 'ios'
            ? t('No iPhone: Compartilhar → Adicionar à Tela de Início.', 'On iPhone: Share → Add to Home Screen.')
            : t('Abra o menu do navegador e escolha “Instalar aplicativo”.', 'Open the browser menu and choose “Install app”.'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePermission = async () => {
    const result = await requestNotifications();
    setPermission(result);
    if (result === 'granted') {
      toast('success', t('Notificações ativadas', 'Notifications enabled'), t('Você será avisado sobre os plantões.', 'You will be notified about shifts.'));
    } else if (result === 'denied') {
      toast('warning', t('Notificações bloqueadas', 'Notifications blocked'), t('Libere nas permissões do site no navegador.', 'Allow them in the browser site permissions.'));
    }
  };

  return (
    <div className={`card install-card${compact ? '' : ''}`}>
      <div className="card-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="card-title">{t('Instalar no aparelho', 'Install on device')}</div>
          <div className="card-sub">
            {installed || isStandalone
              ? t('Este app já está rodando instalado.', 'This app is already running installed.')
              : t('Use como aplicativo nativo — sem loja, sem espera.', 'Use it like a native app — no store, no waiting.')}
          </div>
        </div>
        <div className="badge gold">
          <MonitorSmartphone size={12} /> PWA
        </div>
      </div>

      {installed || isStandalone ? (
        <div className="alert success" style={{ background: 'rgba(108,233,166,0.12)', borderColor: 'rgba(108,233,166,0.3)', color: '#9ff0c2' }}>
          <CheckCircle2 />
          <div>{t('Instalado e funcionando offline.', 'Installed and working offline.')}</div>
        </div>
      ) : (
        <>
          {canInstall ? (
            <button className="btn btn-gold btn-block" onClick={handleInstall} disabled={busy}>
              <Download /> {t('Instalar agora', 'Install now')}
            </button>
          ) : (
            <div className="install-steps">
              {platform === 'ios' ? (
                <>
                  <div className="install-step">
                    <span className="install-step-num">1</span>
                    <span>
                      {t('Toque no botão Compartilhar', 'Tap the Share button')} <Share size={12} style={{ verticalAlign: -2 }} />
                    </span>
                  </div>
                  <div className="install-step">
                    <span className="install-step-num">2</span>
                    <span>{t('Escolha “Adicionar à Tela de Início”.', 'Choose “Add to Home Screen”.')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="install-step">
                    <span className="install-step-num">1</span>
                    <span>{t('Abra o menu do navegador (⋮).', 'Open the browser menu (⋮).')}</span>
                  </div>
                  <div className="install-step">
                    <span className="install-step-num">2</span>
                    <span>{t('Toque em “Instalar aplicativo” ou “Adicionar à tela inicial”.', 'Tap “Install app” or “Add to home screen”.')}</span>
                  </div>
                </>
              )}
              <div className="install-step">
                <span className="install-step-num">3</span>
                <span>{t('Pronto: abre em tela cheia e funciona offline.', 'Done: opens full screen and works offline.')}</span>
              </div>
            </div>
          )}
        </>
      )}

      <div className="setting-row" style={{ marginTop: 14, borderBottom: 0, paddingBottom: 0 }}>
        <div className="rule-icon" style={{ background: 'rgba(255,255,255,0.1)', color: '#e9c46a' }}>
          <Bell size={16} />
        </div>
        <div className="grow">
          <div className="setting-title" style={{ color: '#fff' }}>
            {t('Alertas de plantão', 'Shift alerts')}
          </div>
          <div className="setting-sub" style={{ color: '#9fc0bd' }}>
            {permission === 'granted'
              ? t('Permissão concedida — toque para testar.', 'Permission granted — tap to test.')
              : permission === 'denied'
                ? t('Bloqueado pelo navegador. Libere nas permissões do site.', 'Blocked by the browser. Allow it in site permissions.')
                : t('Ative para receber o resumo do próximo plantão.', 'Enable to get the next shift summary.')}
          </div>
        </div>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => (permission === 'granted' ? void sendNotification() : void handlePermission())}
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
        >
          {permission === 'granted' ? t('Testar', 'Test') : t('Ativar', 'Enable')}
        </button>
      </div>

      <div className="row gap-8 tiny" style={{ color: '#7fa5a3', marginTop: 12, flexWrap: 'wrap' }}>
        <WifiOff size={12} />
        {t('Modo offline ativo após a primeira visita.', 'Offline mode active after the first visit.')}
        <span>·</span>
        <Smartphone size={12} />
        {t('Android, iPhone e desktop', 'Android, iPhone and desktop')}
        <span>·</span>
        <Info size={12} />
        {online ? t('conectado', 'online') : t('offline', 'offline')}
      </div>
    </div>
  );
}
