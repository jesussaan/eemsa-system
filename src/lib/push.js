function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = window.atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const getPermission = () => (pushSupported() ? Notification.permission : 'denied');

export const subscribePush = async () => {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.REACT_APP_VAPID_PUBLIC_KEY),
  });
  const { supabase } = await import('./supabase');
  await supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, subscription: sub.toJSON(), ua: navigator.userAgent.slice(0, 150) },
    { onConflict: 'endpoint' }
  );
  return sub;
};

export const unsubscribePush = async () => {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { supabase } = await import('./supabase');
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
};

export const sendPush = (title, body, url = '/') => {
  if (!process.env.REACT_APP_VAPID_PUBLIC_KEY) return;
  fetch('/api/notificar?via=push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-secret': process.env.REACT_APP_CHAT_API_SECRET || '',
    },
    body: JSON.stringify({ title, body, url }),
  }).catch(() => {});
};
