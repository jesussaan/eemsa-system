export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Recuerda un borrador (form a medio llenar, pantalla en la que ibas) en
// localStorage para que sobreviva si el celular/tablet mata la app en
// segundo plano o hay una actualizacion -- se usan junto con un useState
// perezoso (cargarBorrador) y un useEffect que llama a guardarBorrador
// cada vez que cambia el valor.
export const cargarBorrador = (key, valorPorDefecto) => {
  try {
    const guardado = localStorage.getItem(key);
    return guardado != null ? JSON.parse(guardado) : valorPorDefecto;
  } catch { return valorPorDefecto; }
};
export const guardarBorrador = (key, valor) => {
  try {
    if (valor == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(valor));
  } catch {}
};

// Evita que "Azul PMS" y "azul pms" queden como dos valores distintos solo
// por may/min. Si ya existe un valor igual ignorando mayusculas, se usa esa
// forma (la primera que se escribio); si no, se guarda tal cual lo escribieron.
export const unificarPorTexto = (valor, existentes) => {
  const limpio = String(valor ?? '').trim();
  if (!limpio) return limpio;
  const match = existentes.find(e => String(e ?? '').trim().toLowerCase() === limpio.toLowerCase());
  return match !== undefined ? String(match).trim() : limpio;
};

// Una medida se puede escribir de mil formas ("2x100", "2X100", "2"100",
// "2 x 100") y todas quieren decir lo mismo. Se guarda siempre igual
// (ancho"xlargo, ej. 2"x100) para que el historial de un cliente no se vea
// fragmentado solo por como se haya tecleado. Si no se le puede sacar dos
// numeros, se deja tal cual (mejor no perder el dato que adivinar mal).
export const normalizarMedida = (medida) => {
  const s = String(medida ?? '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  return m ? `${m[1]}"x${m[2]}` : s;
};

// Sube un archivo a Supabase Storage vía signed URL (pedida al servidor) en
// vez de con la anon key directo -- misma forma de retorno {data, error}
// que supabase.storage.from(bucket).upload() para poder sustituirlo igual.
export const subirConUrlFirmada = async (supabase, bucket, path, file, headers = { 'Content-Type': 'application/json' }) => {
  const res = await fetch('/api/storage-upload-url', { method: 'POST', headers, body: JSON.stringify({ bucket, paths: [path] }) });
  const body = await res.json();
  if (!res.ok) return { data: null, error: { message: body.error || 'Error al preparar subida' } };
  const { token } = body.firmas[0];
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file);
  if (error) return { data: null, error };
  return { data: { path }, error: null };
};

export const siguienteNumPedido = (pedidos) => {
  const max = pedidos.reduce((m, p) => {
    const n = parseInt(p.num, 10);
    return !isNaN(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
};

// El pedido mas reciente de un cliente (ignorando may/min y espacios) -- para
// autollenar el formulario de pedido nuevo con lo que ese cliente pide siempre
// (ARIAT casi siempre es Canela 3"x100, 10 cajas, negro) en vez de teclearlo
// de nuevo cada vez y equivocarse. null si el cliente no tiene pedidos.
// Pedidos de un cliente (ignorando may/min y espacios), del mas reciente al
// mas viejo: por fecha_solicitud y, si empatan, por numero de pedido.
const pedidosRecientesDeCliente = (pedidos, cliente) => {
  const buscado = String(cliente ?? '').trim().toLowerCase();
  if (!buscado) return [];
  return pedidos
    .filter(p => String(p.cliente ?? '').trim().toLowerCase() === buscado)
    .sort((a, b) => {
      const fa = a.fecha_solicitud || '', fb = b.fecha_solicitud || '';
      if (fa !== fb) return fb.localeCompare(fa);
      return (parseInt(b.num, 10) || 0) - (parseInt(a.num, 10) || 0);
    });
};

export const ultimoPedidoDeCliente = (pedidos, cliente) =>
  pedidosRecientesDeCliente(pedidos, cliente)[0] || null;

// Avisos al capturar un pedido nuevo cuando un dato no cuadra con lo que ese
// cliente pide siempre (ej. ARIAT con 2"x100 cuando siempre pide 3"x100).
// Solo avisan, no bloquean: a veces si piden algo distinto. Piden al menos 2
// pedidos previos del cliente, para no avisar con un cliente casi nuevo.
const ULTIMOS_PEDIDOS_AVISO = 10;
const recientesParaAviso = (pedidos, cliente) => {
  const recientes = pedidosRecientesDeCliente(pedidos, cliente).slice(0, ULTIMOS_PEDIDOS_AVISO);
  return recientes.length >= 2 ? recientes : null;
};

// Valor que nunca aparece en sus ultimos pedidos. `clave` normaliza para
// comparar ("2x100" = 2"x100, "negro" = "NEGRO"). Devuelve
// { habitual, veces, total } con el valor que mas pide (tal como se guardo
// la primera vez), o null.
const avisoValorNuevo = (recientes, valor, extraer, clave) => {
  const k = clave(valor);
  const conteo = {};
  const original = {};
  recientes.forEach(p => {
    const v = extraer(p);
    const kp = clave(v);
    if (!kp) return;
    conteo[kp] = (conteo[kp] || 0) + 1;
    if (!(kp in original)) original[kp] = String(v).trim();
  });
  if (conteo[k]) return null;
  const [habitual, veces] = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0] || [];
  return habitual ? { habitual: original[habitual], veces, total: recientes.length } : null;
};

// Medida: solo cuando ya trae sus dos numeros, para no avisar a media
// escritura de "2".
export const avisoMedidaCliente = (pedidos, cliente, medida) => {
  const m = normalizarMedida(medida);
  if (!/^\d+(\.\d+)?"x\d+/.test(m)) return null;
  const recientes = recientesParaAviso(pedidos, cliente);
  return recientes && avisoValorNuevo(recientes, m, p => normalizarMedida(p.medida), v => normalizarMedida(v));
};

// Tinta: tinta_tipo y color son el mismo dato segun de donde vino el
// pedido (ver ModoVentas.js save), se compara sin may/min ni espacios.
export const avisoTintaCliente = (pedidos, cliente, tinta) => {
  const clave = v => String(v ?? '').trim().toLowerCase();
  if (!clave(tinta)) return null;
  const recientes = recientesParaAviso(pedidos, cliente);
  return recientes && avisoValorNuevo(recientes, tinta, p => p.tinta_tipo || p.color, clave);
};

// Tipo de cinta (Blanca, Canela, Transparente, Engomado): el select siempre
// trae uno (Blanca por default), asi que tambien avisa si se quedo en Blanca
// sin tocar con un cliente que siempre pide Canela.
export const avisoTipoCliente = (pedidos, cliente, tipo) => {
  const clave = v => String(v ?? '').trim().toLowerCase();
  if (!clave(tipo)) return null;
  const recientes = recientesParaAviso(pedidos, cliente);
  return recientes && avisoValorNuevo(recientes, tipo, p => p.tipo, clave);
};

// Cajas: avisa si se sale del rango de sus ultimos pedidos por mas de la
// mitad (ARIAT siempre 10 -> avisa con 100 o con 5, no con 12). Devuelve
// { min, max, total } o null.
export const avisoCajasCliente = (pedidos, cliente, cajas) => {
  const n = Number(cajas);
  if (!(n > 0)) return null;
  const recientes = recientesParaAviso(pedidos, cliente);
  if (!recientes) return null;
  const previas = recientes.map(p => Number(p.cajas)).filter(c => c > 0);
  if (previas.length < 2) return null;
  const min = Math.min(...previas), max = Math.max(...previas);
  return (n > max * 1.5 || n < min / 1.5) ? { min, max, total: recientes.length } : null;
};
// Fecha de hoy en hora de Mexico (America/Mexico_City), NO UTC -- antes esto
// era new Date().toISOString().slice(0,10), que da la fecha en UTC sin
// importar donde corra. Como CDMX es UTC-6 sin horario de verano desde 2022,
// a partir de las 6pm hora local esto ya marcaba el dia siguiente -- en
// pedidos.created, fallas.fecha, prod_diaria.fecha, "pedidos de hoy" de
// Jarvis, etc. Intl.DateTimeFormat con esa timeZone da directo YYYY-MM-DD
// (locale en-CA) sin tener que sumar/restar horas a mano.
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
export const fmt = (n) => Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const diasHabiles = (desde, hasta) => {
  if (!desde || !hasta) return 0;
  let count = 0;
  const cur = new Date(desde + "T12:00:00");
  const h = new Date(hasta + "T12:00:00");
  while (cur <= h) { const d = cur.getDay(); if (d !== 0 && d !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
};

export const diasHabilesRestantes = (fechaSolicitud) => {
  if (!fechaSolicitud) return null;
  const inicio = new Date(fechaSolicitud + "T12:00:00");
  const limite = new Date(inicio);
  let agregados = 0;
  while (agregados < 15) { limite.setDate(limite.getDate() + 1); const d = limite.getDay(); if (d !== 0 && d !== 6) agregados++; }
  const hoy = new Date(today() + "T12:00:00");
  let restantes = 0;
  const cur = new Date(hoy);
  if (cur > limite) return -diasHabiles(today(), limite.toISOString().slice(0, 10));
  while (cur <= limite) { const dw = cur.getDay(); if (dw !== 0 && dw !== 6) restantes++; cur.setDate(cur.getDate() + 1); }
  return restantes - 1;
};

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const fechaLegible = (fecha) => {
  if (!fecha) return "";
  const d = new Date(fecha + "T12:00:00");
  const dia = DIAS_SEMANA[d.getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
};

export const estadoPlazo = (dias) => {
  if (dias === null) return null;
  if (dias < 0) return { txt: "VENCIDO", cls: "b-red", color: "#ff4d4d" };
  if (dias <= 3) return { txt: `URGENTE (${dias}d)`, cls: "b-orange", color: "#ff9900" };
  return { txt: `${dias} días`, cls: "b-green", color: "#4be87a" };
};

export const alertaEntrega = (fechaEstimada, status) => {
  if (!fechaEstimada || status === "terminado") return null;
  const hoy = new Date(today() + "T12:00:00");
  const ent = new Date(fechaEstimada + "T12:00:00");
  const diff = Math.round((ent - hoy) / 86400000);
  if (diff < 0) return { txt: `⛔ Vencido hace ${Math.abs(diff)}d`, color: "#ff4d4d", bg: "rgba(255,77,77,0.15)", borde: "#ff4d4d" };
  return null;
};
