import { rollosPorCaja, anchoDePedido, largoDePedido, calcularProduccion } from './produccion';

describe('rollosPorCaja', () => {
  test('2 pulgadas caben 36 rollos por caja', () => {
    expect(rollosPorCaja('2', false)).toBe(36);
    expect(rollosPorCaja('2"', false)).toBe(36);
    expect(rollosPorCaja(2, false)).toBe(36);
  });

  test('3 pulgadas caben 24 rollos por caja', () => {
    expect(rollosPorCaja('3', false)).toBe(24);
    expect(rollosPorCaja('3"', false)).toBe(24);
    expect(rollosPorCaja(3, false)).toBe(24);
  });

  test('Engomado siempre caben 10, sin importar el ancho', () => {
    expect(rollosPorCaja('3', true)).toBe(10);
    expect(rollosPorCaja('2', true)).toBe(10);
    expect(rollosPorCaja('', true)).toBe(10);
  });

  test('ancho vacio o invalido no es Engomado -> cae en 36 por default', () => {
    expect(rollosPorCaja('', false)).toBe(36);
    expect(rollosPorCaja(undefined, false)).toBe(36);
  });
});

describe('anchoDePedido', () => {
  test('pedidos de Pedidos.js traen "ancho" directo', () => {
    expect(anchoDePedido({ ancho: '2', tipo: 'Blanca' })).toBe(2);
    expect(anchoDePedido({ ancho: '3', tipo: 'Canela' })).toBe(3);
  });

  test('pedidos de ModoVentas.js solo traen "medida" (ej. "3x100")', () => {
    expect(anchoDePedido({ medida: '3x100', tipo: 'Blanca' })).toBe(3);
    expect(anchoDePedido({ medida: '2x50', tipo: 'Transparente' })).toBe(2);
  });

  test('Engomado siempre es 3", tenga o no el campo lleno', () => {
    expect(anchoDePedido({ tipo: 'Engomado' })).toBe(3);
    expect(anchoDePedido({ tipo: 'Engomado', ancho: '2' })).toBe(3);
    expect(anchoDePedido({ tipo: 'Engomado', medida: '' })).toBe(3);
  });

  test('sin ancho ni medida -> 0', () => {
    expect(anchoDePedido({ tipo: 'Blanca' })).toBe(0);
    expect(anchoDePedido({})).toBe(0);
  });
});

describe('largoDePedido', () => {
  test('pedidos de Pedidos.js traen "largo" directo', () => {
    expect(largoDePedido({ largo: '100' })).toBe(100);
    expect(largoDePedido({ largo: '150' })).toBe(150);
  });

  test('pedidos de ModoVentas.js solo traen "medida" (ej. "3x100") -- este era el bug: no se guardaba largo aparte', () => {
    expect(largoDePedido({ medida: '3x100' })).toBe(100);
    expect(largoDePedido({ medida: '2x50' })).toBe(50);
  });

  test('medida ya normalizada (2"x100) tambien funciona', () => {
    expect(largoDePedido({ medida: '2"x100' })).toBe(100);
  });

  test('admite decimales', () => {
    expect(largoDePedido({ medida: '2x100.5' })).toBe(100.5);
  });

  test('sin largo ni medida -> 0', () => {
    expect(largoDePedido({})).toBe(0);
    expect(largoDePedido({ tipo: 'Blanca' })).toBe(0);
  });
});

describe('calcularProduccion', () => {
  // 2", 100m, 10 cajas de 36 piezas, portacliche 30.9cm, diseno normal (27.5% cobertura)
  const base = { ancho: 2, largo: 100, cajas: 10, rollosCaja: 36, portaliche: '30.9', diseno: 'normal' };

  test('rendimiento, piezas y rollos MP para un caso normal', () => {
    const r = calcularProduccion(base);
    expect(r.largoReal).toBe(96); // -4m de merma de corte por rollo
    expect(r.pistas).toBe(3); // 6" de MP / 2" de ancho
    expect(r.rollosPista).toBe(9); // 914m / 96m
    expect(r.rendimiento).toBe(27); // 3 pistas x 9 rollos/pista
    expect(r.piezasBuenas).toBe(360); // 10 cajas x 36
    expect(r.piezasTotal).toBe(360);
    expect(r.rollosExacto).toBeCloseTo(13.3333, 3);
    expect(r.rollosMP).toBe(14); // siempre redondeado hacia arriba
    expect(r.listo).toBe(true);
  });

  test('la merma esperada se suma a piezas totales pero no a piezas buenas', () => {
    const r = calcularProduccion({ ...base, merma: 18 });
    expect(r.piezasBuenas).toBe(360);
    expect(r.piezasTotal).toBe(378);
    expect(r.rollosExacto).toBe(14);
  });

  test('Engomado usa las pistas fijas del corte real (136mm/68mm=2), no el ancho -- ya se rompio dos veces por esto', () => {
    const conAncho3 = calcularProduccion({ ancho: 3, largo: 100, cajas: 5, rollosCaja: 10, portaliche: '30.9', diseno: 'normal', esEngomado: true });
    const conAncho2 = calcularProduccion({ ancho: 2, largo: 100, cajas: 5, rollosCaja: 10, portaliche: '30.9', diseno: 'normal', esEngomado: true });
    expect(conAncho3.pistas).toBe(2);
    expect(conAncho2.pistas).toBe(2);
    expect(conAncho3.tintaKg).toBeCloseTo(conAncho2.tintaKg, 10);
  });

  test('Engomado no resta los 4m de merma de corte (largoReal = largo tal cual) y nunca gasta solvente', () => {
    const r = calcularProduccion({ ancho: 3, largo: 100, cajas: 5, rollosCaja: 10, portaliche: '30.9', diseno: 'normal', esEngomado: true });
    expect(r.largoReal).toBe(100);
    expect(r.solventeKg).toBe(0);
  });

  test('sinTinta (portacliche N/A) deja tinta en 0', () => {
    const r = calcularProduccion({ ...base, sinTinta: true });
    expect(r.tintaKg).toBe(0);
    expect(r.tintaKgTotal).toBe(0);
  });

  test('sin cajas no hay consumo de solvente ni tinta', () => {
    const r = calcularProduccion({ ...base, cajas: 0 });
    expect(r.solventeKg).toBe(0);
    expect(r.tintaKg).toBe(0);
    expect(r.listo).toBe(false);
  });

  test('2do color usa su propio portacliche/diseno de forma independiente del primero', () => {
    const r = calcularProduccion({ ...base, portaliche2: '25.4', diseno2: 'relleno', tieneColor2: true });
    expect(r.tintaKg2).toBeGreaterThan(0);
    expect(r.tintaKgTotal).toBeCloseTo(r.tintaKg + r.tintaKg2, 10);
    // "relleno" (82.5% cobertura) gasta mas tinta que "normal" (27.5%) aunque su portacliche sea mas chico
    expect(r.tintaKg2).toBeGreaterThan(r.tintaKg);
  });

  test('sin 2do color, tintaKg2 queda en 0 aunque vengan portaliche2/diseno2', () => {
    const r = calcularProduccion({ ...base, portaliche2: '25.4', diseno2: 'relleno', tieneColor2: false });
    expect(r.tintaKg2).toBe(0);
    expect(r.tintaKgTotal).toBe(r.tintaKg);
  });

  test('largo corto (<=4m) no se le resta merma de corte y no queda negativo', () => {
    const r = calcularProduccion({ ...base, largo: 3 });
    expect(r.largoReal).toBe(3);
  });

  test('listo es false si falta ancho, cajas o rollos/caja', () => {
    expect(calcularProduccion({ ...base, ancho: 0 }).listo).toBe(false);
    expect(calcularProduccion({ ...base, rollosCaja: 0 }).listo).toBe(false);
  });
});
