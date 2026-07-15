import { ENGOMADO_JUMBO_LARGO_M, ENGOMADO_PISTAS } from './constants';

export const MP_ANCHO    = 6;
export const MP_LARGO    = 914;
export const CLICHE_W    = 14.4;
export const BCM_RATE    = 0.000698;
export const INK_DENSITY = 1.0;
export const TRANSFER    = 0.50;

export const PORTALICHES = [
  { largo: 30.9, label: '30.9 cm' },
  { largo: 25.4, label: '25.4 cm' },
  { largo: 29.0, label: '29.0 cm' },
];

export const DISENOS = [
  { key: 'chica',   label: 'Letra chica',            cob: 0.125 },
  { key: 'normal',  label: 'Letra normal',            cob: 0.275 },
  { key: 'grande',  label: 'Letra grande',            cob: 0.450 },
  { key: 'relleno', label: 'Relleno completo + logo', cob: 0.825 },
];

// Formula compartida entre Cotizador y Modo Operador para rendimiento de
// rollo (rollosMP) y consumo de tinta/solvente. Antes estaba duplicada en
// ambos componentes y un mismo bug (pistas fijas en la formula de tinta)
// se tuvo que arreglar dos veces -- ahora hay una sola fuente de verdad.
export function calcularProduccion({
  ancho, largo, cajas, rollosCaja, merma = 0,
  portaliche, diseno, portaliche2, diseno2, tieneColor2 = false,
  esEngomado = false, sinTinta = false,
}) {
  const anchoN      = parseFloat(ancho)    || 0;
  const largoN      = parseFloat(largo)    || 0;
  const cajasN      = parseInt(cajas)      || 0;
  const rollosCajaN = parseInt(rollosCaja) || 0;
  const mermaN      = parseInt(merma)      || 0;
  const clicheLargo = parseFloat(portaliche);
  const cobertura   = DISENOS.find(d => d.key === diseno)?.cob || 0.275;

  const largoReal    = esEngomado ? largoN : (largoN > 4 ? largoN - 4 : largoN);
  const pistas       = esEngomado ? ENGOMADO_PISTAS : (anchoN > 0 ? Math.floor(MP_ANCHO / anchoN) : 0);
  const rollosPista  = largoReal > 0 ? Math.floor((esEngomado ? ENGOMADO_JUMBO_LARGO_M : MP_LARGO) / largoReal) : 0;
  const rendimiento  = pistas * rollosPista;
  const piezasBuenas = cajasN * rollosCajaN;
  const piezasTotal  = piezasBuenas + mermaN;
  const rollosExacto = rendimiento > 0 ? piezasTotal / rendimiento : 0;
  const rollosMP     = Math.ceil(rollosExacto);

  const clicheArea      = CLICHE_W * clicheLargo;
  const inkPerImpresion = clicheArea * BCM_RATE * cobertura;
  const largoRealCm     = largoReal * 100;
  const impresiones     = piezasTotal > 0 && clicheLargo > 0 && pistas > 0
    ? (piezasTotal * largoRealCm) / (clicheLargo * pistas) : 0;
  const tintaKg = sinTinta ? 0 : (impresiones * inkPerImpresion * INK_DENSITY * TRANSFER) / 1000;

  const clicheLargo2      = parseFloat(portaliche2);
  const cobertura2        = DISENOS.find(d => d.key === diseno2)?.cob || 0.275;
  const clicheArea2       = CLICHE_W * clicheLargo2;
  const inkPerImpresion2  = clicheArea2 * BCM_RATE * cobertura2;
  const impresiones2      = tieneColor2 && piezasTotal > 0 && clicheLargo2 > 0 && pistas > 0
    ? (piezasTotal * largoRealCm) / (clicheLargo2 * pistas) : 0;
  const tintaKg2 = tieneColor2 && !sinTinta ? (impresiones2 * inkPerImpresion2 * INK_DENSITY * TRANSFER) / 1000 : 0;

  const tintaKgTotal = tintaKg + tintaKg2;
  const solventeKg = (sinTinta || esEngomado || cajasN <= 0) ? 0 : (tintaKgTotal * 0.5) + 0.600;

  const listo = anchoN > 0 && largoN > 0 && cajasN > 0 && rollosCajaN > 0;

  return {
    anchoN, largoN, cajasN, rollosCajaN, mermaN, clicheLargo, cobertura,
    largoReal, pistas, rollosPista, rendimiento, piezasBuenas, piezasTotal,
    rollosExacto, rollosMP,
    clicheArea, inkPerImpresion, largoRealCm, impresiones, tintaKg,
    clicheLargo2, cobertura2, clicheArea2, inkPerImpresion2, impresiones2, tintaKg2,
    tintaKgTotal, solventeKg, listo,
  };
}
