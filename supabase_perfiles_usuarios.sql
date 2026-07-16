-- Perfiles de usuario: reemplaza el login por PIN compartido (SESSION_SECRET
-- + PIN_SUPERVISOR/PIN_COTIZADOR) por cuentas individuales con Supabase Auth
-- (correo + contraseña). Cada modo de la app (operador, ventas, emilio,
-- rebobinado, supervisor, cotizador) se autoriza por separado en `modos`.
--
-- Toda cuenta nueva nace con modos='{}' y activo=false ("pendiente de
-- aprobación") -- sin acceso a nada hasta que un admin le asigne modos desde
-- el panel de Usuarios. Igual que el resto de las tablas del sistema, el
-- RLS queda cerrado a anon/authenticated: toda lectura/escritura pasa por
-- api/*.js con la service-role key (ver api/_lib/auth.js).
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  modos      text[] not null default '{}',
  es_admin   boolean not null default false,
  activo     boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.perfiles enable row level security;
-- Sin policies: cerrado por completo a anon/authenticated. Solo el service
-- role (usado por api/perfil.js y api/usuarios.js) puede leer/escribir.

-- Crea automáticamente el perfil "pendiente" al registrarse, para que no
-- haya ninguna carrera cliente/servidor entre el signUp y la primera
-- consulta a /api/perfil.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Bootstrap manual (una sola vez, después del primer registro real):
--   update public.perfiles set es_admin = true, modos = '{supervisor}', activo = true
--   where email = 'tu-correo@ejemplo.com';
