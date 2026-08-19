import { createClient } from '@supabase/supabase-js';
import { requiereAlgunModo } from './_lib/auth.js';
import { uid, today } from '../src/lib/utils.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Inventario es su propio modulo (modo "inventario", ver App.js) -- pero
// supervisor siempre pasa tambien (requiereAlgunModo ya lo deja entrar a
// cualquier modo, ver api/_lib/auth.js), asi que no hace falta listarlo aqui.
const MODOS_INVENTARIO = ['inventario'];

export default async function handler(req, res) {
  if (req.query.accion === 'movimientos') {
    const usuario = await requiereAlgunModo(req, MODOS_INVENTARIO);
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });
    return listarMovimientos(req, res);
  }

  // El consumo automatico lo dispara Modo Operador (o Modo Emilio) al
  // finalizar un pedido -- no es pantalla de Inventario, asi que se autoriza
  // igual que el resto de llamadas de ese flujo (ver api/cliches.js).
  if (req.query.accion === 'consumo-automatico' && req.method === 'POST') {
    const usuario = await requiereAlgunModo(req, ['operador', 'emilio']);
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });
    return consumoAutomatico(req, res, usuario);
  }

  if (req.query.accion === 'movimiento' && req.method === 'POST') {
    const usuario = await requiereAlgunModo(req, MODOS_INVENTARIO);
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });
    return registrarEntradaHandler(req, res, usuario);
  }

  if (req.query.accion === 'salida-tarima' && req.method === 'POST') {
    const usuario = await requiereAlgunModo(req, MODOS_INVENTARIO);
    if (!usuario) return res.status(401).json({ error: 'No autorizado' });
    return registrarSalidaTarima(req, res, usuario);
  }

  const usuario = await requiereAlgunModo(req, MODOS_INVENTARIO);
  if (!usuario) return res.status(401).json({ error: 'No autorizado' });
  if (req.method === 'POST') return crearMaterial(req, res);
  if (req.method === 'PUT') return editarMaterial(req, res);
  if (req.method === 'DELETE') return eliminarMaterial(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

const CATEGORIAS = ['rollo_mp', 'tinta', 'solvente', 'centro', 'otro'];

async function crearMaterial(req, res) {
  const { nombre, unidad, stock, stock_min, costo_unitario, notas, categoria, match_valor } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const stockInicial = stock !== '' && stock != null ? Number(stock) : 0;
  const nuevo = {
    id: uid(), created: today(),
    nombre, unidad: unidad || 'Pieza',
    stock: 0, // se corrige abajo si hay stock inicial (via su propia tarima)
    stock_min: stock_min !== '' && stock_min != null ? Number(stock_min) : 0,
    costo_unitario: costo_unitario !== '' && costo_unitario != null ? Number(costo_unitario) : null,
    notas: notas || '',
    categoria: CATEGORIAS.includes(categoria) ? categoria : 'otro',
    match_valor: match_valor ? String(match_valor).trim() : null,
  };
  const { error } = await supabase.from('materiales').insert([nuevo]);
  if (error) return res.status(500).json({ error: error.message });

  // El stock inicial tambien necesita su propia tarima -- si no, "stock"
  // quedaria desincronizado de la suma real de tarimas.cantidad_actual en
  // cuanto se registre cualquier entrada/salida despues.
  if (stockInicial > 0) {
    try {
      const { stock } = await registrarEntrada({ material_id: nuevo.id, cantidad: stockInicial, lote: null, proveedor: null, motivo: 'Stock inicial', usuario_email: '' });
      nuevo.stock = stock;
    } catch (_) { /* el material ya quedo creado; el stock inicial se puede cargar despues como entrada normal */ }
  }
  return res.status(200).json(nuevo);
}

// Deja corregir despues el costo unitario y el stock minimo de un material
// ya creado -- antes solo se podian capturar al momento de darlo de alta.
async function editarMaterial(req, res) {
  const { id, costo_unitario, stock_min } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id es requerido' });
  const update = {};
  if (costo_unitario !== undefined) update.costo_unitario = (costo_unitario === '' || costo_unitario == null) ? null : Number(costo_unitario);
  if (stock_min !== undefined) update.stock_min = (stock_min === '' || stock_min == null) ? 0 : Number(stock_min);
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
  const { data, error } = await supabase.from('materiales').update(update).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}

async function eliminarMaterial(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id es requerido' });
  const { error } = await supabase.from('materiales').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// Crea una tarima nueva (un pallet fisico recibido) y suma su cantidad al
// stock cacheado en materiales -- toda entrada, sin excepcion, nace como su
// propia tarima para poder rastrearla despues (QR, lote, FIFO).
async function registrarEntrada({ material_id, cantidad, lote, proveedor, motivo, usuario_email }) {
  const { data: material, error: errMat } = await supabase.from('materiales').select('*').eq('id', material_id).single();
  if (errMat || !material) throw Object.assign(new Error('Material no encontrado'), { status: 404 });

  // Numero secuencial POR MATERIAL (la primera tarima de Blanca es #1, la
  // primera de Canela tambien es #1) -- para poder identificar un pallet a
  // simple vista ("Tarima #4") ademas del QR.
  const { data: ultima } = await supabase.from('tarimas').select('numero').eq('material_id', material_id).order('numero', { ascending: false }).limit(1);
  const numero = (ultima?.[0]?.numero || 0) + 1;

  const tarima = {
    id: uid(), material_id, lote: lote || null, proveedor: proveedor || null,
    cantidad_inicial: cantidad, cantidad_actual: cantidad,
    fecha_recepcion: today(), activa: true, numero,
  };
  const { error: errTar } = await supabase.from('tarimas').insert([tarima]);
  if (errTar) throw Object.assign(new Error(errTar.message), { status: 500 });

  const nuevoStock = Number(material.stock) + cantidad;
  const { error: errUpd } = await supabase.from('materiales').update({ stock: nuevoStock }).eq('id', material_id);
  if (errUpd) throw Object.assign(new Error(errUpd.message), { status: 500 });

  const { error: errMov } = await supabase.from('movimientos_inventario_mp').insert([{
    material_id, material_nombre: material.nombre, tipo: 'entrada', cantidad,
    motivo: motivo || '', origen: 'manual', tarima_id: tarima.id, usuario_email: usuario_email || '',
  }]);
  if (errMov) throw Object.assign(new Error(errMov.message), { status: 500 });

  return { tarima, stock: nuevoStock, material };
}

async function registrarEntradaHandler(req, res, usuario) {
  const { material_id, cantidad, lote, proveedor, motivo } = req.body || {};
  const cant = Number(cantidad);
  if (!material_id || !(cant > 0)) return res.status(400).json({ error: 'material_id y cantidad (> 0) son requeridos' });
  try {
    const { tarima, stock } = await registrarEntrada({ material_id, cantidad: cant, lote, proveedor, motivo, usuario_email: usuario.email });
    return res.status(200).json({ ok: true, stock, tarima });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}

// Descuenta una salida especifica de UNA tarima ya identificada (se llega
// aqui escaneando el QR de un pallet fisico y capturando cuanto se le sacó)
// -- a diferencia del consumo automatico, aqui no aplica FIFO: el operador
// ya eligio la tarima al escanearla.
async function registrarSalidaTarima(req, res, usuario) {
  const { tarima_id, cantidad, motivo } = req.body || {};
  const cant = Number(cantidad);
  if (!tarima_id || !(cant > 0)) return res.status(400).json({ error: 'tarima_id y cantidad (> 0) son requeridos' });

  const { data: tarima, error: errTar } = await supabase.from('tarimas').select('*').eq('id', tarima_id).single();
  if (errTar || !tarima) return res.status(404).json({ error: 'Tarima no encontrada' });
  if (cant > Number(tarima.cantidad_actual)) return res.status(400).json({ error: `Esta tarima solo tiene ${tarima.cantidad_actual} disponibles` });

  const { data: material, error: errMat } = await supabase.from('materiales').select('*').eq('id', tarima.material_id).single();
  if (errMat || !material) return res.status(404).json({ error: 'Material no encontrado' });

  const nuevaCantidadTarima = Number(tarima.cantidad_actual) - cant;
  const { error: errUpdTar } = await supabase.from('tarimas').update({ cantidad_actual: nuevaCantidadTarima, activa: nuevaCantidadTarima > 0 }).eq('id', tarima_id);
  if (errUpdTar) return res.status(500).json({ error: errUpdTar.message });

  const stockAntes = Number(material.stock);
  const nuevoStock = stockAntes - cant;
  const { error: errUpdMat } = await supabase.from('materiales').update({ stock: nuevoStock }).eq('id', material.id);
  if (errUpdMat) return res.status(500).json({ error: errUpdMat.message });

  const { error: errMov } = await supabase.from('movimientos_inventario_mp').insert([{
    material_id: material.id, material_nombre: material.nombre, tipo: 'salida', cantidad: cant,
    motivo: motivo || '', origen: 'manual', tarima_id, usuario_email: usuario.email || '',
  }]);
  if (errMov) return res.status(500).json({ error: errMov.message });

  const min = Number(material.stock_min || 0);
  const cruzoMinimo = min > 0 && stockAntes > min && nuevoStock <= min;
  return res.status(200).json({ ok: true, stock: nuevoStock, stock_min: min, cruzoMinimo, tarima_agotada: nuevaCantidadTarima <= 0 });
}

// Descuenta `cantidadTotal` de un material tomando primero de la tarima
// activa mas vieja (FIFO), y de ahi a la siguiente si no alcanza -- puede
// dejar varios renglones en el historial (uno por tarima tocada) para que
// quede claro de cual pallet salio cada parte. Si ninguna tarima alcanza y
// permitirNegativo=true, el faltante se registra sin tarima_id (deficit no
// atribuible a un pallet especifico -- avisa que el catalogo esta
// desactualizado) en vez de bloquear el consumo.
async function descontarFIFO(material_id, cantidadTotal, { motivo, origen, pedido_num, usuario_email, permitirNegativo }) {
  const { data: material, error: errMat } = await supabase.from('materiales').select('*').eq('id', material_id).single();
  if (errMat || !material) throw Object.assign(new Error('Material no encontrado'), { status: 404 });

  const { data: tarimas, error: errTar } = await supabase.from('tarimas')
    .select('*').eq('material_id', material_id).eq('activa', true).gt('cantidad_actual', 0)
    .order('fecha_recepcion', { ascending: true }).order('created', { ascending: true });
  if (errTar) throw Object.assign(new Error(errTar.message), { status: 500 });

  let restante = cantidadTotal;
  const splits = [];
  for (const t of (tarimas || [])) {
    if (restante <= 0) break;
    const tomar = Math.min(restante, Number(t.cantidad_actual));
    const nuevaCant = Number(t.cantidad_actual) - tomar;
    const { error: errUpdTar } = await supabase.from('tarimas').update({ cantidad_actual: nuevaCant, activa: nuevaCant > 0 }).eq('id', t.id);
    if (errUpdTar) throw Object.assign(new Error(errUpdTar.message), { status: 500 });
    splits.push({ tarima_id: t.id, cantidad: tomar });
    restante -= tomar;
  }

  if (restante > 0) {
    if (!permitirNegativo) throw Object.assign(new Error('Stock no puede quedar negativo'), { status: 400 });
    splits.push({ tarima_id: null, cantidad: restante });
  }

  const stockAntes = Number(material.stock);
  const nuevoStock = stockAntes - cantidadTotal;
  const { error: errUpdMat } = await supabase.from('materiales').update({ stock: nuevoStock }).eq('id', material_id);
  if (errUpdMat) throw Object.assign(new Error(errUpdMat.message), { status: 500 });

  const movimientos = splits.map(s => ({
    material_id, material_nombre: material.nombre, tipo: 'salida', cantidad: s.cantidad,
    motivo: s.tarima_id ? motivo : `${motivo} ⚠ excede lo registrado en tarimas`,
    origen: origen || 'manual', pedido_num: pedido_num || null, tarima_id: s.tarima_id, usuario_email: usuario_email || '',
  }));
  const { error: errMov } = await supabase.from('movimientos_inventario_mp').insert(movimientos);
  if (errMov) throw Object.assign(new Error(errMov.message), { status: 500 });

  const min = Number(material.stock_min || 0);
  const cruzoMinimo = min > 0 && stockAntes > min && nuevoStock <= min;
  return { material, stock: nuevoStock, stockAntes, cruzoMinimo, splits };
}

// Descuenta de UNA tarima especifica que el operador ya eligio a mano en
// Modo Operador (ver vista "tarima" en ModoOperador.js) -- no busca FIFO,
// asume que esa es la que de verdad se uso. Si la corrida gasto mas de lo
// que esa tarima tenia registrado, se deja en 0/agotada y el sobrante se
// resta igual del stock agregado del material (puede quedar negativo) en
// vez de bloquear el pedido -- avisa que el catalogo esta desactualizado.
async function descontarTarimaEspecifica(tarimaId, cantidad, { motivo, origen, pedido_num, usuario_email }) {
  const { data: tarima, error: errTar } = await supabase.from('tarimas').select('*').eq('id', tarimaId).single();
  if (errTar || !tarima) throw Object.assign(new Error('Tarima no encontrada'), { status: 404 });
  const { data: material, error: errMat } = await supabase.from('materiales').select('*').eq('id', tarima.material_id).single();
  if (errMat || !material) throw Object.assign(new Error('Material no encontrado'), { status: 404 });

  const cant = Number(cantidad);
  const nuevaCantidadTarima = Math.max(0, Number(tarima.cantidad_actual) - cant);
  const { error: errUpdTar } = await supabase.from('tarimas').update({ cantidad_actual: nuevaCantidadTarima, activa: nuevaCantidadTarima > 0 }).eq('id', tarimaId);
  if (errUpdTar) throw Object.assign(new Error(errUpdTar.message), { status: 500 });

  const stockAntes = Number(material.stock);
  const nuevoStock = stockAntes - cant;
  const { error: errUpdMat } = await supabase.from('materiales').update({ stock: nuevoStock }).eq('id', material.id);
  if (errUpdMat) throw Object.assign(new Error(errUpdMat.message), { status: 500 });

  const { error: errMov } = await supabase.from('movimientos_inventario_mp').insert([{
    material_id: material.id, material_nombre: material.nombre, tipo: 'salida', cantidad: cant,
    motivo, origen: origen || 'manual', pedido_num: pedido_num || null, tarima_id: tarimaId, usuario_email: usuario_email || '',
  }]);
  if (errMov) throw Object.assign(new Error(errMov.message), { status: 500 });

  const min = Number(material.stock_min || 0);
  const cruzoMinimo = min > 0 && stockAntes > min && nuevoStock <= min;
  return { material, stock: nuevoStock, stockAntes, cruzoMinimo };
}

// Busca el material que corresponde a una categoria+match_valor (case
// insensitive); si no existe todavia lo crea con stock 0 para no perder el
// movimiento -- compras lo ve aparecer en Inventario y le carga stock real
// y minimo. Devuelve null si no hay nada que matchear (valor vacio).
async function resolverOCrearMaterial(categoria, matchValor, nombreSugerido, unidadSugerida) {
  const valor = (matchValor || '').trim();
  if (!valor) return { material: null, creado: false };

  const { data: existentes, error } = await supabase.from('materiales').select('*').eq('categoria', categoria);
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  const encontrado = (existentes || []).find(m => (m.match_valor || '').trim().toLowerCase() === valor.toLowerCase());
  if (encontrado) return { material: encontrado, creado: false };

  const nuevo = {
    id: uid(), created: today(),
    nombre: nombreSugerido, unidad: unidadSugerida,
    stock: 0, stock_min: 0, costo_unitario: null,
    notas: 'Creado automáticamente desde consumo de producción — captura stock real y mínimo.',
    categoria, match_valor: valor,
  };
  const { error: errIns } = await supabase.from('materiales').insert([nuevo]);
  if (errIns) throw Object.assign(new Error(errIns.message), { status: 500 });
  return { material: nuevo, creado: true };
}

// Descuenta solo del inventario lo que la Calculadora de Produccion ya
// calculo para esa corrida (rollos MP por tipo de cinta, tinta por color,
// solvente) -- se llama desde ModoOperador.finalizarPedido justo despues de
// guardar el pedido, sin bloquear ese flujo si algo aqui falla. El descuento
// real de cada material sale de sus tarimas por FIFO (ver descontarFIFO).
async function consumoAutomatico(req, res, usuario) {
  const { pedido_num, cliente, tipo_cinta, color, color2, rollos, tinta_kg, tinta_kg2, solvente_kg, ancho, piezas, tarima_mp_id } = req.body || {};
  const motivo = `Pedido #${pedido_num || '?'}${cliente ? ` — ${cliente}` : ''}`;
  const resultados = [];

  const consumir = async (categoria, matchValor, cantidad, nombreSugerido, unidadSugerida) => {
    const cant = Number(cantidad);
    if (!(cant > 0)) return;
    const { material, creado } = await resolverOCrearMaterial(categoria, matchValor, nombreSugerido, unidadSugerida);
    if (!material) return;
    if (creado) {
      resultados.push({ id: material.id, nombre: material.nombre, unidad: material.unidad, stock: 0, stock_min: 0, creado: true, cruzoMinimo: false });
      return; // stock 0 recien creado: no hay nada que descontar todavia de forma util
    }
    const r = await descontarFIFO(material.id, cant, { motivo, origen: 'corrida_automatica', pedido_num, usuario_email: usuario.email, permitirNegativo: true });
    resultados.push({ id: r.material.id, nombre: r.material.nombre, unidad: r.material.unidad, stock: r.stock, stock_min: Number(r.material.stock_min || 0), creado: false, cruzoMinimo: r.cruzoMinimo });
  };

  try {
    // Rollo MP: si Modo Operador ya mando la tarima especifica elegida a
    // mano (obligatorio ahi, ver ModoOperador.js vista "tarima"), se
    // descuenta de esa; si no vino (no habia ninguna tarima activa de ese
    // tipo cuando el operador finalizo), cae al FIFO automatico de siempre.
    const rollosNum = Number(rollos);
    if (tarima_mp_id && rollosNum > 0) {
      const r = await descontarTarimaEspecifica(tarima_mp_id, rollosNum, { motivo, origen: 'corrida_automatica', pedido_num, usuario_email: usuario.email });
      resultados.push({ id: r.material.id, nombre: r.material.nombre, unidad: r.material.unidad, stock: r.stock, stock_min: Number(r.material.stock_min || 0), creado: false, cruzoMinimo: r.cruzoMinimo });
    } else if (tipo_cinta) {
      await consumir('rollo_mp', tipo_cinta, rollos, `Rollo MP ${tipo_cinta}`, 'Rollo');
    }
    if (color) await consumir('tinta', color, tinta_kg, `Tinta ${color}`, 'Kg');
    if (color2) await consumir('tinta', color2, tinta_kg2, `Tinta ${color2}`, 'Kg');
    // Centro (core de carton): 1 por pieza producida, se ubica por ancho del
    // pedido (2" o 3") -- no tiene tarima fisica pero si lote/FIFO en el
    // sistema (ver resolverOCrearMaterial + descontarFIFO).
    if (ancho) await consumir('centro', String(ancho), piezas, `Centros ${ancho}"`, 'Pieza');
    if (Number(solvente_kg) > 0) {
      // Un solo material de solvente para toda la planta -- se ubica por
      // categoria nada mas (no hay "color" que matchear), tomando el primero
      // que exista o creando "Solvente/Alcohol" la primera vez.
      const { data: existentes, error } = await supabase.from('materiales').select('*').eq('categoria', 'solvente').limit(1);
      if (error) throw Object.assign(new Error(error.message), { status: 500 });
      let material = existentes?.[0] || null;
      let creado = false;
      if (!material) {
        const nuevo = { id: uid(), created: today(), nombre: 'Solvente/Alcohol', unidad: 'Litro', stock: 0, stock_min: 0, costo_unitario: null, notas: 'Creado automáticamente desde consumo de producción — captura stock real y mínimo.', categoria: 'solvente', match_valor: 'solvente' };
        const { error: errIns } = await supabase.from('materiales').insert([nuevo]);
        if (errIns) throw Object.assign(new Error(errIns.message), { status: 500 });
        material = nuevo; creado = true;
      }
      if (creado) {
        resultados.push({ id: material.id, nombre: material.nombre, unidad: material.unidad, stock: 0, stock_min: 0, creado: true, cruzoMinimo: false });
      } else {
        const r = await descontarFIFO(material.id, Number(solvente_kg), { motivo, origen: 'corrida_automatica', pedido_num, usuario_email: usuario.email, permitirNegativo: true });
        resultados.push({ id: r.material.id, nombre: r.material.nombre, unidad: r.material.unidad, stock: r.stock, stock_min: Number(r.material.stock_min || 0), creado: false, cruzoMinimo: r.cruzoMinimo });
      }
    }
  } catch (e) {
    // No se bloquea el pedido por esto -- ya se guardo. Se avisa con lo que
    // se alcanzo a descontar antes del error.
    return res.status(200).json({ ok: false, error: e.message, materiales: resultados });
  }

  return res.status(200).json({ ok: true, materiales: resultados });
}

async function listarMovimientos(req, res) {
  const { material_id } = req.query;
  let q = supabase.from('movimientos_inventario_mp').select('*').order('created', { ascending: false }).limit(200);
  if (material_id) q = q.eq('material_id', material_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
