import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallState {
  canInstall: boolean;
  installed: boolean;
  isStandalone: boolean;
  platform: 'ios' | 'android' | 'desktop' | 'other';
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function detectPlatform(): InstallState['platform'] {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mac|win|linux/.test(ua)) return 'desktop';
  return 'other';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

export function useInstall() {
  const [canInstall, setCanInstall] = useState(Boolean(deferredPrompt));
  const [installed, setInstalled] = useState(isStandalone());
  const [standalone, setStandalone] = useState(isStandalone());
  const platform = detectPlatform();

  useEffect(() => {
    const refresh = () => {
      setCanInstall(Boolean(deferredPrompt));
      setInstalled(isStandalone());
      setStandalone(isStandalone());
    };
    listeners.add(refresh);
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', refresh);
    window.addEventListener('appinstalled', refresh);
    refresh();
    return () => {
      listeners.delete(refresh);
      media.removeEventListener?.('change', refresh);
      window.removeEventListener('appinstalled', refresh);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      deferredPrompt = null;
      setCanInstall(false);
      setInstalled(true);
      notify();
    }
    return choice.outcome;
  }, []);

  return { canInstall, installed, isStandalone: standalone, platform, install } satisfies InstallState;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;
  if (import.meta.env.DEV) return false;

  const start = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('rgsa:update-available', { detail: { registration } }));
          } else if (worker.state === 'installed') {
            window.dispatchEvent(new CustomEvent('rgsa:offline-ready'));
          }
        });
      });
      if (registration.waiting) {
        window.dispatchEvent(new CustomEvent('rgsa:update-available', { detail: { registration } }));
      }
    } catch (error) {
      console.warn('[PWA] Falha ao registrar service worker', error);
    }
  };

  // Se a página já terminou de carregar antes do React montar, `load` nunca
  // dispararia e o app ficaria sem cache offline nem instalabilidade.
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
  return true;
}

/** Descarta dados em cache que pertenciam a outra sessão (login/logout). */
export async function clearOfflineData() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    registration?.active?.postMessage({ type: 'CLEAR_DATA' });
    if ('caches' in window) await caches.delete('rgsa-plantao-v2.0.1-data');
  } catch {
    /* sem service worker ou sem cache: nada a limpar */
  }
}

export async function applyUpdate(registration?: ServiceWorkerRegistration | null) {
  const reg = registration || (await navigator.serviceWorker.getRegistration());
  reg?.waiting?.postMessage('SKIP_WAITING');
  setTimeout(() => window.location.reload(), 350);
}

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotifications(): Promise<NotificationPermissionState> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const result = await Notification.requestPermission();
  return result as NotificationPermissionState;
}

export async function showShiftNotification(payload: { title: string; body: string; tag?: string; url?: string }) {
  const permission = await requestNotifications();
  if (permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) {
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-32.png',
        tag: payload.tag || 'rgsa-plantao',
        data: { url: payload.url || '/?tab=escala' },
        vibrate: [80, 40, 80],
      } as NotificationOptions);
      return true;
    }
    new Notification(payload.title, { body: payload.body, icon: '/icons/icon-192.png' });
    return true;
  } catch (error) {
    console.warn('[PWA] Notificação falhou', error);
    return false;
  }
}
