import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requiereModo, requiereAlgunModo, requiereSecretoJarvis } from './_lib/auth.js';
import { uid, today } from '../src/lib/utils.js';
import { hoyMexico, resumenPedidosHoy, resumenSiat1, resumenInventarioCinta } from '../src/lib/jarvis.js';
import { META_CAJAS } from '../src/lib/constants.js';

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
  'clientes-disenos': manejarClientesDisenos,
  jarvis: manejarJarvis,
  'jarvis-app': manejarJarvisApp,
  'jarvis-tokens': manejarJarvisTokens,
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
  // Pedir un material lo puede disparar tambien Inventario (stock bajo),
  // no solo Emilio -- marcar listo/editar/borrar se queda solo para Emilio.
  if (req.method === 'POST') {
    if (!(await requiereAlgunModo(req, ['emilio', 'inventario']))) return res.status(401).json({ error: 'No autorizado' });
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
    if (!(await requiereModo(req, 'emilio'))) return res.status(401).json({ error: 'No autorizado' });
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
    if (!(await requiereModo(req, 'emilio'))) return res.status(401).json({ error: 'No autorizado' });
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

// Foto de referencia del diseno actual de cada cliente (modulo Clientes) --
// solo escritura via aqui (RLS de la tabla bloquea anon/authenticated, ver
// supabase_clientes_disenos.sql); la lectura la hace el navegador directo
// con la anon key (select abierto), igual que el resto de las tablas que
// carga App.js.
async function manejarClientesDisenos(req, res) {
  // Ventas (no solo Supervisor) tambien usa Clientes.js -- son quienes
  // hablan con el cliente por telefono, el caso de uso principal de esta
  // foto de referencia.
  if (!(await requiereAlgunModo(req, ['ventas', 'supervisor']))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'PUT') {
    const { cliente, foto_path } = req.body || {};
    if (!cliente || !foto_path) return res.status(400).json({ error: 'cliente y foto_path son requeridos' });
    const { data: existente } = await supabase.from('clientes_disenos').select('id').eq('cliente', cliente).maybeSingle();
    const fila = { id: existente?.id || uid(), cliente, foto_path, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('clientes_disenos').upsert([fila], { onConflict: 'cliente' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(fila);
  }

  if (req.method === 'DELETE') {
    const { cliente } = req.body || {};
    if (!cliente) return res.status(400).json({ error: 'cliente es requerido' });
    const { error } = await supabase.from('clientes_disenos').delete().eq('cliente', cliente);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Integracion de solo lectura para Jarvis (o cualquier cliente servidor-a-
// servidor futuro) -- no hay sesion de usuario de por medio (ver
// requiereSecretoJarvis en _lib/auth.js), asi que a proposito esta acotada a
// GET y a estas 3 consultas fijas: nada de escritura ni control de maquina.
// El cliente (Jarvis, un iPhone Shortcut corriendo contra un backend, etc.)
// nunca habla con Supabase directo -- solo con este endpoint.
const CONSULTAS_JARVIS = new Set(['pedidos_hoy', 'siat_1', 'inventario_cinta']);

// Las 3 consultas en si son identicas sin importar quien las pida -- lo unico
// que cambia entre manejarJarvis (secreto) y manejarJarvisApp (sesion de
// usuario) es la autorizacion, ver cada uno abajo.
async function responderConsultaJarvis(req, res) {
  const consulta = req.query.consulta;
  if (!CONSULTAS_JARVIS.has(consulta)) {
    return res.status(400).json({ error: `consulta inválida, usa una de: ${[...CONSULTAS_JARVIS].join(', ')}` });
  }

  const hoy = hoyMexico();

  if (consulta === 'pedidos_hoy') {
    const { data, error } = await supabase.from('pedidos').select('num, cliente, tipo, medida, cajas, status, maq, created');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, fecha: hoy, ...resumenPedidosHoy(data, hoy) });
  }

  if (consulta === 'siat_1') {
    const [pedidosRes, prodRes] = await Promise.all([
      supabase.from('pedidos').select('num, cliente, tipo, medida, cajas, status, maq, fecha_inicio, inicio_ts, fin_ts'),
      supabase.from('prod_diaria').select('num_pedido, cajas_dia, fecha, created'),
    ]);
    if (pedidosRes.error) return res.status(500).json({ error: pedidosRes.error.message });
    if (prodRes.error) return res.status(500).json({ error: prodRes.error.message });
    return res.status(200).json({ ok: true, ...resumenSiat1(pedidosRes.data, prodRes.data, hoy, META_CAJAS) });
  }

  // consulta === 'inventario_cinta'
  const { data, error } = await supabase.from('materiales').select('categoria, match_valor, nombre, stock, unidad, stock_min').eq('categoria', 'rollo_mp');
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, ...resumenInventarioCinta(data) });
}

// Integracion de solo lectura para Jarvis (o cualquier cliente servidor-a-
// servidor futuro) -- no hay sesion de usuario de por medio (ver
// requiereSecretoJarvis en _lib/auth.js), asi que a proposito esta acotada a
// GET y a estas 3 consultas fijas: nada de escritura ni control de maquina.
// El cliente (Jarvis, un iPhone Shortcut corriendo contra un backend, etc.)
// nunca habla con Supabase directo -- solo con este endpoint.
async function manejarJarvis(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requiereSecretoJarvis(req)) return res.status(401).json({ error: 'No autorizado' });
  return responderConsultaJarvis(req, res);
}

// Misma integracion de solo lectura que manejarJarvis, pero para la pantalla
// "Jarvis" dentro de la app (ver src/components/Jarvis.js) -- aqui SI hay un
// usuario logueado, asi que se autoriza con la sesion JWT normal (modo
// "jarvis" o supervisor/admin, igual que el resto de la app) en vez del
// secreto de servidor-a-servidor. A proposito nunca lee ni compara
// JARVIS_API_SECRET en esta rama -- ese secreto es solo para integraciones
// externas sin sesion, no para el navegador.
async function manejarJarvisApp(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requiereAlgunModo(req, ['jarvis']))) return res.status(401).json({ error: 'No autorizado' });
  return responderConsultaJarvis(req, res);
}

// Generar/listar/revocar los tokens personales de Jarvis para Atajos de Siri
// (ver supabase_jarvis_tokens.sql y la rama de x-jarvis-token en api/chat.js).
// El valor real del token SOLO se devuelve aqui, una vez, al crearlo -- de
// ahi en adelante solo se guarda su hash SHA-256, igual que un Personal
// Access Token de GitHub: si esta tabla se filtrara no revela ningun token
// usable. Cada quien solo puede ver/revocar sus propios tokens (eq user_id).
async function manejarJarvisTokens(req, res) {
  const usuario = await requiereAlgunModo(req, ['jarvis']);
  if (!usuario) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('jarvis_tokens')
      .select('id, nombre, created_at, revoked_at, ultimo_uso')
      .eq('user_id', usuario.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const nombre = (req.body?.nombre || 'Atajo de Siri').toString().trim().slice(0, 60) || 'Atajo de Siri';
    const token = 'jrv_' + crypto.randomBytes(24).toString('hex');
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');
    const { data, error } = await supabase.from('jarvis_tokens')
      .insert([{ user_id: usuario.id, nombre, token_hash }])
      .select('id, nombre, created_at')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ...data, token });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('jarvis_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', usuario.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
