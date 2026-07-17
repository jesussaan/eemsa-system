import { createClient } from '@supabase/supabase-js';
import { requiereModo } from './_lib/auth.js';
import { uid, today } from '../src/lib/utils.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cuatro endpoints chicos (fallas, lista-materiales, plantillas, prod-diaria)
// fusionados en uno solo para no toparse otra vez con el limite de 12
// funciones serverless del plan Hobby de Vercel -- mismo patron que ya
// usaba refacciones.js con ?tabla=proveedores.
const TABLAS = {
  fallas: manejarFallas,
  'lista-materiales': manejarListaMateriales,
  plantillas: manejarPlantillas,
  'prod-diaria': manejarProdDiaria,
};

export default async function handler(req, res) {
  const manejador = TABLAS[req.query.tabla];
  if (!manejador) return res.status(400).json({ error: 'tabla inválida' });
  return manejador(req, res);
}

async function manejarFallas(req, res) {
  if (req.method === 'POST') {
    if (!(await requiereModo(req, 'operador'))) return res.status(401).json({ error: 'No autorizado' });
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
      if (!(await requiereModo(req, 'operador'))) return res.status(401).json({ error: 'No autorizado' });
      const updates = { status: 'cerrada' };
      if (req.body.accion !== undefined) updates.accion = req.body.accion;
      const { error } = await supabase.from('fallas').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'completo') {
      if (!(await requiereModo(req, 'supervisor'))) return res.status(401).json({ error: 'No autorizado' });
      const { action: _a, id: _id, ...resto } = req.body;
      const { error } = await supabase.from('fallas').update(resto).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'action inválido' });
  }

  if (req.method === 'DELETE') {
    if (!(await requiereModo(req, 'supervisor'))) return res.status(401).json({ error: 'No autorizado' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('fallas').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

const CAMPOS_EDITABLES_MATERIAL = ['material', 'tipo', 'cantidad', 'unidad', 'urgente', 'notas', 'proveedor'];

async function manejarListaMateriales(req, res) {
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
      for (const k of CAMPOS_EDITABLES_MATERIAL) if (req.body[k] !== undefined) updates[k] = req.body[k];
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

async function manejarPlantillas(req, res) {
  if (!(await requiereModo(req, 'supervisor'))) return res.status(401).json({ error: 'No autorizado' });

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

async function manejarProdDiaria(req, res) {
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
