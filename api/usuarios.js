import { supabaseAdmin, requiereAdmin } from './_lib/auth.js';

const MODOS_VALIDOS = ['operador', 'ventas', 'emilio', 'rebobinado', 'supervisor', 'cotizador'];

export default async function handler(req, res) {
  if (!(await requiereAdmin(req))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('perfiles')
      .select('id, email, modos, es_admin, activo, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, modos, activo } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });

    const updates = {};
    if (modos !== undefined) {
      if (!Array.isArray(modos) || modos.some(m => !MODOS_VALIDOS.includes(m))) {
        return res.status(400).json({ error: `modos debe ser un arreglo con valores de: ${MODOS_VALIDOS.join(', ')}` });
      }
      updates.modos = modos;
    }
    if (activo !== undefined) updates.activo = !!activo;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Sin campos válidos para actualizar' });

    const { error } = await supabaseAdmin.from('perfiles').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
