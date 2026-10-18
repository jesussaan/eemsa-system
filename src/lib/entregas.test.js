import { tasasProduccion, simularCola, fechaEntregaSugerida, compararPorEntrega, programarProduccion } from './entregas';
import { sumarHorasHabiles, sumarDiasHabiles, fechaLocalISO } from './horario';

// Lunes 19 oct 2026, 8:00 (hora local)
const LUNES_8AM = new Date(2026, 9, 19, 8, 0);
const TASA_FIJA = { porMedida: {}, general: 1.5 };

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

describe('tasasProduccion', () => {
  test('usa las cajas por hora reales por medida', () => {
    const hecho = (n) => ({ num: String(n), cliente: 'X', status: 'terminado', medida: '2"x100', cajas: 6, inicio_ts: new Date(2026, 9, 19, 8, 0).toISOString(), fin_ts: new Date(2026, 9, 19, 12, 0).toISOString() });
    const t = tasasProduccion([hecho(1), hecho(2), hecho(3)]);
    expect(t.porMedida['2"x100']).toBeCloseTo(1.5);
    expect(t.general).toBeCloseTo(1.5);
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
