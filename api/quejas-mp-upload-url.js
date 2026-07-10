import { createClient } from '@supabase/supabase-js';
import { verificarToken, tokenDesdeHeader } from './_lib/token.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const sesion = verificarToken(tokenDesdeHeader(req), ['supervisor']);
  if (!sesion) return res.status(401).json({ error: 'No autorizado' });
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
