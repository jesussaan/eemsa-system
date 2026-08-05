import { createClient } from '@supabase/supabase-js';
import { REBOB_CLIENTE } from '../src/lib/constants.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_KEY
);

const today = () => new Date().toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const mediana = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const promedio = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

// Clientes con cadencia de pedido reconocible que llevan mas tiempo del
// esperado sin volver a pedir -- señal de posible cliente en riesgo.
function candidatosInactividad(pedidos, hoy) {
  const porCliente = {};
  pedidos.forEach(p => {
    if (p.cliente === REBOB_CLIENTE || !p.fecha_solicitud) return;
    (porCliente[p.cliente] ||= []).push(p.fecha_solicitud);
  });
  const out = [];
  for (const [cliente, fechas] of Object.entries(porCliente)) {
    const unicas = [...new Set(fechas)].sort();
    if (unicas.length < 3) continue;
    const gaps = unicas.slice(1).map((f, i) => diasEntre(unicas[i], f));
    const medianGap = mediana(gaps);
    if (medianGap < 5 || medianGap > 75) continue; // sin cadencia clara
    const diasDesde = diasEntre(unicas[unicas.length - 1], hoy);
    if (diasDesde > Math.max(medianGap * 1.7, medianGap + 12)) {
      out.push({ tipo: 'inactividad', cliente, dias_desde_ultimo: diasDesde, cadencia_habitual_dias: Math.round(medianGap) });
    }
  }
  return out.sort((a, b) => (b.dias_desde_ultimo / b.cadencia_habitual_dias) - (a.dias_desde_ultimo / a.cadencia_habitual_dias)).slice(0, 5);
}

// Merma de este mes muy por encima del historico del mismo cliente.
function candidatosMerma(pedidos, hoy) {
  const mesActual = hoy.slice(0, 7);
  const term = pedidos.filter(p => p.cliente !== REBOB_CLIENTE && p.status === 'terminado' && p.merma_pct != null && p.merma_pct !== '');
  const porCliente = {};
  term.forEach(p => (porCliente[p.cliente] ||= []).push(p));
  const out = [];
  for (const [cliente, peds] of Object.entries(porCliente)) {
    const mes = peds.filter(p => p.fecha_termino?.startsWith(mesActual)).map(p => Number(p.merma_pct));
    const historico = peds.filter(p => !p.fecha_termino?.startsWith(mesActual)).map(p => Number(p.merma_pct));
    if (mes.length === 0 || historico.length < 3) continue;
    const avgMes = promedio(mes);
    const avgHist = promedio(historico);
    if (avgMes > Math.max(avgHist * 1.5, avgHist + 4)) {
      out.push({ tipo: 'merma', cliente, merma_mes_pct: avgMes.toFixed(1), merma_historica_pct: avgHist.toFixed(1) });
    }
  }
  return out.sort((a, b) => b.merma_mes_pct - a.merma_mes_pct).slice(0, 5);
}

// Pedidos en proceso que llevan mas dias corriendo de lo normal para EEMSA.
function candidatosTiempoProceso(pedidos, hoy) {
  const conTiempo = pedidos.filter(p => p.cliente !== REBOB_CLIENTE && p.status === 'terminado' && p.fecha_inicio && p.fecha_termino)
    .map(p => diasEntre(p.fecha_inicio, p.fecha_termino) + 1);
  if (conTiempo.length < 5) return [];
  const avgGlobal = promedio(conTiempo);
  const enProceso = pedidos.filter(p => p.cliente !== REBOB_CLIENTE && p.status === 'proceso' && p.fecha_inicio);
  const out = [];
  enProceso.forEach(p => {
    const dias = diasEntre(p.fecha_inicio, hoy) + 1;
    if (dias >= 3 && dias > avgGlobal * 1.6) {
      out.push({ tipo: 'tiempo_proceso', num: p.num, cliente: p.cliente, dias_en_proceso: dias, promedio_normal_dias: Math.round(avgGlobal) });
    }
  });
  return out.sort((a, b) => b.dias_en_proceso - a.dias_en_proceso).slice(0, 5);
}

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const hoy = today();
    const { data: pedidos, error } = await supabase.from('pedidos').select('*').order('created', { ascending: false }).limit(1000);
    if (error) return res.status(500).json({ error: error.message });

    const candidatos = [
      ...candidatosInactividad(pedidos, hoy),
      ...candidatosMerma(pedidos, hoy),
      ...candidatosTiempoProceso(pedidos, hoy),
    ];

    if (candidatos.length === 0) {
      return res.status(200).json({ ok: true, enviado: false, motivo: 'sin hallazgos' });
    }

    const systemPrompt = `Eres el asistente de producción de EEMSA (empresa de conversión/impresión de cinta adhesiva en rollos). Te doy una lista de hallazgos ya detectados automáticamente sobre el negocio. Tu trabajo es elegir como máximo 3 -- los más importantes y accionables para hoy -- y redactar cada uno en una sola frase natural en español de México, directa, como si le avisaras a un colega. No inventes datos que no estén en la lista. Si ninguno amerita aviso, responde con una lista vacía.
Responde ÚNICAMENTE JSON válido con este formato, sin texto ni markdown extra: {"insights":[{"titulo":"...","detalle":"..."}]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(candidatos) }],
      }),
    });
    const data = await response.json();
    const texto = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let insights = [];
    try { insights = JSON.parse(texto).insights || []; } catch (_) { insights = []; }

    if (insights.length === 0) {
      return res.status(200).json({ ok: true, enviado: false, motivo: 'IA no encontró nada notable', candidatos: candidatos.length });
    }

    await fetch(`https://${req.headers.host}/api/notificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Chat-Secret': process.env.CHAT_API_SECRET },
      body: JSON.stringify({ tipo: 'analisis_diario', datos: { insights } }),
    });

    return res.status(200).json({ ok: true, enviado: true, insights: insights.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
