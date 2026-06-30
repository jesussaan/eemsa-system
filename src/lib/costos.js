// Costos de producción EEMSA — actualiza aquí cuando cambien precios

export const COSTOS = {
  mp_rollo:         412.38,  // por rollo de MP (canela/transparente/blanca)
  caja:               9.95,  // por caja
  centro_2:           1.07,  // por pieza — centro 2"
  centro_3:           1.61,  // por pieza — centro 3" (1.07 × 1.5)
  stickyback:       112.00,  // por stickyback
  solvente_litro:    53.50,  // por litro
  tinta: {
    naranja:         176.80, // por kg
    azul:            265.00,
    rojo:            180.00,
    negro:           185.70,
  },
  mano_obra_dia:    340.00,  // William por día
  mantenimiento_dia: 80.00,  // mantenimiento impresora por día
  luz_dia:          160.00,  // luz impresora por día
};

export const TINTA_OPCIONES = [
  { key: 'naranja', label: 'Naranja', color: '#ff8c00', precio: COSTOS.tinta.naranja },
  { key: 'azul',    label: 'Azul',    color: '#4b8fe8', precio: COSTOS.tinta.azul },
  { key: 'rojo',    label: 'Rojo',    color: '#e84b4b', precio: COSTOS.tinta.rojo },
  { key: 'negro',   label: 'Negro',   color: '#aaaaaa', precio: COSTOS.tinta.negro },
];

const TINTA_PROMEDIO = Object.values(COSTOS.tinta).reduce((s, v) => s + v, 0) / Object.values(COSTOS.tinta).length;
const SOLVENTE_KG    = COSTOS.solvente_litro / 0.79; // densidad ~0.79 kg/L

export const costoTintaKg = (colorKey = '') => {
  const c = (colorKey || '').toLowerCase();
  if (c.includes('naranja') || c.includes('orange')) return COSTOS.tinta.naranja;
  if (c.includes('azul')    || c.includes('blue'))   return COSTOS.tinta.azul;
  if (c.includes('rojo')    || c.includes('roja') || c.includes('red')) return COSTOS.tinta.rojo;
  if (c.includes('negro')   || c.includes('negra')|| c.includes('black')) return COSTOS.tinta.negro;
  return TINTA_PROMEDIO;
};

export const calcularCosto = ({ rollosMP = 0, tintaKg = 0, solventeKg = 0, cajas = 0, piezasBuenas = 0, sticky = 0, diasProd = 1, colorKey = '', tipoCentro = '2' }) => {
  const pTinta   = costoTintaKg(colorKey);
  const mp       = rollosMP     * COSTOS.mp_rollo;
  const tinta    = tintaKg      * pTinta;
  const solvente = solventeKg   * SOLVENTE_KG;
  const cajasC   = cajas        * COSTOS.caja;
  const centros  = piezasBuenas * (tipoCentro === '3' ? COSTOS.centro_3 : COSTOS.centro_2);
  const stickyC  = sticky       * COSTOS.stickyback;
  const fijo     = diasProd     * (COSTOS.mano_obra_dia + COSTOS.mantenimiento_dia + COSTOS.luz_dia);
  const total    = mp + tinta + solvente + cajasC + centros + stickyC + fijo;
  const porPieza = piezasBuenas > 0 ? total / piezasBuenas : 0;
  return { mp, tinta, solvente, cajas: cajasC, centros, stickyback: stickyC, fijo, total, porPieza };
};
