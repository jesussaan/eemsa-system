export const MAQUINAS = ["SIAT L36 #1", "SIAT L36 #2", "SIAT L36 #3", "Rebobinadora"];
export const TIPOS = ["Blanca", "Canela", "Transparente", "Engomado"];
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
export const REBOB_LARGO_JUMBO_M = 8000;
export const REBOB_PIEZAS_POR_VUELTA = { '2"': 33, '3"': 22 };
export const REBOB_ANCHOS = Object.keys(REBOB_PIEZAS_POR_VUELTA);
export const REBOB_LARGOS_PIEZA = [96, 147];
export const REBOB_PIEZAS_POR_CAJA = 36;
export const calcularPiezasTeoricas = (ancho, largoPieza) => {
  const piezasPorVuelta = REBOB_PIEZAS_POR_VUELTA[ancho] || 0;
  const largo = Number(largoPieza) || 0;
  if (!piezasPorVuelta || largo <= 0) return 0;
  const vueltas = Math.floor(REBOB_LARGO_JUMBO_M / largo);
  return vueltas * piezasPorVuelta;
};
