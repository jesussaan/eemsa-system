export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Evita que "Azul PMS" y "azul pms" queden como dos valores distintos solo
// por may/min. Si ya existe un valor igual ignorando mayusculas, se usa esa
// forma (la primera que se escribio); si no, se guarda tal cual lo escribieron.
export const unificarPorTexto = (valor, existentes) => {
  const limpio = String(valor ?? '').trim();
  if (!limpio) return limpio;
  const match = existentes.find(e => String(e ?? '').trim().toLowerCase() === limpio.toLowerCase());
  return match !== undefined ? String(match).trim() : limpio;
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
export const today = () => new Date().toISOString().slice(0, 10);
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
