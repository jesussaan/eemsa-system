import { useState } from 'react';

const MP_ANCHO    = 6;
const MP_LARGO    = 914;
const CLICHE_W    = 14.4;
const BCM_RATE    = 0.000698;
const INK_DENSITY = 1.0;
const TRANSFER    = 0.50;
const PISTAS      = 3;

const PORTALICHES = [
  { largo: 30.9, label: '30.9 cm' },
  { largo: 25.4, label: '25.4 cm' },
  { largo: 29.0, label: '29.0 cm' },
];

const DISENOS = [
  { key: 'chica',   label: 'Letra chica',            cob: 0.125 },
  { key: 'normal',  label: 'Letra normal',            cob: 0.275 },
  { key: 'grande',  label: 'Letra grande',            cob: 0.450 },
  { key: 'relleno', label: 'Relleno completo + logo', cob: 0.825 },
];

export default function CalculadoraProduccion({ pedidos, onClose, pedidoInicial, onConfirmar, inline }) {
  const [ancho,      setAncho]      = useState(pedidoInicial?.ancho       ? String(pedidoInicial.ancho)       : '2');
  const [largo,      setLargo]      = useState(pedidoInicial?.largo       ? String(pedidoInicial.largo)       : '100');
  const [cajas,      setCajas]      = useState(pedidoInicial?.cajas       ? String(pedidoInicial.cajas)       : '');
  const [rollosCaja, setRollosCaja] = useState(pedidoInicial?.rollos_caja ? String(pedidoInicial.rollos_caja) : '36');
  const [merma,      setMerma]      = useState('');
  const [portaliche, setPortaliche] = useState('30.9');
  const [diseno,     setDiseno]     = useState('normal');

  // Datos reales (flujo finalizar)
  const [piezasProd, setPiezasProd] = useState('');
  const [mermaReal,  setMermaReal]  = useState('');
  const [stickyback, setStickyback] = useState(null);
  const [verDesglose, setVerDesglose] = useState(false);

  // Cálculos producción
  const anchoN      = parseFloat(ancho)    || 0;
  const largoN      = parseFloat(largo)    || 0;
  const cajasN      = parseInt(cajas)      || 0;
  const rollosCajaN = parseInt(rollosCaja) || 0;
  const mermaN      = parseInt(merma)      || 0;
  const clicheLargo = parseFloat(portaliche);
  const disenoObj   = DISENOS.find(d => d.key === diseno);
  const cobertura   = disenoObj?.cob || 0.275;

  const largoReal    = largoN > 4 ? largoN - 4 : largoN;
  const pistas       = anchoN > 0 ? Math.floor(MP_ANCHO / anchoN) : 0;
  const rollosPista  = largoReal > 0 ? Math.floor(MP_LARGO / largoReal) : 0;
  const rendimiento  = pistas * rollosPista;
  const piezasBuenas = cajasN * rollosCajaN;
  const piezasTotal  = piezasBuenas + mermaN;
  const rollosExacto = rendimiento > 0 ? piezasTotal / rendimiento : 0;
  const rollosMP     = Math.ceil(rollosExacto);

  const clicheArea      = CLICHE_W * clicheLargo;
  const inkPerImpresion = clicheArea * BCM_RATE * cobertura;
  const largoRealCm     = largoReal * 100;
  const impresiones     = piezasTotal > 0 && clicheLargo > 0
    ? (piezasTotal * largoRealCm) / (clicheLargo * PISTAS) : 0;
  const tintaCm3 = impresiones * inkPerImpresion;
  const tintaKg  = (tintaCm3 * INK_DENSITY * TRANSFER) / 1000;

  const listo      = anchoN > 0 && largoN > 0 && cajasN > 0 && rollosCajaN > 0;
  const solventeKg = listo ? (tintaKg * 0.5) + 0.600 : 0;

  const mermaPct = piezasProd && mermaReal && Number(piezasProd) > 0
    ? ((Number(mermaReal) / Number(piezasProd)) * 100).toFixed(2) : null;

  const fmt2 = n => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const content = (
    <div
      style={{ background: '#181b24', borderRadius: inline ? 0 : 18, padding: inline ? '0 0 24px' : 24, width: '100%', maxWidth: inline ? '100%' : 460, border: inline ? 'none' : '1px solid #2d3249', boxShadow: inline ? 'none' : '0 8px 40px rgba(0,0,0,0.6)', ...(inline ? {} : { maxHeight: '94vh', overflowY: 'auto' }) }}
      onClick={inline ? undefined : e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 20, color: onConfirmar ? '#4be87a' : '#e8b84b' }}>
            {onConfirmar ? '✅ Finalizar pedido' : '🧮 Calculadora de Producción'}
          </div>
          {pedidoInicial && <div style={{ fontSize: 13, color: '#c9922a', fontWeight: 700, marginTop: 2 }}>{pedidoInicial.cliente} · {pedidoInicial.medida}</div>}
          <div style={{ fontSize: 11, color: '#545a78', marginTop: 3 }}>MP {MP_ANCHO}" × {MP_LARGO}m · Anilox 250 LPI / 4.5 BCM · −4m por rollo</div>
        </div>
        {!inline && onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>}
      </div>

      {/* Formulario unificado */}
      <div className="form-grid">
        <div className="field"><label>Ancho (")</label><input type="number" step="0.5" min="0.5" value={ancho} onChange={e => setAncho(e.target.value)} placeholder="2" /></div>
        <div className="field"><label>Largo (m)</label><input type="number" value={largo} onChange={e => setLargo(e.target.value)} placeholder="100" /></div>
        <div className="field"><label>Cajas</label><input type="number" value={cajas} onChange={e => setCajas(e.target.value)} placeholder="50" /></div>
        <div className="field"><label>Rollos / caja</label><input type="number" value={rollosCaja} onChange={e => setRollosCaja(e.target.value)} placeholder="36" /></div>
        <div className="field"><label>Portacliché</label><select value={portaliche} onChange={e => setPortaliche(e.target.value)}>{PORTALICHES.map(p => <option key={p.largo} value={p.largo}>{p.label}</option>)}</select></div>
        <div className="field"><label>Diseño</label><select value={diseno} onChange={e => setDiseno(e.target.value)}>{DISENOS.map(d => <option key={d.key} value={d.key}>{d.label} ({Math.round(d.cob * 100)}%)</option>)}</select></div>
        <div className="field full"><label>Merma esperada (piezas)</label><input type="number" value={merma} onChange={e => setMerma(e.target.value)} placeholder="0" /></div>

        {onConfirmar && (<>
          <div className="field full" style={{ borderTop: '1px solid #1e2132', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: '#4be87a', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>DATOS REALES DE LA CORRIDA</div>
          </div>
          <div className="field"><label>Piezas producidas</label><input type="number" placeholder="1800" value={piezasProd} onChange={e => setPiezasProd(e.target.value)} /></div>
          <div className="field"><label>Merma real (piezas)</label><input type="number" placeholder="0" value={mermaReal} onChange={e => setMermaReal(e.target.value)} /></div>
          {mermaPct !== null && (
            <div className="field"><label>% Merma real</label><input readOnly value={mermaPct + "%"} style={{ background: "#1a2744", color: Number(mermaPct) > 3 ? "#ff4d4d" : "#4be87a" }} /></div>
          )}
          <div className="field">
            <label>Stickybacks</label>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {[1, 2].map(n => (
                <button key={n} type="button" onClick={() => setStickyback(stickyback === n ? null : n)}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "2px solid", borderColor: stickyback === n ? "#c9922a" : "#2a2d3a", background: stickyback === n ? "#c9922a22" : "transparent", color: stickyback === n ? "#c9922a" : "#555", fontWeight: 900, fontSize: 16, cursor: "pointer", transition: "all .15s" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>)}
      </div>

      {/* Resultados */}
      {listo ? (
        <div style={{ marginTop: 18 }}>
          {/* 3 números grandes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'rgba(75,142,232,0.12)', border: '1px solid rgba(75,142,232,0.3)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, letterSpacing: '.05em', marginBottom: 4 }}>ROLLOS MP</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{rollosMP}</div>
              <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 3 }}>exacto {rollosExacto.toFixed(1)}</div>
            </div>
            <div style={{ background: 'rgba(201,146,42,0.1)', border: '1px solid rgba(201,146,42,0.25)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#c9922a', fontWeight: 700, letterSpacing: '.05em', marginBottom: 4 }}>TINTA</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#c9922a', lineHeight: 1 }}>{tintaKg.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 3 }}>kg</div>
            </div>
            <div style={{ background: 'rgba(75,143,232,0.07)', border: '1px solid rgba(75,143,232,0.18)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, letterSpacing: '.05em', marginBottom: 4 }}>SOLVENTE</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{solventeKg.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 3 }}>kg</div>
            </div>
          </div>

          {/* Toggle desglose fórmulas */}
          <button type="button" onClick={() => setVerDesglose(v => !v)}
            style={{ width: '100%', background: 'transparent', border: '1px solid #1e2132', borderRadius: 8, color: '#545a78', fontSize: 12, padding: '7px 0', cursor: 'pointer', marginBottom: verDesglose ? 8 : 12 }}>
            {verDesglose ? '▲ Ocultar desglose' : '▼ Ver desglose de fórmulas'}
          </button>

          {verDesglose && (
            <div style={{ background: '#0e1018', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e2132', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#545a78', lineHeight: 2.1, marginBottom: 10 }}>
                <span style={{ color: '#3a3f5a' }}>Largo real: </span><span style={{ color: '#9aa0bc' }}>{largoN}m − 4m = <strong style={{ color: '#c9c9c9' }}>{largoReal}m</strong></span><br />
                <span style={{ color: '#3a3f5a' }}>Pistas: </span><span style={{ color: '#9aa0bc' }}>{MP_ANCHO}" ÷ {anchoN}" = <strong style={{ color: '#c9c9c9' }}>{pistas}</strong></span><br />
                <span style={{ color: '#3a3f5a' }}>Rollos/pista: </span><span style={{ color: '#9aa0bc' }}>{MP_LARGO}m ÷ {largoReal}m = <strong style={{ color: '#c9c9c9' }}>{rollosPista}</strong></span><br />
                <span style={{ color: '#3a3f5a' }}>Rend./rollo MP: </span><span style={{ color: '#9aa0bc' }}>{pistas} × {rollosPista} = <strong style={{ color: '#c9c9c9' }}>{rendimiento} pzas</strong></span>
              </div>
              <div style={{ borderTop: '1px solid #1e2132', paddingTop: 8, fontSize: 12 }}>
                {[[`Piezas buenas`, piezasBuenas.toLocaleString(), '#e0e0e0'], mermaN > 0 ? [`+ Merma esperada`, `+${mermaN}`, '#ff9900'] : null, [`Total a producir`, `${piezasTotal.toLocaleString()} pzas`, '#e8b84b']].filter(Boolean).map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #13161e' }}>
                    <span style={{ color: '#545a78' }}>{l}</span><span style={{ color: c, fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, marginTop: 20, padding: 16 }}>
          Llena ancho, largo, cajas y rollos/caja para ver el cálculo
        </div>
      )}

      {/* Botón confirmar */}
      {onConfirmar && (
        <button
          className="btn btn-primary btn-block"
          disabled={!listo}
          style={{ padding: '14px 0', fontSize: 15, marginTop: 16, opacity: listo ? 1 : 0.4 }}
          onClick={() => onConfirmar({
            rollosMP, tintaKg, solventeKg,
            piezasProd:  piezasProd !== "" ? Number(piezasProd) : null,
            mermaReal:   mermaReal  !== "" ? Number(mermaReal)  : null,
            mermaPct, stickyback,
          })}
        >
          ✅ Confirmar y enviar a Emilio
        </button>
      )}
    </div>
  );

  if (inline) return content;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      {content}
    </div>
  );
}
