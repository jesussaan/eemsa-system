-- =====================================================================
-- Limpieza de materiales duplicados (misma tarima de 76 rollos de
-- Cinta Blanca, registrada 5 veces por error el 2026-08-19).
-- Se conserva el material "ROLLOS DE CINTA BLANCA JANEL 6X914 MODELO 200"
-- (id mt08tim9oy6cz1c923c) con su tarima de 76 rollos.
-- Al borrar estos 4 materiales se borran automatico (cascade) sus
-- tarimas y movimientos asociados -- no hace falta tocar esas tablas.
-- =====================================================================
delete from public.materiales where id in (
  'mt08ivatcxhumiduz5j', -- ROLLOS DE CINTA JANEL BLANCA 6X914 MODELO 200
  'mt08fyy0m5nll6hsibh', -- ROLLOS DE CINTA JANEL BLANCA 6X914 MODELO 200
  'mt08d8ncqz2rypvbqeo', --  ROLLOS DE CINTA BLANCA JANEL 6x914 MODELO 200 (espacio al inicio)
  'mt085n4p7svpxsb8o06'  -- Rollos de cinta janel blanca 6x914 imprimible modelo 200
);
