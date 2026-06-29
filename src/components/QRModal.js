import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabase';

const BASE = 'https://eemsa-system.vercel.app';

export default function QRModal({ pedido, onClose }) {
  const [portalUrl, setPortalUrl] = useState(null);
  const [cargando, setCargando] = useState(true);
  const refOp  = useRef(null);
  const refCli = useRef(null);

  const urlOperador = `${BASE}/?modo=operador&pedido=${pedido.id}`;

  useEffect(() => {
    supabase.rpc('get_or_create_portal_token', { p_nombre: pedido.cliente })
      .then(({ data: token }) => { if (token) setPortalUrl(`${BASE}/cliente/${token}`); })
      .finally(() => setCargando(false));
  }, [pedido.cliente]);

  const descargar = (canvasRef, nombre) => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `${nombre}.png`;
    a.click();
  };

  const imprimir = () => {
    const imgOp  = refOp.current?.toDataURL('image/png') || '';
    const imgCli = refCli.current?.toDataURL('image/png') || '';
    const w = window.open('', '_blank', 'width=640,height=700');
    w.document.write(`<!DOCTYPE html><html><head>
      <title>QR Pedido #${pedido.num}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;text-align:center;background:#fff;color:#111}
        h2{margin:0 0 4px;font-size:20px} p{margin:2px 0;color:#555;font-size:13px}
        .qrs{display:flex;gap:32px;justify-content:center;margin:24px 0;flex-wrap:wrap}
        .blk{text-align:center} .blk h3{margin:0 0 10px;font-size:13px;font-weight:700}
        .blk img{width:176px;height:176px;border:1px solid #eee;border-radius:6px}
        .url{font-size:9px;color:#999;word-break:break-all;max-width:180px;margin-top:6px}
        footer{margin-top:20px;font-size:11px;color:#aaa}
      </style></head><body>
      <h2>EEMSA System · Pedido #${pedido.num}</h2>
      <p>${pedido.cliente} · ${pedido.medida || ''} · ${pedido.cajas} cajas · ${pedido.tipo || ''}</p>
      <div class="qrs">
        <div class="blk"><h3>🏭 Para el operador</h3><img src="${imgOp}"/><div class="url">${urlOperador}</div></div>
        ${portalUrl ? `<div class="blk"><h3>📦 Para el cliente</h3><img src="${imgCli}"/><div class="url">${portalUrl}</div></div>` : ''}
      </div>
      <footer>Impreso desde EEMSA System · ${new Date().toLocaleDateString('es-MX')}</footer>
      <script>window.onload=function(){window.print();window.close();}</script>
    </body></html>`);
    w.document.close();
  };

  const card = { textAlign: 'center', flex: '1 1 160px' };
  const qrWrap = { background: '#fff', borderRadius: 10, padding: 10, display: 'inline-block', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#181b24', borderRadius: 18, padding: 24, width: '100%', maxWidth: 460, border: '1px solid #2d3249', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 20, color: '#e8b84b' }}>QR · Pedido #{pedido.num}</div>
            <div style={{ fontSize: 12, color: '#9aa0bc', marginTop: 3 }}>{pedido.cliente} · {pedido.medida} · {pedido.cajas} cajas</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 24, cursor: 'pointer', lineHeight: 1, marginTop: -4 }}>✕</button>
        </div>

        {/* QR codes */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>

          {/* Operador */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4b8fe8', marginBottom: 10 }}>🏭 Para el operador</div>
            <div style={qrWrap}>
              <QRCodeCanvas ref={refOp} value={urlOperador} size={160} level="M" />
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => descargar(refOp, `QR_Operador_${pedido.num}`)}>⬇ Descargar PNG</button>
            </div>
            <div style={{ fontSize: 10, color: '#545a78', marginTop: 6 }}>Entra directo al pedido en ModoOperador</div>
          </div>

          {/* Cliente */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#4be87a', marginBottom: 10 }}>📦 Para el cliente</div>
            {cargando ? (
              <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#545a78', fontSize: 12, border: '1px solid #22263a', borderRadius: 10 }}>Generando…</div>
            ) : portalUrl ? (
              <>
                <div style={qrWrap}>
                  <QRCodeCanvas ref={refCli} value={portalUrl} size={160} level="M" />
                </div>
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => descargar(refCli, `QR_Cliente_${pedido.num}`)}>⬇ Descargar PNG</button>
                </div>
                <div style={{ fontSize: 10, color: '#545a78', marginTop: 6 }}>Ve el estatus del pedido en el portal</div>
              </>
            ) : (
              <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#545a78', fontSize: 12, border: '1px solid #22263a', borderRadius: 10, textAlign: 'center', padding: 12 }}>Sin portal configurado para este cliente</div>
            )}
          </div>
        </div>

        <button className="btn btn-primary btn-block" style={{ marginTop: 4 }} onClick={imprimir}>🖨️ Imprimir ambos QR</button>
      </div>
    </div>
  );
}
