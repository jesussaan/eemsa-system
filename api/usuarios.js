import { supabaseAdmin, requiereAdmin } from './_lib/auth.js';

const MODOS_VALIDOS = ['operador', 'ventas', 'emilio', 'rebobinado', 'supervisor', 'cotizador'];

// ?propio=1 (GET): perfil del usuario que manda el token -- cualquier cuenta
// logueada, incluso sin modos asignados/pendiente de aprobar (es justo el
// endpoint que usa el cliente para saber si ya lo aprobaron). Fusionado
// aqui (antes era api/perfil.js) para no pasar del limite de 12 Serverless
// Functions del plan Hobby de Vercel.
async function perfilPropio(req, res) {
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

export default async function handler(req, res) {
  if (req.query.propio === '1') return perfilPropio(req, res);

  if (!(await requiereAdmin(req))) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('perfiles')
      .select('id, email, modos, es_admin, activo, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, modos, activo } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id es requerido' });

    const updates = {};
    if (modos !== undefined) {
      if (!Array.isArray(modos) || modos.some(m => !MODOS_VALIDOS.includes(m))) {
        return res.status(400).json({ error: `modos debe ser un arreglo con valores de: ${MODOS_VALIDOS.join(', ')}` });
      }
      updates.modos = modos;
    }
    if (activo !== undefined) updates.activo = !!activo;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Sin campos válidos para actualizar' });

    const { error } = await supabaseAdmin.from('perfiles').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
