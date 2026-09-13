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

// ---------------------------------------------------------------------------
// Ampliacion a los demas modulos operativos (ver api/chat.js, manejarJarvisIA)
// ---------------------------------------------------------------------------

// Redondea igual que fmtStock en Jarvis.js -- evita que un resto de punto
// flotante (48.069999999999999) le llegue a Claude tal cual en el JSON.
const redondear = (n) => Number(Number(n || 0).toFixed(2));

// Que modo (ademas de "jarvis", que ya es el gate de entrada a la pantalla)
// hace falta para cada modulo -- vacio significa que cualquiera con acceso a
// Jarvis puede preguntar, sin candado extra (asi ya funcionaban pedidos_hoy/
// siat_1 desde el principio). "supervisor" o esAdmin siempre pasan todo,
// igual que en el resto de la app (ver requiereAlgunModo en api/_lib/auth.js).
// "direccion" es un modo angosto a proposito -- ve el resumen ejecutivo
// (Costos, Reportes) pero NO el detalle operativo (Inventario, Agenda,
// Compras, Refacciones), a diferencia de "supervisor" que ve todo. Pensado
// para el dashboard por rol de Jarvis (ver Jarvis.js "Mi resumen"), no da
// acceso a ninguna pantalla nueva fuera de Jarvis.
export const MODULOS_JARVIS = {
  pedidos: [],
  produccion: [],
  agenda: ['supervisor'],
  inventario: ['inventario'],
  clientes: ['ventas'],
  compras: ['emilio'],
  refacciones: ['supervisor'],
  costos: ['supervisor', 'direccion'],
  reportes: ['supervisor', 'direccion'],
};

export const tieneAccesoModulo = (modulo, usuario) => {
  if (!usuario) return false;
  if (usuario.esAdmin || (usuario.modos || []).includes('supervisor')) return true;
  const requeridos = MODULOS_JARVIS[modulo];
  if (!requeridos || requeridos.length === 0) return true;
  return requeridos.some(m => (usuario.modos || []).includes(m));
};

// Filtro por palabras clave (no un modelo de lenguaje, ver interpretarConsulta
// en Jarvis.js) que decide que modulo(s) tocan la pregunta -- asi no se le
// manda a Claude el negocio completo en cada mensaje, solo lo relevante. Sin
// coincidencias, cae a los 3 modulos originales (los mas baratos y comunes)
// en vez de mandar los 9 por default.
const TODOS_LOS_MODULOS = Object.keys(MODULOS_JARVIS);

export const detectarModulos = (texto) => {
  const t = (texto || '').toLowerCase();
  // Pregunta explicitamente por "todo" -- se manda cada modulo al que el
  // usuario tenga permiso (tieneAccesoModulo filtra esto despues, en
  // api/chat.js), no solo el default angosto de abajo.
  if (t.includes('todo') || t.includes('toda la informaci') || t.includes('todos los modulos') || t.includes('todos los módulos')) {
    return [...TODOS_LOS_MODULOS];
  }
  const modulos = new Set();
  if (t.includes('pedido')) modulos.add('pedidos');
  if (t.includes('siat') || t.includes('producci') || t.includes('maquina') || t.includes('máquina')) modulos.add('produccion');
  if (t.includes('inventario') || t.includes('cinta') || t.includes('rollo') || t.includes('tinta') || t.includes('stock') || t.includes('material')) modulos.add('inventario');
  if (t.includes('cliente')) modulos.add('clientes');
  if (t.includes('agenda') || t.includes('entrega') || t.includes('atrasad') || t.includes('vence')) modulos.add('agenda');
  if (t.includes('compra') || t.includes('proveedor')) modulos.add('compras');
  if (t.includes('refaccion') || t.includes('refacción') || t.includes('pieza') || t.includes('queja')) modulos.add('refacciones');
  if (t.includes('costo') || t.includes('cuesta') || t.includes('cuánto sale') || t.includes('cuanto sale')) modulos.add('costos');
  if (t.includes('reporte') || t.includes('resumen') || t.includes('merma')) modulos.add('reportes');
  // Sin ninguna palabra clave reconocida: en vez de un default angosto fijo,
  // se manda TODO lo que el usuario tenga permiso de ver (tieneAccesoModulo
  // filtra esto en api/chat.js) -- asi una pregunta que no se supo
  // clasificar no se queda corta de informacion para quien si tiene acceso
  // amplio (supervisor/direccion/admin), y para alguien con permiso angosto
  // (ej. solo jarvis+ventas) de todos modos no se le abre nada que no
  // tuviera ya. El costo extra solo aplica a estas preguntas ambiguas, no a
  // las que si matchean una palabra clave arriba.
  if (modulos.size === 0) return [...TODOS_LOS_MODULOS];
  return [...modulos];
};

// Todas las maquinas, no solo SIAT L36 #1 -- reutiliza resumenSiat1 tal cual
// (ya acepta "maquina" como parametro) para no duplicar la logica.
export const resumenProduccionTodas = (pedidos, prodDiaria, hoy, metaCajas) => ({
  maquinas: ['SIAT L36 #1', 'SIAT L36 #2', 'SIAT L36 #3']
    .map(maq => resumenSiat1(pedidos, prodDiaria, hoy, metaCajas, maq)),
});

// Igual que resumenInventarioCinta pero sin filtrar por categoria -- tinta,
// solvente, centros y jumbo de rebobinado incluidos. Sin costo_unitario.
export const resumenInventarioTodo = (materiales) => ({
  materiales: (materiales || []).map(m => ({
    categoria: m.categoria,
    tipo: m.match_valor || null,
    nombre: m.nombre,
    stock: redondear(m.stock),
    unidad: m.unidad,
    bajo: Number(m.stock_min || 0) > 0 && Number(m.stock || 0) <= Number(m.stock_min),
  })),
});

// Pedidos recientes con su cliente -- Claude filtra por el nombre que haya
// mencionado la pregunta en vez de que el servidor intente adivinar a que
// cliente se refiere el texto libre.
export const resumenClientes = (pedidos) => ({
  pedidos_recientes: (pedidos || []).slice(0, 80).map(p => ({
    cliente: p.cliente, num: p.num, tipo: p.tipo, medida: p.medida,
    cajas: p.cajas, status: p.status, fecha_estimada: p.fecha_estimada || null,
  })),
});

// Fechas de entrega de pedidos activos -- mismo criterio que
// CalendarioEntregas.js (solo pedidos no terminados, agrupados por si ya
// vencieron o no).
export const resumenAgenda = (pedidos, hoy) => {
  const activos = (pedidos || []).filter(p => p.status !== 'terminado' && p.fecha_estimada);
  return {
    atrasados: activos.filter(p => p.fecha_estimada < hoy)
      .map(p => ({ num: p.num, cliente: p.cliente, fecha_estimada: p.fecha_estimada })),
    proximos: activos.filter(p => p.fecha_estimada >= hoy)
      .sort((a, b) => a.fecha_estimada.localeCompare(b.fecha_estimada)).slice(0, 15)
      .map(p => ({ num: p.num, cliente: p.cliente, fecha_estimada: p.fecha_estimada })),
  };
};

// Lista de compras pendientes (Modo Emilio) + compras ya registradas
// recientes -- sin telefono/direccion del proveedor, no hace falta para
// contestar "que esta pendiente de comprar".
export const resumenCompras = (listaMateriales, proveedores) => ({
  pendientes: (listaMateriales || []).filter(m => m.status !== 'listo')
    .map(m => ({ material: m.material, tipo: m.tipo, cantidad: m.cantidad, unidad: m.unidad, urgente: !!m.urgente })),
  compras_recientes: (proveedores || []).slice(0, 20)
    .map(p => ({ proveedor: p.nombre, que_compro: p.que_compro, monto: p.monto, fecha: p.fecha })),
});

// Refacciones bajas de stock (no el catalogo completo) + quejas de materia
// prima abiertas -- sin costo de refaccion ni datos del proveedor de la
// queja mas alla de su nombre.
export const resumenRefacciones = (refacciones, quejasMp) => ({
  refacciones_bajas: (refacciones || [])
    .filter(r => Number(r.stock_min || 0) > 0 && Number(r.stock || 0) <= Number(r.stock_min))
    .map(r => ({ nombre: r.nombre, stock: r.stock, stock_min: r.stock_min, maq: r.maq })),
  quejas_abiertas: (quejasMp || []).filter(q => q.estatus !== 'Cerrada')
    .map(q => ({ folio: q.folio, proveedor: q.proveedor, material: q.material, fecha: q.fecha })),
});

// Solo el costo por pieza YA CALCULADO de pedidos terminados recientes --
// nunca los parametros de costeo (mano de obra/luz/mantenimiento/precio de
// insumos de EditorCostos), que son configuracion financiera interna, no
// datos operativos de una corrida.
export const resumenCostos = (pedidos, hoy) => {
  const mes = hoy.slice(0, 7);
  const delMes = (pedidos || []).filter(p => p.status === 'terminado' && p.costo_pieza != null && String(p.fecha_termino || '').startsWith(mes));
  const promedio = delMes.length ? redondear(delMes.reduce((s, p) => s + Number(p.costo_pieza), 0) / delMes.length) : null;
  return {
    mes,
    pedidos_con_costo: delMes.map(p => ({ num: p.num, cliente: p.cliente, costo_pieza: redondear(p.costo_pieza) })),
    costo_pieza_promedio_mes: promedio,
  };
};

// Digesto del mes -- agregados ya calculados, nunca filas crudas de mas de
// lo necesario.
export const resumenReportes = (pedidos, prodDiaria, hoy) => {
  const mes = hoy.slice(0, 7);
  const prodMes = (prodDiaria || []).filter(r => String(r.fecha || '').startsWith(mes));
  const cajasMes = prodMes.reduce((s, r) => s + Number(r.cajas_dia || 0), 0);
  const terminadosMes = (pedidos || []).filter(p => p.status === 'terminado' && String(p.fecha_termino || '').startsWith(mes));
  const conMerma = terminadosMes.filter(p => p.piezas_prod > 0 && p.merma != null);
  const mermaPct = conMerma.length
    ? redondear((conMerma.reduce((s, p) => s + Number(p.merma), 0) / conMerma.reduce((s, p) => s + Number(p.piezas_prod), 0)) * 100)
    : null;
  return { mes, cajas_producidas_mes: cajasMes, pedidos_terminados_mes: terminadosMes.length, merma_pct_mes: mermaPct };
};
