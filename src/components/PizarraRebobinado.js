import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { REBOB_CLIENTE, REBOB_PIEZAS_POR_VUELTA } from "../lib/constants";
import { IcoSpinner, IcoBox, IcoTapeRoll } from "./Icons";

// fmt() de lib/utils.js siempre fuerza 2 decimales (pensado para dinero) --
// cajas/piezas son unidades enteras, se ven mal como "76.00" en numeros
// grandes, asi que aqui se redondea a entero antes de formatear.
const fmtEntero = (n) => Math.round(Number(n) || 0).toLocaleString("es-MX");

const Ico = ({ icon: I, size = 15 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

// Un color fijo por tipo de jumbo (material+adhesivo) para distinguirlos de
// un vistazo -- se reparte por orden de aparicion entre los tipos que de
// verdad estan planeados ahorita, no por un catalogo fijo (pueden ser mas
// o menos de 3 con el tiempo).
const PALETA_TIPO = ["#3ecfc0", "#e8894b", "#9b6fe8", "#4b8fe8", "#e8b84b", "#e84b4b"];

// Publica (sin login): pedidos ya tiene lectura abierta a la anon key (ver
// supabase_pedidos_fallas_security.sql) y tarimas tambien (ver
// supabase_inventario_mp.sql) -- mismo criterio que PizarraOperador.js, solo
// que aqui se agrupa por jumbo (folio_rebobinado) para que se vea claro
// "este jumbo, a esta medida" en vez de una lista plana de medidas sueltas.
export default function PizarraRebobinado() {
  const [pedidos, setPedidos] = useState([]);
  const [tarimas, setTarimas] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const tituloPrevio = document.title;
    document.title = "EEMSA - Pizarra Rebobinado";
    return () => { document.title = tituloPrevio; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const cargar = async () => {
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from("pedidos").select("*").eq("cliente", REBOB_CLIENTE).in("status", ["anotado", "proceso"]),
      supabase.from("tarimas").select("*"),
    ]);
    setPedidos(p || []);
    setTarimas(t || []);
    setCargado(true);
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const canal = supabase.channel("rt_pizarra_rebobinado")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => cargar())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const grupos = Object.values(
    pedidos.reduce((acc, p) => {
      const key = p.folio_rebobinado != null ? `f${p.folio_rebobinado}` : p.id;
      (acc[key] = acc[key] || []).push(p);
      return acc;
    }, {})
  ).map(g => [...g].sort((a, b) => String(a.num).localeCompare(String(b.num))))
   .sort((a, b) => (a[0].orden ?? 9999) - (b[0].orden ?? 9999));

  // Vueltas de cada medida -- se recalculan de piezas_prod (guardado como
  // meta al planear, ver guardarPlan en Rebobinado.js) en vez de traer un
  // campo aparte.
  const vueltasDe = (p) => {
    const ancho = String(p.medida || "").split(" x ")[0];
    const ppv = REBOB_PIEZAS_POR_VUELTA[ancho] || 0;
    return ppv > 0 ? Math.round((Number(p.piezas_prod) || 0) / ppv) : 0;
  };

  // Solo para mostrar en la pizarra -- el largo real (96/147) es el que se
  // usa para calcular vueltas/piezas en todos lados, esto nomas redondea
  // como se le conoce de palabra en planta ("la 100", "la 150").
  const REDONDEO_LARGO_PIZARRA = { "96": "100", "147": "150" };
  const medidaBonita = (medida) => {
    const [ancho, largoConM] = String(medida || "").split(" x ");
    const largo = (largoConM || "").replace(/m$/i, "");
    return `${ancho} x ${REDONDEO_LARGO_PIZARRA[largo] || largo}m`;
  };

  // Un color por tipo de jumbo (material_id de la tarima), repartido en el
  // orden en que aparecen los grupos en la cola.
  const tiposEnCola = [...new Set(grupos.map(g => tarimas.find(t => t.id === g[0].tarima_jumbo_id)?.material_id).filter(Boolean))];
  const colorDeGrupo = (g) => {
    const matId = tarimas.find(t => t.id === g[0].tarima_jumbo_id)?.material_id;
    const idx = tiposEnCola.indexOf(matId);
    return PALETA_TIPO[idx >= 0 ? idx % PALETA_TIPO.length : 0];
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 900px 500px at 50% -10%, rgba(62,207,192,0.08), transparent), #0b0d11", color: "#e0e0e0" }}>
      <style>{`
        @keyframes pizarraPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(62,207,192,0.55); }
          50% { opacity: .55; box-shadow: 0 0 0 6px rgba(62,207,192,0); }
        }
        @keyframes pizarraFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 22px", position: "sticky", top: 0, background: "rgba(11,13,17,0.9)", backdropFilter: "blur(8px)", zIndex: 5, boxShadow: "0 1px 0 rgba(62,207,192,0.4), 0 14px 30px -18px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo192.png" alt="EEMSA" style={{ height: 34, width: "auto" }} />
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: ".05em" }}>EEMSA · Pizarra Rebobinado</div>
            <div style={{ fontSize: 10, color: "#3ecfc0", fontWeight: 700, letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ecfc0", animation: "pizarraPulse 1.8s ease-in-out infinite" }} />
              SOLO LECTURA · SE ACTUALIZA SOLA
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#8a90ac", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      <main style={{ padding: "20px 16px 44px", maxWidth: 640, margin: "0 auto" }}>
        {!cargado ? (
          <p style={{ textAlign: "center", color: "#555", fontSize: 13, marginTop: 60 }}>Cargando…</p>
        ) : grupos.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: 70, color: "#444" }}>
            <div style={{ fontSize: 40, marginBottom: 10, opacity: .5 }}>🧵</div>
            <p style={{ fontSize: 13 }}>Sin jumbos planeados por ahora.</p>
          </div>
        ) : (
          grupos.map((g, i) => {
            const p0 = g[0];
            const t = tarimas.find(x => x.id === p0.tarima_jumbo_id);
            const color = colorDeGrupo(g);
            const enProceso = p0.status === "proceso";
            return (
              <div key={p0.folio_rebobinado ?? p0.id} style={{
                position: "relative",
                background: "linear-gradient(160deg, #1c202b 0%, #14161e 100%)",
                borderRadius: 20,
                padding: "20px 20px 18px",
                marginBottom: 16,
                border: `1px solid ${color}33`,
                boxShadow: `0 14px 34px -20px ${color}77, 0 2px 10px rgba(0,0,0,0.35)`,
                overflow: "hidden",
                animation: "pizarraFadeIn .35s ease both",
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${color}, ${color}55)` }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${color}22`, border: `1.5px solid ${color}`, color, fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6a7090", fontWeight: 700, letterSpacing: ".06em", marginBottom: 7, textTransform: "uppercase" }}>
                        Jumbo {t ? `#${t.numero ?? "?"}${t.lote ? ` · ${t.lote}` : ""}` : ""}
                      </div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${color}1c`, border: `1px solid ${color}55`, borderRadius: 20, padding: "5px 16px 5px 10px" }}>
                        <span style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}aa` }} />
                        <span style={{ fontSize: 19, fontWeight: 800, color, letterSpacing: ".01em" }}>{p0.tipo} · {p0.color}</span>
                      </div>
                    </div>
                  </div>
                  {enProceso && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "#3ecfc0", background: "rgba(62,207,192,0.12)", border: "1px solid rgba(62,207,192,0.35)", borderRadius: 20, padding: "5px 12px 5px 9px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3ecfc0", animation: "pizarraPulse 1.6s ease-in-out infinite" }} />
                      EN PROCESO
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gap: 9 }}>
                  {g.map(p => (
                    <div key={p.id} style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 14, padding: "13px 15px" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#c9922a", marginBottom: 12, lineHeight: 1, letterSpacing: ".01em" }}>{medidaBonita(p.medida)}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                        {[
                          { ico: IcoSpinner, val: vueltasDe(p), lbl: "vueltas", col: color },
                          { ico: IcoBox, val: fmtEntero(p.cajas), lbl: "cajas", col: "#e0e0e0" },
                          { ico: IcoTapeRoll, val: fmtEntero(p.piezas_prod), lbl: "piezas", col: "#e0e0e0" },
                        ].map((s, j) => (
                          <div key={j} style={{ textAlign: "center", borderLeft: j > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                            <div style={{ color: "#4a5070", marginBottom: 4 }}><Ico icon={s.ico} size={13} /></div>
                            <div style={{ fontSize: 30, fontWeight: 900, color: s.col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.val}</div>
                            <div style={{ fontSize: 10, color: "#5a6080", marginTop: 5, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{s.lbl}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
