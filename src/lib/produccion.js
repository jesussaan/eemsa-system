import { ENGOMADO_JUMBO_LARGO_M, ENGOMADO_PISTAS, REBOB_CLIENTE } from './constants';

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

// Rollos por caja segun ancho -- 2" caben 36, 3" caben 24 (Canela/Transparente/
// Blanca). Engomado siempre se vende como 3" pero el rollo real es mas chico,
// asi que caben 10 por caja en vez de 24. Fuente unica -- se usa al crear el
// pedido (Ventas, Pedidos) y al finalizar produccion (Modo Operador).
export const rollosPorCaja = (ancho, esEngomado) => {
  if (esEngomado) return 10;
  const anchoN = parseFloat(String(ancho ?? '').replace(/[^0-9.]/g, ''));
  return anchoN === 3 ? 24 : 36;
};

// Ancho en pulgadas de un pedido, sin importar de donde vino: Pedidos.js
// guarda "ancho" suelto, ModoVentas.js solo guarda "medida" (ej. "3x100").
// Engomado siempre es 3" aunque el campo no lo diga -- se usa para elegir
// la tarifa de centro correcta al costear (ver tipoCentro en lib/costos.js).
export const anchoDePedido = (pedido) => {
  if (pedido?.tipo === 'Engomado') return 3;
  const directo = parseFloat(String(pedido?.ancho ?? '').replace(/[^0-9.]/g, ''));
  if (directo) return directo;
  const deMedida = String(pedido?.medida ?? '').match(/^\s*(\d+(\.\d+)?)/);
  return deMedida ? parseFloat(deMedida[1]) : 0;
};

// Largo (m) de un pedido, mismo criterio que anchoDePedido: Pedidos.js guarda
// "largo" suelto, ModoVentas.js solo guarda "medida" (ej. "3x100") -- si no
// viene el campo aparte, se saca el segundo numero de la medida.
export const largoDePedido = (pedido) => {
  const directo = parseFloat(String(pedido?.largo ?? '').replace(/[^0-9.]/g, ''));
  if (directo) return directo;
  const deMedida = String(pedido?.medida ?? '').match(/^\s*\d+(?:\.\d+)?\D+(\d+(\.\d+)?)/);
  return deMedida ? parseFloat(deMedida[1]) : 0;
};

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

// Suma cuanto Rollo MP / Tinta / Solvente van a necesitar TODOS los pedidos
// que todavia no se han finalizado ("anotado"/"proceso"), para poder avisar
// en Inventario ANTES de que el stock cruce el minimo -- no solo cuando ya
// lo cruzo. Portacliche/diseno de un pedido que aun no arranca casi nunca
// estan capturados (se eligen hasta que Modo Operador lo finaliza), asi que
// si faltan se usa el default de CalculadoraProduccion.js (30.9cm / normal)
// y el renglon se marca "estimado" en vez de exacto.
export function proyectarConsumoPendientes(pedidos) {
  const porTipo = {};   // tipo de cinta -> { rollos, pedidos, estimado }
  const porColor = {};  // color de tinta -> { kg, pedidos, estimado }
  const porCentro = {}; // ancho ("2"/"3") -> { piezas, pedidos } -- 1 core por pieza
  let solventeTotal = 0;

  (pedidos || [])
    .filter(p => p.cliente !== REBOB_CLIENTE && (p.status === 'anotado' || p.status === 'proceso'))
    .forEach(p => {
      const esEngomado = p.tipo === 'Engomado';
      const ancho = anchoDePedido(p);
      const largo = largoDePedido(p);
      const cajas = Number(p.cajas || 0);
      if (!ancho || !largo || !cajas) return;
      const rollosCaja = p.rollos_caja || rollosPorCaja(ancho, esEngomado);
      const estimado = !p.diseno || !p.portaliche;

      const { rollosExacto, tintaKg, tintaKg2, solventeKg, piezasTotal } = calcularProduccion({
        ancho, largo, cajas, rollosCaja, merma: 0,
        portaliche: p.portaliche || 30.9, diseno: p.diseno || 'normal',
        portaliche2: p.portaliche2 || 30.9, diseno2: p.diseno2 || 'normal',
        tieneColor2: !!p.color2, esEngomado, sinTinta: false,
      });

      const tipo = (p.tipo || 'Sin tipo').trim();
      if (!porTipo[tipo]) porTipo[tipo] = { rollos: 0, pedidos: 0, estimado: false };
      porTipo[tipo].rollos += rollosExacto;
      porTipo[tipo].pedidos += 1;
      porTipo[tipo].estimado = porTipo[tipo].estimado || estimado;

      const color = (p.color || p.tinta_tipo || '').trim();
      if (color) {
        if (!porColor[color]) porColor[color] = { kg: 0, pedidos: 0, estimado: false };
        porColor[color].kg += tintaKg;
        porColor[color].pedidos += 1;
        porColor[color].estimado = porColor[color].estimado || estimado;
      }
      const color2 = (p.color2 || '').trim();
      if (color2) {
        if (!porColor[color2]) porColor[color2] = { kg: 0, pedidos: 0, estimado: false };
        porColor[color2].kg += tintaKg2;
        porColor[color2].pedidos += 1;
        porColor[color2].estimado = porColor[color2].estimado || estimado;
      }
      solventeTotal += solventeKg;

      // Mismo criterio que tipoCentro en lib/costos.js / ModoOperador: 3"
      // cuenta aparte, cualquier otro ancho cae en la caja de centros de 2".
      const anchoCentro = ancho === 3 ? '3' : '2';
      if (!porCentro[anchoCentro]) porCentro[anchoCentro] = { piezas: 0, pedidos: 0 };
      porCentro[anchoCentro].piezas += piezasTotal;
      porCentro[anchoCentro].pedidos += 1;
    });

  return {
    porTipo: Object.entries(porTipo).map(([tipo, d]) => ({ tipo, ...d })).sort((a, b) => b.rollos - a.rollos),
    porColor: Object.entries(porColor).map(([color, d]) => ({ color, ...d })).sort((a, b) => b.kg - a.kg),
    porCentro: Object.entries(porCentro).map(([ancho, d]) => ({ ancho, ...d })).sort((a, b) => b.piezas - a.piezas),
    solventeTotal,
  };
}
