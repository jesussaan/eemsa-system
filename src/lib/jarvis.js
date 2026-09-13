// Logica pura del resumen de solo lectura que expone la integracion Jarvis
// (ver api/registro.js?tabla=jarvis). Separada de Supabase y de Date.now()
// -- recibe los datos y la fecha "hoy" ya resueltos -- para poder probarla
// con datos fijos (ver jarvis.test.js) igual que produccion.js.

// "hoy" en hora de Mexico, no UTC -- el today() compartido de utils.js usa
// toISOString() (siempre UTC) y por eso corre un dia adelantado despues de
// las 6pm hora de CDMX. Esta integracion nueva no hereda ese bug; el resto
// de la app lo sigue teniendo hasta que se corrija aparte.
export const hoyMexico = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

// "Pedidos de hoy" = anotados hoy (columna created), no "que vencen hoy"
// (fecha_solicitud, que en este sistema es la fecha de entrega pedida, ver
// api/chat.js). Si el uso real es "que vencen hoy", cambiar el filtro aqui.
export const resumenPedidosHoy = (pedidos, hoy) => {
  const deHoy = (pedidos || []).filter(p => String(p.created || '').slice(0, 10) === hoy);
  const porStatus = {};
  for (const p of deHoy) {
    const key = p.status || 'sin_status';
    porStatus[key] = (porStatus[key] || 0) + 1;
  }
  return {
    total: deHoy.length,
    por_status: porStatus,
    pedidos: deHoy.map(p => ({
      num: p.num, cliente: p.cliente, tipo: p.tipo, medida: p.medida,
      cajas: p.cajas, status: p.status, maq: p.maq,
    })),
  };
};

// Pedido activo ("en proceso") de una maquina, cajas ya producidas hoy segun
// la bitacora prod_diaria, y el timestamp mas reciente relacionado a esa
// maquina hoy -- para que Jarvis pueda contestar "como va SIAT 1" sin tener
// que interpretar el estado crudo de pedidos.
export const resumenSiat1 = (pedidos, prodDiaria, hoy, metaCajas, maquina = 'SIAT L36 #1') => {
  const pedidosMaquina = (pedidos || []).filter(p => p.maq === maquina);
  const activo = pedidosMaquina.find(p => p.status === 'proceso') || null;
  const numsMaquina = new Set(pedidosMaquina.map(p => String(p.num)));
  const prodHoyMaquina = (prodDiaria || []).filter(r => r.fecha === hoy && numsMaquina.has(String(r.num_pedido)));
  const cajasHoy = prodHoyMaquina.reduce((s, r) => s + Number(r.cajas_dia || 0), 0);

  const timestamps = [
    ...pedidosMaquina.map(p => p.fin_ts || p.inicio_ts).filter(Boolean),
    ...prodHoyMaquina.map(r => r.created).filter(Boolean),
  ].sort();

  return {
    maquina,
    pedido_activo: activo ? {
      num: activo.num, cliente: activo.cliente, tipo: activo.tipo,
      medida: activo.medida, cajas: activo.cajas, fecha_inicio: activo.fecha_inicio || null,
    } : null,
    cajas_hoy: cajasHoy,
    meta_cajas: metaCajas ?? null,
    ultima_actualizacion: timestamps.length ? timestamps[timestamps.length - 1] : null,
  };
};

// Existencias de Rollo MP (tipos de cinta) agregadas por material -- sin
// costo_unitario ni notas, que no hacen falta para una consulta externa de
// solo lectura.
export const resumenInventarioCinta = (materiales) => ({
  materiales: (materiales || [])
    .filter(m => m.categoria === 'rollo_mp')
    .map(m => ({
      tipo: m.match_valor || null,
      nombre: m.nombre,
      stock: Number(m.stock || 0),
      unidad: m.unidad,
      bajo: Number(m.stock_min || 0) > 0 && Number(m.stock || 0) <= Number(m.stock_min),
    })),
});
