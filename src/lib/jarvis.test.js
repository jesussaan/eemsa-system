import { resumenPedidosHoy, resumenSiat1, resumenInventarioCinta } from './jarvis';

describe('resumenPedidosHoy', () => {
  const pedidos = [
    { num: '1', cliente: 'A', tipo: 'Blanca', medida: '2"x100', cajas: 5, status: 'proceso', maq: 'SIAT L36 #1', created: '2026-09-12' },
    { num: '2', cliente: 'B', tipo: 'Canela', medida: '3"x100', cajas: 8, status: 'anotado', maq: 'SIAT L36 #2', created: '2026-09-12' },
    { num: '3', cliente: 'C', tipo: 'Blanca', medida: '2"x100', cajas: 3, status: 'terminado', maq: 'SIAT L36 #1', created: '2026-09-11' },
  ];

  test('solo cuenta los creados el dia pedido', () => {
    const r = resumenPedidosHoy(pedidos, '2026-09-12');
    expect(r.total).toBe(2);
    expect(r.pedidos.map(p => p.num)).toEqual(['1', '2']);
  });

  test('agrupa por status', () => {
    const r = resumenPedidosHoy(pedidos, '2026-09-12');
    expect(r.por_status).toEqual({ proceso: 1, anotado: 1 });
  });

  test('sin pedidos ese dia da total 0', () => {
    const r = resumenPedidosHoy(pedidos, '2026-01-01');
    expect(r.total).toBe(0);
    expect(r.pedidos).toEqual([]);
  });
});

describe('resumenSiat1', () => {
  const pedidos = [
    { num: '10', cliente: 'Nartex', tipo: 'Transparente', medida: '2"x150', cajas: 7, status: 'proceso', maq: 'SIAT L36 #1', fecha_inicio: '2026-09-10', inicio_ts: '2026-09-10T14:00:00.000Z', fin_ts: null },
    { num: '11', cliente: 'Otro', tipo: 'Blanca', medida: '2"x100', cajas: 4, status: 'terminado', maq: 'SIAT L36 #1', fecha_inicio: '2026-09-09', inicio_ts: '2026-09-09T14:00:00.000Z', fin_ts: '2026-09-09T18:00:00.000Z' },
    { num: '12', cliente: 'Ajena', tipo: 'Canela', medida: '3"x100', cajas: 9, status: 'proceso', maq: 'SIAT L36 #2', fecha_inicio: '2026-09-10', inicio_ts: null, fin_ts: null },
  ];
  const prodDiaria = [
    { num_pedido: '10', cajas_dia: 5, fecha: '2026-09-12', created: '2026-09-12T16:00:00.000Z' },
    { num_pedido: '11', cajas_dia: 3, fecha: '2026-09-12', created: '2026-09-12T10:00:00.000Z' },
    { num_pedido: '12', cajas_dia: 9, fecha: '2026-09-12', created: '2026-09-12T12:00:00.000Z' },
  ];

  test('identifica el pedido en proceso de esa maquina', () => {
    const r = resumenSiat1(pedidos, prodDiaria, '2026-09-12', 12);
    expect(r.pedido_activo.num).toBe('10');
    expect(r.pedido_activo.cliente).toBe('Nartex');
  });

  test('suma cajas de hoy solo de pedidos de esa maquina', () => {
    const r = resumenSiat1(pedidos, prodDiaria, '2026-09-12', 12);
    expect(r.cajas_hoy).toBe(8); // 5 (#10) + 3 (#11), no los 9 de #12 (SIAT #2)
  });

  test('sin pedido en proceso en esa maquina da null', () => {
    const r = resumenSiat1(pedidos, prodDiaria, '2026-09-12', 12, 'SIAT L36 #3');
    expect(r.pedido_activo).toBeNull();
    expect(r.cajas_hoy).toBe(0);
  });

  test('trae la meta tal cual se le pasa', () => {
    const r = resumenSiat1(pedidos, prodDiaria, '2026-09-12', 12);
    expect(r.meta_cajas).toBe(12);
  });
});

describe('resumenInventarioCinta', () => {
  const materiales = [
    { categoria: 'rollo_mp', match_valor: 'Blanca', nombre: 'ROLLOS BLANCA JANEL', stock: 471.26, unidad: 'Rollo', stock_min: 200, costo_unitario: 472 },
    { categoria: 'rollo_mp', match_valor: 'Blanca Navitek', nombre: 'ROLLOS BLANCA NAVITEK', stock: 5, unidad: 'Rollo', stock_min: 30 },
    { categoria: 'tinta', match_valor: 'NEGRO', nombre: 'TINTA NEGRO-C', stock: 18.99, unidad: 'Kg', stock_min: 17 },
  ];

  test('solo incluye categoria rollo_mp', () => {
    const r = resumenInventarioCinta(materiales);
    expect(r.materiales).toHaveLength(2);
    expect(r.materiales.every(m => m.nombre.includes('BLANCA'))).toBe(true);
  });

  test('no expone costo_unitario ni notas', () => {
    const r = resumenInventarioCinta(materiales);
    expect(r.materiales[0]).not.toHaveProperty('costo_unitario');
    expect(r.materiales[0]).not.toHaveProperty('notas');
  });

  test('marca bajo cuando stock <= stock_min', () => {
    const r = resumenInventarioCinta(materiales);
    const navitek = r.materiales.find(m => m.tipo === 'Blanca Navitek');
    expect(navitek.bajo).toBe(true);
    const janel = r.materiales.find(m => m.tipo === 'Blanca');
    expect(janel.bajo).toBe(false);
  });
});
