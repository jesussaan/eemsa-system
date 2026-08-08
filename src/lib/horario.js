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
