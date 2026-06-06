export const notificar = async (tipo, datos) => {
  try {
    await fetch('/api/notificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, datos }),
    });
  } catch (_) {}
};
