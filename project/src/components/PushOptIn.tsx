import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

/**
 * Registers a Web Push subscription when VITE_VAPID_PUBLIC_KEY is configured.
 * Without a VAPID key, shows a graceful disabled state.
 */
export function PushOptIn() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

  if (!session) return null;

  const enable = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      showToast('Push is not supported in this browser.', 'error');
      return;
    }
    if (!vapid) {
      showToast('Push is not configured yet (missing VAPID public key).', 'error');
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('Notification permission denied.', 'error');
        setBusy(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json = sub.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: session.user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys?.p256dh || '',
          auth: json.keys?.auth || '',
          user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: 'user_id,endpoint' }
      );
      if (error) showToast(error.message, 'error');
      else showToast('Push notifications enabled.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to enable push.', 'error');
    }
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className="btn-secondary text-xs flex items-center gap-1.5"
      title={vapid ? 'Enable browser push' : 'Configure VITE_VAPID_PUBLIC_KEY to activate'}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />}
      Enable push
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
