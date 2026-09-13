import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requiereModo, requiereAlgunModo } from './_lib/auth.js';
import {
  hoyMexico, resumenPedidosHoy, resumenSiat1, resumenInventarioCinta,
  MODULOS_JARVIS, tieneAccesoModulo, detectarModulos,
  resumenProduccionTodas, resumenInventarioTodo, resumenClientes, resumenAgenda,
  resumenCompras, resumenRefacciones, resumenCostos, resumenReportes,
} from '../src/lib/jarvis.js';
import { META_CAJAS } from '../src/lib/constants.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_KEY
);

// refacciones/proveedores ya no aceptan escritura de la anon key (RLS) —
// estas herramientas usan la service key para seguir funcionando.
const supabaseAdmin = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0, 10);

const TOOLS = [
  {
    name: "crear_pedido",
    description: "Crea un nuevo pedido de producción en el sistema EEMSA",
    input_schema: {
      type: "object",
      properties: {
        cliente:         { type: "string", description: "Nombre del cliente" },
        num:             { type: "string", description: "Número de pedido" },
        tipo:            { type: "string", description: "Tipo de cinta: Blanca, Canela, Transparente, Engomado" },
        medida:          { type: "string", description: 'Medida ej: 2"x100' },
        cajas:           { type: "number", description: "Cajas solicitadas" },
        rollos_caja:     { type: "number" },
        op:              { type: "string", description: "Operador: William o Alfredo" },
        maq:             { type: "string", description: "SIAT L36 #1, SIAT L36 #2 o SIAT L36 #3" },
        fecha_solicitud: { type: "string", description: "Fecha límite de entrega YYYY-MM-DD" },
        color:           { type: "string", description: "Color de impresión" },
        color_cinta:     { type: "string" },
        notas:           { type: "string" }
      },
      required: ["cliente", "num", "cajas", "fecha_solicitud"]
    }
  },
  {
    name: "actualizar_pedido",
    description: "Actualiza campos de un pedido existente: status, operador, fechas, notas",
    input_schema: {
      type: "object",
      properties: {
        num_pedido:    { type: "string", description: "Número del pedido a actualizar" },
        status:        { type: "string", description: "anotado, proceso o terminado" },
        op:            { type: "string" },
        fecha_inicio:  { type: "string", description: "YYYY-MM-DD" },
        fecha_termino: { type: "string", description: "YYYY-MM-DD" },
        notas:         { type: "string" }
      },
      required: ["num_pedido"]
    }
  },
  {
    name: "registrar_merma",
    description: "Registra piezas producidas y merma de un pedido. Calcula el % automáticamente.",
    input_schema: {
      type: "object",
      properties: {
        num_pedido:  { type: "string" },
        piezas_prod: { type: "number", description: "Total de piezas producidas" },
        merma:       { type: "number", description: "Piezas defectuosas o con merma" }
      },
      required: ["num_pedido", "piezas_prod", "merma"]
    }
  },
  {
    name: "registrar_produccion_diaria",
    description: "Registra las cajas producidas en el día para un pedido específico",
    input_schema: {
      type: "object",
      properties: {
        num_pedido: { type: "string" },
        cajas_dia:  { type: "number" },
        op:         { type: "string", description: "William o Alfredo" },
        fecha:      { type: "string", description: "YYYY-MM-DD, si no se indica usar hoy" },
        notas:      { type: "string" }
      },
      required: ["num_pedido", "cajas_dia"]
    }
  },
  {
    name: "registrar_falla",
    description: "Registra una falla o paro en una máquina SIAT L36",
    input_schema: {
      type: "object",
      properties: {
        maq:         { type: "string", description: "SIAT L36 #1, #2 o #3" },
        comp:        { type: "string", description: "Componente fallado: Rodillo anilox, Sistema de tintas, Motor principal, etc." },
        min_paro:    { type: "number", description: "Minutos de paro" },
        sev:         { type: "string", description: "leve, moderada o critica" },
        descripcion: { type: "string" },
        accion:      { type: "string", description: "Acción correctiva tomada (opcional)" },
        op:          { type: "string" }
      },
      required: ["maq", "comp", "min_paro", "sev", "descripcion"]
    }
  },
  {
    name: "cerrar_falla",
    description: "Cierra una falla abierta identificándola por componente o descripción",
    input_schema: {
      type: "object",
      properties: {
        descripcion_parcial: { type: "string", description: "Texto para identificar la falla (componente o parte de descripción)" },
        accion_correctiva:   { type: "string", description: "Qué se hizo para resolverla" }
      },
      required: ["descripcion_parcial"]
    }
  },
  {
    name: "usar_refaccion",
    description: "Descuenta 1 unidad del stock de una refacción (cuando se usa una pieza)",
    input_schema: {
      type: "object",
      properties: {
        nombre_parcial: { type: "string", description: "Nombre o parte del nombre de la refacción" }
      },
      required: ["nombre_parcial"]
    }
  },
  {
    name: "agregar_stock_refaccion",
    description: "Incrementa el stock de una refacción ya existente en inventario",
    input_schema: {
      type: "object",
      properties: {
        nombre_parcial: { type: "string" },
        cantidad:       { type: "number", description: "Unidades a agregar al stock actual" }
      },
      required: ["nombre_parcial", "cantidad"]
    }
  },
  {
    name: "agregar_refaccion",
    description: "Agrega una nueva refacción al inventario",
    input_schema: {
      type: "object",
      properties: {
        nombre:    { type: "string" },
        costo:     { type: "number" },
        stock:     { type: "number" },
        stock_min: { type: "number" },
        maq:       { type: "string" },
        proveedor: { type: "string" },
        notas:     { type: "string" }
      },
      required: ["nombre", "costo"]
    }
  },
  {
    name: "registrar_compra",
    description: "Registra una compra realizada a un proveedor",
    input_schema: {
      type: "object",
      properties: {
        nombre:     { type: "string", description: "Nombre del proveedor" },
        monto:      { type: "number" },
        que_compro: { type: "string" },
        fecha:      { type: "string", description: "YYYY-MM-DD" },
        telefono:   { type: "string" },
        direccion:  { type: "string" }
      },
      required: ["nombre", "monto", "que_compro"]
    }
  }
];

async function ejecutarHerramienta(name, input) {
  try {
    switch (name) {

      case "crear_pedido": {
        const nuevo = {
          id: uid(), created: today(),
          cliente: input.cliente, num: String(input.num),
          tipo: input.tipo || "Blanca", medida: input.medida || "",
          cajas: input.cajas,
          rollos_caja: input.rollos_caja || null,
          rollos_totales: input.cajas && input.rollos_caja ? input.cajas * input.rollos_caja : null,
          op: input.op || "William", maq: input.maq || "SIAT L36 #1",
          fecha_solicitud: input.fecha_solicitud,
          color: input.color || "", color_cinta: input.color_cinta || "",
          notas: input.notas || "", status: "anotado",
          cliche_url: null, merma_pct: null
        };
        const { error } = await supabaseAdmin.from("pedidos").insert([nuevo]);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Pedido #${input.num} creado para ${input.cliente} — ${input.cajas} cajas`, tablas: ["pedidos"] };
      }

      case "actualizar_pedido": {
        const STATUS_VALIDOS = ["anotado", "proceso", "terminado"];
        if (input.status && !STATUS_VALIDOS.includes(input.status)) {
          return { ok: false, error: `Status inválido: "${input.status}". Debe ser uno de: ${STATUS_VALIDOS.join(", ")}` };
        }
        const updates = {};
        if (input.status)        updates.status        = input.status;
        if (input.op)            updates.op             = input.op;
        if (input.fecha_inicio)  updates.fecha_inicio  = input.fecha_inicio;
        if (input.fecha_termino) updates.fecha_termino = input.fecha_termino;
        if (input.notas !== undefined) updates.notas   = input.notas;
        if (Object.keys(updates).length === 0) return { ok: false, error: "No se especificó qué actualizar" };
        const { error } = await supabaseAdmin.from("pedidos").update(updates).eq("num", String(input.num_pedido));
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Pedido #${input.num_pedido} actualizado: ${Object.keys(updates).join(", ")}`, tablas: ["pedidos"] };
      }

      case "registrar_merma": {
        const merma_pct = ((input.merma / input.piezas_prod) * 100).toFixed(2);
        const { error } = await supabaseAdmin.from("pedidos").update({
          piezas_prod: input.piezas_prod,
          merma: input.merma,
          merma_pct
        }).eq("num", String(input.num_pedido));
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Merma del pedido #${input.num_pedido}: ${merma_pct}% (${input.merma} pzas de ${input.piezas_prod})`, tablas: ["pedidos"] };
      }

      case "registrar_produccion_diaria": {
        const nuevo = {
          id: uid(), created: today(),
          fecha: input.fecha || today(),
          num_pedido: String(input.num_pedido),
          cajas_dia: input.cajas_dia,
          op: input.op || "William",
          notas: input.notas || ""
        };
        const { error } = await supabaseAdmin.from("prod_diaria").insert([nuevo]);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Producción registrada: ${input.cajas_dia} cajas del pedido #${input.num_pedido}`, tablas: ["prod_diaria"] };
      }

      case "registrar_falla": {
        const nuevo = {
          id: uid(), created: today(),
          fecha: today(), maq: input.maq, comp: input.comp,
          min_paro: input.min_paro, sev: input.sev,
          op: input.op || "",
          descripcion: input.descripcion,
          accion: input.accion || "",
          status: "abierta"
        };
        const { error } = await supabaseAdmin.from("fallas").insert([nuevo]);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Falla registrada: ${input.comp} en ${input.maq} — ${input.min_paro} min de paro`, tablas: ["fallas"] };
      }

      case "cerrar_falla": {
        const { data: fallas } = await supabaseAdmin.from("fallas").select("*").eq("status", "abierta");
        const term = input.descripcion_parcial.toLowerCase();
        const coincidencias = (fallas || []).filter(f =>
          f.descripcion?.toLowerCase().includes(term) ||
          f.comp?.toLowerCase().includes(term) ||
          f.maq?.toLowerCase().includes(term)
        );
        if (coincidencias.length === 0) return { ok: false, error: `No encontré falla abierta que coincida con: "${input.descripcion_parcial}"` };
        if (coincidencias.length > 1) {
          const opciones = coincidencias.map(f => `${f.comp} en ${f.maq} (${f.descripcion?.slice(0, 30) || "sin descripción"})`).join("; ");
          return { ok: false, error: `Encontré ${coincidencias.length} fallas abiertas que coinciden con "${input.descripcion_parcial}", sé más específico: ${opciones}` };
        }
        const falla = coincidencias[0];
        const updates = { status: "cerrada" };
        if (input.accion_correctiva) updates.accion = input.accion_correctiva;
        await supabaseAdmin.from("fallas").update(updates).eq("id", falla.id);
        return { ok: true, mensaje: `Falla cerrada: ${falla.comp} en ${falla.maq}`, tablas: ["fallas"] };
      }

      case "usar_refaccion": {
        const { data: refs } = await supabaseAdmin.from("refacciones").select("*");
        const term = input.nombre_parcial.toLowerCase();
        const coincidencias = (refs || []).filter(r => r.nombre?.toLowerCase().includes(term));
        if (coincidencias.length === 0) return { ok: false, error: `No encontré refacción con: "${input.nombre_parcial}"` };
        if (coincidencias.length > 1) {
          return { ok: false, error: `Encontré ${coincidencias.length} refacciones que coinciden con "${input.nombre_parcial}", sé más específico: ${coincidencias.map(r => r.nombre).join(", ")}` };
        }
        const ref = coincidencias[0];
        const nuevoStock = Number(ref.stock) - 1;
        if (nuevoStock < 0) return { ok: false, error: `Sin stock disponible de "${ref.nombre}" (stock actual: 0)` };
        await supabaseAdmin.from("refacciones").update({ stock: nuevoStock }).eq("id", ref.id);
        return { ok: true, mensaje: `Stock de "${ref.nombre}" actualizado: ${ref.stock} → ${nuevoStock}${nuevoStock <= Number(ref.stock_min || 1) ? " ⚠ STOCK BAJO" : ""}`, tablas: ["refacciones"] };
      }

      case "agregar_stock_refaccion": {
        const { data: refs } = await supabaseAdmin.from("refacciones").select("*");
        const term = input.nombre_parcial.toLowerCase();
        const coincidencias = (refs || []).filter(r => r.nombre?.toLowerCase().includes(term));
        if (coincidencias.length === 0) return { ok: false, error: `No encontré refacción con: "${input.nombre_parcial}"` };
        if (coincidencias.length > 1) {
          return { ok: false, error: `Encontré ${coincidencias.length} refacciones que coinciden con "${input.nombre_parcial}", sé más específico: ${coincidencias.map(r => r.nombre).join(", ")}` };
        }
        const ref = coincidencias[0];
        if (!(Number(input.cantidad) > 0)) return { ok: false, error: "La cantidad a agregar debe ser un número positivo" };
        const nuevoStock = Number(ref.stock) + Number(input.cantidad);
        await supabaseAdmin.from("refacciones").update({ stock: nuevoStock }).eq("id", ref.id);
        return { ok: true, mensaje: `Stock de "${ref.nombre}" incrementado: ${ref.stock} → ${nuevoStock}`, tablas: ["refacciones"] };
      }

      case "agregar_refaccion": {
        const nuevo = {
          id: uid(), created: today(),
          nombre: input.nombre, costo: input.costo,
          stock: input.stock || 1, stock_min: input.stock_min || 1,
          maq: input.maq || "SIAT L36 #1",
          proveedor: input.proveedor || "",
          fecha: today(),
          notas: input.notas || ""
        };
        const { error } = await supabaseAdmin.from("refacciones").insert([nuevo]);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Refacción "${input.nombre}" agregada al inventario (stock: ${nuevo.stock})`, tablas: ["refacciones"] };
      }

      case "registrar_compra": {
        if (!(Number(input.monto) >= 0)) return { ok: false, error: "El monto debe ser un número mayor o igual a 0" };
        const nuevo = {
          id: uid(), created: today(),
          nombre: input.nombre, monto: input.monto,
          que_compro: input.que_compro,
          fecha: input.fecha || today(),
          telefono: input.telefono || "",
          direccion: input.direccion || "",
          imagen_url: ""
        };
        const { error } = await supabaseAdmin.from("proveedores").insert([nuevo]);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Compra registrada: $${input.monto} en ${input.nombre} — ${input.que_compro}`, tablas: ["proveedores"] };
      }

      default:
        return { ok: false, error: `Herramienta desconocida: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://eemsa-system.vercel.app';

// Version de Claude de la pantalla Jarvis para preguntas que el filtro por
// palabras clave de Jarvis.js no reconoce (ver src/components/Jarvis.js:
// interpretarConsulta). A proposito NO comparte camino con el asistente
// completo de mas abajo:
//   - Sin `tools` en la llamada a Claude -- no es "se le pidio no escribir",
//     es que la funcion no tiene ninguna herramienta que pueda invocar para
//     escribir, ni aunque alguien intente manipular el prompt.
//   - El contexto son resumenes ya acotados por modulo (src/lib/jarvis.js),
//     nunca tablas completas ni columnas de costo/config/ids internos.
//   - Historial acotado a los ultimos 6 mensajes para no inflar el costo de
//     una conversacion larga con cada pregunta nueva.
//
// Permisos por modulo: detectarModulos() decide, por palabras clave en la
// ULTIMA pregunta, que modulo(s) tocan (pedidos, produccion, inventario,
// clientes, agenda, compras, refacciones, costos, reportes -- ver
// MODULOS_JARVIS). tieneAccesoModulo() filtra esa lista contra los modos
// reales del usuario que pregunta -- si pidio algo de un modulo que no le
// toca, ese modulo se descarta ANTES de tocar Supabase o llamar a Claude; si
// no queda ningun modulo autorizado, se responde de una vez sin gastar nada
// en la IA. "usuarios/administracion", contraseñas, tokens, sesiones y
// configuracion de costeo nunca se arman como modulo -- no existen en este
// archivo, asi que no hay nada que filtrar mal ni que Claude pueda contestar
// por accidente.
async function manejarJarvisIA(req, res, messages, usuario) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages es requerido' });
  }

  const ultimaPregunta = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const detectados = detectarModulos(ultimaPregunta);
  const autorizados = detectados.filter(m => tieneAccesoModulo(m, usuario));

  if (autorizados.length === 0) {
    return res.status(200).json({ reply: 'No tienes permiso para consultar esa información desde Jarvis. Pídele a un supervisor que te dé acceso al módulo correspondiente.' });
  }

  const hoy = hoyMexico();
  const necesita = (m) => autorizados.includes(m);

  // Solo se pide a Supabase lo que de verdad hace falta para los modulos
  // autorizados de ESTA pregunta -- no las 9 tablas siempre.
  const [pedidosRes, prodRes, materialesRes, listaMatRes, proveedoresRes, refaccionesRes, quejasRes] = await Promise.all([
    (necesita('pedidos') || necesita('produccion') || necesita('clientes') || necesita('agenda') || necesita('costos') || necesita('reportes'))
      ? supabase.from('pedidos').select('num, cliente, tipo, medida, cajas, status, maq, created, fecha_estimada, fecha_inicio, fecha_termino, inicio_ts, fin_ts, piezas_prod, merma, costo_pieza').order('created', { ascending: false }).limit(300)
      : { data: null },
    (necesita('produccion') || necesita('reportes')) ? supabase.from('prod_diaria').select('num_pedido, cajas_dia, fecha, created') : { data: null },
    necesita('inventario') ? supabase.from('materiales').select('categoria, match_valor, nombre, stock, unidad, stock_min') : { data: null },
    necesita('compras') ? supabase.from('lista_materiales').select('material, tipo, cantidad, unidad, urgente, status') : { data: null },
    necesita('compras') ? supabase.from('proveedores').select('nombre, monto, que_compro, fecha').order('fecha', { ascending: false }).limit(20) : { data: null },
    necesita('refacciones') ? supabase.from('refacciones').select('nombre, stock, stock_min, maq') : { data: null },
    necesita('refacciones') ? supabase.from('quejas_mp').select('folio, proveedor, material, fecha, estatus') : { data: null },
  ]);
  for (const r of [pedidosRes, prodRes, materialesRes, listaMatRes, proveedoresRes, refaccionesRes, quejasRes]) {
    if (r?.error) return res.status(500).json({ error: r.error.message });
  }

  const datos = { fecha_hoy: hoy };
  if (necesita('pedidos')) datos.pedidos_hoy = resumenPedidosHoy(pedidosRes.data, hoy);
  if (necesita('produccion')) datos.produccion = resumenProduccionTodas(pedidosRes.data, prodRes.data, hoy, META_CAJAS);
  if (necesita('inventario')) datos.inventario = resumenInventarioTodo(materialesRes.data);
  if (necesita('clientes')) datos.clientes = resumenClientes(pedidosRes.data);
  if (necesita('agenda')) datos.agenda = resumenAgenda(pedidosRes.data, hoy);
  if (necesita('compras')) datos.compras = resumenCompras(listaMatRes.data, proveedoresRes.data);
  if (necesita('refacciones')) datos.refacciones = resumenRefacciones(refaccionesRes.data, quejasRes.data);
  if (necesita('costos')) datos.costos = resumenCostos(pedidosRes.data, hoy);
  if (necesita('reportes')) datos.reportes = resumenReportes(pedidosRes.data, prodRes.data, hoy);

  const negados = detectados.filter(m => !autorizados.includes(m));
  const avisoPermisos = negados.length
    ? `\n\nEl usuario tambien pregunto algo relacionado a: ${negados.join(', ')} -- NO tienes datos de eso (sin permiso), dile que no puedes consultar esa parte y sugiere que pida acceso.`
    : '';

  const systemPrompt = `Eres Jarvis, el asistente de solo lectura de EEMSA. Respondes SIEMPRE en español, breve y claro (la respuesta se puede leer en voz alta en un celular).
Solo puedes usar los datos de este mensaje -- no inventes cifras ni asumas nada que no este aqui. Si la pregunta no se puede responder con estos datos, dilo claramente.
No tienes forma de crear, modificar ni borrar nada, ni de controlar ninguna máquina -- si te piden hacer algo (no solo consultar), explica que Jarvis es de solo lectura y que usen el módulo correspondiente (Pedidos, Modo Operador, Inventario, etc.).
No tienes acceso a usuarios, contraseñas, sesiones, tokens ni configuración del sistema -- si preguntan por eso, di que no es información que Jarvis maneje.${avisoPermisos}

DATOS (${hoy}):
${JSON.stringify(datos)}`;

  const ultimosMensajes = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: systemPrompt,
        messages: ultimosMensajes,
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(502).json({ error: data.error.message || 'Error al consultar la IA.' });
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || 'Sin respuesta.';
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Acceso de un token personal de Jarvis (Atajos de Siri u otro cliente sin
// sesion de usuario -- ver supabase_jarvis_tokens.sql y
// api/registro.js?tabla=jarvis-tokens). A proposito SIEMPRE cae en
// manejarJarvisIA sin importar el body: un token nunca llega al asistente
// completo (herramientas de escritura, OCR), ni siquiera si la cuenta dueña
// del token es supervisor -- ese es justo el punto de que Siri use un
// camino aparte y mas angosto que la sesion normal.
async function manejarConsultaPorToken(req, res, token) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data: fila, error } = await supabaseAdmin.from('jarvis_tokens')
    .select('*').eq('token_hash', tokenHash).is('revoked_at', null).maybeSingle();
  if (error || !fila) return res.status(401).json({ error: 'Token inválido o revocado' });

  // Anti-loop: un Atajo mal configurado (o un token filtrado) no puede
  // disparar llamadas en rafaga.
  if (fila.ultimo_uso && Date.now() - new Date(fila.ultimo_uso).getTime() < 2000) {
    return res.status(429).json({ error: 'Demasiadas consultas seguidas, espera un momento.' });
  }

  // Limite diario -- se resetea solo cuando cambia el dia (hora de Mexico,
  // ver hoyMexico en src/lib/jarvis.js), sin cron ni job aparte.
  const hoy = hoyMexico();
  const usosHoy = fila.fecha_contador === hoy ? fila.usos_hoy : 0;
  if (usosHoy >= fila.limite_diario) {
    return res.status(429).json({ error: `Límite diario de ${fila.limite_diario} consultas alcanzado.` });
  }

  await supabaseAdmin.from('jarvis_tokens').update({
    ultimo_uso: new Date().toISOString(), fecha_contador: hoy, usos_hoy: usosHoy + 1,
  }).eq('id', fila.id);

  const { data: perfil } = await supabaseAdmin.from('perfiles').select('modos, activo, es_admin').eq('id', fila.user_id).single();
  if (!perfil?.activo) return res.status(401).json({ error: 'Cuenta inactiva' });

  // El token hereda los modos reales del usuario que lo genero -- ni mas ni
  // menos permiso que si esa persona hubiera entrado a Jarvis con su sesion
  // normal (ver tieneAccesoModulo en src/lib/jarvis.js).
  const usuarioDelToken = { id: fila.user_id, modos: perfil.modos || [], esAdmin: !!perfil.es_admin };
  return manejarJarvisIA(req, res, req.body?.messages, usuarioDelToken);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-jarvis-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Atajos de Siri (o cualquier cliente sin sesion de usuario) mandan este
  // header en vez de un JWT -- se revisa antes que nada porque no hay sesion
  // Supabase de por medio para requiereAlgunModo.
  const tokenSiri = req.headers['x-jarvis-token'];
  if (tokenSiri) return manejarConsultaPorToken(req, res, String(tokenSiri));

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Ampliado de "supervisor" a "supervisor o jarvis" para que la pantalla
  // Jarvis (modo mas angosto, ver AdminUsuarios.js) tambien pueda llamar este
  // mismo endpoint -- pero OJO: pasar este gate NO alcanza para la parte de
  // abajo que crea/modifica datos con herramientas. Eso se revalida aparte,
  // explicitamente, unas lineas mas abajo.
  const usuario = await requiereAlgunModo(req, ['supervisor', 'jarvis']);
  if (!usuario) return res.status(401).json({ error: 'No autorizado' });

  try {
    const { messages, image, mediaType, extractTicket, jarvis } = req.body;

    // Rama de Jarvis: solo lectura, sin herramientas, sin OCR. Cualquiera con
    // el modo "jarvis" (o supervisor) puede entrar aqui -- es justo la unica
    // parte de este archivo pensada para eso. No se mezcla con el resto del
    // asistente (que si puede escribir), asi que ni siquiera se le arma el
    // array de TOOLS a Claude en esta rama.
    if (jarvis) return manejarJarvisIA(req, res, messages, usuario);

    // A partir de aqui: OCR de tickets y el asistente completo (crea/edita
    // pedidos, fallas, refacciones, compras...) -- requiere supervisor o
    // admin DE VERDAD, verificado aqui mismo, no solo "paso el gate de
    // arriba" (que tambien deja pasar el modo "jarvis", mas angosto).
    if (!usuario.esAdmin && !usuario.modos.includes('supervisor')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // OCR de ticket
    if (extractTicket && image) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
              { type: 'text', text: 'Extrae los datos de este ticket de compra y devuelve ÚNICAMENTE un JSON válido con este formato exacto (sin texto extra, sin markdown): {"nombre":"nombre del proveedor","telefono":"teléfono si aparece, si no cadena vacía","direccion":"dirección si aparece, si no cadena vacía","monto":"monto numérico sin símbolo de moneda","fecha":"fecha en formato YYYY-MM-DD","que_compro":"descripción breve de lo comprado"}' }
            ]
          }]
        })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    // Contexto de datos actuales
    const [pedidos, fallas, refacciones, prodDiaria] = await Promise.all([
      supabase.from('pedidos').select('*').order('created', { ascending: false }).limit(30),
      supabase.from('fallas').select('*').order('created', { ascending: false }).limit(20),
      supabase.from('refacciones').select('*').order('created', { ascending: false }).limit(30),
      supabase.from('prod_diaria').select('*').order('fecha', { ascending: false }).limit(14),
    ]);

    const contexto = `DATOS ACTUALES DE EEMSA (hoy: ${today()}):
PEDIDOS (${pedidos.data?.length || 0}): ${JSON.stringify(pedidos.data)}
FALLAS (${fallas.data?.length || 0}): ${JSON.stringify(fallas.data)}
REFACCIONES (${refacciones.data?.length || 0}): ${JSON.stringify(refacciones.data)}
PRODUCCIÓN ÚLTIMOS 14 DÍAS: ${JSON.stringify(prodDiaria.data)}`;

    const systemPrompt = `Eres el asistente de producción de EEMSA. Hablas en español de México, de forma concisa y técnica.
PUEDES CONSULTAR Y MODIFICAR el sistema usando las herramientas disponibles.
Cuando el usuario pida crear, registrar, actualizar, cerrar o mover algo, USA las herramientas — no respondas solo con texto.
Confirma siempre lo que hiciste de forma clara y breve. Si falta información obligatoria, pregunta antes de ejecutar.
Para fechas usa formato YYYY-MM-DD. La fecha de hoy es ${today()}.
Máquinas válidas: SIAT L36 #1, SIAT L36 #2, SIAT L36 #3. Operadores: William, Alfredo.

${contexto}`;

    let msgs = messages;
    let data;
    const tablasActualizadas = new Set();

    // Bucle de tool use
    for (let i = 0; i < 5; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1024, system: systemPrompt, tools: TOOLS, messages: msgs })
      });
      data = await response.json();

      if (data.error) break;
      if (data.stop_reason !== 'tool_use') break;

      const toolUseBlocks = (data.content || []).filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const resultado = await ejecutarHerramienta(toolUse.name, toolUse.input);
        if (resultado.tablas) resultado.tablas.forEach(t => tablasActualizadas.add(t));
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(resultado) });
      }

      msgs = [...msgs, { role: 'assistant', content: data.content }, { role: 'user', content: toolResults }];
    }

    const reply = ((data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('')) || (data?.error?.message || data?.error) || 'Sin respuesta.';
    return res.status(200).json({ reply, tablas_actualizadas: [...tablasActualizadas] });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
