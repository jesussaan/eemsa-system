import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { REBOB_CLIENTE } from "../lib/constants";

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
            return (
              <div key={p0.folio_rebobinado ?? p0.id} style={{ background: "#181b24", borderRadius: 14, padding: 18, marginBottom: 14, borderLeft: `4px solid ${p0.status === "proceso" ? "#3ecfc0" : "#ff9900"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 700, letterSpacing: ".05em" }}>#{i + 1} · JUMBO {t ? `#${t.numero ?? "?"}${t.lote ? ` · ${t.lote}` : ""}` : ""}</div>
                    <div style={{ fontSize: 19, fontWeight: 700 }}>{p0.tipo} · {p0.color}</div>
                  </div>
                  {p0.status === "proceso" && <span style={{ fontSize: 11, fontWeight: 700, color: "#3ecfc0", background: "rgba(62,207,192,0.12)", borderRadius: 20, padding: "3px 10px" }}>EN PROCESO</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {g.map(p => (
                    <span key={p.id} style={{ fontSize: 16, fontWeight: 800, color: "#c9922a", background: "#0d0f14", borderRadius: 10, padding: "6px 12px" }}>{p.medida}</span>
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
