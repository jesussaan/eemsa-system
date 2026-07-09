// Analiza el historial de fallas por componente para detectar patrones de
// mantenimiento: cada cuánto falla en promedio, y si ya "toca" que vuelva
// a fallar según ese promedio. Necesita al menos 3 fallas con fecha del
// mismo componente para calcular un promedio con algo de sentido.
export const analizarComponentes = (fallas) => {
  const grupos = {};
  fallas.forEach(f => {
    const key = f.comp || 'Sin componente';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(f);
  });

  const hoy = Date.now();

  const resultado = Object.entries(grupos).map(([comp, items]) => {
    const totalFallas = items.length;
    const abiertas = items.filter(f => f.status === 'abierta').length;
    const minParoTotal = items.reduce((s, f) => s + Number(f.min_paro || 0), 0);
    const maquinas = [...new Set(items.map(f => f.maq).filter(Boolean))];

    const fechasOrdenadas = items.map(f => f.fecha).filter(Boolean).sort();
    const ultimaFecha = fechasOrdenadas[fechasOrdenadas.length - 1] || null;

    let promedioIntervalo = null, diasDesdeUltima = null, diasRestantes = null, vencido = false;
    const prediccionDisponible = fechasOrdenadas.length >= 3;

    if (prediccionDisponible) {
      const intervalos = [];
      for (let i = 1; i < fechasOrdenadas.length; i++) {
        const dias = (new Date(fechasOrdenadas[i]) - new Date(fechasOrdenadas[i - 1])) / 86400000;
        if (dias > 0) intervalos.push(dias);
      }
      if (intervalos.length > 0) {
        promedioIntervalo = Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length);
        diasDesdeUltima = Math.round((hoy - new Date(ultimaFecha + 'T12:00:00').getTime()) / 86400000);
        diasRestantes = promedioIntervalo - diasDesdeUltima;
        vencido = diasRestantes <= 0;
      }
    }

    return { comp, totalFallas, abiertas, minParoTotal, maquinas, ultimaFecha, promedioIntervalo, diasDesdeUltima, diasRestantes, vencido, prediccionDisponible: promedioIntervalo != null };
  });

  return resultado.sort((a, b) => {
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
    if (a.diasRestantes != null && b.diasRestantes != null) return a.diasRestantes - b.diasRestantes;
    return b.totalFallas - a.totalFallas;
  });
};
