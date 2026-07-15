// Valores por defecto — se sobreescriben con lo que venga de Supabase
export const COSTOS = {
  mp_rollo:          412.38,
  caja:                9.95,
  centro_2:            1.07,
  centro_3:            1.61,
  stickyback:        112.00,
  solvente_litro:     53.50,
  tinta: {
    naranja:          176.80,
    azul:             265.00,
    rojo:             180.00,
    negro:            185.70,
  },
  mano_obra_dia:     340.00,
  mantenimiento_dia:  80.00,
  luz_dia:           160.00,
};

export const TINTA_OPCIONES = [
  { key: 'naranja', label: 'Naranja', color: '#ff8c00' },
  { key: 'azul',    label: 'Azul',    color: '#4b8fe8' },
  { key: 'rojo',    label: 'Rojo',    color: '#e84b4b' },
  { key: 'negro',   label: 'Negro',   color: '#aaaaaa' },
];

export const calcularCosto = ({ rollosMP=0, tintaKg=0, solventeKg=0, cajas=0, piezasBuenas=0, sticky=0, diasProd=1, colorKey='', tintaKg2=0, colorKey2='', tipoCentro='2', costosDB=null, precioMPRollo=null }) => {
  // precioMPRollo: para materiales con precio de rollo fijo propio
  // (ej. Engomado a $900/rollo) en vez del precio general de MP.
  const pMP    = precioMPRollo ?? costosDB?.mp_rollo ?? COSTOS.mp_rollo;
  const pCaja  = costosDB?.caja              ?? COSTOS.caja;
  const pC2    = costosDB?.centro_2          ?? COSTOS.centro_2;
  const pC3    = costosDB?.centro_3          ?? COSTOS.centro_3;
  const pStick = costosDB?.stickyback        ?? COSTOS.stickyback;
  const pSolv  = (costosDB?.solvente_litro   ?? COSTOS.solvente_litro) / 0.79;
  const pMO    = costosDB?.mano_obra_dia     ?? COSTOS.mano_obra_dia;
  const pMant  = costosDB?.mantenimiento_dia ?? COSTOS.mantenimiento_dia;
  const pLuz   = costosDB?.luz_dia           ?? COSTOS.luz_dia;

  const tintaPrecios = {
    naranja: costosDB?.tinta_naranja ?? COSTOS.tinta.naranja,
    azul:    costosDB?.tinta_azul    ?? COSTOS.tinta.azul,
    rojo:    costosDB?.tinta_rojo    ?? COSTOS.tinta.rojo,
    negro:   costosDB?.tinta_negro   ?? COSTOS.tinta.negro,
  };
  const avgTinta = Object.values(tintaPrecios).reduce((s, v) => s + v, 0) / 4;
  const precioDeColor = (key) => {
    const c = (key || '').toLowerCase();
    return c.includes('naranja') || c.includes('orange') ? tintaPrecios.naranja
         : c.includes('azul')    || c.includes('blue')   ? tintaPrecios.azul
         : c.includes('rojo')    || c.includes('roja')   || c.includes('red')   ? tintaPrecios.rojo
         : c.includes('negro')   || c.includes('negra')  || c.includes('black') ? tintaPrecios.negro
         : avgTinta;
  };

  const mp         = rollosMP     * pMP;
  // Costo de tinta: si hay 2do color (pedido a 2 tintas), se suma el costo de
  // cada uno por separado -- cada color tiene su propio kg y su propio precio.
  const tinta      = tintaKg * precioDeColor(colorKey) + (Number(tintaKg2) || 0) * precioDeColor(colorKey2);
  const solvente   = solventeKg   * pSolv;
  const cajasC     = cajas        * pCaja;
  const centros    = piezasBuenas * (tipoCentro === '3' ? pC3 : pC2);
  const stickyback = (sticky || 0) * pStick;
  const fijo       = diasProd     * (pMO + pMant + pLuz);
  const total      = mp + tinta + solvente + cajasC + centros + stickyback + fijo;
  const porPieza   = piezasBuenas > 0 ? total / piezasBuenas : 0;
  return { mp, tinta, solvente, cajas: cajasC, centros, stickyback, fijo, total, porPieza };
};
