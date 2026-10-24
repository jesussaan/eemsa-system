-- =====================================================================
-- Modulo Herramienta: cajas (Caja roja, Caja negra, Archivero cajon 1...).
-- Cada tipo de herramienta vive en una caja (herramienta_tipos.caja_id) y
-- cada caja tiene su QR (/herramienta/caja/<id>) que abre solo lo que hay
-- adentro. Requiere supabase_herramientas.sql. Se puede correr mas de una vez.
-- =====================================================================

create table if not exists public.herramienta_cajas (
  id       text primary key,
  created  timestamptz not null default now(),
  nombre   text not null,
  color    text,
  orden    integer not null default 0
);

alter table public.herramienta_tipos
  add column if not exists caja_id text references public.herramienta_cajas(id) on delete set null;

alter table public.herramienta_cajas enable row level security;
revoke all on table public.herramienta_cajas from anon;
drop policy if exists "herramienta_cajas_select_activos" on public.herramienta_cajas;
create policy "herramienta_cajas_select_activos" on public.herramienta_cajas
  for select to authenticated using (public.es_usuario_activo());

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.herramienta_cajas'; exception when others then null; end;
end $$;

-- Las cajas que hay hoy.
insert into public.herramienta_cajas (id, nombre, color, orden) values
  ('caja-roja',         'Caja roja',                    '#e84b4b', 1),
  ('caja-negra',        'Caja negra',                   '#2b2f36', 2),
  ('caja-dados-1-4',    'Caja de dados 1/4"',           '#6b7a8f', 3),
  ('juego-milwaukee',   'Llaves combinadas Milwaukee',  '#b5121b', 4),
  ('archivero-cajon-1', 'Archivero · Cajón 1',          '#8a6d3b', 5),
  ('archivero-cajon-2', 'Archivero · Cajón 2',          '#8a6d3b', 6),
  ('archivero-cajon-3', 'Archivero · Cajón 3',          '#8a6d3b', 7)
on conflict (id) do nothing;

-- Tipos nuevos (la cantidad se pone desde la app).
insert into public.herramienta_tipos (id, nombre, orden, caja_id) values
  ('dados-1-4',                'Dados 1/4"',                   7,  'caja-negra'),
  ('dados-3-8',                'Dados 3/8"',                   8,  'caja-negra'),
  ('dados-1-2',                'Dados 1/2"',                   9,  'caja-negra'),
  ('llaves-espanolas-mm',      'Llaves españolas (mm)',        10, 'caja-negra'),
  ('llaves-espanolas-estandar','Llaves españolas (estándar)',  11, 'caja-negra'),
  ('dados-1-4-caja',           'Dados 1/4"',                   12, 'caja-dados-1-4'),
  ('llaves-combinadas-milwaukee','Llaves combinadas Milwaukee', 13, 'juego-milwaukee')
on conflict (id) do nothing;

-- Los tipos que ya estaban, cada uno a su caja (solo si aun no tiene).
update public.herramienta_tipos set caja_id = 'caja-roja'
  where id in ('desarmadores', 'pinzas-presion', 'pinzas-corte') and caja_id is null;
update public.herramienta_tipos set caja_id = 'archivero-cajon-1' where id = 'matraca-extensiones' and caja_id is null;
update public.herramienta_tipos set caja_id = 'archivero-cajon-2' where id = 'remachadoras' and caja_id is null;
update public.herramienta_tipos set caja_id = 'archivero-cajon-3' where id = 'prensas-c' and caja_id is null;
