// Horario real de trabajo -- se usa para medir tiempo EFECTIVO de
// produccion (solo horas laborables) en vez de tiempo de reloj crudo, que
// le sumaba noches y domingos completos a un pedido dejado "en proceso"
// de un dia para otro. El mismo horario determina cuanto "dia" de costos
// fijos (mano de obra/mantenimiento/luz) se le carga a cada corrida --
// tiempo tardado y costo van de la mano.
const HORARIO_SEMANA = {
  0: null,                            // domingo: cerrado
  1: { ini: [8, 0], fin: [17, 45] },  // lunes
  2: { ini: [8, 0], fin: [17, 45] },  // martes
  3: { ini: [8, 0], fin: [17, 45] },  // miercoles
  4: { ini: [8, 0], fin: [17, 45] },  // jueves
  5: { ini: [8, 0], fin: [17, 45] },  // viernes
  6: { ini: [9, 0], fin: [13, 15] },  // sabado
};

// Jornada completa de lunes a viernes (8:00-17:45 = 9h45m) -- referencia de
// "1 dia" al convertir horas efectivas en dias de costo fijo.
export const JORNADA_HORAS = 9.75;

// Minutos reales de trabajo entre dos fechas, respetando el horario de
// arriba -- recorre dia por dia y suma solo el traslape con la ventana de
// ese dia (domingo, o lo que caiga fuera del horario, no cuenta).
export const minutosEfectivos = (inicio, fin) => {
  if (!(fin > inicio)) return 0;
  let total = 0;
  const cursor = new Date(inicio);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < fin) {
    const horario = HORARIO_SEMANA[cursor.getDay()];
    if (horario) {
      const ventanaIni = new Date(cursor); ventanaIni.setHours(horario.ini[0], horario.ini[1], 0, 0);
      const ventanaFin = new Date(cursor); ventanaFin.setHours(horario.fin[0], horario.fin[1], 0, 0);
      const solapeIni = inicio > ventanaIni ? inicio : ventanaIni;
      const solapeFin = fin < ventanaFin ? fin : ventanaFin;
      if (solapeFin > solapeIni) total += (solapeFin - solapeIni) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
};

export const horasEfectivas = (inicio, fin) => minutosEfectivos(inicio, fin) / 60;

// Pausas manuales de un pedido "en proceso" (operador ausente, maquina
// apagada, etc. -- ver ModoOperador.js) -- se guardan como
// [{inicio: ISO, fin: ISO|null}, ...] en pedidos.pausas. Una pausa sin
// "fin" sigue abierta (todavia pausado); se cuenta hasta `hasta` (default
// ahora) para poder mostrar el tiempo pausado en vivo.
export const horasPausadas = (pausas, hasta = new Date()) => {
  if (!Array.isArray(pausas) || !pausas.length) return 0;
  return pausas.reduce((s, p) => {
    if (!p?.inicio) return s;
    const fin = p.fin ? new Date(p.fin) : hasta;
    return s + horasEfectivas(new Date(p.inicio), fin);
  }, 0);
};

// Horas efectivas de produccion de un pedido, con las pausas ya
// descontadas -- esto es lo que de verdad hay que usar para diasProd
// (costo fijo) y para el cronometro en pantalla, no horasEfectivas crudo.
export const horasEfectivasPedido = (inicio, fin, pausas) =>
  Math.max(0, horasEfectivas(inicio, fin) - horasPausadas(pausas, fin));

// Suma `horas` de trabajo a partir de `inicio`, saltandose las horas fuera
// del horario de la planta (noches, domingos, sabado en la tarde) -- para
// calcular cuando terminaria un pedido que dura N horas de maquina.
export const sumarHorasHabiles = (inicio, horas) => {
  let restante = Math.max(0, horas) * 60;
  const cursor = new Date(inicio);
  for (let i = 0; i < 3660; i++) {
    const horario = HORARIO_SEMANA[cursor.getDay()];
    if (horario) {
      const ventanaIni = new Date(cursor); ventanaIni.setHours(horario.ini[0], horario.ini[1], 0, 0);
      const ventanaFin = new Date(cursor); ventanaFin.setHours(horario.fin[0], horario.fin[1], 0, 0);
      if (cursor < ventanaIni) cursor.setTime(ventanaIni.getTime());
      if (cursor < ventanaFin) {
        const disponible = (ventanaFin - cursor) / 60000;
        if (restante <= disponible) return new Date(cursor.getTime() + restante * 60000);
        restante -= disponible;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return cursor;
};

// "YYYY-MM-DD" de una fecha en hora local (la del navegador = planta).
export const fechaLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fecha "YYYY-MM-DD" + n dias habiles (dias con horario: lunes a sabado).
export const sumarDiasHabiles = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00`);
  let faltan = n;
  while (faltan > 0) {
    d.setDate(d.getDate() + 1);
    if (HORARIO_SEMANA[d.getDay()]) faltan--;
  }
  return fechaLocalISO(d);
};
