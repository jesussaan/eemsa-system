import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const sesion = verificarToken(tokenDesdeHeader(req), ['supervisor']);
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('plantillas').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.nombre) return res.status(400).json({ error: 'nombre es requerido' });
    const { data, error } = await supabase.from('plantillas').insert([p]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('plantillas').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
