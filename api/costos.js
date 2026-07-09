import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ROLES_PERMITIDOS = ['supervisor', 'cotizador'];

export default async function handler(req, res) {
  const token = tokenDesdeHeader(req);
  const sesion = verificarToken(token, ROLES_PERMITIDOS);
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('costos').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const mapa = {};
    (data || []).forEach(r => { mapa[r.key] = Number(r.valor); });
    return res.status(200).json(mapa);
  }

  if (req.method === 'PUT') {
    const valores = req.body || {};
    const filas = Object.entries(valores).map(([key, valor]) => ({ key, valor: Number(valor) }));
    if (!filas.length) return res.status(400).json({ error: 'Sin valores para guardar' });
    const { error } = await supabase.from('costos').upsert(filas, { onConflict: 'key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
