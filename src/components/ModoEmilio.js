import { useState } from "react";
import ClicheImg from './ClicheImg';
import { supabase } from "../lib/supabase";
import { today } from "../lib/utils";
import { sendWhatsApp } from "../utils/whatsapp";

export default function ModoEmilio({ pedidos, setPedidos, onSalir }) {
  const [toast, setToast]       = useState("");
  const [loading, setLoading]   = useState(null);
  const [stickybacks, setStickybacks] = useState({});
  const [swipes, setSwipes]     = useState({});

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const SWIPE_THRESHOLD = 90;

  const onTouchStart = (id, e) => {
    const t = e.touches[0];
    setSwipes(s => ({ ...s, [id]: { startX: t.clientX, startY: t.clientY, dx: 0, active: false } }));
  };

  const onTouchMove = (id, e) => {
    setSwipes(s => {
      const sw = s[id];
      if (!sw) return s;
      const dx = e.touches[0].clientX - sw.startX;
      const dy = e.touches[0].clientY - sw.startY;
      if (!sw.active && Math.abs(dy) > Math.abs(dx)) return s;
      return { ...s, [id]: { ...sw, dx, active: true } };
    });
  };

  const onTouchEnd = (id) => {
    const dx = swipes[id]?.dx || 0;
    if (dx >= SWIPE_THRESHOLD) {
      darDeAlta(id);
    }
    setSwipes(s => ({ ...s, [id]: { startX: 0, startY: 0, dx: 0, active: false } }));
  };

  const pendientes = pedidos
    .filter(p => p.status === "pendiente")
    .sort((a, b) => (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""));

  const darDeAlta = async (id) => {
    setLoading(id);
    const update = { status: "terminado", fecha_termino: today() };
    const { error } = await supabase.from("pedidos").update(update).eq("id", id);
    if (error) { showToast("❌ Error: " + error.message); setLoading(null); return; }
    setPedidos(ps => ps.map(p => p.id === id ? { ...p, ...update } : p));
    const p = pedidos.find(x => x.id === id);
    if (p) sendWhatsApp(`✅ Pedido #${p.num} ${p.cliente} dado de alta por Emilio`);
    showToast("✓ Pedido dado de alta");
    setLoading(null);
  };

  const calcTiempo = (p) => {
    const start = p.inicio_ts  ? new Date(p.inicio_ts)
                : p.fecha_inicio   ? new Date(p.fecha_inicio   + 'T07:00:00')
                : null;
    const end   = p.fin_ts     ? new Date(p.fin_ts)
                : p.fecha_termino  ? new Date(p.fecha_termino  + 'T16:00:00')
                : null;
    if (!start || !end) return null;
    const ms = end - start;
    if (ms < 0) return null;
    const days = ms / (1000 * 3600 * 24);
    const rounded = Math.round(days * 10) / 10;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  };

  const fmtTS = (ts, fecha) => {
    if (ts) {
      const d = new Date(ts);
      return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
           + ' · '
           + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }
    return fecha || '—';
  };

  const S = {
    card:     { background: "#1a1d26", borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: "4px solid #ff4d4d" },
    section:  { background: "#0d0f14", borderRadius: 10, padding: 12, marginBottom: 10 },
    secTitle: { fontSize: 11, color: "#c9922a", fontWeight: 700, letterSpacing: ".07em", marginBottom: 10, textTransform: "uppercase" },
    mini:     { background: "#13161e", borderRadius: 8, padding: "10px 12px" },
    miniLbl:  { fontSize: 10, color: "#555", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".05em" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0d0f14" }}>

      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#11131a", borderBottom: "1px solid #1e2130", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "#c9922a", fontWeight: 700, letterSpacing: ".08em" }}>MÓDULO EMILIO</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 32px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: "#ff4d4d", letterSpacing: ".06em", margin: "0 0 14px" }}>🔔 Falta dar de alta</h2>

        {pendientes.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#444", fontSize: 13 }}>
            No hay pedidos pendientes de dar de alta.
          </div>
        )}

        {pendientes.map(p => {
          const cajasProducidas = p.piezas_prod != null && p.rollos_caja
            ? Math.floor(Number(p.piezas_prod) / Number(p.rollos_caja))
            : null;
          const centros = p.piezas_prod != null
            ? Number(p.piezas_prod) + (Number(p.merma) || 0)
            : null;
          const sticky  = stickybacks[p.id] || 1;
          const tiempo  = calcTiempo(p);
          const exacto  = !!(p.inicio_ts && p.fin_ts);

          const sw        = swipes[p.id] || {};
          const dx        = sw.dx || 0;
          const confirming = dx >= SWIPE_THRESHOLD;

          return (
            <div
              key={p.id}
              style={{
                ...S.card,
                transform:      `translateX(${dx}px) rotate(${dx * 0.015}deg)`,
                transition:     sw.active ? 'none' : 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), background 0.2s',
                background:     confirming ? '#0e2a14' : '#1a1d26',
                borderLeft:     `4px solid ${confirming ? '#4be87a' : '#ff4d4d'}`,
                userSelect:     'none',
                touchAction:    'pan-y',
                position:       'relative',
                overflow:       'hidden',
              }}
              onTouchStart={e => onTouchStart(p.id, e)}
              onTouchMove={e  => onTouchMove(p.id, e)}
              onTouchEnd={()  => onTouchEnd(p.id)}
            >
              {dx > 20 && (
                <div style={{
                  position:'absolute', left:16, top:'50%', transform:'translateY(-50%)',
                  fontSize:13, fontWeight:800, color:'#4be87a', letterSpacing:'.06em',
                  opacity: Math.min(1, (dx - 20) / 60), pointerEvents:'none',
                }}>
                  ✓ DAR DE ALTA
                </div>
              )}

              {/* ── Encabezado del pedido ── */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#fff" }}>{p.cliente}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: "#c9922a", fontWeight: 700 }}>📏 {p.medida}</span>
                  <span style={{ color: "#aaa" }}>🎨 {p.tipo}</span>
                  {(p.color || p.tinta_tipo) && <span style={{ color: "#aaa" }}>🖌 {p.color || p.tinta_tipo}</span>}
                  <span style={{ color: "#aaa" }}>📦 {p.cajas} cajas</span>
                  <span style={{ color: "#444" }}>#Ped {p.num}</span>
                </div>
                {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>Solicitud: {p.fecha_solicitud}</div>}
              </div>

              {/* ── PRODUCCIÓN ── */}
              <div style={S.section}>
                <div style={S.secTitle}>📦 Producción</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {cajasProducidas != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Cajas producidas</div>
                      <div style={{ color: "#4be87a", fontWeight: 800, fontSize: 20 }}>{cajasProducidas.toLocaleString()}</div>
                    </div>
                  )}
                  {p.piezas_prod != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Rollos producidos</div>
                      <div style={{ color: "#4be87a", fontWeight: 800, fontSize: 20 }}>{Number(p.piezas_prod).toLocaleString()}</div>
                    </div>
                  )}
                  {p.rollos_usados != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Rollos MP usados</div>
                      <div style={{ color: "#4b8fe8", fontWeight: 800, fontSize: 20 }}>{p.rollos_usados}</div>
                    </div>
                  )}
                  {p.tinta_kg != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Tinta</div>
                      <div style={{ color: "#c9922a", fontWeight: 800, fontSize: 18 }}>{Number(p.tinta_kg).toFixed(3)} kg</div>
                    </div>
                  )}
                  {p.alcohol_litros != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Solvente</div>
                      <div style={{ color: "#4b8fe8", fontWeight: 800, fontSize: 18 }}>{Number(p.alcohol_litros).toFixed(3)} kg</div>
                    </div>
                  )}
                  {p.merma_pct != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>% Merma</div>
                      <div style={{ color: Number(p.merma_pct) > 3 ? "#ff4d4d" : "#4be87a", fontWeight: 800, fontSize: 20 }}>
                        {Number(p.merma_pct).toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── INSUMOS ── */}
              <div style={S.section}>
                <div style={S.secTitle}>🔩 Insumos</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {centros != null && (
                    <div style={S.mini}>
                      <div style={S.miniLbl}>Centros utilizados</div>
                      <div style={{ color: "#e0e0e0", fontWeight: 800, fontSize: 20 }}>{centros.toLocaleString()}</div>
                      {p.merma != null && (
                        <div style={{ fontSize: 10, color: "#3a3f5a", marginTop: 3 }}>
                          {Number(p.piezas_prod).toLocaleString()} prod + {Number(p.merma)} merma
                        </div>
                      )}
                    </div>
                  )}
                  <div style={S.mini}>
                    <div style={S.miniLbl}>Stickybacks</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {[1, 2].map(n => (
                        <button
                          key={n}
                          onClick={() => setStickybacks(s => ({ ...s, [p.id]: n }))}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
                            fontWeight: 900, fontSize: 20,
                            background: sticky === n ? "#c9922a" : "#1a1d26",
                            color:      sticky === n ? "#000"    : "#444",
                            transition: "all .15s",
                          }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── TIEMPO DE PRODUCCIÓN ── */}
              <div style={S.section}>
                <div style={S.secTitle}>⏱ Tiempo de producción</div>

                {/* Rango inicio → fin */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#3a3f5a", marginBottom: 10 }}>
                  <span>{fmtTS(p.inicio_ts, p.fecha_inicio)}</span>
                  <span>→</span>
                  <span>{fmtTS(p.fin_ts, p.fecha_termino)}</span>
                </div>

                {/* Tiempo total */}
                {tiempo ? (
                  <div style={{ background: "#0a0c10", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 48, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {tiempo}
                    </span>
                    <span style={{ fontSize: 16, color: "#545a78", fontWeight: 600 }}>días</span>
                    {exacto && <span style={{ fontSize: 10, color: "#2a4a2a", background: "#1a2e1a", padding: "2px 7px", borderRadius: 20, marginLeft: 4 }}>exacto</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#3a3f5a", marginBottom: 12 }}>Sin datos de tiempo suficientes</div>
                )}

                {/* Tabla: Mant. / Luz / William */}
                {tiempo && (
                  <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #1e2132" }}>
                    {[
                      { ico: "🔧", lbl: "Mant. impresora" },
                      { ico: "💡", lbl: "Luz impresora"   },
                      { ico: "👷", lbl: "William — operador" },
                    ].map((row, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 14px",
                          borderBottom: i < 2 ? "1px solid #1e2132" : "none",
                          background: i % 2 === 0 ? "#0d0f14" : "#0b0d12",
                        }}>
                        <span style={{ fontSize: 13, color: "#8a90ac" }}>{row.ico} {row.lbl}</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0", fontVariantNumeric: "tabular-nums" }}>{tiempo} días</span>
                      </div>
                    ))}
                  </div>
                )}

                {p.notas && <div style={{ fontSize: 12, color: "#aaa", marginTop: 10 }}>📝 {p.notas}</div>}
                {p.foto_producto_url && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>📷 Foto del producto</div>
                    <ClicheImg src={p.foto_producto_url} style={{ width: "100%", maxWidth: 300, borderRadius: 8, border: "1px solid #2a2d3a" }} />
                  </div>
                )}
              </div>

              {/* ── Botón dar de alta ── */}
              <button
                onClick={() => darDeAlta(p.id)}
                disabled={loading === p.id}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
                  background: loading === p.id ? "#2a2d3a" : "#4be87a",
                  color: "#000", fontSize: 15, fontWeight: 800,
                  cursor: loading === p.id ? "default" : "pointer",
                }}>
                {loading === p.id ? "Guardando…" : "✓ Ya lo di de alta"}
              </button>

            </div>
          );
        })}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
