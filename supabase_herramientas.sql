-- =====================================================================
-- Modulo Herramienta: control de herramientas del taller.
--   herramienta_tipos      = cada tipo (Desarmadores, Pinzas de presion...)
--                            con cuantas piezas hay; cada pieza se numera
--                            del 1 a `cantidad` (Desarmador #1, #2...).
--   herramienta_prestamos  = quien saco que pieza (tipo + numero) y cuando
--                            la regreso. Abierto = regreso null.
-- Cada tipo tiene su QR (/herramienta/<id>) para sacar/regresar desde el
-- celular (ver src/components/ModoHerramienta.js).
-- Lectura: solo cuentas activas (es_usuario_activo, de
-- supabase_seguridad_fase1.sql). Escritura: solo por /api/herramientas con
-- la service key (permiso "herramienta", supervisor o admin).
-- Se puede correr mas de una vez.
-- =====================================================================

create table if not exists public.herramienta_tipos (
  id         text primary key,
  created    timestamptz not null default now(),
  nombre     text not null,
  cantidad   integer not null default 0 check (cantidad >= 0),
  ubicacion  text,
  orden      integer not null default 0
);

create table if not exists public.herramienta_prestamos (
  id            text primary key,
  tipo_id       text not null references public.herramienta_tipos(id) on delete cascade,
  numero        integer not null check (numero > 0),
  persona       text not null,
  salida        timestamptz not null default now(),
  regreso       timestamptz,
  notas         text,
  usuario_email text
);
create index if not exists herramienta_prestamos_tipo_idx on public.herramienta_prestamos (tipo_id);
-- Una pieza no puede estar prestada a dos personas a la vez.
create unique index if not exists herramienta_prestamos_abierto_uq
  on public.herramienta_prestamos (tipo_id, numero) where regreso is null;

alter table public.herramienta_tipos enable row level security;
alter table public.herramienta_prestamos enable row level security;
revoke all on table public.herramienta_tipos from anon;
revoke all on table public.herramienta_prestamos from anon;
drop policy if exists "herramienta_tipos_select_activos" on public.herramienta_tipos;
create policy "herramienta_tipos_select_activos" on public.herramienta_tipos
  for select to authenticated using (public.es_usuario_activo());
drop policy if exists "herramienta_prestamos_select_activos" on public.herramienta_prestamos;
create policy "herramienta_prestamos_select_activos" on public.herramienta_prestamos
  for select to authenticated using (public.es_usuario_activo());

-- Para que la pantalla se actualice sola cuando alguien saca/regresa algo.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.herramienta_tipos'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.herramienta_prestamos'; exception when others then null; end;
end $$;

-- Los tipos que hay hoy (la cantidad se pone desde la app).
insert into public.herramienta_tipos (id, nombre, orden) values
  ('desarmadores',       'Desarmadores',          1),
  ('pinzas-presion',     'Pinzas de presión',     2),
  ('pinzas-corte',       'Pinzas de corte',       3),
  ('remachadoras',       'Remachadoras',          4),
  ('prensas-c',          'Prensas tipo C',        5),
  ('matraca-extensiones','Matraca y extensiones', 6)
on conflict (id) do nothing;
