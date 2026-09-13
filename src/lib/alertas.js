// Detectores puros para las alertas automaticas del cron diario (ver
// api/analisis-diario.js). A diferencia de src/lib/jarvis.js (que arma
// resumenes para que Claude conteste una pregunta), esto son reglas duras
// sin ningun modelo de lenguaje de por medio -- si la condicion se cumple,
// se avisa, punto. Separado en su propio archivo para no mezclar los dos
// tipos de logica ni sus pruebas.
import { REBOB_CLIENTE } from './constants.js';

const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

// Pedidos activos (no terminados) cuya fecha de entrega ya es hoy o paso --
// mismo criterio que ya usaba Dashboard.js al abrirse (ver
// notificar('pedidos_vencidos', ...) ahi), pero corriendo en el servidor
// para que avise aunque nadie abra el Dashboard ese dia.
export const detectarPedidosUrgentes = (pedidos, hoy) => (pedidos || [])
  .filter(p => p.status !== 'terminado' && p.fecha_estimada && p.fecha_estimada <= hoy && p.cliente !== REBOB_CLIENTE)
  .map(p => ({ num: p.num, cliente: p.cliente, fecha_estimada: p.fecha_estimada, dias_vencido: diasEntre(p.fecha_estimada, hoy) }))
  .sort((a, b) => b.dias_vencido - a.dias_vencido);

// Mismo criterio de "bajo" que ya se muestra en Inventario.js -- aqui solo
// se reusa para decidir si se manda un aviso, no cambia como se calcula.
export const detectarInventarioCritico = (materiales) => (materiales || [])
  .filter(m => Number(m.stock_min || 0) > 0 && Number(m.stock || 0) <= Number(m.stock_min))
  .map(m => ({ nombre: m.nombre, categoria: m.categoria, stock: Number(m.stock || 0), stock_min: Number(m.stock_min || 0) }));

// Pedidos que YA llevaban corriendo desde ayer (o antes) sin ningun
// registro en prod_diaria para el dia de AYER -- se revisa el dia anterior,
// no el actual, para que baste con el cron de las 8am que ya existe (a esa
// hora nadie ha registrado nada de HOY todavia, seria una alerta falsa).
export const detectarProduccionSinRegistrar = (pedidos, prodDiaria, ayer) => {
  const numsConRegistro = new Set((prodDiaria || []).filter(r => r.fecha === ayer).map(r => String(r.num_pedido)));
  return (pedidos || [])
    .filter(p => p.status === 'proceso' && p.fecha_inicio && p.fecha_inicio <= ayer)
    .filter(p => !numsConRegistro.has(String(p.num)))
    .map(p => ({ maq: p.maq, num: p.num, cliente: p.cliente }));
};
