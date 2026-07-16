import { createClient } from '@supabase/supabase-js';
import { requiereModo } from './_lib/auth.js';
import { uid, today } from '../src/lib/utils.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (!(await requiereModo(req, 'supervisor'))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.num_pedido || !p.cajas_dia) return res.status(400).json({ error: 'num_pedido y cajas_dia son requeridos' });
    const nuevo = { id: p.id || uid(), created: p.created || today(), fecha: p.fecha || today(), num_pedido: p.num_pedido, cajas_dia: p.cajas_dia, op: p.op || '', notas: p.notas || '' };
    const { error } = await supabase.from('prod_diaria').insert([nuevo]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(nuevo);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('prod_diaria').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
