-- Jumbos de Rebobinado -- EEMSA System. Ejecutar en el SQL Editor de Supabase.
--
-- No se crea tabla nueva: cada jumbo fisico se registra como una tarima mas
-- (categoria "jumbo" en materiales), reusando todo lo que Inventario.js ya
-- tiene para dar de alta/QR/escaneo. Lo unico nuevo es una columna en
-- pedidos para saber de que jumbo (tarima) salio cada plan/corte de
-- Rebobinado.

alter table public.pedidos add column if not exists tarima_jumbo_id text;

-- Ambas tablas tienen restricciones (check) que limitan los valores
-- permitidos en categoria/origen -- se me olvido incluir "jumbo" y
-- "rebobinado" al agregarlos (mismo tipo de bug que ya paso con
-- ajustar-conteo, ver commit df7e4b4). Sin esto, crear un material de
-- categoria "jumbo" o descontar un jumbo (origen "rebobinado") falla con
-- un error de restriccion violada.
alter table public.materiales drop constraint if exists materiales_categoria_check;
alter table public.materiales add constraint materiales_categoria_check
  check (categoria in ('rollo_mp','tinta','solvente','centro','jumbo','otro'));

alter table public.movimientos_inventario_mp drop constraint if exists movimientos_inventario_mp_origen_check;
alter table public.movimientos_inventario_mp add constraint movimientos_inventario_mp_origen_check
  check (origen in ('manual','corrida_automatica','rebobinado'));

-- Para deshacer:
-- alter table public.pedidos drop column if exists tarima_jumbo_id;
-- alter table public.materiales drop constraint if exists materiales_categoria_check;
-- alter table public.materiales add constraint materiales_categoria_check check (categoria in ('rollo_mp','tinta','solvente','centro','otro'));
-- alter table public.movimientos_inventario_mp drop constraint if exists movimientos_inventario_mp_origen_check;
-- alter table public.movimientos_inventario_mp add constraint movimientos_inventario_mp_origen_check check (origen in ('manual','corrida_automatica'));
