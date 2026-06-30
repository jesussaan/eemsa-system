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

// Parsea "2\"×100m", "2x100", "1.5" x 50m", etc.
const parseMedida = (medida) => {
  if (!medida) return {};
  const m = String(medida).match(/(\d+(?:\.\d+)?)[^0-9.]*?[xX×][^0-9.]*?(\d+(?:\.\d+)?)/);
  return m ? { ancho: m[1], largo: m[2] } : {};
};

export default function CalculadoraProduccion({ pedidos, onClose, pedidoInicial, onConfirmar, inline }) {
  const ini = pedidoInicial ? parseMedida(pedidoInicial.medida) : {};

  const [ancho,      setAncho]      = useState(ini.ancho || '2');
  const [largo,      setLargo]      = useState(ini.largo || '100');
  const [cajas,      setCajas]      = useState(pedidoInicial?.cajas ? String(pedidoInicial.cajas) : '');
  const [rollosCaja, setRollosCaja] = useState(pedidoInicial?.rollos_caja ? String(pedidoInicial.rollos_caja) : '36');
  const [merma,      setMerma]      = useState('');
  const [portaliche, setPortaliche] = useState('30.9');
  const [diseno,     setDiseno]     = useState('normal');

  // Campos reales — solo visibles en flujo de finalizar
  const [piezasProd, setPiezasProd] = useState('');
  const [mermaReal,  setMermaReal]  = useState('');
  const [notasFin,   setNotasFin]   = useState('');

  const calcSolvente = (tintaKgVal) => (tintaKgVal * 0.5) + 0.600;

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
    ? (piezasTotal * largoRealCm) / (clicheLargo * PISTAS)
    : 0;
  const tintaCm3        = impresiones * inkPerImpresion;
  const tintaKg         = (tintaCm3 * INK_DENSITY * TRANSFER) / 1000;

  const listo      = anchoN > 0 && largoN > 0 && cajasN > 0 && rollosCajaN > 0;
  const solventeKg = listo ? calcSolvente(tintaKg) : null;

  const Row = ({ label, value, color = '#fff', sub }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #13161e' }}>
      <div>
        <span style={{ fontSize: 13, color: '#9aa0bc' }}>{label}</span>
        {sub && <div style={{ fontSize: 10, color: '#3a3f5a' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
    </div>
  );

  const mermaPct = piezasProd && mermaReal && Number(piezasProd) > 0
    ? ((Number(mermaReal) / Number(piezasProd)) * 100).toFixed(2)
    : null;

  const content = (
    <div
      style={{
        background: '#181b24',
        borderRadius: inline ? 0 : 18,
        padding: inline ? '0 0 24px' : 24,
        width: '100%',
        maxWidth: inline ? '100%' : 460,
        border: inline ? 'none' : '1px solid #2d3249',
        boxShadow: inline ? 'none' : '0 8px 40px rgba(0,0,0,0.6)',
        ...(inline ? {} : { maxHeight: '94vh', overflowY: 'auto' }),
      }}
      onClick={inline ? undefined : e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 20, color: onConfirmar ? '#4be87a' : '#e8b84b' }}>
            {onConfirmar ? '✅ Finalizar pedido' : '🧮 Calculadora de Producción'}
          </div>
          {pedidoInicial && (
            <div style={{ fontSize: 13, color: '#c9922a', fontWeight: 700, marginTop: 2 }}>
              {pedidoInicial.cliente} · {pedidoInicial.medida}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#545a78', marginTop: 3 }}>
            MP {MP_ANCHO}" × {MP_LARGO}m · Anilox 250 LPI / 4.5 BCM · −4m por rollo
          </div>
        </div>
        {!inline && onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Inputs de producción */}
      <div className="form-grid">
        <div className="field">
          <label>Ancho del producto (")</label>
          <input type="number" step="0.5" min="0.5" value={ancho} onChange={e => setAncho(e.target.value)} placeholder="2" />
        </div>
        <div className="field">
          <label>Largo del pedido (m)</label>
          <input type="number" value={largo} onChange={e => setLargo(e.target.value)} placeholder="100" />
        </div>
        <div className="field">
          <label>Cajas</label>
          <input type="number" value={cajas} onChange={e => setCajas(e.target.value)} placeholder="50" />
        </div>
        <div className="field">
          <label>Rollos por caja</label>
          <input type="number" value={rollosCaja} onChange={e => setRollosCaja(e.target.value)} placeholder="36" />
        </div>
        <div className="field">
          <label>Portacliché</label>
          <select value={portaliche} onChange={e => setPortaliche(e.target.value)}>
            {PORTALICHES.map(p => <option key={p.largo} value={p.largo}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Tipo de diseño</label>
          <select value={diseno} onChange={e => setDiseno(e.target.value)}>
            {DISENOS.map(d => <option key={d.key} value={d.key}>{d.label} ({Math.round(d.cob * 100)}%)</option>)}
          </select>
        </div>
        <div className="field full">
          <label>Merma esperada (piezas) — opcional</label>
          <input type="number" value={merma} onChange={e => setMerma(e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* Resultados calculados */}
      {listo && (
        <div style={{ marginTop: 18, background: '#0e1018', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e2132' }}>
          <div style={{ fontSize: 11, color: '#545a78', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>DESGLOSE</div>
          <div style={{ fontSize: 12, color: '#545a78', lineHeight: 2.1, marginBottom: 10 }}>
            <span style={{ color: '#3a3f5a' }}>Largo real: </span>
            <span style={{ color: '#9aa0bc' }}>{largoN}m − 4m = <strong style={{ color: '#c9c9c9' }}>{largoReal}m</strong></span><br />
            <span style={{ color: '#3a3f5a' }}>Pistas: </span>
            <span style={{ color: '#9aa0bc' }}>{MP_ANCHO}" ÷ {anchoN}" = <strong style={{ color: '#c9c9c9' }}>{pistas}</strong></span><br />
            <span style={{ color: '#3a3f5a' }}>Rollos por pista: </span>
            <span style={{ color: '#9aa0bc' }}>{MP_LARGO}m ÷ {largoReal}m = <strong style={{ color: '#c9c9c9' }}>{rollosPista}</strong></span><br />
            <span style={{ color: '#3a3f5a' }}>Rendimiento/rollo MP: </span>
            <span style={{ color: '#9aa0bc' }}>{pistas} × {rollosPista} = <strong style={{ color: '#c9c9c9' }}>{rendimiento} piezas</strong></span><br />
            <span style={{ color: '#3a3f5a' }}>Área cliché: </span>
            <span style={{ color: '#9aa0bc' }}>{CLICHE_W} × {clicheLargo} = <strong style={{ color: '#c9c9c9' }}>{clicheArea.toFixed(2)} cm²</strong></span><br />
            <span style={{ color: '#3a3f5a' }}>Cobertura: </span>
            <span style={{ color: '#9aa0bc' }}><strong style={{ color: '#c9c9c9' }}>{Math.round(cobertura * 100)}%</strong> ({disenoObj?.label})</span>
          </div>

          <div style={{ borderTop: '1px solid #1e2132', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: '#545a78', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>ESTIMADOS</div>

            <Row label="Piezas buenas"    value={piezasBuenas.toLocaleString()} />
            {mermaN > 0 && <Row label="+ Merma esperada" value={`+${mermaN}`} color="#ff9900" />}
            <Row label="Total a producir" value={`${piezasTotal.toLocaleString()} piezas`} color="#e8b84b" />

            {/* Rollos MP */}
            <div style={{ background: 'rgba(75,142,232,0.1)', border: '1px solid rgba(75,142,232,0.25)', borderRadius: 10, padding: '12px 14px', margin: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#4b8fe8', fontWeight: 700, fontSize: 14 }}>🎯 Rollos de MP</div>
                  <div style={{ fontSize: 11, color: '#3a3f5a', marginTop: 2 }}>exacto: {rollosExacto.toFixed(2)}</div>
                </div>
                <span style={{ color: '#4b8fe8', fontWeight: 900, fontSize: 30 }}>{rollosMP}</span>
              </div>
            </div>

            {/* Tinta */}
            <div style={{ background: 'rgba(201,146,42,0.08)', border: '1px solid rgba(201,146,42,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#c9922a', fontWeight: 700, fontSize: 14 }}>🎨 Tinta estimada</div>
                  <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>
                    {impresiones.toFixed(0)} impresiones · {tintaCm3.toFixed(1)} cm³ · 50% transferencia
                  </div>
                </div>
                <span style={{ color: '#c9922a', fontWeight: 900, fontSize: 26 }}>{tintaKg.toFixed(3)} kg</span>
              </div>
            </div>

            {/* Solvente */}
            {solventeKg !== null && (
              <div style={{ background: 'rgba(75,143,232,0.06)', border: '1px solid rgba(75,143,232,0.15)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#4b8fe8', fontWeight: 700, fontSize: 14 }}>🧴 Solvente estimado</div>
                    <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>
                      dilución: {(tintaKg * 0.5).toFixed(3)} kg + lavado: 0.600 kg
                    </div>
                  </div>
                  <span style={{ color: '#4b8fe8', fontWeight: 900, fontSize: 26 }}>{solventeKg.toFixed(3)} kg</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!listo && !onConfirmar && (
        <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, marginTop: 20, padding: 16 }}>
          Llena ancho, largo, cajas y rollos/caja para ver el cálculo
        </div>
      )}

      {/* ── Sección de datos reales + confirmar (solo flujo finalizar) ── */}
      {onConfirmar && (
        <div style={{ marginTop: 20, background: '#0e1018', borderRadius: 12, padding: '14px 16px', border: '1px solid #1c3a2a' }}>
          <div style={{ fontSize: 11, color: '#4be87a', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
            DATOS REALES DE LA CORRIDA
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Piezas producidas (real)</label>
              <input type="number" placeholder="1800" value={piezasProd} onChange={e => setPiezasProd(e.target.value)} />
            </div>
            <div className="field">
              <label>Merma real (piezas)</label>
              <input type="number" placeholder="0" value={mermaReal} onChange={e => setMermaReal(e.target.value)} />
            </div>
            {mermaPct !== null && (
              <div className="field">
                <label>% Merma real</label>
                <input
                  readOnly
                  value={mermaPct + "%"}
                  style={{ background: "#1a2744", color: Number(mermaPct) > 3 ? "#ff4d4d" : "#4be87a" }}
                />
              </div>
            )}
            <div className="field full">
              <label>Observaciones</label>
              <textarea placeholder="Notas del pedido…" value={notasFin} onChange={e => setNotasFin(e.target.value)} />
            </div>
          </div>

          {!listo && (
            <div style={{ fontSize: 12, color: '#ff9900', textAlign: 'center', padding: '8px 0 4px' }}>
              ⚠ Completa ancho, largo, cajas y rollos/caja arriba para calcular
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            disabled={!listo}
            style={{ padding: '14px 0', fontSize: 15, marginTop: 10, opacity: listo ? 1 : 0.4 }}
            onClick={() => onConfirmar({
              rollosMP,
              tintaKg,
              solventeKg,
              piezasProd: piezasProd !== "" ? Number(piezasProd) : null,
              mermaReal:  mermaReal  !== "" ? Number(mermaReal)  : null,
              mermaPct:   mermaPct,
              notas:      notasFin || null,
            })}
          >
            ✅ Confirmar y enviar a Emilio
          </button>
        </div>
      )}
    </div>
  );

  if (inline) return content;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      {content}
    </div>
  );
}
