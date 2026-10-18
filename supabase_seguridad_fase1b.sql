-- =====================================================================
-- Seguridad Fase 1b: lo mismo que supabase_seguridad_fase1.sql hizo con
-- pedidos, ahora para el resto de las tablas.
--
--   - anon (la key del bundle, cualquiera la saca del navegador) ya no lee
--     fallas, refacciones, proveedores (compras con montos), prod_diaria,
--     lista_materiales, cliches, clientes_disenos, quejas_mp, plantillas,
--     costos, perfiles ni jarvis_tokens.
--   - anon SI sigue leyendo lo que usan las paginas publicas sin login:
--       /tarima/<id> (InfoTarima.js) y /pizarra-rebobinado: tarimas completa,
--       y solo las columnas que se muestran de materiales (sin
--       costo_unitario) y de movimientos_inventario_mp (sin usuario_email
--       ni motivo).
--   - authenticated (cualquiera que le dio "Crear cuenta") lee solo si su
--     perfil esta activo -- usa public.es_usuario_activo(), que ya creo
--     supabase_seguridad_fase1.sql.
--   - Escrituras: el frontend ya escribe todo por /api con la service key
--     (que no pasa por RLS), salvo push_subscriptions, que no se toca aqui.
--
-- Se puede correr mas de una vez. Las tablas que no existan se saltan.
-- =====================================================================

do $fn$
declare
  t text;
  pol record;
begin
  -- Tablas que leen las cuentas activas desde el frontend
  foreach t in array array[
    'fallas', 'refacciones', 'proveedores', 'prod_diaria', 'lista_materiales',
    'cliches', 'clientes_disenos', 'quejas_mp', 'plantillas', 'costos',
    'materiales', 'tarimas', 'movimientos_inventario_mp'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('revoke all on table public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.es_usuario_activo())', t || '_select_activos', t);
  end loop;

  -- Tablas que solo se tocan desde /api con la service key
  foreach t in array array['perfiles', 'jarvis_tokens'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $fn$;

-- Paginas publicas: /tarima/<id> y /pizarra-rebobinado
create policy "tarimas_select_anon" on public.tarimas for select to anon using (true);
grant select on public.tarimas to anon;

create policy "materiales_select_anon" on public.materiales for select to anon using (true);
grant select (id, nombre, unidad, stock_min, categoria, match_valor) on public.materiales to anon;

create policy "movimientos_inventario_mp_select_anon" on public.movimientos_inventario_mp for select to anon using (true);
grant select (id, created, material_id, tarima_id, tipo, cantidad, origen) on public.movimientos_inventario_mp to anon;

-- ---------------------------------------------------------------------
-- Verificacion (opcional, correr despues):
--   select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by 1, 2;
-- ---------------------------------------------------------------------
