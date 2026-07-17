import { rollosPorCaja, anchoDePedido } from './produccion';

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
