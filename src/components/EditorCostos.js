import { useState, useEffect } from 'react';
import { authHeaders } from '../lib/auth';
import { COSTOS } from '../lib/costos';

const CAMPOS_COSTO = [
  { key: 'mp_rollo',          label: 'MP por rollo',          grupo: 'Materias primas' },
  { key: 'mp_rollo_engomado', label: 'MP Engomado (rollo)',   grupo: 'Materias primas' },
  { key: 'caja',              label: 'Caja',                  grupo: 'Materias primas' },
  { key: 'centro_2',          label: 'Centro 2"',             grupo: 'Materias primas' },
  { key: 'centro_3',          label: 'Centro 3"',             grupo: 'Materias primas' },
  { key: 'stickyback',        label: 'Stickyback',            grupo: 'Materias primas' },
  { key: 'solvente_litro',    label: 'Solvente (litro)',      grupo: 'Solvente' },
  { key: 'tinta_naranja',     label: 'Tinta naranja (kg)',    grupo: 'Tintas' },
  { key: 'tinta_azul',        label: 'Tinta azul (kg)',       grupo: 'Tintas' },
  { key: 'tinta_rojo',        label: 'Tinta rojo (kg)',       grupo: 'Tintas' },
  { key: 'tinta_negro',       label: 'Tinta negro (kg)',      grupo: 'Tintas' },
  { key: 'mano_obra_dia',     label: 'Mano de obra (día)',    grupo: 'Costos fijos/día' },
  { key: 'mantenimiento_dia', label: 'Mantenimiento (día)',   grupo: 'Costos fijos/día' },
  { key: 'luz_dia',           label: 'Luz (día)',             grupo: 'Costos fijos/día' },
];

const DEFAULTS = {
  mp_rollo: COSTOS.mp_rollo, mp_rollo_engomado: COSTOS.mp_rollo_engomado, caja: COSTOS.caja, centro_2: COSTOS.centro_2,
  centro_3: COSTOS.centro_3, stickyback: COSTOS.stickyback,
  solvente_litro: COSTOS.solvente_litro,
  tinta_naranja: COSTOS.tinta.naranja, tinta_azul: COSTOS.tinta.azul,
  tinta_rojo: COSTOS.tinta.rojo, tinta_negro: COSTOS.tinta.negro,
  mano_obra_dia: COSTOS.mano_obra_dia, mantenimiento_dia: COSTOS.mantenimiento_dia,
  luz_dia: COSTOS.luz_dia,
};

// Editor de costos compartido -- antes vivia solo dentro de Cotizador.js.
// Se usa tambien desde el Dashboard (pestana Finanzas) para poder cambiar
// precios sin tener que entrar al Cotizador. onLoaded/onSaved son opcionales,
// para que el que lo usa (ej. Cotizador, que necesita costosDB para calcular)
// se entere de los valores sin tener que hacer su propio fetch por separado.
export default function EditorCostos({ onLoaded, onSaved, label = 'Costos' }) {
  const [costosDB,   setCostosDB]   = useState(null);
  const [editCostos, setEditCostos] = useState(false);
  const [editVals,   setEditVals]   = useState({});
  const [guardando,  setGuardando]  = useState(false);
  const [savedMsg,   setSavedMsg]   = useState(false);

  useEffect(() => {
    fetch('/api/costos', { headers: authHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(obj => {
        if (!obj || !Object.keys(obj).length) return;
        setCostosDB(obj);
        onLoaded?.(obj);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        onSaved?.({ ...editVals });
        setEditCostos(false);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 2500);
      }
    } catch (_) {}
    setGuardando(false);
  };

  const grupos = [...new Set(CAMPOS_COSTO.map(c => c.grupo))];

  return (
    <>
      <button onClick={abrirEditor}
        style={{ background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 8, color: 'var(--text-2)', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>
        {label}
      </button>

      {savedMsg && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#0d2a0d', border: '1px solid #1a4a1a', color: '#4be87a', fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '10px 0', zIndex: 250 }}>
          ✓ Costos actualizados
        </div>
      )}

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
    </>
  );
}
