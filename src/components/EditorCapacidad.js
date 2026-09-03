import { useState, useEffect } from 'react';
import { authHeaders } from '../lib/auth';
import { CAPACIDAD_CAMPOS, CAPACIDAD_DEFAULTS } from '../lib/capacidad';

// Editor de tiempos estandar / capacidad -- mismo patron que EditorCostos.js
// (que es dinero; este es tiempo). Se llena UNA VEZ por linea via un estudio
// de tiempos ocasional (cronometrar montaje y velocidad real de la
// maquina), no en cada corrida -- por eso vive aqui como un ajuste
// administrativo, igual que Costos, y no como un campo mas del formulario
// de produccion.
export default function EditorCapacidad({ onLoaded, onSaved, label = 'Capacidad' }) {
  const [capacidadDB, setCapacidadDB] = useState(null);
  const [editAbierto,  setEditAbierto] = useState(false);
  const [editVals,     setEditVals]    = useState({});
  const [guardando,    setGuardando]   = useState(false);
  const [savedMsg,     setSavedMsg]    = useState(false);

  useEffect(() => {
    fetch('/api/registro?tabla=capacidad', { headers: authHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(obj => {
        if (!obj || !Object.keys(obj).length) return;
        setCapacidadDB(obj);
        onLoaded?.(obj);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirEditor = () => {
    setEditVals(capacidadDB ? { ...capacidadDB } : { ...CAPACIDAD_DEFAULTS });
    setEditAbierto(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch('/api/registro?tabla=capacidad', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(editVals),
      });
      if (res.ok) {
        setCapacidadDB({ ...editVals });
        onSaved?.({ ...editVals });
        setEditAbierto(false);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 2500);
      }
    } catch (_) {}
    setGuardando(false);
  };

  const grupos = [...new Set(CAPACIDAD_CAMPOS.map(c => c.grupo))];
  const sufijoDe = (key) => key.startsWith('montaje_min') ? 'min' : 'pzas/min';

  return (
    <>
      <button onClick={abrirEditor}
        style={{ background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 8, color: 'var(--text-2)', fontSize: 12, padding: '6px 12px', cursor: 'pointer' }}>
        {label}
      </button>

      {savedMsg && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#0d2a0d', border: '1px solid #1a4a1a', color: '#4be87a', fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '10px 0', zIndex: 250 }}>
          ✓ Tiempos actualizados
        </div>
      )}

      {editAbierto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, overflowY: 'auto', padding: '20px 16px 40px' }}>
          <div style={{ maxWidth: 460, margin: '0 auto', background: '#181b24', borderRadius: 16, border: '1px solid #22263a', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#e0e0e0' }}>⏱ Tiempos estándar / capacidad</div>
              <button onClick={() => setEditAbierto(false)} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 18 }}>
              Se llena con un estudio de tiempos ocasional (cronometrar montaje y velocidad real), no en cada corrida.
            </div>

            {grupos.map(grupo => (
              <div key={grupo} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: '#c9922a', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>{grupo.toUpperCase()}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {CAPACIDAD_CAMPOS.filter(c => c.grupo === grupo).map(campo => (
                    <div key={campo.key}>
                      <div style={{ fontSize: 10, color: '#545a78', marginBottom: 3 }}>{campo.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#0d0f14', border: '1px solid #2a2d3a', borderRadius: 6, overflow: 'hidden' }}>
                        <input
                          type="number" step="0.1" min="0"
                          value={editVals[campo.key] ?? CAPACIDAD_DEFAULTS[campo.key]}
                          onChange={e => setEditVals(v => ({ ...v, [campo.key]: e.target.value }))}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: '#e0e0e0', fontSize: 13, padding: '7px 0 7px 8px', outline: 'none' }}
                        />
                        <span style={{ padding: '0 8px', color: '#545a78', fontSize: 11, whiteSpace: 'nowrap' }}>{sufijoDe(campo.key)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <button onClick={() => setEditAbierto(false)}
                style={{ padding: '12px 0', borderRadius: 10, border: '1px solid #2a2d3a', background: 'transparent', color: '#9aa0bc', fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
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
