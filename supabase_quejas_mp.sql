-- =====================================================================
-- MODULO "QUEJAS DE MATERIA PRIMA" — EEMSA System
-- Ejecutar TODO este archivo de una sola vez en el SQL Editor de Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla quejas_mp
-- ---------------------------------------------------------------------
create table if not exists public.quejas_mp (
  id bigint generated always as identity primary key,
  folio text not null unique,
  fecha date not null default current_date,
  created timestamptz not null default now(),
  proveedor text not null,
  lote text,
  material text,
  cantidad_afectada text,
  factura_remision text,
  detectado_por text,
  accion_solicitada text,
  descripcion text,
  imagenes jsonb not null default '[]'::jsonb,
  estatus text not null default 'Abierta'
);

create index if not exists quejas_mp_proveedor_idx on public.quejas_mp (proveedor);
create index if not exists quejas_mp_folio_idx on public.quejas_mp (folio);

-- RLS: misma politica abierta que el resto del sistema (acceso via anon key)
alter table public.quejas_mp enable row level security;

drop policy if exists "quejas_mp_select" on public.quejas_mp;
create policy "quejas_mp_select" on public.quejas_mp for select using (true);

drop policy if exists "quejas_mp_insert" on public.quejas_mp;
create policy "quejas_mp_insert" on public.quejas_mp for insert with check (true);

drop policy if exists "quejas_mp_update" on public.quejas_mp;
create policy "quejas_mp_update" on public.quejas_mp for update using (true);


-- ---------------------------------------------------------------------
-- 2) Bucket de Storage "quejas" (para las fotos de evidencia)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('quejas', 'quejas', true)
on conflict (id) do nothing;

-- Politicas de Storage: permitir leer/subir archivos en el bucket "quejas"
drop policy if exists "quejas_storage_select" on storage.objects;
create policy "quejas_storage_select" on storage.objects for select
  using (bucket_id = 'quejas');

drop policy if exists "quejas_storage_insert" on storage.objects;
create policy "quejas_storage_insert" on storage.objects for insert
  with check (bucket_id = 'quejas');


-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop policy if exists "quejas_mp_select" on public.quejas_mp;
-- drop policy if exists "quejas_mp_insert" on public.quejas_mp;
-- drop policy if exists "quejas_mp_update" on public.quejas_mp;
-- alter table public.quejas_mp disable row level security;
-- drop table if exists public.quejas_mp;
-- drop policy if exists "quejas_storage_select" on storage.objects;
-- drop policy if exists "quejas_storage_insert" on storage.objects;
-- delete from storage.buckets where id = 'quejas';
