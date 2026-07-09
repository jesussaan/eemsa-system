export const notificar = async (tipo, datos) => {
  try {
    await fetch('/api/notificar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.REACT_APP_CHAT_API_SECRET ? { 'X-Chat-Secret': process.env.REACT_APP_CHAT_API_SECRET } : {}),
      },
      body: JSON.stringify({ tipo, datos }),
    });
  } catch (_) {}
};
