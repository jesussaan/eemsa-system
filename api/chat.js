import { createClient } from '@supabase/supabase-js';

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
        const { error } = await supabase.from("pedidos").insert([nuevo]);
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
        const { error } = await supabase.from("pedidos").update(updates).eq("num", String(input.num_pedido));
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Pedido #${input.num_pedido} actualizado: ${Object.keys(updates).join(", ")}`, tablas: ["pedidos"] };
      }

      case "registrar_merma": {
        const merma_pct = ((input.merma / input.piezas_prod) * 100).toFixed(2);
        const { error } = await supabase.from("pedidos").update({
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
        const { error } = await supabase.from("prod_diaria").insert([nuevo]);
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
        const { error } = await supabase.from("fallas").insert([nuevo]);
        if (error) return { ok: false, error: error.message };
        return { ok: true, mensaje: `Falla registrada: ${input.comp} en ${input.maq} — ${input.min_paro} min de paro`, tablas: ["fallas"] };
      }

      case "cerrar_falla": {
        const { data: fallas } = await supabase.from("fallas").select("*").eq("status", "abierta");
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
        await supabase.from("fallas").update(updates).eq("id", falla.id);
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Chat-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (process.env.CHAT_API_SECRET && req.headers['x-chat-secret'] !== process.env.CHAT_API_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { messages, image, mediaType, extractTicket } = req.body;

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
