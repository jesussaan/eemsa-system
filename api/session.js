import { firmarToken } from './_lib/token.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { pin, target } = req.body || {};
  if (!pin || (target !== 'supervisor' && target !== 'cotizador')) {
    return res.status(400).json({ error: 'pin y target ("supervisor" | "cotizador") son requeridos' });
  }

  const pinCorrecto = target === 'cotizador'
    ? (process.env.PIN_COTIZADOR || '2312')
    : (process.env.PIN_SUPERVISOR || '2312');

  if (String(pin) !== String(pinCorrecto)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  try {
    const token = firmarToken(target);
    return res.status(200).json({ token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
