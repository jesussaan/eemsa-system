export const MAQUINAS = ["SIAT L36 #1", "SIAT L36 #2", "SIAT L36 #3", "Rebobinadora"];
export const TIPOS = ["Blanca", "Canela", "Transparente", "Engomado"];

// Conversiones fisicas de Inventario (ver src/components/Inventario.js y
// api/inventario.js) -- como llega cada insumo, para no tener que hacer la
// cuenta a mano al capturar una entrada:
//   Rollo MP: llega en cajas de 2 rollos, apiladas en tarima.
//   Centros (cores de carton): llegan en cajas sueltas (no en tarima),
//     organizadas por ancho -- una caja de 2" trae 250 piezas, una de 3" 280.
//   Solvente/alcohol: llega en tambos de 200 litros.
//   Tinta: llega por cubeta de 20 kg.
export const ROLLOS_POR_CAJA_MP = 2;
export const CENTROS_POR_CAJA = { '2': 250, '3': 280 };
export const LITROS_POR_TAMBO_SOLVENTE = 200;
export const KG_POR_CUBETA_TINTA = 17;
export const OPERADORES = ["William", "Alfredo"];
export const COMPS = ["Rodillo anilox", "Sistema de tintas", "Cliché/portacliché", "Motor principal", "Sistema de corte", "Banda transportadora", "Sistema eléctrico", "Resortes de Mandriles Chicos", "Otro"];
export const COMPS_REBOBINADORA = ["Cuchillas de corte", "Motor rebobinador", "Sistema de frenado", "Mandriles", "Sistema eléctrico", "Otro"];
export const STATUS_PED = { pendiente: "Falta dar de alta", anotado: "Anotado", proceso: "En proceso", terminado: "Terminado" };
export const SEV = { leve: "Leve", moderada: "Moderada", critica: "Crítica" };
export const META_CAJAS = 12;
export const META_MERMA_PCT = 3;
export const UMBRAL_MERMA = 3;

// Rebobinado de stock: jumbos de 1615mm x 8000m que se cortan en rollos angostos.
export const REBOB_CLIENTE = "Stock · Rebobinado";
export const REBOB_COLOR = "#3ecfc0";
export const REBOB_OPERADORES = ["José", "Alfredo"]; // usado en Fallas (quien reporta)
export const REBOB_OPERADOR_EQUIPO = "José y Alfredo"; // operan la rebobinadora juntos
export const REBOB_TIPOS = ["Hotmelt", "Acrílico"];
export const REBOB_MATERIALES = ["Transparente", "Canela"];
export const REBOB_LARGO_JUMBO_M = 8000;
export const REBOB_PIEZAS_POR_VUELTA = { '2"': 33, '3"': 22 };
export const REBOB_ANCHOS = Object.keys(REBOB_PIEZAS_POR_VUELTA);
export const REBOB_LARGOS_PIEZA = [96, 147];
export const REBOB_PIEZAS_POR_CAJA = { '2"': 36, '3"': 24 };

// Al apilar cajas del rebobinado se cuentan por "camas" (capas) en vez de
// caja por caja -- una cama completa siempre trae 12. Se usa en la
// calculadora de conteo dentro de Rebobinado.js.
export const REBOB_CAJAS_POR_CAMA = 12;
export const calcularPiezasTeoricas = (ancho, largoPieza) => {
  const piezasPorVuelta = REBOB_PIEZAS_POR_VUELTA[ancho] || 0;
  const largo = Number(largoPieza) || 0;
  if (!piezasPorVuelta || largo <= 0) return 0;
  const vueltas = Math.floor(REBOB_LARGO_JUMBO_M / largo);
  return vueltas * piezasPorVuelta;
};

// Engomado: rollo de materia prima fijo de 136mm x 685m ($900/rollo). El
// ancho comercial "3 pulgadas" en realidad se corta a 6.8cm reales -- por
// eso las pistas se calculan con el corte real, no con 3" tal cual.
export const ENGOMADO_JUMBO_ANCHO_MM = 136;
export const ENGOMADO_JUMBO_LARGO_M = 685;
export const ENGOMADO_CORTE_REAL_MM = 68;
export const ENGOMADO_MP_ROLLO_PRECIO = 900;
export const ENGOMADO_PISTAS = Math.floor(ENGOMADO_JUMBO_ANCHO_MM / ENGOMADO_CORTE_REAL_MM);
