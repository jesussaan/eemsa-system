export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'Eres el asistente de producción de EEMSA, empresa que fabrica cinta adhesiva con logo personalizado usando máquinas flexográficas SIAT L36. Hablas en español de México, de forma concisa y técnica. Ayudas con operación SIAT L36, parámetros flexográficos, mermas, pedidos, fallas mecánicas, SGC ISO 9001.',
        messages
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}