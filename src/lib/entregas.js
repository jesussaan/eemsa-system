// Programa de produccion y fecha de entrega automatica -- reglas fijas, no
// IA: se recalcula al instante en cada pantalla con los mismos datos, asi
// que Ventas, Agenda, Modo Operador y la pizarra ven siempre el mismo orden.
//   - Orden de la maquina: de tinta mas clara a mas intensa (menos limpieza),
//     pero sin dejar que un pedido llegue tarde a su fecha prometida.
//   - Tiempos: 1 h de arranque por pedido + 12 cajas/dia (1 tinta) o 10
//     (2 tintas), sobre el horario real de la planta (horario.js).
//   - Fecha de un pedido nuevo: donde le toca en ese programa + 1 dia de margen.
import { horasEfectivasPedido, sumarHorasHabiles, sumarDiasHabiles, fechaLocalISO, JORNADA_HORAS } from './horario';
import { REBOB_CLIENTE } from './constants';
import { claridadDeColor } from './colores';

// Ritmo de la SIAT L36, con los numeros de planta (oct 2026): cada pedido
// pierde ~1 hora en arrancar (montar cliche, tinta, ajustar) y en un dia
// completo de un solo pedido salen 12 cajas con una tinta o 10 con dos.
// Por eso un pedido chico rinde menos por hora que uno grande. Los tiempos
// registrados (inicio_ts/fin_ts) salian demasiado dispersos para usarlos.
export const RITMO_PLANTA = { arranqueHoras: 1, cajasDia1Tinta: 12, cajasDia2Tintas: 10 };
// Colchon entre que la maquina termina y lo que se le promete al cliente.
export const MARGEN_DIAS_HABILES = 1;
export const MAQUINA_DEFAULT = 'SIAT L36 #1';

export const ritmoProduccion = () => RITMO_PLANTA;

// Horas de maquina de un pedido: arranque + cajas x (lo que tarda cada caja
// con 1 o 2 tintas, descontando el arranque del dia completo).
export const horasEstimadas = (p, ritmo = RITMO_PLANTA) => {
  const cajasDia = p.color2 ? ritmo.cajasDia2Tintas : ritmo.cajasDia1Tinta;
  const horasPorCaja = (JORNADA_HORAS - ritmo.arranqueHoras) / cajasDia;
  return ritmo.arranqueHoras + (Number(p.cajas) || 0) * horasPorCaja;
};

// Orden de la cola: primero lo que se entrega antes; sin fecha al final;
// empates por fecha de solicitud y luego por numero de pedido.
export const compararPorEntrega = (a, b) => {
  const fa = a.fecha_estimada || '9999-99-99', fb = b.fecha_estimada || '9999-99-99';
  if (fa !== fb) return fa.localeCompare(fb);
  const sa = a.fecha_solicitud || '9999-99-99', sb = b.fecha_solicitud || '9999-99-99';
  if (sa !== sb) return sa.localeCompare(sb);
  return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0);
};

// Que tan clara es la tinta de un pedido (0 negro .. 255 blanco). Con 2
// tintas cuenta la mas intensa: es la que obliga a limpiar despues.
export const claridadPedido = (p) => Math.min(
  claridadDeColor(p.color || p.tinta_tipo),
  p.color2 ? claridadDeColor(p.color2) : 255,
);
// Orden ideal para la maquina: de tinta mas clara a mas intensa (se limpia
// menos entre pedidos); mismo color -> por fecha de entrega.
export const compararPorColor = (a, b) =>
  (claridadPedido(b) - claridadPedido(a)) || compararPorEntrega(a, b);

// Corre una lista en orden desde `cursor` y dice cuando termina cada uno.
const correrLista = (lista, ritmo, ahora, cursorInicial) => {
  let cursor = new Date(cursorInicial);
  const res = {};
  lista.forEach(p => {
    let horas = horasEstimadas(p, ritmo);
    if (p.status === 'proceso' && p.inicio_ts) {
      const hechas = horasEfectivasPedido(new Date(p.inicio_ts), ahora, p.pausas);
      horas = Math.max(horas - hechas, 0.25);
    }
    const fin = sumarHorasHabiles(cursor, horas);
    cursor = fin;
    const fechaFin = fechaLocalISO(fin);
    res[p.id] = {
      fin, fechaFin,
      fechaSugerida: sumarDiasHabiles(fechaFin, MARGEN_DIAS_HABILES),
      enRiesgo: !!p.fecha_estimada && fechaFin > p.fecha_estimada,
    };
  });
  return { res, cursor };
};

// Acomodo manual: un pedido con `orden` (numero) lo acomodo alguien a mano
// con las flechas de Modo Operador -- esos van primero, en ese orden, y el
// programa ya no los mueve. Sin `orden` (null) = lo acomoda el programa.
export const esManual = (p) => p.orden !== null && p.orden !== undefined && p.orden !== '';

// Programa de la maquina para lo anotado (lo que esta en proceso va antes):
//   0. Los acomodados a mano van primero, tal cual.
//   1. El resto se ordena de tinta clara a intensa.
//   2. Si asi algun pedido ya no alcanza su fecha prometida, se adelanta un
//      lugar a la vez -- solo por encima de pedidos que se entregan despues
//      que el -- hasta que alcance o ya no se pueda. Asi se respeta lo
//      prometido y, dentro de eso, se cuida el orden de color.
export const programarAnotados = (anotados, ritmo, ahora, cursor) => {
  const manuales = anotados.filter(esManual).sort((a, b) => Number(a.orden) - Number(b.orden) || compararPorEntrega(a, b));
  const trasManuales = correrLista(manuales, ritmo, ahora, cursor).cursor;
  const orden = anotados.filter(p => !esManual(p)).sort(compararPorColor);
  const atorados = new Set();
  for (let vuelta = 0; vuelta < orden.length * orden.length + 5; vuelta++) {
    const { res } = correrLista(orden, ritmo, ahora, trasManuales);
    const i = orden.findIndex(p => res[p.id].enRiesgo && !atorados.has(p.id));
    if (i < 0) break;
    const fechaI = orden[i].fecha_estimada || '9999-99-99';
    const fechaAnterior = i > 0 ? (orden[i - 1].fecha_estimada || '9999-99-99') : null;
    if (i === 0 || fechaAnterior <= fechaI) { atorados.add(orden[i].id); continue; }
    [orden[i - 1], orden[i]] = [orden[i], orden[i - 1]];
  }
  return [...manuales, ...orden];
};

// Programa completo por maquina. Devuelve:
//   porId[id] = { fin, fechaFin, fechaSugerida, enRiesgo, posicion }
//     fechaFin      = dia en que la maquina terminaria ese pedido
//     fechaSugerida = fechaFin + margen, lo que se le promete al cliente
//     enRiesgo      = tiene fecha prometida y aun asi la maquina termina despues
//     posicion      = lugar en la cola de su maquina (1 = el que sigue)
//   anotadosEnOrden = los anotados de todas las maquinas en el orden del programa
export const programarProduccion = (pedidos, ritmo, ahora = new Date()) => {
  const activos = pedidos.filter(p => (p.status === 'anotado' || p.status === 'proceso') && p.cliente !== REBOB_CLIENTE);
  const porMaquina = {};
  activos.forEach(p => { (porMaquina[p.maq || MAQUINA_DEFAULT] = porMaquina[p.maq || MAQUINA_DEFAULT] || []).push(p); });
  const porId = {};
  const anotadosEnOrden = [];
  Object.values(porMaquina).forEach(lista => {
    const enProceso = lista.filter(p => p.status === 'proceso').sort((a, b) => (a.inicio_ts || '').localeCompare(b.inicio_ts || ''));
    const tras = correrLista(enProceso, ritmo, ahora, ahora);
    Object.assign(porId, tras.res);
    const orden = programarAnotados(lista.filter(p => p.status === 'anotado'), ritmo, ahora, tras.cursor);
    const { res } = correrLista(orden, ritmo, ahora, tras.cursor);
    orden.forEach((p, i) => { porId[p.id] = { ...res[p.id], posicion: i + 1 }; });
    anotadosEnOrden.push(...orden);
  });
  return { porId, anotadosEnOrden };
};

// Atajo: solo el mapa por id (lo que usan agenda y tarjetas).
export const simularCola = (pedidos, ritmo, ahora = new Date()) => programarProduccion(pedidos, ritmo, ahora).porId;

// Fecha que se le puede prometer a un pedido NUEVO: se mete al programa en
// el lugar que le toca por color (y sin mover a nadie de su fecha), y se
// toma cuando terminaria + margen. null si falta medida o cajas.
export const fechaEntregaSugerida = (pedidos, nuevo, ritmo, ahora = new Date()) => {
  if (!(Number(nuevo.cajas) > 0) || !nuevo.medida) return null;
  // Sin fecha propia; solicitud y numero "maximos" para que, entre los de su
  // mismo color, quede detras de los que ya estaban.
  const temporal = { ...nuevo, id: '__nuevo__', status: 'anotado', fecha_estimada: null, fecha_solicitud: '9999-12-31', num: '999999999', cliente: nuevo.cliente || '__nuevo__', maq: nuevo.maq || MAQUINA_DEFAULT };
  return simularCola([...pedidos, temporal], ritmo, ahora).__nuevo__?.fechaSugerida || null;
};

// "2026-10-23" -> "jue 23 oct" para mostrar.
export const fechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
};

// "¿Que pasa si meto este pedido?" -- simula el programa con y sin el pedido
// nuevo (con la fecha que pide el cliente) y dice:
//   nuevo      = como quedaria el nuevo { fechaFin, enRiesgo, posicion }
//   masPronto  = lo mas pronto que podria salir si se pone primero (fechaFin)
//   recorridos = pedidos que salen mas tarde que antes pero aun llegan a su fecha
//   atrasados  = pedidos que antes alcanzaban su fecha y ahora ya no
// Cada recorrido/atrasado: { pedido, antes, despues } (fechaFin de cada uno).
export const impactoPedidoNuevo = (pedidos, nuevo, ritmo, ahora = new Date()) => {
  if (!(Number(nuevo.cajas) > 0) || !nuevo.medida) return null;
  const temporal = { ...nuevo, id: '__nuevo__', status: 'anotado', fecha_solicitud: '9999-12-31', num: '999999999', cliente: nuevo.cliente || '__nuevo__', maq: nuevo.maq || MAQUINA_DEFAULT };
  const antes = simularCola(pedidos, ritmo, ahora);
  const despues = simularCola([...pedidos, temporal], ritmo, ahora);
  const primero = simularCola([...pedidos, { ...temporal, fecha_estimada: '0000-00-00' }], ritmo, ahora);
  const recorridos = [], atrasados = [];
  pedidos.forEach(p => {
    const a = antes[p.id], d = despues[p.id];
    if (!a || !d || d.fin <= a.fin) return;
    const fila = { pedido: p, antes: a.fechaFin, despues: d.fechaFin };
    if (d.enRiesgo && !a.enRiesgo) atrasados.push(fila); else recorridos.push(fila);
  });
  return { nuevo: despues.__nuevo__, masPronto: primero.__nuevo__?.fechaFin || null, recorridos, atrasados };
};
