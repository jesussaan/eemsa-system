import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { REBOB_CLIENTE, REBOB_PIEZAS_POR_VUELTA, REBOB_PAROS_MAQUINA } from "../lib/constants";

// fmt() de lib/utils.js siempre fuerza 2 decimales (pensado para dinero) --
// cajas/piezas son unidades enteras, se ven mal como "76.00" en numeros
// grandes, asi que aqui se redondea a entero antes de formatear.
const fmtEntero = (n) => Math.round(Number(n) || 0).toLocaleString("es-MX");

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
// Mismo diseño plano que PizarraOperador.js (a proposito, para que las dos
// pizarras se vean/sientan igual en planta) en vez del look con gradientes
// que tenia antes.
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

  const gruposEnProceso = grupos.filter(g => g[0].status === "proceso");
  const gruposAnotados  = grupos.filter(g => g[0].status === "anotado");

  // Vueltas de cada medida -- se recalculan de piezas_prod (guardado como
  // meta al planear, ver guardarPlan en Rebobinado.js) en vez de traer un
  // campo aparte.
  const vueltasDe = (p) => {
    const ancho = String(p.medida || "").split(" x ")[0];
    const ppv = REBOB_PIEZAS_POR_VUELTA[ancho] || 0;
    return ppv > 0 ? Math.round((Number(p.piezas_prod) || 0) / ppv) : 0;
  };

  // A que numero parar el contador de la rebobinadora para esta medida (ver
  // REBOB_PAROS_MAQUINA) -- null si todavia no se ha capturado esa
  // calibracion para este largo.
  const paroDeMedida = (p) => {
    const largo = String(p.medida || "").split(" x ")[1]?.replace(/m$/i, "");
    return REBOB_PAROS_MAQUINA[largo] || null;
  };

  // Solo para mostrar en la pizarra -- el largo real (46/96/146/147/196) es
  // el que se usa para calcular vueltas/piezas en todos lados, esto nomas
  // redondea como se le conoce de palabra en planta ("la 50", "la 100",
  // "la 150", "la 200").
  const REDONDEO_LARGO_PIZARRA = { "46": "50", "96": "100", "146": "150", "147": "150", "196": "200" };
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

  const card = { background: "#181b24", borderRadius: 14, padding: 18, marginBottom: 14 };

  const lbl = { fontSize: 14, color: "#9aa0bc", marginLeft: 5, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 };
  // Badge de Set 1/Set 2 junto al titulo de la medida -- colores fuertes y
  // distintos entre si (rojo/verde) para que no se confundan entre ellos ni
  // con las demas stats (vueltas/cajas/piezas, cada una con su propio color).
  const badgeSet = (bg, border, txt, label, valor) => (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, background: bg, border: `1px solid ${border}`, color: txt, borderRadius: 8, padding: "3px 10px" }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 900 }}>{valor}</span>
    </span>
  );

  const Medidas = ({ g, color }) => (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      {g.map(p => {
        const paro = paroDeMedida(p);
        return (
          <div key={p.id} style={{ background: "#0d0f14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <div style={{ color: "#c9922a", fontSize: 20, fontWeight: 800 }}>{medidaBonita(p.medida)}</div>
              {paro && (
                <div style={{ display: "flex", gap: 6 }}>
                  {badgeSet("rgba(232,75,75,0.15)", "#e84b4b", "#ff9c9c", "SET 1", paro.set1)}
                  {badgeSet("rgba(75,232,122,0.15)", "#4be87a", "#8ef0ac", "SET 2 · FINAL", paro.set2)}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: 24, fontWeight: 900, color }}>{vueltasDe(p)}</span>
                <span style={lbl}>vueltas</span>
              </div>
              <div>
                <span style={{ fontSize: 24, fontWeight: 900, color: "#4b8fe8" }}>{fmtEntero(p.cajas)}</span>
                <span style={lbl}>cajas</span>
              </div>
              <div>
                <span style={{ fontSize: 24, fontWeight: 900, color: "#e8b84b" }}>{fmtEntero(p.piezas_prod)}</span>
                <span style={lbl}>piezas</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

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
        ) : (
          <>
            <h2 style={{ color: "#3ecfc0", fontSize: 14, margin: "8px 0 10px", textTransform: "uppercase", letterSpacing: ".08em" }}>▶ En proceso</h2>
            {gruposEnProceso.length === 0 ? (
              <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>Sin jumbos en proceso.</p>
            ) : gruposEnProceso.map(g => {
              const p0 = g[0];
              const t = tarimas.find(x => x.id === p0.tarima_jumbo_id);
              const color = colorDeGrupo(g);
              return (
                <div key={p0.folio_rebobinado ?? p0.id} style={{ ...card, borderLeft: `4px solid ${color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: ".05em", marginBottom: 3 }}>
                        JUMBO {t ? `#${t.numero ?? "?"}${t.lote ? ` · ${t.lote}` : ""}` : ""}
                      </div>
                      <div style={{ fontSize: 19, fontWeight: 700, color }}>{p0.tipo} · {p0.color}</div>
                    </div>
                  </div>
                  <Medidas g={g} color={color} />
                </div>
              );
            })}

            <h2 style={{ color: "#ff9900", fontSize: 14, margin: "22px 0 10px", textTransform: "uppercase", letterSpacing: ".08em" }}>📋 Próximos anotados — orden de salida</h2>
            {gruposAnotados.length === 0 ? (
              <p style={{ color: "#666", fontSize: 13 }}>Sin jumbos anotados en cola.</p>
            ) : gruposAnotados.map((g, i) => {
              const p0 = g[0];
              const t = tarimas.find(x => x.id === p0.tarima_jumbo_id);
              const color = colorDeGrupo(g);
              return (
                <div key={p0.folio_rebobinado ?? p0.id} style={{ ...card, borderLeft: `4px solid #ff9900`, display: "flex", gap: 12 }}>
                  <div style={{ color: "#ff9900", fontWeight: 800, fontSize: 20, minWidth: 24, textAlign: "center" }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: ".05em", marginBottom: 3 }}>
                      JUMBO {t ? `#${t.numero ?? "?"}${t.lote ? ` · ${t.lote}` : ""}` : ""}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color }}>{p0.tipo} · {p0.color}</div>
                    <Medidas g={g} color={color} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
