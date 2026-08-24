import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { REBOB_CLIENTE, REBOB_PIEZAS_POR_VUELTA } from "../lib/constants";
import { fmt } from "../lib/utils";

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
    <div style={{ minHeight: "100vh", background: "#0b0d11", color: "#e0e0e0" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "2px solid #3ecfc0", position: "sticky", top: 0, background: "#0b0d11", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo192.png" alt="EEMSA" style={{ height: 32, width: "auto" }} />
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: ".05em" }}>EEMSA · Pizarra Rebobinado</div>
            <div style={{ fontSize: 10, color: "#3ecfc0", fontWeight: 700, letterSpacing: ".08em" }}>SOLO LECTURA · SE ACTUALIZA SOLA</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#666", textAlign: "right" }}>{ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      <main style={{ padding: "18px 16px 40px", maxWidth: 620, margin: "0 auto" }}>
        {!cargado ? (
          <p style={{ textAlign: "center", color: "#666", fontSize: 13, marginTop: 40 }}>Cargando…</p>
        ) : grupos.length === 0 ? (
          <p style={{ textAlign: "center", color: "#666", fontSize: 13, marginTop: 40 }}>Sin jumbos planeados por ahora.</p>
        ) : (
          grupos.map((g, i) => {
            const p0 = g[0];
            const t = tarimas.find(x => x.id === p0.tarima_jumbo_id);
            const color = colorDeGrupo(g);
            return (
              <div key={p0.folio_rebobinado ?? p0.id} style={{ background: "#181b24", borderRadius: 14, padding: 18, marginBottom: 14, borderLeft: `4px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 700, letterSpacing: ".05em", marginBottom: 6 }}>#{i + 1} · JUMBO {t ? `#${t.numero ?? "?"}${t.lote ? ` · ${t.lote}` : ""}` : ""}</div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${color}22`, border: `1px solid ${color}66`, borderRadius: 20, padding: "5px 16px 5px 10px" }}>
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: ".01em" }}>{p0.tipo} · {p0.color}</span>
                    </div>
                  </div>
                  {p0.status === "proceso" && <span style={{ fontSize: 11, fontWeight: 700, color: "#3ecfc0", background: "rgba(62,207,192,0.12)", borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>EN PROCESO</span>}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {g.map(p => (
                    <div key={p.id} style={{ background: "#0d0f14", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#c9922a", marginBottom: 10, lineHeight: 1 }}>{medidaBonita(p.medida)}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1 }}>{vueltasDe(p)}</div>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>vueltas</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 34, fontWeight: 900, color: "#e0e0e0", lineHeight: 1 }}>{fmt(p.cajas)}</div>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>cajas</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 34, fontWeight: 900, color: "#e0e0e0", lineHeight: 1 }}>{fmt(p.piezas_prod)}</div>
                          <div style={{ fontSize: 11, color: "#666", marginTop: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>piezas</div>
                        </div>
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
