import { createClient } from '@supabase/supabase-js';
import { requiereAlgunModo } from './_lib/auth.js';
import { uid, today } from '../src/lib/utils.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requiereAlgunModo(req, ['operador', 'emilio']))) return res.status(401).json({ error: 'No autorizado' });

  const { cliente, medida, color, diseno, portaliche, cajas, estado } = req.body || {};
  if (!cliente || !medida || (estado !== 'nuevo' && estado !== 'usado')) {
    return res.status(400).json({ error: 'cliente, medida y estado (nuevo|usado) son requeridos' });
  }
  const cajasNum = Number(cajas) || 0;

  // .eq('color', null) no matchea IS NULL de forma confiable en Postgrest
  // -- pedidos sin color (monocromía) necesitan .is() para encontrar su
  // cliché activo.
  let busqueda = supabase.from('cliches').select('*').eq('cliente', cliente).eq('medida', medida).eq('estado', 'activo');
  busqueda = color ? busqueda.eq('color', color) : busqueda.is('color', null);
  const { data: activo, error: errBusqueda } = await busqueda
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errBusqueda) return res.status(500).json({ error: errBusqueda.message });

  const crearNuevo = async () => {
    const nuevo = {
      id: uid(),
      cliente, medida, color: color || null, diseno: diseno || null,
      portaliche: portaliche != null ? Number(portaliche) : null,
      cajas_acumuladas: cajasNum, pedidos_acumulados: 1,
      estado: 'activo', fecha_alta: today(), created: new Date().toISOString(),
    };
    const { error } = await supabase.from('cliches').insert([nuevo]);
    if (error) return { error };
    return { cliche_id: nuevo.id };
  };

  if (estado === 'nuevo') {
    if (activo) {
      const { error } = await supabase.from('cliches').update({ estado: 'cerrado', fecha_baja: today() }).eq('id', activo.id);
      if (error) return res.status(500).json({ error: error.message });
    }
    const r = await crearNuevo();
    if (r.error) return res.status(500).json({ error: r.error.message });
    return res.status(200).json({ cliche_id: r.cliche_id });
  }

  // estado === 'usado'
  if (activo) {
    const { error } = await supabase.from('cliches').update({
      cajas_acumuladas: Number(activo.cajas_acumuladas || 0) + cajasNum,
      pedidos_acumulados: Number(activo.pedidos_acumulados || 0) + 1,
    }).eq('id', activo.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ cliche_id: activo.id });
  }
  // No habia un cliche activo para esta combinacion (primera vez que se
  // trackea) -- se crea igual que "nuevo", no hay nada previo que rescatar.
  const r = await crearNuevo();
  if (r.error) return res.status(500).json({ error: r.error.message });
  return res.status(200).json({ cliche_id: r.cliche_id });
}
