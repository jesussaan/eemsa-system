import { detectarPedidosUrgentes, detectarInventarioCritico, detectarProduccionSinRegistrar } from './alertas';

describe('detectarPedidosUrgentes', () => {
  const pedidos = [
    { num: '1', cliente: 'A', status: 'proceso', fecha_estimada: '2026-09-10' }, // vencido
    { num: '2', cliente: 'B', status: 'anotado', fecha_estimada: '2026-09-12' }, // vence hoy
    { num: '3', cliente: 'C', status: 'anotado', fecha_estimada: '2026-09-20' }, // futuro, no urgente
    { num: '4', cliente: 'D', status: 'terminado', fecha_estimada: '2026-09-01' }, // ya termino, no cuenta
    { num: '5', cliente: 'Stock · Rebobinado', status: 'proceso', fecha_estimada: '2026-09-01' }, // no es cliente real
  ];

  test('incluye vencidos y los que vencen hoy, excluye terminados y futuros', () => {
    const r = detectarPedidosUrgentes(pedidos, '2026-09-12');
    expect(r.map(p => p.num).sort()).toEqual(['1', '2']);
  });

  test('excluye el cliente interno de Rebobinado', () => {
    const r = detectarPedidosUrgentes(pedidos, '2026-09-12');
    expect(r.find(p => p.num === '5')).toBeUndefined();
  });

  test('el mas vencido queda primero', () => {
    const r = detectarPedidosUrgentes(pedidos, '2026-09-12');
    expect(r[0].num).toBe('1');
  });
});

describe('detectarInventarioCritico', () => {
  const materiales = [
    { nombre: 'Blanca Janel', categoria: 'rollo_mp', stock: 471, stock_min: 200 },
    { nombre: 'Engomado', categoria: 'rollo_mp', stock: 11.5, stock_min: 90 },
    { nombre: 'Tinta Verde', categoria: 'tinta', stock: 4.8, stock_min: 5 },
    { nombre: 'Sin minimo', categoria: 'tinta', stock: 0, stock_min: 0 },
  ];

  test('solo incluye materiales con stock_min configurado y por debajo', () => {
    const r = detectarInventarioCritico(materiales);
    expect(r.map(m => m.nombre).sort()).toEqual(['Engomado', 'Tinta Verde']);
  });

  test('un material sin stock_min (0) nunca sale como critico', () => {
    const r = detectarInventarioCritico(materiales);
    expect(r.find(m => m.nombre === 'Sin minimo')).toBeUndefined();
  });
});

describe('detectarProduccionSinRegistrar', () => {
  const pedidos = [
    { num: '10', cliente: 'A', maq: 'SIAT L36 #1', status: 'proceso', fecha_inicio: '2026-09-10' },
    { num: '11', cliente: 'B', maq: 'SIAT L36 #2', status: 'proceso', fecha_inicio: '2026-09-11' },
    { num: '12', cliente: 'C', maq: 'SIAT L36 #3', status: 'proceso', fecha_inicio: '2026-09-12' }, // empezo HOY, no ayer -- no cuenta todavia
    { num: '13', cliente: 'D', maq: 'SIAT L36 #1', status: 'terminado', fecha_inicio: '2026-09-01' },
  ];
  const prodDiaria = [
    { num_pedido: '10', fecha: '2026-09-11', cajas_dia: 5 }, // #10 SI registro ayer
  ];

  test('detecta pedidos en proceso desde ayer o antes sin registro de ayer', () => {
    const r = detectarProduccionSinRegistrar(pedidos, prodDiaria, '2026-09-11');
    expect(r.map(p => p.num)).toEqual(['11']);
  });

  test('un pedido que empezo hoy mismo no cuenta como "sin registrar de ayer"', () => {
    const r = detectarProduccionSinRegistrar(pedidos, prodDiaria, '2026-09-11');
    expect(r.find(p => p.num === '12')).toBeUndefined();
  });

  test('pedidos terminados no generan alerta', () => {
    const r = detectarProduccionSinRegistrar(pedidos, prodDiaria, '2026-09-11');
    expect(r.find(p => p.num === '13')).toBeUndefined();
  });
});
