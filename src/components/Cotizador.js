import { useState } from 'react';
import { calcularCosto, TINTA_OPCIONES } from '../lib/costos';

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

export default function Cotizador({ onSalir }) {
  const [ancho,      setAncho]      = useState('2');
  const [largo,      setLargo]      = useState('100');
  const [cajas,      setCajas]      = useState('');
  const [rollosCaja, setRollosCaja] = useState('36');
  const [merma,      setMerma]      = useState('0');
  const [portaliche, setPortaliche] = useState('30.9');
  const [diseno,     setDiseno]     = useState('normal');
  const [colorKey,   setColorKey]   = useState('naranja');
  const [tipoCentro, setTipoCentro] = useState('2');
  const [stickyback, setStickyback] = useState(0);
  const [diasProd,   setDiasProd]   = useState(1);
  const [margen,     setMargen]     = useState(30);

  const anchoN      = parseFloat(ancho)    || 0;
  const largoN      = parseFloat(largo)    || 0;
  const cajasN      = parseInt(cajas)      || 0;
  const rollosCajaN = parseInt(rollosCaja) || 0;
  const mermaN      = parseInt(merma)      || 0;
  const clicheLargo = parseFloat(portaliche);
  const cobertura   = DISENOS.find(d => d.key === diseno)?.cob || 0.275;

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
  const tintaKg  = (impresiones * inkPerImpresion * INK_DENSITY * TRANSFER) / 1000;
  const solventeKg = cajasN > 0 ? (tintaKg * 0.5) + 0.600 : 0;

  const listo = anchoN > 0 && largoN > 0 && cajasN > 0 && rollosCajaN > 0;

  const costo = listo ? calcularCosto({
    rollosMP, tintaKg, solventeKg,
    cajas: cajasN, piezasBuenas,
    sticky: stickyback,
    diasProd, colorKey, tipoCentro,
  }) : null;
  const precioPieza = costo ? costo.porPieza * (1 + margen / 100) : 0;

  const fmt2 = n => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f14', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ background: '#12151f', borderBottom: '1px solid #1e2132', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onSalir} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>←</button>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 20, color: '#4be87a' }}>💰 Cotizador de Precio</div>
          <div style={{ fontSize: 11, color: '#545a78' }}>Costo por pieza y precio de venta</div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* Datos del pedido */}
        <div style={{ background: '#181b24', borderRadius: 14, padding: '16px', border: '1px solid #22263a', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#9aa0bc', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>DATOS DE LA CINTA</div>
          <div className="form-grid">
            <div className="field"><label>Ancho (")</label><input type="number" step="0.5" min="0.5" value={ancho} onChange={e => setAncho(e.target.value)} /></div>
            <div className="field"><label>Largo (m)</label><input type="number" value={largo} onChange={e => setLargo(e.target.value)} /></div>
            <div className="field"><label>Cajas</label><input type="number" value={cajas} onChange={e => setCajas(e.target.value)} placeholder="50" /></div>
            <div className="field"><label>Rollos / caja</label><input type="number" value={rollosCaja} onChange={e => setRollosCaja(e.target.value)} /></div>
            <div className="field"><label>Portacliché</label>
              <select value={portaliche} onChange={e => setPortaliche(e.target.value)}>
                {PORTALICHES.map(p => <option key={p.largo} value={p.largo}>{p.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Diseño</label>
              <select value={diseno} onChange={e => setDiseno(e.target.value)}>
                {DISENOS.map(d => <option key={d.key} value={d.key}>{d.label} ({Math.round(d.cob * 100)}%)</option>)}
              </select>
            </div>
            <div className="field full"><label>Merma estimada (piezas)</label><input type="number" value={merma} onChange={e => setMerma(e.target.value)} /></div>
          </div>
        </div>

        {/* Parámetros cotizador */}
        <div style={{ background: '#0d1a0d', borderRadius: 14, padding: '16px', border: '1px solid #1a3a1a', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#4be87a', fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>PARÁMETROS DE COSTO</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: '#545a78', marginBottom: 5 }}>Centro</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['2', '2"'], ['3', '3"']].map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setTipoCentro(k)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: `1.5px solid ${tipoCentro === k ? '#4be87a' : '#2a2d3a'}`, background: tipoCentro === k ? '#4be87a22' : 'transparent', color: tipoCentro === k ? '#4be87a' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#545a78', marginBottom: 5 }}>Stickybacks</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(n => (
                  <button key={n} type="button" onClick={() => setStickyback(n)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: `1.5px solid ${stickyback === n ? '#c9922a' : '#2a2d3a'}`, background: stickyback === n ? '#c9922a22' : 'transparent', color: stickyback === n ? '#c9922a' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#545a78', marginBottom: 5 }}>Días prod.</div>
              <input type="number" min="1" value={diasProd} onChange={e => setDiasProd(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: '100%', background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 6, padding: '6px 8px', color: '#e0e0e0', fontSize: 13 }} />
            </div>
          </div>

          {/* Color tinta */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#545a78', marginBottom: 6 }}>Color de tinta</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[...TINTA_OPCIONES, { key: '', label: 'Otro', color: '#9aa0bc', precio: null }].map(t => (
                <button key={t.key} type="button" onClick={() => setColorKey(t.key)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${colorKey === t.key ? t.color : '#2a2d3a'}`, background: colorKey === t.key ? t.color + '22' : 'transparent', color: colorKey === t.key ? t.color : '#555', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                  {t.label}{t.precio ? ` $${t.precio}` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* % Ganancia */}
          <div>
            <div style={{ fontSize: 10, color: '#545a78', marginBottom: 5 }}>% Ganancia</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[10, 20, 30, 40, 50].map(v => (
                <button key={v} type="button" onClick={() => setMargen(v)}
                  style={{ padding: '5px 10px', borderRadius: 8, border: `1.5px solid ${margen === v ? '#4be87a' : '#2a2d3a'}`, background: margen === v ? '#4be87a22' : 'transparent', color: margen === v ? '#4be87a' : '#555', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  {v}%
                </button>
              ))}
              <input type="number" min="0" max="500" value={margen} onChange={e => setMargen(Number(e.target.value) || 0)}
                style={{ width: 64, background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 6, padding: '5px 8px', color: '#e0e0e0', fontSize: 13 }} />
            </div>
          </div>
        </div>

        {/* Resultados */}
        {listo && costo ? (
          <>
            {/* MP / Tinta / Solvente */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ background: 'rgba(75,143,232,0.1)', border: '1px solid rgba(75,143,232,0.25)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, marginBottom: 4 }}>ROLLOS MP</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{rollosMP}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>exacto {rollosExacto.toFixed(1)}</div>
              </div>
              <div style={{ background: 'rgba(201,146,42,0.1)', border: '1px solid rgba(201,146,42,0.25)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#c9922a', fontWeight: 700, marginBottom: 4 }}>TINTA</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#c9922a', lineHeight: 1 }}>{tintaKg.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>kg</div>
              </div>
              <div style={{ background: 'rgba(75,143,232,0.06)', border: '1px solid rgba(75,143,232,0.15)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, marginBottom: 4 }}>SOLVENTE</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{solventeKg.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>kg</div>
              </div>
            </div>

            {/* Desglose de costos */}
            <div style={{ background: '#181b24', borderRadius: 14, padding: '16px', border: '1px solid #22263a', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#9aa0bc', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>DESGLOSE DE COSTOS</div>
              {[
                [`MP (${rollosMP} rollos)`,                          costo.mp],
                [`Tinta (${tintaKg.toFixed(3)} kg)`,                costo.tinta],
                [`Solvente (${solventeKg.toFixed(3)} kg)`,           costo.solvente],
                [`Cajas (${cajasN})`,                                costo.cajas],
                [`Centros ${tipoCentro}" (${piezasBuenas} pzas)`,   costo.centros],
                stickyback > 0 ? [`Stickyback ×${stickyback}`,      costo.stickyback] : null,
                [`Fijo (${diasProd} día${diasProd !== 1 ? 's' : ''}: mano obra + mant. + luz)`, costo.fijo],
              ].filter(Boolean).map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #13161e', fontSize: 13 }}>
                  <span style={{ color: '#545a78' }}>{lbl}</span>
                  <span style={{ color: '#9aa0bc' }}>${fmt2(val)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 14, fontWeight: 700 }}>
                <span style={{ color: '#e0e0e0' }}>Total corrida</span>
                <span style={{ color: '#e0e0e0' }}>${fmt2(costo.total)}</span>
              </div>
            </div>

            {/* Resultado costo / precio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#0a0c10', borderRadius: 14, padding: '18px 12px', textAlign: 'center', border: '1px solid #1e2132' }}>
                <div style={{ fontSize: 11, color: '#545a78', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>COSTO / PIEZA</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#e0e0e0', lineHeight: 1 }}>${costo.porPieza.toFixed(4)}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 4 }}>{piezasBuenas.toLocaleString()} piezas</div>
              </div>
              <div style={{ background: '#07140a', borderRadius: 14, padding: '18px 12px', textAlign: 'center', border: '2px solid #1a4a1a' }}>
                <div style={{ fontSize: 11, color: '#4be87a', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>PRECIO +{margen}%</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#4be87a', lineHeight: 1 }}>${precioPieza.toFixed(4)}</div>
                <div style={{ fontSize: 10, color: '#2a6a2a', marginTop: 4 }}>Ganancia ${fmt2(costo.total * margen / 100)}</div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 14, padding: 30 }}>
            Llena los datos de la cinta para ver el cotizador
          </div>
        )}
      </div>
    </div>
  );
}
