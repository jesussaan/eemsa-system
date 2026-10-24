import { requiereAlgunModo, supabaseAdmin as supabase } from './auth.js';
import { uid } from '../../src/lib/utils.js';

// Modulo Herramienta (ver supabase_herramientas.sql y ModoHerramienta.js).
// Vive en _lib y se atiende desde /api/inventario?modulo=herramientas -- el
// plan de Vercel permite 12 funciones y ya estaban las 12 ocupadas.
// Lectura: el frontend lee directo de Supabase (cuentas activas, RLS).
// Escritura: solo aqui, con la service key, para quien tenga el permiso
// "herramienta" (supervisor y admin tambien pasan, ver _lib/auth.js).
//   POST   { action: "tipo", nombre, cantidad, ubicacion }        -> alta de tipo
//   PUT    { action: "tipo", id, nombre?, cantidad?, ubicacion? } -> editar tipo
//   DELETE { id }                                                 -> borrar tipo
//   POST   { action: "sacar", tipo_id, numeros: [..], persona, notas? }
//   PUT    { action: "regresar", ids: [..] }                      -> ids de prestamos
const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const prestamosAbiertos = async (tipoId) => {
  const { data, error } = await supabase.from('herramienta_prestamos').select('id, numero').eq('tipo_id', tipoId).is('regreso', null);
  if (error) throw error;
  return data || [];
};

export async function manejarHerramientas(req, res) {
  const usuario = await requiereAlgunModo(req, ['herramienta']);
  if (!usuario) return res.status(401).json({ error: 'No autorizado' });
  const body = req.body || {};

  try {
    if (req.method === 'POST' && body.action === 'tipo') {
      const nombre = String(body.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
      const cantidad = Math.max(0, parseInt(body.cantidad, 10) || 0);
      const { data: ultimos } = await supabase.from('herramienta_tipos').select('orden').order('orden', { ascending: false }).limit(1);
      const nuevo = { id: `${slug(nombre) || 'tipo'}-${uid().slice(-4)}`, nombre, cantidad, ubicacion: body.ubicacion || null, orden: (ultimos?.[0]?.orden || 0) + 1 };
      const { error } = await supabase.from('herramienta_tipos').insert([nuevo]);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(nuevo);
    }

    if (req.method === 'PUT' && body.action === 'tipo') {
      if (!body.id) return res.status(400).json({ error: 'Falta id' });
      const cambios = {};
      if (body.nombre !== undefined) {
        const n = String(body.nombre).trim();
        if (!n) return res.status(400).json({ error: 'El nombre no puede ir vacío' });
        cambios.nombre = n;
      }
      if (body.ubicacion !== undefined) cambios.ubicacion = body.ubicacion || null;
      if (body.cantidad !== undefined) {
        const cantidad = parseInt(body.cantidad, 10);
        if (!(cantidad >= 0)) return res.status(400).json({ error: 'Cantidad inválida' });
        // No se puede bajar la cantidad por debajo de una pieza que esta prestada.
        const abiertos = await prestamosAbiertos(body.id);
        const mayorPrestada = Math.max(0, ...abiertos.map(p => p.numero));
        if (cantidad < mayorPrestada) {
          return res.status(409).json({ error: `La pieza #${mayorPrestada} está prestada; regrésala antes de bajar la cantidad a ${cantidad}.` });
        }
        cambios.cantidad = cantidad;
      }
      const { error } = await supabase.from('herramienta_tipos').update(cambios).eq('id', body.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      if (!body.id) return res.status(400).json({ error: 'Falta id' });
      const abiertos = await prestamosAbiertos(body.id);
      if (abiertos.length) return res.status(409).json({ error: `Hay ${abiertos.length} pieza(s) prestada(s); regrésalas antes de borrar este tipo.` });
      const { error } = await supabase.from('herramienta_tipos').delete().eq('id', body.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST' && body.action === 'sacar') {
      const persona = String(body.persona || '').trim();
      const numeros = [...new Set((body.numeros || []).map(n => parseInt(n, 10)).filter(n => n > 0))];
      if (!body.tipo_id || !persona || !numeros.length) return res.status(400).json({ error: 'Falta tipo, persona o piezas' });
      const { data: tipo } = await supabase.from('herramienta_tipos').select('cantidad').eq('id', body.tipo_id).single();
      if (!tipo) return res.status(404).json({ error: 'Ese tipo de herramienta no existe' });
      const fuera = numeros.filter(n => n > tipo.cantidad);
      if (fuera.length) return res.status(400).json({ error: `No existe la pieza #${fuera[0]} (hay ${tipo.cantidad})` });
      const ocupadas = (await prestamosAbiertos(body.tipo_id)).map(p => p.numero).filter(n => numeros.includes(n));
      if (ocupadas.length) return res.status(409).json({ error: `La pieza #${ocupadas[0]} ya está prestada` });
      const filas = numeros.map(numero => ({ id: uid(), tipo_id: body.tipo_id, numero, persona, notas: body.notas || null, usuario_email: usuario.email }));
      const { error } = await supabase.from('herramienta_prestamos').insert(filas);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(filas);
    }

    if (req.method === 'PUT' && body.action === 'regresar') {
      const ids = (body.ids || []).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'Faltan piezas por regresar' });
      const regreso = new Date().toISOString();
      const { error } = await supabase.from('herramienta_prestamos').update({ regreso }).in('id', ids).is('regreso', null);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, regreso });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
