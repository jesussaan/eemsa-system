import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;

    const [pedidos, fallas, refacciones] = await Promise.all([
      supabase.from('pedidos').select('*').order('created', { ascending: false }).limit(20),
      supabase.from('fallas').select('*').order('created', { ascending: false }).limit(20),
      supabase.from('refacciones').select('*').order('created', { ascending: false }).limit(20),
    ]);

    const contexto = `
DATOS ACTUALES DE EEMSA:
PEDIDOS: ${JSON.stringify(pedidos.data)}
FALLAS: ${JSON.stringify(fallas.data)}
REFACCIONES: ${JSON.stringify(refacciones.data)}
    `;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        system: `Eres el asistente de producción de EEMSA. Hablas en español de México, de forma concisa y técnica. Tienes acceso a los datos en tiempo real de la empresa: ${contexto}`,
        messages
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}