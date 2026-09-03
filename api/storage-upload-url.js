import { createClient } from '@supabase/supabase-js';
import { requiereAlgunModo } from './_lib/auth.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// cliches: lo sube Modo Operador (cliché de un pedido) o Ventas (foto de
// referencia del diseño de un cliente, ver Clientes.js) -- Supervisor
// siempre pasa de todos modos via requiereAlgunModo.
// refacciones: solo se usa dentro de Modo Supervisor (tickets de compra).
const BUCKETS_MODOS = { cliches: ['operador', 'ventas'], refacciones: ['supervisor'] };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bucket, paths } = req.body || {};
  const modosPermitidos = BUCKETS_MODOS[bucket];
  if (!modosPermitidos) return res.status(400).json({ error: 'bucket inválido' });
  if (!(await requiereAlgunModo(req, modosPermitidos))) return res.status(401).json({ error: 'No autorizado' });

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
