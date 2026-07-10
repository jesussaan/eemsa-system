import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// cliches: lo sube Modo Operador, que no tiene PIN -- se queda abierto,
// igual que el resto de sus acciones de piso.
// refacciones: solo se usa dentro de Modo Supervisor (tickets de compra).
const BUCKETS_ABIERTOS = ['cliches'];
const BUCKETS_SUPERVISOR = ['refacciones'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bucket, paths } = req.body || {};
  if (BUCKETS_SUPERVISOR.includes(bucket)) {
    const sesion = verificarToken(tokenDesdeHeader(req), ['supervisor']);
    if (!sesion) return res.status(401).json({ error: 'No autorizado' });
  } else if (!BUCKETS_ABIERTOS.includes(bucket)) {
    return res.status(400).json({ error: 'bucket inválido' });
  }

  if (!Array.isArray(paths) || !paths.length) return res.status(400).json({ error: 'paths es requerido' });
  if (paths.some(p => typeof p !== 'string' || !p || p.includes('..') || p.startsWith('/'))) {
    return res.status(400).json({ error: 'path inválido' });
  }

  const firmas = await Promise.all(paths.map(async (path) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return { path, error: error.message };
    return { path, token: data.token, signedUrl: data.signedUrl };
  }));

  const fallo = firmas.find(f => f.error);
  if (fallo) return res.status(500).json({ error: fallo.error });
  return res.status(200).json({ firmas });
}
