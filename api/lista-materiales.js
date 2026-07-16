import { createClient } from '@supabase/supabase-js';
import { requiereModo } from './_lib/auth.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CAMPOS_EDITABLES = ['material', 'tipo', 'cantidad', 'unidad', 'urgente', 'notas', 'proveedor'];

export default async function handler(req, res) {
  if (!(await requiereModo(req, 'emilio'))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'POST') {
    const m = req.body || {};
    if (!m.material || !String(m.material).trim()) return res.status(400).json({ error: 'material es requerido' });
    const nuevo = {
      material: String(m.material).trim(), tipo: m.tipo || 'Tinta', cantidad: m.cantidad || null,
      unidad: m.unidad || 'kg', urgente: !!m.urgente, notas: m.notas || null,
      proveedor: m.proveedor || null, status: 'pendiente',
    };
    const { data, error } = await supabase.from('lista_materiales').insert([nuevo]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { action, id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });

    if (action === 'listo') {
      const updates = { status: 'listo', fecha_listo: req.body.fecha_listo };
      const { error } = await supabase.from('lista_materiales').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'editar') {
      const updates = {};
      for (const k of CAMPOS_EDITABLES) if (req.body[k] !== undefined) updates[k] = req.body[k];
      if (!updates.material || !String(updates.material).trim()) return res.status(400).json({ error: 'material es requerido' });
      const { error } = await supabase.from('lista_materiales').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'action inválido' });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('lista_materiales').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
