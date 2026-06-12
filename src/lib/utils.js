export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

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
