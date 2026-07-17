import { createClient } from '@supabase/supabase-js';
import { requiereAlgunModo, requiereModo } from './_lib/auth.js';
import { uid, today } from '../src/lib/utils.js';
import { REBOB_CLIENTE } from '../src/lib/constants.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Campos que se pueden tocar desde piso (iniciar/finalizar producción,
// mover orden, dar de alta). Todo lo demás (cliente, num, cajas, fechas
// de solicitud, etc.) solo se cambia con action="completo" (supervisor).
const CAMPOS_ESTADO = [
  'status', 'fecha_inicio', 'fecha_termino', 'inicio_ts', 'fin_ts', 'orden',
  'piezas_prod', 'merma', 'merma_pct', 'rollos_usados', 'rollos_caja', 'tinta_kg', 'tinta_kg2',
  'alcohol_litros', 'stickyback', 'foto_producto_url', 'costo_pieza', 'notas',
  'diseno', 'portaliche', 'diseno2', 'portaliche2',
];

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Crear pedido: Ventas anota clientes, Rebobinado registra rollos MP,
    // Supervisor usa "Anotar pedido" -- las tres mismas llamadas de siempre.
    if (!(await requiereAlgunModo(req, ['ventas', 'rebobinado']))) return res.status(401).json({ error: 'No autorizado' });
    const p = req.body || {};
    if (!p.cliente || !p.num || !p.cajas || !p.fecha_solicitud) {
      return res.status(400).json({ error: 'cliente, num, cajas y fecha_solicitud son requeridos' });
    }
    const nuevo = { id: p.id || uid(), created: p.created || today(), ...p };
    const { error } = await supabase.from('pedidos').insert([nuevo]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(nuevo);
  }

  if (req.method === 'PUT') {
    const { action, id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });

    if (action === 'estado') {
      // Operador registra producción/paros, Emilio da de alta y actualiza estado.
      if (!(await requiereAlgunModo(req, ['operador', 'emilio']))) return res.status(401).json({ error: 'No autorizado' });
      const updates = {};
      for (const k of CAMPOS_ESTADO) if (req.body[k] !== undefined) updates[k] = req.body[k];
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
      const { error } = await supabase.from('pedidos').update(updates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'fecha') {
      if (!(await requiereModo(req, 'supervisor'))) return res.status(401).json({ error: 'No autorizado' });
      const { fecha_estimada, fecha_original } = req.body;
      const { error } = await supabase.from('pedidos').update({ fecha_estimada: fecha_estimada ?? null, fecha_original: fecha_original ?? null }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'completo') {
      if (!(await requiereModo(req, 'supervisor'))) return res.status(401).json({ error: 'No autorizado' });
      const { action: _a, id: _id, ...resto } = req.body;
      const { error } = await supabase.from('pedidos').update(resto).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'action inválido' });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });

    const esSupervisor = await requiereModo(req, 'supervisor');
    if (!esSupervisor) {
      // Rebobinado puede borrar sus propios registros para corregir un error
      // de captura, pero solo mientras sigan "pendiente" (antes de que Emilio
      // les de de alta) -- no puede tocar pedidos de clientes reales ni algo
      // que ya avanzo mas adelante en el flujo.
      if (!(await requiereModo(req, 'rebobinado'))) return res.status(401).json({ error: 'No autorizado' });
      const { data: pedido } = await supabase.from('pedidos').select('cliente, status').eq('id', id).single();
      if (!pedido || pedido.cliente !== REBOB_CLIENTE || pedido.status !== 'pendiente') {
        return res.status(401).json({ error: 'No autorizado' });
      }
    }

    const { error } = await supabase.from('pedidos').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
