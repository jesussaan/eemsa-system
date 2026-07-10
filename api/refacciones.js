import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';
import { uid, today } from '../src/lib/utils.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const sesion = verificarToken(tokenDesdeHeader(req), ['supervisor']);
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  if (req.query.tabla === 'proveedores') return manejarProveedores(req, res);
  return manejarRefacciones(req, res);
}

async function manejarRefacciones(req, res) {
  if (req.method === 'POST') {
    const { nombre, costo, maq, proveedor, fecha, notas, stock, stock_min } = req.body || {};
    if (!nombre || !costo) return res.status(400).json({ error: 'nombre y costo son requeridos' });
    const nuevo = {
      id: uid(), created: today(),
      nombre, costo, maq: maq || 'SIAT L36 #1', proveedor: proveedor || '',
      fecha: fecha || today(), notas: notas || '',
      stock: stock || '1', stock_min: stock_min !== '' && stock_min != null ? Number(stock_min) : 1,
    };
    const { error } = await supabase.from('refacciones').insert([nuevo]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(nuevo);
  }

  if (req.method === 'PUT') {
    const { id, stock } = req.body || {};
    if (!id || stock == null || isNaN(Number(stock)) || Number(stock) < 0) {
      return res.status(400).json({ error: 'id y stock (>= 0) son requeridos' });
    }
    const { error } = await supabase.from('refacciones').update({ stock: Number(stock) }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('refacciones').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function manejarProveedores(req, res) {
  if (req.method === 'POST') {
    const { nombre, telefono, direccion, monto, fecha, que_compro, categoria, imagen_url } = req.body || {};
    if (!nombre || !(Number(monto) >= 0)) return res.status(400).json({ error: 'nombre y monto (>= 0) son requeridos' });
    const nuevo = {
      id: uid(), created: today(),
      nombre, telefono: telefono || '', direccion: direccion || '',
      monto, fecha: fecha || today(), que_compro: que_compro || '',
      categoria: categoria || null, imagen_url: imagen_url || '',
    };
    const { error } = await supabase.from('proveedores').insert([nuevo]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(nuevo);
  }

  if (req.method === 'PUT') {
    const { id, nombre, telefono, direccion, monto, fecha, que_compro, categoria } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    if (monto != null && !(Number(monto) >= 0)) return res.status(400).json({ error: 'monto debe ser >= 0' });
    const actualizado = {
      nombre, telefono: telefono || null, direccion: direccion || null,
      monto, fecha, que_compro: que_compro || null, categoria: categoria || null,
    };
    const { error } = await supabase.from('proveedores').update(actualizado).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { error } = await supabase.from('proveedores').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
