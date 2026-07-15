import { useState, useEffect } from 'react';
import { calcularCosto, TINTA_OPCIONES, COSTOS } from '../lib/costos';
import { ENGOMADO_JUMBO_LARGO_M, ENGOMADO_PISTAS, ENGOMADO_MP_ROLLO_PRECIO } from '../lib/constants';
import { IcoCotizador } from './Icons';

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

const CAMPOS_COSTO = [
  { key: 'mp_rollo',          label: 'MP por rollo',          grupo: 'Materias primas',  prefix: '$' },
  { key: 'caja',              label: 'Caja',                  grupo: 'Materias primas',  prefix: '$' },
  { key: 'centro_2',          label: 'Centro 2"',             grupo: 'Materias primas',  prefix: '$' },
  { key: 'centro_3',          label: 'Centro 3"',             grupo: 'Materias primas',  prefix: '$' },
  { key: 'stickyback',        label: 'Stickyback',            grupo: 'Materias primas',  prefix: '$' },
  { key: 'solvente_litro',    label: 'Solvente (litro)',      grupo: 'Solvente',         prefix: '$' },
  { key: 'tinta_naranja',     label: 'Tinta naranja (kg)',    grupo: 'Tintas',           prefix: '$' },
  { key: 'tinta_azul',        label: 'Tinta azul (kg)',       grupo: 'Tintas',           prefix: '$' },
  { key: 'tinta_rojo',        label: 'Tinta rojo (kg)',       grupo: 'Tintas',           prefix: '$' },
  { key: 'tinta_negro',       label: 'Tinta negro (kg)',      grupo: 'Tintas',           prefix: '$' },
  { key: 'mano_obra_dia',     label: 'Mano de obra (día)',    grupo: 'Costos fijos/día', prefix: '$' },
  { key: 'mantenimiento_dia', label: 'Mantenimiento (día)',   grupo: 'Costos fijos/día', prefix: '$' },
  { key: 'luz_dia',           label: 'Luz (día)',             grupo: 'Costos fijos/día', prefix: '$' },
];

const DEFAULTS = {
  mp_rollo: COSTOS.mp_rollo, caja: COSTOS.caja, centro_2: COSTOS.centro_2,
  centro_3: COSTOS.centro_3, stickyback: COSTOS.stickyback,
  solvente_litro: COSTOS.solvente_litro,
  tinta_naranja: COSTOS.tinta.naranja, tinta_azul: COSTOS.tinta.azul,
  tinta_rojo: COSTOS.tinta.rojo, tinta_negro: COSTOS.tinta.negro,
  mano_obra_dia: COSTOS.mano_obra_dia, mantenimiento_dia: COSTOS.mantenimiento_dia,
  luz_dia: COSTOS.luz_dia,
};

export default function Cotizador({ onSalir }) {
  // Engomado: rollo de MP fijo (136mm x 685m, $900/rollo, corte real 6.8cm
  // aunque se venda como "3\""), sin toggle manual en Modo Operador porque
  // ahi se autodetecta del tipo del pedido -- aqui no hay pedido, asi que
  // se elige a mano.
  const [esEngomado, setEsEngomado] = useState(false);
  const [ancho,      setAncho]      = useState('2');
  const [largo,      setLargo]      = useState('100');
  const [cajas,      setCajas]      = useState('');
  const [rollosCaja, setRollosCaja] = useState('36');
  const [merma,      setMerma]      = useState('0');
  const [portaliche, setPortaliche] = useState('30.9');
  const [diseno,     setDiseno]     = useState('normal');
  const [colorKey,   setColorKey]   = useState('naranja');
  const [tipoCentro, setTipoCentro] = useState('2');
  const [mostrarColor2,       setMostrarColor2]       = useState(false);
  const [portaliche2,  setPortaliche2]  = useState('30.9');
  const [diseno2,      setDiseno2]      = useState('normal');
  const [colorKey2,    setColorKey2]    = useState('azul');
  const [stickyback, setStickyback] = useState(null);
  const [diasProd,   setDiasProd]   = useState(0.5);
  const [margen,     setMargen]     = useState(30);

  // Costos dinámicos
  const [costosDB,    setCostosDB]    = useState(null);
  const [editCostos,  setEditCostos]  = useState(false);
  const [editVals,    setEditVals]    = useState({});
  const [guardando,   setGuardando]   = useState(false);
  const [savedMsg,    setSavedMsg]    = useState(false);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('token_cotizador') || sessionStorage.getItem('token_supervisor') || ''}`,
  });

  useEffect(() => {
    fetch('/api/costos', { headers: authHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(obj => {
        if (!obj || !Object.keys(obj).length) return;
        setCostosDB(obj);
        setEditVals(obj);
      })
      .catch(() => {});
  }, []);

  const abrirEditor = () => {
    setEditVals(costosDB ? { ...costosDB } : { ...DEFAULTS });
    setEditCostos(true);
  };

  const guardarCostos = async () => {
    setGuardando(true);
    try {
      const res = await fetch('/api/costos', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(editVals),
      });
      if (res.ok) {
        setCostosDB({ ...editVals });
        setEditCostos(false);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 2500);
      }
    } catch (_) {}
    setGuardando(false);
  };

  // Cálculos
  const anchoN      = parseFloat(ancho)    || 0;
  const largoN      = parseFloat(largo)    || 0;
  const cajasN      = parseInt(cajas)      || 0;
  const rollosCajaN = parseInt(rollosCaja) || 0;
  const mermaN      = parseInt(merma)      || 0;
  const clicheLargo = parseFloat(portaliche);
  const cobertura   = DISENOS.find(d => d.key === diseno)?.cob || 0.275;

  const largoReal    = esEngomado ? largoN : (largoN > 4 ? largoN - 4 : largoN);
  const pistas       = esEngomado ? ENGOMADO_PISTAS : (anchoN > 0 ? Math.floor(MP_ANCHO / anchoN) : 0);
  const rollosPista  = largoReal > 0 ? Math.floor((esEngomado ? ENGOMADO_JUMBO_LARGO_M : MP_LARGO) / largoReal) : 0;
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
  const tintaKg    = (impresiones * inkPerImpresion * INK_DENSITY * TRANSFER) / 1000;

  // 2do color (opcional): mismas piezas de la corrida, pero su propio
  // portacliche y diseno/cobertura -- se calcula igual que el color 1.
  const clicheLargo2      = parseFloat(portaliche2);
  const cobertura2        = DISENOS.find(d => d.key === diseno2)?.cob || 0.275;
  const clicheArea2       = CLICHE_W * clicheLargo2;
  const inkPerImpresion2  = clicheArea2 * BCM_RATE * cobertura2;
  const impresiones2      = mostrarColor2 && piezasTotal > 0 && clicheLargo2 > 0
    ? (piezasTotal * largoRealCm) / (clicheLargo2 * PISTAS) : 0;
  const tintaKg2   = mostrarColor2 ? (impresiones2 * inkPerImpresion2 * INK_DENSITY * TRANSFER) / 1000 : 0;

  const tintaKgTotal = tintaKg + tintaKg2;
  // Engomado usa la tinta tal cual viene (espesa), sin diluir con alcohol.
  const solventeKg = esEngomado ? 0 : (cajasN > 0 ? (tintaKgTotal * 0.5) + 0.600 : 0);

  const listo = anchoN > 0 && largoN > 0 && cajasN > 0 && rollosCajaN > 0;

  const costo = listo ? calcularCosto({
    rollosMP, tintaKg, tintaKg2, colorKey2: mostrarColor2 ? colorKey2 : '',
    solventeKg,
    cajas: cajasN, piezasBuenas,
    sticky: stickyback || 0,
    diasProd, colorKey, tipoCentro,
    precioMPRollo: esEngomado ? ENGOMADO_MP_ROLLO_PRECIO : null,
    costosDB,
  }) : null;
  const precioPieza = costo ? costo.porPieza * (1 + margen / 100) : 0;

  const fmt2 = n => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Agrupar campos para el editor
  const grupos = [...new Set(CAMPOS_COSTO.map(c => c.grupo))];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '2px solid var(--orange)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={onSalir} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 20, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'inline-flex' }}><IcoCotizador /></span> Cotizador de Precio</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Costo por pieza y precio de venta</div>
        </div>
        <button onClick={abrirEditor}
          style={{ background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 8, color: 'var(--text-2)', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>
          Costos
        </button>
      </div>

      {savedMsg && (
        <div style={{ background: '#0d2a0d', border: '1px solid #1a4a1a', color: '#4be87a', fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '10px 0' }}>
          ✓ Costos actualizados
        </div>
      )}

      {/* ── Editor de costos ── */}
      {editCostos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, overflowY: 'auto', padding: '20px 16px 40px' }}>
          <div style={{ maxWidth: 460, margin: '0 auto', background: '#181b24', borderRadius: 16, border: '1px solid #22263a', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#e0e0e0' }}>⚙️ Actualizar costos</div>
              <button onClick={() => setEditCostos(false)} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {grupos.map(grupo => (
              <div key={grupo} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: '#c9922a', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>{grupo.toUpperCase()}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {CAMPOS_COSTO.filter(c => c.grupo === grupo).map(campo => (
                    <div key={campo.key}>
                      <div style={{ fontSize: 10, color: '#545a78', marginBottom: 3 }}>{campo.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#0d0f14', border: '1px solid #2a2d3a', borderRadius: 6, overflow: 'hidden' }}>
                        <span style={{ padding: '0 8px', color: '#545a78', fontSize: 12 }}>$</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={editVals[campo.key] ?? DEFAULTS[campo.key]}
                          onChange={e => setEditVals(v => ({ ...v, [campo.key]: e.target.value }))}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: '#e0e0e0', fontSize: 13, padding: '7px 8px 7px 0', outline: 'none' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <button onClick={() => setEditCostos(false)}
                style={{ padding: '12px 0', borderRadius: 10, border: '1px solid #2a2d3a', background: 'transparent', color: '#9aa0bc', fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarCostos} disabled={guardando}
                style={{ padding: '12px 0', borderRadius: 10, border: 'none', background: guardando ? '#2a2d3a' : '#4be87a', color: '#000', fontSize: 14, fontWeight: 800, cursor: guardando ? 'default' : 'pointer' }}>
                {guardando ? 'Guardando…' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* Datos del pedido */}
        <div style={{ background: '#181b24', borderRadius: 14, padding: '16px', border: '1px solid #22263a', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#9aa0bc', fontWeight: 700, letterSpacing: 1 }}>DATOS DE LA CINTA</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[[false, 'Normal'], [true, 'Engomado']].map(([v, lbl]) => (
                <button key={lbl} type="button" onClick={() => setEsEngomado(v)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: `1.5px solid ${esEngomado === v ? '#ff9900' : '#2a2d3a'}`, background: esEngomado === v ? '#ff990022' : 'transparent', color: esEngomado === v ? '#ff9900' : '#555', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {esEngomado && (
            <div style={{ fontSize: 11, color: '#ff9900', marginBottom: 10, fontWeight: 700 }}>
              ENGOMADO · rollo 136mm × {ENGOMADO_JUMBO_LARGO_M}m (corte real 6.8cm) · ${ENGOMADO_MP_ROLLO_PRECIO}/rollo
            </div>
          )}
          <div className="form-grid">
            <div className="field"><label>Ancho (") {esEngomado && <span style={{ color: '#3a3f5a' }}>· fijo (3")</span>}</label><input type="number" step="0.5" min="0.5" value={ancho} onChange={e => setAncho(e.target.value)} disabled={esEngomado} /></div>
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
                {[1, 2].map(n => (
                  <button key={n} type="button" onClick={() => setStickyback(stickyback === n ? null : n)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: `1.5px solid ${stickyback === n ? '#c9922a' : '#2a2d3a'}`, background: stickyback === n ? '#c9922a22' : 'transparent', color: stickyback === n ? '#c9922a' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#545a78', marginBottom: 5 }}>Días prod.</div>
              <input type="number" min="0" step="0.25" value={diasProd} onChange={e => setDiasProd(Number(e.target.value) || 0)}
                style={{ width: '100%', background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 6, padding: '6px 8px', color: '#e0e0e0', fontSize: 13 }} />
            </div>
          </div>

          {/* Color tinta */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#545a78', marginBottom: 6 }}>Color de tinta</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[...TINTA_OPCIONES, { key: '', label: 'Otro', color: '#9aa0bc' }].map(t => (
                <button key={t.key} type="button" onClick={() => setColorKey(t.key)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${colorKey === t.key ? t.color : '#2a2d3a'}`, background: colorKey === t.key ? t.color + '22' : 'transparent', color: colorKey === t.key ? t.color : '#555', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2do color (opcional) -- pedidos a 2 tintas, mismas piezas, cada
              color con su propio portacliche y diseno/cobertura. */}
          {!mostrarColor2 ? (
            <button type="button" onClick={() => setMostrarColor2(true)}
              style={{ background: 'transparent', border: '1px dashed #2a2d3a', borderRadius: 8, color: '#9aa0bc', fontSize: 12, fontWeight: 700, padding: '8px 12px', cursor: 'pointer', width: '100%', marginBottom: 4 }}>
              + Agregar 2do color
            </button>
          ) : (
            <div style={{ background: '#0d0f14', borderRadius: 10, padding: 12, border: '1px solid #2a2d3a', marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#9aa0bc', fontWeight: 700, letterSpacing: 1 }}>2DO COLOR</div>
                <button type="button" onClick={() => setMostrarColor2(false)}
                  style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <div className="form-grid" style={{ marginBottom: 10 }}>
                <div className="field"><label>Portacliché</label>
                  <select value={portaliche2} onChange={e => setPortaliche2(e.target.value)}>
                    {PORTALICHES.map(p => <option key={p.largo} value={p.largo}>{p.label}</option>)}
                  </select>
                </div>
                <div className="field"><label>Diseño</label>
                  <select value={diseno2} onChange={e => setDiseno2(e.target.value)}>
                    {DISENOS.map(d => <option key={d.key} value={d.key}>{d.label} ({Math.round(d.cob * 100)}%)</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#545a78', marginBottom: 6 }}>Color de tinta</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[...TINTA_OPCIONES, { key: '', label: 'Otro', color: '#9aa0bc' }].map(t => (
                  <button key={t.key} type="button" onClick={() => setColorKey2(t.key)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${colorKey2 === t.key ? t.color : '#2a2d3a'}`, background: colorKey2 === t.key ? t.color + '22' : 'transparent', color: colorKey2 === t.key ? t.color : '#555', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* % Ganancia */}
          <div>
            <div style={{ fontSize: 10, color: '#545a78', marginBottom: 5 }}>% Ganancia</div>
            <input type="number" min="0" value={margen} onChange={e => setMargen(Number(e.target.value) || 0)}
              style={{ width: '100%', background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 6, padding: '6px 8px', color: '#e0e0e0', fontSize: 13 }} />
          </div>
        </div>

        {/* Resultados */}
        {listo && costo ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ background: 'rgba(75,143,232,0.1)', border: '1px solid rgba(75,143,232,0.25)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, marginBottom: 4 }}>ROLLOS MP</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{rollosExacto.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>enteros: {rollosMP}</div>
              </div>
              <div style={{ background: 'rgba(201,146,42,0.1)', border: '1px solid rgba(201,146,42,0.25)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#c9922a', fontWeight: 700, marginBottom: 4 }}>TINTA{mostrarColor2 ? ' (2 colores)' : ''}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#c9922a', lineHeight: 1 }}>{tintaKgTotal.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>kg</div>
              </div>
              <div style={{ background: 'rgba(75,143,232,0.06)', border: '1px solid rgba(75,143,232,0.15)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, marginBottom: 4 }}>SOLVENTE</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{solventeKg.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 2 }}>kg</div>
              </div>
            </div>

            <div style={{ background: '#181b24', borderRadius: 14, padding: '16px', border: '1px solid #22263a', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#9aa0bc', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>DESGLOSE DE COSTOS</div>
              {[
                [esEngomado ? `MP (${rollosMP} rollos × $${ENGOMADO_MP_ROLLO_PRECIO})` : `MP (${rollosMP} rollos)`, costo.mp],
                [mostrarColor2 ? `Tinta (${tintaKg.toFixed(3)} + ${tintaKg2.toFixed(3)} kg, 2 colores)` : `Tinta (${tintaKg.toFixed(3)} kg)`, costo.tinta],
                [`Solvente (${solventeKg.toFixed(3)} kg)`,          costo.solvente],
                [`Cajas (${cajasN})`,                                costo.cajas],
                [`Centros ${tipoCentro}" (${piezasBuenas} pzas)`,   costo.centros],
                stickyback ? [`Stickyback ×${stickyback}`,          costo.stickyback] : null,
                [`Fijo (${diasProd} día${diasProd !== 1 ? 's' : ''})`, costo.fijo],
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
