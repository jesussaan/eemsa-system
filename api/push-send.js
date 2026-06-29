import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.CHAT_API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const vapidPublic  = process.env.REACT_APP_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail   = process.env.VAPID_EMAIL || 'mailto:admin@eemsa.com.mx';
  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID keys no configuradas' });
  }

  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

  const { title, body, url = '/' } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title y body requeridos' });

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: subs, error } = await supabase.from('push_subscriptions').select('endpoint, subscription');
  if (error) return res.status(500).json({ error: error.message });
  if (!subs?.length) return res.json({ sent: 0, total: 0 });

  const payload = JSON.stringify({ title, body, url });
  const expired = [];

  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(s.subscription, payload).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) expired.push(s.endpoint);
        throw err;
      })
    )
  );

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired);
  }

  res.json({ sent: results.filter(r => r.status === 'fulfilled').length, total: subs.length });
}
