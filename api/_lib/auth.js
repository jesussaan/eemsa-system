import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function usuarioDesdeRequest(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('modos, activo, es_admin')
    .eq('id', data.user.id)
    .single();
  if (!perfil?.activo) return null;

  return { id: data.user.id, email: data.user.email, modos: perfil.modos || [], esAdmin: !!perfil.es_admin };
}

// "supervisor" es superusuario operativo -- ya se comporta asi hoy (casi todo
// lo sensible esta gateado a soloSupervisor en cada api/*.js). es_admin es
// algo aparte y mas angosto: solo controla quien puede administrar el acceso
// de otros usuarios desde el panel de Usuarios.
export async function requiereAlgunModo(req, modosPermitidos) {
  const u = await usuarioDesdeRequest(req);
  if (!u) return null;
  if (u.esAdmin || u.modos.includes('supervisor') || modosPermitidos.some(m => u.modos.includes(m))) return u;
  return null;
}

export async function requiereModo(req, modo) {
  return requiereAlgunModo(req, [modo]);
}

export async function requiereAdmin(req) {
  const u = await usuarioDesdeRequest(req);
  return u?.esAdmin ? u : null;
}

// Autenticacion servidor-a-servidor para integraciones externas sin sesion
// de usuario (ej. Jarvis) -- no hay JWT de Supabase que validar, asi que en
// vez de usuarioDesdeRequest se compara un secreto fijo guardado SOLO como
// variable de entorno de Vercel (JARVIS_API_SECRET, sin prefijo REACT_APP_
// para que nunca se empaquete en el build de React, y sin valor en git).
// Si el secreto no esta configurado en el entorno, nunca autoriza -- asi un
// despliegue sin la variable puesta se queda cerrado en vez de abierto.
// Comparacion a tiempo constante para no filtrar el secreto por timing.
export function requiereSecretoJarvis(req) {
  const esperado = process.env.JARVIS_API_SECRET;
  if (!esperado) return false;
  const recibido = String(req.headers['x-jarvis-secret'] || '');
  const bufEsperado = Buffer.from(esperado);
  const bufRecibido = Buffer.from(recibido);
  if (bufRecibido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(bufRecibido, bufEsperado);
}

export { supabaseAdmin };
