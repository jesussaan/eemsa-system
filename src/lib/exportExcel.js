const SEV_LABEL = { leve: 'Leve', moderada: 'Moderada', critica: 'Crítica' };
const STATUS_LABEL = { anotado: 'Anotado', proceso: 'En proceso', pendiente: 'Pendiente alta', terminado: 'Terminado' };

function colWidths(arr) {
  return arr.map(w => ({ wch: w }));
}

function sheetPedidos(XLSX, pedidos) {
  const rows = pedidos.map(p => ({
    'No. Pedido':        p.num || '',
    'Cliente':           p.cliente || '',
    'Tipo':              p.tipo || '',
    'Medida':            p.medida || '',
    'Cajas':             Number(p.cajas || 0),
    'Rollos/Piezas':     Number(p.rollos_totales || 0),
    'Estatus':           STATUS_LABEL[p.status] || p.status || '',
    'Fecha solicitud':   p.fecha_solicitud || '',
    'Fecha inicio':      p.fecha_inicio || '',
    'Fecha término':     p.fecha_termino || '',
    'Piezas producidas': p.piezas_prod != null ? Number(p.piezas_prod) : '',
    'Merma (piezas)':    p.merma != null ? Number(p.merma) : '',
    '% Merma':           p.merma_pct != null && p.merma_pct !== '' ? Number(p.merma_pct) : '',
    'Rollos usados':     p.rollos_usados != null ? Number(p.rollos_usados) : '',
    'Tinta (kg)':        p.tinta_kg != null ? Number(p.tinta_kg) : '',
    'Alcohol (L)':       p.alcohol_litros != null ? Number(p.alcohol_litros) : '',
    'Máquina':           p.maq || '',
    'Color / Tinta':     p.color || p.tinta_tipo || '',
    'Fecha estimada':    p.fecha_estimada || '',
    'Notas':             p.notas || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = colWidths([10, 22, 14, 14, 8, 12, 14, 14, 14, 14, 14, 14, 10, 12, 10, 10, 16, 14, 14, 30]);
  return ws;
}

function sheetFallas(XLSX, fallas) {
  const rows = fallas.map(f => ({
    'Fecha':            f.fecha || '',
    'Máquina':          f.maq || '',
    'Componente':       f.comp || '',
    'Severidad':        SEV_LABEL[f.sev] || f.sev || '',
    'Operador':         f.op || '',
    'Min. de paro':     Number(f.min_paro || 0),
    'Descripción':      f.descripcion || '',
    'Acción correctiva':f.accion || '',
    'Estatus':          f.status === 'cerrada' ? 'Cerrada' : 'Abierta',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = colWidths([12, 16, 22, 12, 14, 12, 40, 40, 10]);
  return ws;
}

function sheetProduccion(XLSX, prodDiaria) {
  const rows = [...prodDiaria]
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    .map(r => ({
      'Fecha':            r.fecha || '',
      'Cajas producidas': Number(r.cajas_dia || 0),
      'Máquina':          r.maquina || '',
      'Turno':            r.turno || '',
      'Notas':            r.notas || '',
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = colWidths([12, 16, 16, 12, 40]);
  return ws;
}

function sheetCompras(XLSX, proveedores) {
  const rows = [...proveedores]
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    .map(p => ({
      'Fecha':       p.fecha || '',
      'Proveedor':   p.proveedor || '',
      'Descripción': p.descripcion || '',
      'Monto ($)':   Number(p.monto || 0),
      'Categoría':   p.categoria || '',
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = colWidths([12, 24, 36, 12, 18]);
  return ws;
}

export async function exportarExcel({ pedidos, fallas, prodDiaria, proveedores }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, sheetPedidos(XLSX, pedidos),        'Pedidos');
  XLSX.utils.book_append_sheet(wb, sheetFallas(XLSX, fallas),          'Fallas');
  XLSX.utils.book_append_sheet(wb, sheetProduccion(XLSX, prodDiaria),  'Producción diaria');
  XLSX.utils.book_append_sheet(wb, sheetCompras(XLSX, proveedores),    'Compras');

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `EEMSA_Datos_${fecha}.xlsx`);
}
