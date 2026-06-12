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
