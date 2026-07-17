-- Tabla para suscripciones de push notifications
create table if not exists public.push_subscriptions (
  id          uuid default gen_random_uuid() primary key,
  endpoint    text unique not null,
  subscription jsonb not null,
  ua          text,
  created_at  timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

-- Cualquier usuario, con o sin sesion (anon o authenticated), puede
-- suscribirse o borrar su propia suscripcion.
create policy "anon_insert" on public.push_subscriptions
  for insert to anon, authenticated with check (true);

create policy "anon_delete" on public.push_subscriptions
  for delete to anon, authenticated using (true);

-- El service role (usado por la API de Vercel) puede leer todas las suscripciones
-- Esto se gestiona automáticamente por Supabase — el service key bypass RLS
