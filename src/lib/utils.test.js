import { unificarPorTexto, normalizarMedida } from './utils';

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
