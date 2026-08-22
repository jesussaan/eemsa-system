-- Jumbos de Rebobinado -- EEMSA System. Ejecutar en el SQL Editor de Supabase.
--
-- No se crea tabla nueva: cada jumbo fisico se registra como una tarima mas
-- (categoria "jumbo" en materiales), reusando todo lo que Inventario.js ya
-- tiene para dar de alta/QR/escaneo. Lo unico nuevo es una columna en
-- pedidos para saber de que jumbo (tarima) salio cada plan/corte de
-- Rebobinado.

alter table public.pedidos add column if not exists tarima_jumbo_id text;

-- Para deshacer:
-- alter table public.pedidos drop column if exists tarima_jumbo_id;
