import { useState, useEffect } from 'react';

export default function ModoTV({ pedidos, fallas, onSalir }) {
  const [hora, setHora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const enProceso      = pedidos.filter(p => p.status === 'proceso');
  const anotados       = pedidos.filter(p => p.status === 'anotado');
  const terminados     = pedidos.filter(p => p.status === 'terminado');
  const fallasAbiertas = fallas.filter(f => f.status === 'abierta');
  const fallasCriticas = fallasAbiertas.filter(f => f.sev === 'critica');

  const hoy = new Date();
  const proximos = pedidos
    .filter(p => p.status !== 'terminado' && p.fecha_estimada)
    .map(p => ({ ...p, dias: Math.ceil((new Date(p.fecha_estimada + 'T12:00:00') - hoy) / 86400000) }))
    .filter(p => p.dias <= 7)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 5);

  // Siguiente pedido en cola (el primero por orden de salida)
  const siguienteEnCola = [...anotados]
    .sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || (a.fecha_solicitud || '').localeCompare(b.fecha_solicitud || ''))
    [0] || null;

  // Cronómetro en vivo: usa inicio_ts (ISO) si existe, si no muestra días desde fecha_inicio
  const calcElapsed = (p) => {
    if (p.inicio_ts) {
      const ms = hora - new Date(p.inicio_ts);
      if (ms < 0) return '0s';
      const totalS = Math.floor(ms / 1000);
      const d = Math.floor(totalS / 86400);
      const h = Math.floor((totalS % 86400) / 3600);
      const m = Math.floor((totalS % 3600) / 60);
      const s = totalS % 60;
      if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
      if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
      return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    }
    if (p.fecha_inicio) {
      const dias = Math.max(0, Math.round((hora - new Date(p.fecha_inicio + 'T12:00:00')) / 86400000));
      return dias === 0 ? 'Hoy' : `${dias} día${dias !== 1 ? 's' : ''}`;
    }
    return null;
  };

  const timeStr = hora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = hora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const diasColor = d => d < 0 ? '#ff4d4d' : d === 0 ? '#ff9900' : d <= 2 ? '#ff9900' : '#4be87a';
  const diasTxt   = d => d < 0 ? `${Math.abs(d)}d VENCIDO` : d === 0 ? '¡HOY!' : `${d} días`;
  const sevColor  = s => s === 'critica' ? '#ff4d4d' : s === 'moderada' ? '#ff9900' : '#9aa0bc';

  const S = {
    panel:  { background: '#0e1018', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column' },
    label:  { fontSize: 12, fontWeight: 800, letterSpacing: 3, marginBottom: 16 },
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#080a10', color: '#e0e0e0', fontFamily: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 32px', background: '#0b0d15', borderBottom: '1px solid #13161e', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/logo192.png" alt="EEMSA" style={{ height: 40 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, color: '#e8b84b' }}>EEMSA SYSTEM</div>
            <div style={{ fontSize: 11, color: '#3a3f5a', letterSpacing: 2 }}>PRODUCCIÓN EN VIVO</div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', letterSpacing: 3, lineHeight: 1 }}>{timeStr}</div>
          <div style={{ fontSize: 13, color: '#545a78', textTransform: 'capitalize', marginTop: 2 }}>{dateStr}</div>
        </div>

        <button onClick={onSalir} style={{ background: 'transparent', border: '1px solid #1e2132', borderRadius: 8, color: '#3a3f5a', cursor: 'pointer', fontSize: 12, padding: '6px 14px' }}>✕ Salir</button>
      </div>

      {/* ── MAIN GRID ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 6, padding: 6, overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT — En proceso + Siguiente en cola */}
        <div style={{ ...S.panel, gap: 0 }}>

          {/* EN PROCESO */}
          <div style={{ ...S.label, color: '#4b8fe8' }}>🏭 EN PROCESO AHORA</div>

          {enProceso.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#2a2d3a', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 64 }}>💤</div>
              <div style={{ fontSize: 22, marginTop: 12 }}>Sin pedidos en proceso</div>
            </div>
          ) : (
            <div style={{ flex: 1 }}>
              {enProceso.map((p, i) => {
                const elapsed = calcElapsed(p);
                return (
                  <div key={p.id} style={{ marginBottom: i < enProceso.length - 1 ? 24 : 0, paddingBottom: i < enProceso.length - 1 ? 24 : 0, borderBottom: i < enProceso.length - 1 ? '1px solid #1a1d26' : 'none' }}>
                    <div style={{ fontSize: enProceso.length === 1 ? 80 : 56, fontWeight: 900, color: '#4be87a', lineHeight: 1 }}>#{p.num}</div>
                    <div style={{ fontSize: enProceso.length === 1 ? 36 : 26, fontWeight: 700, color: '#fff', marginTop: 6 }}>{p.cliente}</div>
                    <div style={{ fontSize: enProceso.length === 1 ? 22 : 17, color: '#9aa0bc', marginTop: 6 }}>
                      {p.medida} &nbsp;·&nbsp; {p.cajas} cajas &nbsp;·&nbsp; {p.maq}
                    </div>
                    {p.op && <div style={{ fontSize: 16, color: '#545a78', marginTop: 4 }}>Operador: {p.op}</div>}

                    {/* ⏱ Cronómetro en vivo */}
                    {elapsed && (
                      <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(75,232,122,0.08)', border: '1px solid rgba(75,232,122,0.2)', borderRadius: 10, padding: '8px 18px' }}>
                        <span style={{ fontSize: 15, color: '#4be87a' }}>⏱</span>
                        <span style={{ fontSize: enProceso.length === 1 ? 32 : 24, fontWeight: 900, color: '#4be87a', fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{elapsed}</span>
                        <span style={{ fontSize: 13, color: '#3a7a4a' }}>en producción</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SIGUIENTE EN COLA */}
          {siguienteEnCola && (
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #1a1d26' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: '#ff9900', marginBottom: 10 }}>📋 SIGUIENTE EN COLA</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 38, fontWeight: 900, color: '#ff9900', lineHeight: 1 }}>#{siguienteEnCola.num}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#e0e0e0' }}>{siguienteEnCola.cliente}</div>
                  <div style={{ fontSize: 16, color: '#545a78', marginTop: 2 }}>
                    {siguienteEnCola.medida} &nbsp;·&nbsp; {siguienteEnCola.cajas} cajas
                    {siguienteEnCola.tipo && <span> &nbsp;·&nbsp; {siguienteEnCola.tipo}</span>}
                  </div>
                  {(siguienteEnCola.color || siguienteEnCola.tinta_tipo) && (
                    <div style={{ fontSize: 14, color: '#c9922a', marginTop: 2 }}>🎨 {siguienteEnCola.color || siguienteEnCola.tinta_tipo}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Vencimientos + Fallas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Próximos vencimientos */}
          <div style={{ ...S.panel, flex: 1 }}>
            <div style={{ ...S.label, color: '#e8b84b' }}>⏰ PRÓXIMOS VENCIMIENTOS</div>
            {proximos.length === 0 ? (
              <div style={{ color: '#2a2d3a', fontSize: 15, flex: 1, display: 'flex', alignItems: 'center' }}>Sin vencimientos esta semana ✓</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
                {proximos.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < proximos.length - 1 ? '1px solid #13161e' : 'none' }}>
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>#{p.num}</span>
                      <span style={{ fontSize: 17, color: '#9aa0bc', marginLeft: 10 }}>{p.cliente}</span>
                      <div style={{ fontSize: 13, color: '#545a78' }}>{p.medida} · {p.cajas} cajas</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: diasColor(p.dias), textAlign: 'right', minWidth: 100 }}>
                      {diasTxt(p.dias)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fallas abiertas */}
          <div style={{ ...S.panel, flexShrink: 0 }}>
            <div style={{ ...S.label, color: fallasCriticas.length > 0 ? '#ff4d4d' : '#545a78' }}>
              ⚠️ FALLAS ABIERTAS &nbsp;
              <span style={{ background: fallasAbiertas.length > 0 ? '#ff4d4d' : '#2a2d3a', color: '#fff', borderRadius: 20, padding: '1px 10px', fontSize: 13 }}>
                {fallasAbiertas.length}
              </span>
            </div>
            {fallasAbiertas.length === 0 ? (
              <div style={{ color: '#4be87a', fontSize: 17, fontWeight: 700 }}>✓ Sin fallas abiertas</div>
            ) : fallasAbiertas.slice(0, 4).map((f, i) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < Math.min(fallasAbiertas.length, 4) - 1 ? '1px solid #13161e' : 'none' }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: sevColor(f.sev) }}>{f.comp}</span>
                  <span style={{ fontSize: 13, color: '#545a78', marginLeft: 8 }}>{f.maq}</span>
                </div>
                <div style={{ fontSize: 13, color: '#3a3f5a' }}>{f.fecha}</div>
              </div>
            ))}
            {fallasAbiertas.length > 4 && (
              <div style={{ fontSize: 12, color: '#3a3f5a', marginTop: 8 }}>+{fallasAbiertas.length - 4} más…</div>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{ background: '#0b0d15', borderTop: '1px solid #13161e', padding: '12px 32px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {[
          { val: anotados.length,       lbl: 'EN COLA',         color: '#e8b84b' },
          { val: enProceso.length,       lbl: 'EN PROCESO',      color: '#4b8fe8' },
          { val: terminados.length,      lbl: 'TERMINADOS',      color: '#4be87a' },
          { val: fallasAbiertas.length,  lbl: 'FALLAS ABIERTAS', color: fallasAbiertas.length > 0 ? '#ff4d4d' : '#4be87a' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? '1px solid #1a1d26' : 'none' }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 11, color: '#3a3f5a', letterSpacing: 2, marginTop: 4 }}>{s.lbl}</div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#1e2132', paddingLeft: 24 }}>Tiempo real · EEMSA System</div>
      </div>
    </div>
  );
}
