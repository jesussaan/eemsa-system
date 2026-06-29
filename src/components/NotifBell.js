import { useState } from 'react';
import { pushSupported, getPermission, subscribePush, unsubscribePush } from '../lib/push';

export default function NotifBell() {
  const [perm, setPerm] = useState(getPermission);

  if (!pushSupported()) return null;

  const activar = async () => {
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      try { await subscribePush(); } catch {}
    }
    setPerm(p);
  };

  const desactivar = async () => {
    try { await unsubscribePush(); } catch {}
    setPerm('default');
  };

  if (perm === 'denied') return null;

  if (perm === 'granted') {
    return (
      <button
        onClick={desactivar}
        title="Notificaciones activas — clic para desactivar"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, padding: '2px 6px', color: '#4be87a', lineHeight: 1 }}
      >🔔</button>
    );
  }

  return (
    <button onClick={activar} className="btn btn-ghost btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
      🔔 Notificaciones
    </button>
  );
}
