// Tiempos estandar / capacidad teorica -- separado de costos.js (ese es
// dinero, esto es tiempo). Se captura UNA VEZ por linea (no por corrida) via
// un estudio de tiempos ocasional -- Cintas (SIAT L36), Engomado y
// Rebobinado se llevan aparte porque son procesos distintos (maquinas y
// montajes distintos entre si).
export const CAPACIDAD_DEFAULTS = {
  montaje_min_cintas:            15,
  velocidad_piezasmin_cintas:    40,
  montaje_min_engomado:          20,
  velocidad_piezasmin_engomado:  25,
  montaje_min_rebobinado:        20,
  velocidad_piezasmin_rebobinado: 30,
};

export const CAPACIDAD_CAMPOS = [
  { key: 'montaje_min_cintas',            label: 'Montaje promedio (min)', grupo: 'Cintas (SIAT L36)' },
  { key: 'velocidad_piezasmin_cintas',    label: 'Velocidad (piezas/min)', grupo: 'Cintas (SIAT L36)' },
  { key: 'montaje_min_engomado',          label: 'Montaje promedio (min)', grupo: 'Engomado' },
  { key: 'velocidad_piezasmin_engomado',  label: 'Velocidad (piezas/min)', grupo: 'Engomado' },
  { key: 'montaje_min_rebobinado',        label: 'Montaje promedio (min)', grupo: 'Rebobinado' },
  { key: 'velocidad_piezasmin_rebobinado', label: 'Velocidad (piezas/min)', grupo: 'Rebobinado' },
];
