import { supabase } from './supabase';

// authHeaders() en Pedidos.js/Refacciones.js/Produccion.js/etc. es sincrono
// (se usa inline en cada fetch), asi que el access_token se cachea aqui en
// memoria y se mantiene al dia con onAuthStateChange, en vez de volver
// async cada sitio donde ya se usa.
let accessToken = null;

supabase.auth.onAuthStateChange((_event, session) => {
  accessToken = session?.access_token || null;
});

// Se llama una vez al arrancar la app para que accessToken ya este listo
// antes del primer render (onAuthStateChange dispara poco despues).
export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  accessToken = data?.session?.access_token || null;
  return data?.session || null;
}

export const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
});

export const iniciarSesion = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const registrarse = (email, password) => supabase.auth.signUp({ email, password });
export const cerrarSesion = () => supabase.auth.signOut();
