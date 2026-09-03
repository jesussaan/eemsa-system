import { createClient } from '@supabase/supabase-js';
import { requiereAlgunModo } from './_lib/auth.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Tiempos estandar / capacidad teorica -- mismo patron key/valor que
// api/costos.js, pero en su propia tabla porque es un dato distinto (tiempo,
// no dinero) que se actualiza con un estudio de tiempos ocasional, no cada
// corrida. GET solo requiere estar en algun modo con acceso al Dashboard
// (supervisor); PUT igual, para poder editarlo desde ahi.
export default async function handler(req, res) {
  if (!(await requiereAlgunModo(req, ['supervisor']))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('capacidad').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const mapa = {};
    (data || []).forEach(r => { mapa[r.key] = Number(r.valor); });
    return res.status(200).json(mapa);
  }

  if (req.method === 'PUT') {
    const valores = req.body || {};
    const filas = Object.entries(valores).map(([key, valor]) => ({ key, valor: Number(valor) }));
    if (!filas.length) return res.status(400).json({ error: 'Sin valores para guardar' });
    const { error } = await supabase.from('capacidad').upsert(filas, { onConflict: 'key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
