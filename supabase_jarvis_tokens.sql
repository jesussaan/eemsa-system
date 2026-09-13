-- Tokens personales y revocables para acceso de solo lectura a Jarvis desde
-- fuera de la app (Atajos de Siri, por ahora) -- ver api/chat.js y
-- api/registro.js?tabla=jarvis-tokens. Nunca se guarda el token en texto
-- plano, solo su hash SHA-256 (igual que un Personal Access Token de
-- GitHub): si esta tabla se filtrara, no revela ningun token usable.
--
-- limite_diario + usos_hoy + fecha_contador: contador que se resetea solo
-- cuando cambia el dia (ver api/chat.js), para acotar el costo de un Atajo
-- mal configurado o un token filtrado. ultimo_uso ademas fuerza un pequeno
-- espacio minimo entre llamadas (anti loop).
create table if not exists public.jarvis_tokens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  nombre         text not null default 'Atajo de Siri',
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  ultimo_uso     timestamptz,
  limite_diario  int not null default 200,
  usos_hoy       int not null default 0,
  fecha_contador date
);

create index if not exists jarvis_tokens_user_id_idx on public.jarvis_tokens(user_id);

alter table public.jarvis_tokens enable row level security;
-- Sin policies: cerrado por completo a anon/authenticated. Solo el service
-- role (api/registro.js y api/chat.js) lee/escribe esta tabla -- mismo
-- criterio que perfiles (ver supabase_perfiles_usuarios.sql).
