import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const sesion = verificarToken(tokenDesdeHeader(req), ['supervisor']);
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });

  if (req.query.action === 'upload-url') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { paths } = req.body || {};
    if (!Array.isArray(paths) || !paths.length) return res.status(400).json({ error: 'paths es requerido' });
    if (paths.some(p => typeof p !== 'string' || !p || p.includes('..') || p.startsWith('/'))) {
      return res.status(400).json({ error: 'path inválido' });
    }
    const firmas = await Promise.all(paths.map(async (path) => {
      const { data, error } = await supabase.storage.from('quejas').createSignedUploadUrl(path);
      if (error) return { path, error: error.message };
      return { path, token: data.token, signedUrl: data.signedUrl };
    }));
    const fallo = firmas.find(f => f.error);
    if (fallo) return res.status(500).json({ error: fallo.error });
    return res.status(200).json({ firmas });
  }

  if (req.method === 'POST') {
    const q = req.body || {};
    if (!q.folio || !q.proveedor || !q.descripcion) {
      return res.status(400).json({ error: 'folio, proveedor y descripcion son requeridos' });
    }
    const nuevo = {
      folio: q.folio, fecha: q.fecha, proveedor: q.proveedor, lote: q.lote || null,
      material: q.material || null, cantidad_afectada: q.cantidad_afectada || null,
      factura_remision: q.factura_remision || null, detectado_por: q.detectado_por || null,
      accion_solicitada: q.accion_solicitada || null, descripcion: q.descripcion,
      elaboro: q.elaboro || null, autorizo: q.autorizo || null,
      imagenes: Array.isArray(q.imagenes) ? q.imagenes : [], estatus: 'Abierta',
    };
    const { data, error } = await supabase.from('quejas_mp').insert([nuevo]).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data[0]);
  }

  if (req.method === 'PUT') {
    const { id, estatus } = req.body || {};
    if (!id || !estatus) return res.status(400).json({ error: 'id y estatus son requeridos' });
    const { error } = await supabase.from('quejas_mp').update({ estatus }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });
    const { data: queja } = await supabase.from('quejas_mp').select('imagenes').eq('id', id).single();
    const { error } = await supabase.from('quejas_mp').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    if (queja?.imagenes?.length) await supabase.storage.from('quejas').remove(queja.imagenes);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
