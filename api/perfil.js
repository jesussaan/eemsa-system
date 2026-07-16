import { supabaseAdmin } from './_lib/auth.js';

// A diferencia de requiereModo/usuarioDesdeRequest, este endpoint SI debe
// responder aunque el perfil este pendiente (activo=false) -- es justo lo
// que el cliente usa para saber si ya lo aprobaron o sigue esperando.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'No autorizado' });

  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from('perfiles')
    .select('modos, activo, es_admin')
    .eq('id', data.user.id)
    .single();
  if (perfilError || !perfil) return res.status(404).json({ error: 'Perfil no encontrado' });

  return res.status(200).json({
    email: data.user.email,
    modos: perfil.modos || [],
    activo: !!perfil.activo,
    esAdmin: !!perfil.es_admin,
  });
}
