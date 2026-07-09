import { createClient } from '@supabase/supabase-js';
import { calcularCosto } from '../src/lib/costos.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Sin token: Modo Operador no tiene PIN hoy. Este endpoint solo regresa
// el costo por pieza ya calculado — nunca la tabla de costos completa,
// asi que no expone tarifas ni formulas al navegador.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { rollosMP, tintaKg, solventeKg, cajas, piezasBuenas, sticky, diasProd, colorKey, tipoCentro } = req.body || {};
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
    tipoCentro: tipoCentro || '2',
    costosDB,
  });

  return res.status(200).json({ costo_pieza: Number(costo.porPieza.toFixed(6)) });
}
