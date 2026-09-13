import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { resumenProduccionTodas, resumenAgenda } from "../lib/jarvis";
import { detectarInventarioCritico } from "../lib/alertas";
import { META_CAJAS } from "../lib/constants";

// Publica (sin login), pensada para dejarse fija en una pantalla/TV de la
// planta -- mismo criterio que PizarraOperador.js/PizarraRebobinado.js:
// pedidos y materiales ya tienen lectura abierta a la anon key (las mismas
// politicas RLS que ya usan Inventario.js/Dashboard.js), asi que esto no
// expone nada que no estuviera ya accesible, solo lo junta en una vista
// grande y de solo lectura. Sin botones, sin login, sin nada que controle
// una maquina -- se recarga sola con Supabase Realtime.
const hoyMexico = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

export default function CommandCenter() {
  const [pedidos, setPedidos] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [prodDiaria, setProdDiaria] = useState([]);
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const tituloPrevio = document.title;
    document.title = "EEMSA · Command Center";
    return () => { document.title = tituloPrevio; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const cargar = async () => {
    const hoy = hoyMexico();
    const [pedidosRes, materialesRes, prodRes] = await Promise.all([
      supabase.from("pedidos").select("num, cliente, tipo, medida, cajas, status, maq, fecha_estimada, fecha_inicio, inicio_ts, fin_ts"),
      supabase.from("materiales").select("nombre, categoria, stock, stock_min"),
      supabase.from("prod_diaria").select("num_pedido, cajas_dia, fecha, created").eq("fecha", hoy),
    ]);
    setPedidos(pedidosRes.data || []);
    setMateriales(materialesRes.data || []);
    setProdDiaria(prodRes.data || []);
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const canal = supabase.channel("rt_command_center")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "prod_diaria" }, () => cargar())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const hoy = hoyMexico();
  const { maquinas } = resumenProduccionTodas(pedidos, prodDiaria, hoy, META_CAJAS);
  const critico = detectarInventarioCritico(materiales);
  const { atrasados } = resumenAgenda(pedidos, hoy);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8e8e8", padding: 32, fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28, borderBottom: "3px solid #c9922a", paddingBottom: 14 }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: ".04em" }}>🖥️ EEMSA · COMMAND CENTER</div>
        <div style={{ fontSize: 20, color: "#999" }}>{ahora.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short" })}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
        {maquinas.map(m => (
          <div key={m.maquina} style={{ background: "#13161e", border: "2px solid #2a2d3a", borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 16, color: "#c9922a", fontWeight: 700, letterSpacing: ".06em" }}>{m.maquina}</div>
            {m.pedido_activo ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>#{m.pedido_activo.num} · {m.pedido_activo.cliente}</div>
                <div style={{ fontSize: 15, color: "#999", marginTop: 2 }}>{m.pedido_activo.tipo} · {m.pedido_activo.medida}</div>
              </>
            ) : (
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: "#555" }}>Libre</div>
            )}
            <div style={{ marginTop: 14, fontSize: 34, fontWeight: 900, color: m.meta_cajas && m.cajas_hoy >= m.meta_cajas ? "#4be87a" : "#e8b84b" }}>
              {m.cajas_hoy}{m.meta_cajas ? <span style={{ fontSize: 18, color: "#666" }}> / {m.meta_cajas}</span> : null}
            </div>
            <div style={{ fontSize: 13, color: "#666" }}>cajas hoy</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "#13161e", border: `2px solid ${critico.length ? "#e84b4b" : "#2a2d3a"}`, borderRadius: 16, padding: 22 }}>
          <div style={{ fontSize: 16, color: critico.length ? "#e84b4b" : "#c9922a", fontWeight: 700, letterSpacing: ".06em" }}>📦 INVENTARIO CRÍTICO</div>
          {critico.length === 0 ? (
            <div style={{ fontSize: 20, color: "#4be87a", marginTop: 10 }}>✓ Todo en orden</div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {critico.slice(0, 6).map(m => (
                <div key={m.nombre} style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                  <span>{m.nombre}</span><span style={{ color: "#e84b4b", fontWeight: 700 }}>{m.stock} / {m.stock_min}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: "#13161e", border: `2px solid ${atrasados.length ? "#e84b4b" : "#2a2d3a"}`, borderRadius: 16, padding: 22 }}>
          <div style={{ fontSize: 16, color: atrasados.length ? "#e84b4b" : "#c9922a", fontWeight: 700, letterSpacing: ".06em" }}>📅 PEDIDOS ATRASADOS</div>
          {atrasados.length === 0 ? (
            <div style={{ fontSize: 20, color: "#4be87a", marginTop: 10 }}>✓ Nada atrasado</div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {atrasados.slice(0, 6).map(p => (
                <div key={p.num} style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                  <span>#{p.num} · {p.cliente}</span><span style={{ color: "#e84b4b", fontWeight: 700 }}>{p.fecha_estimada}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
