import { horasEstimadas, RITMO_PLANTA, simularCola, fechaEntregaSugerida, compararPorEntrega, programarProduccion, impactoPedidoNuevo } from './entregas';
import { sumarHorasHabiles, sumarDiasHabiles, fechaLocalISO } from './horario';

// Lunes 19 oct 2026, 8:00 (hora local)
const LUNES_8AM = new Date(2026, 9, 19, 8, 0);
// Ritmo de prueba: 1.5 cajas/hora parejo y sin arranque (14.625 cajas en la
// jornada de 9.75h), para que los casos se puedan sacar a mano.
const TASA_FIJA = { arranqueHoras: 0, cajasDia1Tinta: 14.625, cajasDia2Tintas: 14.625 };

describe('sumarHorasHabiles / sumarDiasHabiles', () => {
  test('lo que no cabe en el dia sigue al dia habil siguiente', () => {
    // 10h desde lunes 8:00: la jornada es de 9.75h -> martes 8:15
    const fin = sumarHorasHabiles(LUNES_8AM, 10);
    expect(fechaLocalISO(fin)).toBe('2026-10-20');
    expect(fin.getHours()).toBe(8);
    expect(fin.getMinutes()).toBe(15);
  });

  test('el sabado solo hay 4.25h y el domingo se salta', () => {
    const fin = sumarHorasHabiles(new Date(2026, 9, 24, 9, 0), 5);
    expect(fechaLocalISO(fin)).toBe('2026-10-26');
    expect(fin.getHours()).toBe(8);
    expect(fin.getMinutes()).toBe(45);
  });

  test('un dia habil despues del sabado es el lunes', () => {
    expect(sumarDiasHabiles('2026-10-24', 1)).toBe('2026-10-26');
  });
});

describe('simularCola / fechaEntregaSugerida', () => {
  const grande = { id: 'a', num: '160', cliente: 'ARIAT', status: 'anotado', medida: '3"x100', cajas: 15, fecha_solicitud: '2026-10-18' };

  test('un pedido nuevo entra al final de la cola + 1 dia habil de margen', () => {
    // grande: 15 cajas / 1.5 = 10h -> termina martes; el nuevo (2h) tambien
    // martes -> se promete el miercoles
    expect(fechaEntregaSugerida([grande], { medida: '2"x100', cajas: 3 }, TASA_FIJA, LUNES_8AM)).toBe('2026-10-21');
  });

  test('sin cajas o sin medida no sugiere fecha', () => {
    expect(fechaEntregaSugerida([grande], { medida: '2"x100', cajas: '' }, TASA_FIJA, LUNES_8AM)).toBeNull();
  });

  test('avisa en riesgo si la maquina terminaria despues de lo prometido', () => {
    const prometidoHoy = { ...grande, fecha_estimada: '2026-10-19' };
    expect(simularCola([prometidoHoy], TASA_FIJA, LUNES_8AM).a.enRiesgo).toBe(true);
  });

  test('un pedido urgente (fecha mas cercana) se adelanta en la cola', () => {
    const conFecha = { ...grande, fecha_estimada: '2026-10-30' };
    const urgente = { id: 'u', num: '161', cliente: 'MAFENSA', status: 'anotado', medida: '2"x100', cajas: 3, fecha_estimada: '2026-10-20', fecha_solicitud: '2026-10-19' };
    expect([conFecha, urgente].sort(compararPorEntrega)[0].id).toBe('u');
    const r = simularCola([conFecha, urgente], TASA_FIJA, LUNES_8AM);
    expect(r.u.fechaFin).toBe('2026-10-19');
    expect(r.u.enRiesgo).toBe(false);
  });
});

describe('horasEstimadas (ritmo de planta)', () => {
  test('12 cajas de una tinta llenan un dia completo, con su hora de arranque', () => {
    expect(horasEstimadas({ cajas: 12 }, RITMO_PLANTA)).toBeCloseTo(9.75);
  });
  test('con 2 tintas un dia completo son 10 cajas', () => {
    expect(horasEstimadas({ cajas: 10, color2: 'Negro' }, RITMO_PLANTA)).toBeCloseTo(9.75);
  });
  test('un pedido chico pesa mas por el arranque (3 cajas ~3.2h)', () => {
    expect(horasEstimadas({ cajas: 3 }, RITMO_PLANTA)).toBeCloseTo(1 + 3 * 8.75 / 12);
  });
});

describe('programarProduccion (orden por color)', () => {
  const ped = (id, color, cajas, fecha_estimada) => ({ id, num: id, cliente: 'X', status: 'anotado', medida: '2"x100', cajas, color, fecha_estimada, fecha_solicitud: '2026-10-18' });
  const orden = (lista) => programarProduccion(lista, TASA_FIJA, LUNES_8AM).anotadosEnOrden.map(p => p.id);

  test('de tinta clara a intensa cuando todos alcanzan su fecha', () => {
    expect(orden([ped('negro', 'NEGRO', 2, '2026-10-30'), ped('amarillo', 'Amarillo', 2, '2026-10-30'), ped('blanco', 'Blanco', 2, '2026-10-30')]))
      .toEqual(['blanco', 'amarillo', 'negro']);
  });

  test('2 tintas cuenta la mas intensa', () => {
    const dos = { ...ped('dos', 'Amarillo', 2, '2026-10-30'), color2: 'Negro' };
    expect(orden([dos, ped('rojo', 'Rojo', 2, '2026-10-30')])).toEqual(['rojo', 'dos']);
  });

  test('un pedido oscuro que no alcanzaria su fecha se adelanta a los claros', () => {
    // amarillo: 15 cajas = 10h (termina martes); negro se prometio el lunes
    const r = programarProduccion([ped('amarillo', 'Amarillo', 15, '2026-10-30'), ped('negro', 'NEGRO', 3, '2026-10-19')], TASA_FIJA, LUNES_8AM);
    expect(r.anotadosEnOrden.map(p => p.id)).toEqual(['negro', 'amarillo']);
    expect(r.porId.negro.enRiesgo).toBe(false);
    expect(r.porId.negro.posicion).toBe(1);
  });

  test('un pedido nuevo claro entra antes que los oscuros que tienen holgura', () => {
    // negro (2h) con fecha lejana; el nuevo blanco entra primero -> termina lunes
    expect(fechaEntregaSugerida([ped('negro', 'NEGRO', 3, '2026-10-30')], { medida: '2"x100', cajas: 3, color: 'Blanco' }, TASA_FIJA, LUNES_8AM)).toBe('2026-10-20');
  });
});

describe('acomodo manual', () => {
  const ped = (id, color, orden) => ({ id, num: id, cliente: 'X', status: 'anotado', medida: '2"x100', cajas: 2, color, orden, fecha_solicitud: '2026-10-18' });

  test('lo acomodado a mano va primero y el resto sigue de claro a intenso', () => {
    const r = programarProduccion([ped('blanco', 'Blanco', null), ped('negro', 'Negro', 0), ped('amarillo', 'Amarillo', null)], TASA_FIJA, LUNES_8AM);
    expect(r.anotadosEnOrden.map(p => p.id)).toEqual(['negro', 'blanco', 'amarillo']);
  });
});

describe('impactoPedidoNuevo (pedido urgente)', () => {
  const ped = (id, color, cajas, fecha_estimada) => ({ id, num: id, cliente: id.toUpperCase(), status: 'anotado', medida: '2"x100', cajas, color, fecha_estimada, fecha_solicitud: '2026-10-18' });

  test('el urgente alcanza y los que se recorren siguen llegando', () => {
    // a: 15 cajas (10h, sale martes) con entrega lejana; urgente para el lunes
    const r = impactoPedidoNuevo([ped('a', 'Blanco', 15, '2026-10-30')], { medida: '2"x100', cajas: 3, color: 'Negro', fecha_estimada: '2026-10-19' }, TASA_FIJA, LUNES_8AM);
    expect(r.nuevo.enRiesgo).toBe(false);
    expect(r.nuevo.fechaFin).toBe('2026-10-19');
    expect(r.recorridos.map(x => x.pedido.id)).toEqual(['a']);
    expect(r.atrasados).toEqual([]);
  });

  test('avisa a quien se atrasa por el urgente', () => {
    // a: 28 cajas (~18.7h) sale el martes en la tarde, justo para su entrega del martes;
    // el urgente (3 cajas = 2h) lo empuja al miercoles
    const r = impactoPedidoNuevo([ped('a', 'Blanco', 28, '2026-10-20')], { medida: '2"x100', cajas: 3, color: 'Negro', fecha_estimada: '2026-10-19' }, TASA_FIJA, LUNES_8AM);
    expect(r.nuevo.enRiesgo).toBe(false);
    expect(r.atrasados.map(x => x.pedido.id)).toEqual(['a']);
  });

  test('si no alcanza ni siendo el primero, dice lo mas pronto posible', () => {
    // 30 cajas = 20h: lo mas pronto es el miercoles aunque se pida para el lunes
    const r = impactoPedidoNuevo([], { medida: '2"x100', cajas: 30, fecha_estimada: '2026-10-19' }, TASA_FIJA, LUNES_8AM);
    expect(r.nuevo.enRiesgo).toBe(true);
    expect(r.masPronto).toBe('2026-10-21');
  });
});
