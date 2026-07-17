-- Folio propio de Rebobinado (empieza en 1) -- EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Antes Rebobinado usaba el mismo consecutivo "num" que los pedidos de
-- cliente (compartido), asi que los registros viejos tienen numeros
-- altos (84, 90...). Se agrega esta columna aparte, vacia para todo lo
-- viejo, para que el contador nuevo arranque limpio en 1 sin que los
-- numeros viejos lo empujen para arriba.
alter table public.pedidos add column if not exists folio_rebobinado integer;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- alter table public.pedidos drop column if exists folio_rebobinado;
