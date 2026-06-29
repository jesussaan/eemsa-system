import { useState, useMemo } from 'react';

const MP_ANCHO = 6;
const MP_LARGO = 914;

export default function CalculadoraProduccion({ pedidos, onClose }) {
  const [ancho,       setAncho]       = useState('2');
  const [largo,       setLargo]       = useState('100');
  const [cajas,       setCajas]       = useState('');
  const [rollosCaja,  setRollosCaja]  = useState('36');
  const [merma,       setMerma]       = useState('');

  // Ratios históricos de pedidos terminados
  const { ratioTinta, ratioAlcohol, ratioDias } = useMemo(() => {
    const term = pedidos.filter(p => p.status === 'terminado' && Number(p.piezas_prod) > 0);
    const conTinta    = term.filter(p => p.tinta_kg);
    const conAlcohol  = term.filter(p => p.alcohol_litros);
    const conTiempo   = term.filter(p => p.fecha_inicio && p.fecha_termino);

    const avg = (arr, fn) => arr.length ? arr.reduce((s, p) => s + fn(p), 0) / arr.length : null;

    return {
      ratioTinta:   avg(conTinta,   p => Number(p.tinta_kg)       / Number(p.piezas_prod)),
      ratioAlcohol: avg(conAlcohol, p => Number(p.alcohol_litros) / Number(p.piezas_prod)),
      ratioDias:    avg(conTiempo,  p => {
        const dias = (new Date(p.fecha_termino + 'T12:00:00') - new Date(p.fecha_inicio + 'T12:00:00')) / 86400000 + 1;
        return dias / Number(p.piezas_prod);
      }),
    };
  }, [pedidos]);

  const anchoN      = parseFloat(ancho)     || 0;
  const largoN      = parseFloat(largo)     || 0;
  const cajasN      = parseInt(cajas)       || 0;
  const rollosCajaN = parseInt(rollosCaja)  || 0;
  const mermaN      = parseInt(merma)       || 0;

  const largoReal    = largoN > 4 ? largoN - 4 : largoN;
  const pistas       = anchoN > 0 ? Math.floor(MP_ANCHO / anchoN) : 0;
  const rollosPista  = largoReal > 0 ? Math.floor(MP_LARGO / largoReal) : 0;
  const rendimiento  = pistas * rollosPista;
  const piezasBuenas = cajasN * rollosCajaN;
  const piezasTotal  = piezasBuenas + mermaN;
  const rollosMP     = rendimiento > 0 ? Math.ceil(piezasTotal / rendimiento) : 0;
  const tintaEst     = ratioTinta   ? (piezasTotal * ratioTinta).toFixed(2)   : null;
  const alcoholEst   = ratioAlcohol ? (piezasTotal * ratioAlcohol).toFixed(2) : null;
  const diasEst      = ratioDias    ? Math.ceil(piezasTotal * ratioDias)       : null;

  const listo = anchoN > 0 && largoN > 0 && cajasN > 0 && rollosCajaN > 0;

  const row = (label, value, color = '#fff', big = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #13161e' }}>
      <span style={{ fontSize: 13, color: '#9aa0bc' }}>{label}</span>
      <span style={{ fontSize: big ? 22 : 15, fontWeight: big ? 900 : 700, color }}>{value}</span>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#181b24', borderRadius: 18, padding: 24, width: '100%', maxWidth: 440, border: '1px solid #2d3249', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 20, color: '#e8b84b' }}>🧮 Calculadora de Producción</div>
            <div style={{ fontSize: 11, color: '#545a78', marginTop: 3 }}>MP: {MP_ANCHO}" × {MP_LARGO}m por rollo · corte − 4m</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Inputs */}
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
          <div className="field full">
            <label>Merma esperada (piezas)</label>
            <input type="number" value={merma} onChange={e => setMerma(e.target.value)} placeholder="0 — opcional" />
          </div>
        </div>

        {/* Resultados */}
        {listo && (
          <div style={{ marginTop: 18, background: '#0e1018', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e2132' }}>

            {/* Desglose del cálculo */}
            <div style={{ fontSize: 11, color: '#545a78', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>DESGLOSE</div>
            <div style={{ fontSize: 12, color: '#545a78', lineHeight: 2 }}>
              <span style={{ color: '#3a3f5a' }}>Largo real de corte: </span>
              <span style={{ color: '#9aa0bc' }}>{largoN}m − 4m = <strong>{largoReal}m</strong></span>
              <br />
              <span style={{ color: '#3a3f5a' }}>Pistas de ancho: </span>
              <span style={{ color: '#9aa0bc' }}>{MP_ANCHO}" ÷ {anchoN}" = <strong>{pistas} pistas</strong></span>
              <br />
              <span style={{ color: '#3a3f5a' }}>Rollos por pista: </span>
              <span style={{ color: '#9aa0bc' }}>{MP_LARGO}m ÷ {largoReal}m = <strong>{rollosPista} rollos</strong></span>
              <br />
              <span style={{ color: '#3a3f5a' }}>Rendimiento por rollo MP: </span>
              <span style={{ color: '#9aa0bc' }}>{pistas} × {rollosPista} = <strong>{rendimiento} piezas</strong></span>
            </div>

            {/* Resultados */}
            <div style={{ borderTop: '1px solid #1e2132', marginTop: 12, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: '#545a78', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>RESULTADO</div>
              {row('Piezas buenas', piezasBuenas.toLocaleString())}
              {mermaN > 0 && row('+ Merma esperada', `+${mermaN}`, '#ff9900')}
              {row('Total a producir', piezasTotal.toLocaleString(), '#e8b84b')}

              <div style={{ background: 'rgba(75,142,232,0.1)', border: '1px solid rgba(75,142,232,0.25)', borderRadius: 10, padding: '12px 14px', margin: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#4b8fe8', fontWeight: 700, fontSize: 14 }}>🎯 Rollos de MP necesarios</span>
                <span style={{ color: '#4b8fe8', fontWeight: 900, fontSize: 28 }}>{rollosMP}</span>
              </div>

              {tintaEst   && row('🎨 Tinta estimada',   `${tintaEst} kg`,  '#c9922a')}
              {alcoholEst && row('🧴 Alcohol estimado', `${alcoholEst} L`, '#c9922a')}
              {diasEst    && row('⏱ Tiempo estimado',   `${diasEst} días`, '#4be87a')}

              {!tintaEst && !alcoholEst && (
                <div style={{ fontSize: 11, color: '#3a3f5a', marginTop: 10, textAlign: 'center' }}>
                  Sin historial suficiente para estimar tinta y alcohol
                </div>
              )}
            </div>
          </div>
        )}

        {!listo && (
          <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, marginTop: 20, padding: 16 }}>
            Llena ancho, largo, cajas y rollos/caja para ver el cálculo
          </div>
        )}
      </div>
    </div>
  );
}
