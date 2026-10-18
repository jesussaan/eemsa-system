import { unificarPorTexto, normalizarMedida, ultimoPedidoDeCliente, avisoMedidaCliente, avisoTintaCliente, avisoCajasCliente, avisoTipoCliente } from './utils';

describe('unificarPorTexto', () => {
  test('valor nuevo que no existe se guarda tal cual', () => {
    expect(unificarPorTexto('MAFENSA', [])).toBe('MAFENSA');
  });

  test('mismo valor con distintas mayus/minus usa la forma ya guardada', () => {
    expect(unificarPorTexto('mafensa', ['MAFENSA', 'ARIAT'])).toBe('MAFENSA');
    expect(unificarPorTexto('azul pms', ['Roja UV', 'Azul PMS'])).toBe('Azul PMS');
  });

  test('quita espacios sobrantes', () => {
    expect(unificarPorTexto('  Azul PMS   ', [])).toBe('Azul PMS');
  });

  test('vacio se queda vacio', () => {
    expect(unificarPorTexto('   ', ['algo'])).toBe('');
  });
});

describe('normalizarMedida', () => {
  test('formatos distintos de la misma medida quedan iguales', () => {
    expect(normalizarMedida('2x100')).toBe('2"x100');
    expect(normalizarMedida('2X100')).toBe('2"x100');
    expect(normalizarMedida('2"100')).toBe('2"x100');
    expect(normalizarMedida('2"x100')).toBe('2"x100');
    expect(normalizarMedida('2 x 100')).toBe('2"x100');
  });

  test('medidas distintas no se confunden', () => {
    expect(normalizarMedida('3x100')).toBe('3"x100');
    expect(normalizarMedida('2x50')).toBe('2"x50');
  });

  test('admite decimales', () => {
    expect(normalizarMedida('2.5x100')).toBe('2.5"x100');
  });

  test('si no se pueden sacar dos numeros, se deja tal cual', () => {
    expect(normalizarMedida('100')).toBe('100');
    expect(normalizarMedida('')).toBe('');
    expect(normalizarMedida('a granel')).toBe('a granel');
  });
});

describe('ultimoPedidoDeCliente', () => {
  const pedidos = [
    { num: '140', cliente: 'ARIAT', fecha_solicitud: '2026-08-25' },
    { num: '151', cliente: 'ARIAT', fecha_solicitud: '2026-09-25' },
    { num: '150', cliente: 'MAFENSA', fecha_solicitud: '2026-09-30' },
  ];

  test('regresa el mas reciente del cliente, sin importar may/min ni espacios', () => {
    expect(ultimoPedidoDeCliente(pedidos, ' ariat ').num).toBe('151');
  });

  test('cliente sin pedidos regresa null', () => {
    expect(ultimoPedidoDeCliente(pedidos, 'NUEVO')).toBeNull();
  });
});

describe('avisoMedidaCliente', () => {
  const ariat = [
    { num: '131', cliente: 'ARIAT', medida: '3"x100', fecha_solicitud: '2026-08-07' },
    { num: '140', cliente: 'ARIAT', medida: '3"x100', fecha_solicitud: '2026-08-25' },
    { num: '151', cliente: 'ARIAT', medida: '3"x100', fecha_solicitud: '2026-09-25' },
  ];

  test('avisa si la medida nunca aparece en sus ultimos pedidos', () => {
    expect(avisoMedidaCliente(ariat, 'ARIAT', '2x100')).toEqual({ habitual: '3"x100', veces: 3, total: 3 });
  });

  test('no avisa si ya la ha pedido, escrita de cualquier forma', () => {
    expect(avisoMedidaCliente(ariat, 'ARIAT', '3 X 100')).toBeNull();
  });

  test('no avisa a media escritura ni con clientes de menos de 2 pedidos', () => {
    expect(avisoMedidaCliente(ariat, 'ARIAT', '2')).toBeNull();
    expect(avisoMedidaCliente(ariat.slice(0, 1), 'ARIAT', '2x100')).toBeNull();
  });
});

describe('avisoTintaCliente', () => {
  const ariat = [
    { num: '140', cliente: 'ARIAT', tinta_tipo: 'NEGRO', fecha_solicitud: '2026-08-25' },
    { num: '151', cliente: 'ARIAT', color: 'NEGRO', fecha_solicitud: '2026-09-25' },
  ];

  test('avisa con una tinta que no ha usado, y dice cual usa (tal como se guardo)', () => {
    expect(avisoTintaCliente(ariat, 'ARIAT', 'Rojo')).toEqual({ habitual: 'NEGRO', veces: 2, total: 2 });
  });

  test('no avisa con la misma tinta en minusculas, ni con tinta vacia', () => {
    expect(avisoTintaCliente(ariat, 'ARIAT', ' negro ')).toBeNull();
    expect(avisoTintaCliente(ariat, 'ARIAT', '')).toBeNull();
  });
});

describe('avisoCajasCliente', () => {
  const ariat = [
    { num: '140', cliente: 'ARIAT', cajas: 8, fecha_solicitud: '2026-08-25' },
    { num: '151', cliente: 'ARIAT', cajas: 10, fecha_solicitud: '2026-09-25' },
  ];

  test('avisa si se pasa mucho o se queda muy corto de su rango', () => {
    expect(avisoCajasCliente(ariat, 'ARIAT', '100')).toEqual({ min: 8, max: 10, total: 2 });
    expect(avisoCajasCliente(ariat, 'ARIAT', '3')).toEqual({ min: 8, max: 10, total: 2 });
  });

  test('no avisa dentro de un margen razonable', () => {
    expect(avisoCajasCliente(ariat, 'ARIAT', '12')).toBeNull();
    expect(avisoCajasCliente(ariat, 'ARIAT', '6')).toBeNull();
  });
});

describe('avisoTipoCliente', () => {
  const ariat = [
    { num: '140', cliente: 'ARIAT', tipo: 'Canela', fecha_solicitud: '2026-08-25' },
    { num: '151', cliente: 'ARIAT', tipo: 'Canela', fecha_solicitud: '2026-09-25' },
  ];

  test('avisa si se queda en Blanca con un cliente que siempre pide Canela', () => {
    expect(avisoTipoCliente(ariat, 'ARIAT', 'Blanca')).toEqual({ habitual: 'Canela', veces: 2, total: 2 });
  });

  test('no avisa con el tipo de siempre', () => {
    expect(avisoTipoCliente(ariat, 'ARIAT', 'Canela')).toBeNull();
  });
});
