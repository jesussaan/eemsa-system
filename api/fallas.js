import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';
import { uid, today } from '../src/lib/utils.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const soloSupervisor = (req) => verificarToken(tokenDesdeHeader(req), ['supervisor']);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const f = req.body || {};
    if (!f.descripcion || !f.min_paro) return res.status(400).json({ error: 'descripcion y min_paro son requeridos' });
    const nueva = {
      id: f.id || uid(), created: f.created || today(), fecha: f.fecha || today(),
      maq: f.maq, comp: f.comp, min_paro: f.min_paro, sev: f.sev || 'leve',
      op: f.op || '', descripcion: f.descripcion, accion: f.accion || '',
      status: f.status || 'abierta',
    };
    const { error } = await supabase.from('fallas').insert([nueva]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(nueva);
  }

  if (req.method === 'PUT') {
    const { action, id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });

    if (action === 'cerrar') {
      const updates = { status: 'cerrada' };
      if (req.body.accion !== undefined) updates.accion = req.body.accion;
      const { error } = await supabase.from('fallas').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'completo') {
      if (!soloSupervisor(req)) return res.status(401).json({ error: 'No autorizado' });
      const { action: _a, id: _id, ...resto } = req.body;
      const { error } = await supabase.from('fallas').update(resto).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'action inválido' });
  }

  if (req.method === 'DELETE') {
    if (!soloSupervisor(req)) return res.status(401).json({ error: 'No autorizado' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('fallas').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
