import { createClient } from '@supabase/supabase-js';
import { requiereAlgunModo } from './_lib/auth.js';
import { calcularCosto } from '../src/lib/costos.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Sin auth: Modo Operador la usa para su calculadora. Esta accion solo
  // regresa el costo por pieza ya calculado -- nunca la tabla de costos
  // completa, asi que no expone tarifas ni formulas al navegador.
  if (req.query.action === 'calcular') {
    if (req.method !== 'POST') return res.status(405).end();

    const { rollosMP, tintaKg, solventeKg, cajas, piezasBuenas, sticky, diasProd, colorKey, tintaKg2, colorKey2, tipoCentro, esEngomado } = req.body || {};
    if (!(Number(piezasBuenas) > 0)) return res.status(400).json({ error: 'piezasBuenas debe ser mayor a 0' });

    const { data, error } = await supabase.from('costos').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const costosDB = {};
    (data || []).forEach(r => { costosDB[r.key] = Number(r.valor); });

    const costo = calcularCosto({
      rollosMP: Number(rollosMP) || 0,
      tintaKg: Number(tintaKg) || 0,
      solventeKg: Number(solventeKg) || 0,
      cajas: Number(cajas) || 0,
      piezasBuenas: Number(piezasBuenas),
      sticky: Number(sticky) || 0,
      diasProd: Number(diasProd) || 1,
      colorKey: colorKey || '',
      tintaKg2: Number(tintaKg2) || 0,
      colorKey2: colorKey2 || '',
      tipoCentro: tipoCentro || '2',
      esEngomado: !!esEngomado,
      costosDB,
    });

    return res.status(200).json({ costo_pieza: Number(costo.porPieza.toFixed(6)) });
  }

  if (!(await requiereAlgunModo(req, ['cotizador']))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('costos').select('*');
    if (error) return res.status(500).json({ error: error.message });
    const mapa = {};
    (data || []).forEach(r => { mapa[r.key] = Number(r.valor); });
    return res.status(200).json(mapa);
  }

  if (req.method === 'PUT') {
    const valores = req.body || {};
    const filas = Object.entries(valores).map(([key, valor]) => ({ key, valor: Number(valor) }));
    if (!filas.length) return res.status(400).json({ error: 'Sin valores para guardar' });
    const { error } = await supabase.from('costos').upsert(filas, { onConflict: 'key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
