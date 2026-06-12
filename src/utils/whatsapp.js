export const mensajePedidoNuevo = (p) => {
  const lineas = [`🆕 Pedido nuevo #${p.num} - ${p.cliente}`];
  if (p.tipo) lineas.push(`🎨 Tipo: ${p.tipo}`);
  if (p.medida) lineas.push(`📏 Medida: ${p.medida}`);
  if (p.cajas != null && p.cajas !== "") lineas.push(`📦 Cajas: ${p.cajas}`);
  if (p.rollos_totales != null && p.rollos_totales !== "") lineas.push(`🧵 Piezas/rollos: ${p.rollos_totales}`);
  if (p.ancho || p.largo) lineas.push(`📐 Medidas: ${p.ancho || "?"} x ${p.largo || "?"}`);
  const tinta = p.color || p.tinta_tipo;
  if (tinta) lineas.push(`🖌 Tinta/Color: ${tinta}`);
  const entrega = p.fecha_estimada || p.fecha_solicitud;
  if (entrega) lineas.push(`📅 Entrega: ${entrega}`);
  if (p.notas) lineas.push(`📝 Notas: ${p.notas}`);
  return lineas.join("\n");
};

export const sendWhatsApp = async (mensaje) => {
  const phone = process.env.REACT_APP_CALLMEBOT_PHONE;
  const apikey = process.env.REACT_APP_CALLMEBOT_APIKEY;
  if (!phone || !apikey) return;
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(mensaje)}&apikey=${apikey}`;
    await fetch(url, { mode: 'no-cors' });
  } catch (err) {
    console.warn('No se pudo enviar notificación de WhatsApp:', err);
  }
};
