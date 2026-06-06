import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const DEST = 'jeduardosl@eemsa.com.mx';
const FROM = 'EEMSA System <onboarding@resend.dev>';

const estilos = `
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 10px; padding: 24px; max-width: 480px; margin: 0 auto; border-top: 4px solid #c9922a; }
  .titulo { color: #c9922a; font-size: 20px; font-weight: bold; margin-bottom: 16px; }
  .fila { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .lbl { color: #888; font-size: 13px; }
  .val { font-weight: bold; font-size: 14px; color: #222; }
  .pie { margin-top: 20px; font-size: 11px; color: #aaa; text-align: center; }
`;

const fila = (lbl, val) => val ? `<div class="fila"><span class="lbl">${lbl}</span><span class="val">${val}</span></div>` : '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { tipo, datos } = req.body;
  let subject = '', html = '';

  if (tipo === 'pedido_finalizado') {
    subject = `✅ Pedido #${datos.num} finalizado — ${datos.cliente}`;
    html = `<style>${estilos}</style>
    <div class="card">
      <div class="titulo">✅ Pedido finalizado</div>
      ${fila('No. Pedido', datos.num)}
      ${fila('Cliente', datos.cliente)}
      ${fila('Medida', datos.medida)}
      ${fila('Tipo', datos.tipo)}
      ${fila('Cajas', datos.cajas)}
      ${fila('Merma', datos.merma_pct ? datos.merma_pct + '%' : null)}
      ${fila('Rollos usados', datos.rollos_usados)}
      ${fila('Tinta (kg)', datos.tinta_kg)}
      ${fila('Alcohol (L)', datos.alcohol_litros)}
      ${fila('Notas', datos.notas)}
      <div class="pie">EEMSA System · ${new Date().toLocaleString('es-MX')}</div>
    </div>`;

  } else if (tipo === 'pedidos_vencidos') {
    subject = `⚠️ ${datos.pedidos.length} pedido(s) vencido(s) — EEMSA`;
    const filas = datos.pedidos.map(p =>
      `<div class="fila"><span class="lbl">#${p.num} — ${p.cliente}</span><span class="val" style="color:#ff4d4d">${Math.abs(p.dias)} día(s) vencido</span></div>`
    ).join('');
    html = `<style>${estilos}</style>
    <div class="card">
      <div class="titulo">⚠️ Pedidos vencidos</div>
      ${filas}
      <div class="pie">EEMSA System · ${new Date().toLocaleString('es-MX')}</div>
    </div>`;
  } else {
    return res.status(400).json({ error: 'tipo desconocido' });
  }

  try {
    await resend.emails.send({ from: FROM, to: DEST, subject, html });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
