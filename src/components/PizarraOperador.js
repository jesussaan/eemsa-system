import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { alertaEntrega } from "../lib/utils";
import { REBOB_CLIENTE, PEDIDOS_COLUMNAS_PUBLICAS } from "../lib/constants";
import { tasasProduccion, programarProduccion } from "../lib/entregas";
import { chipColor } from "../lib/colores";
import BadgeUrgente from "./BadgeUrgente";

// Publica (sin login): pedidos ya tiene lectura abierta a la anon key (ver
// supabase_pedidos_fallas_security.sql, policy "anon_select"), la misma key
// que ya trae el bundle del sitio -- no se expone nada que no estuviera ya
// accesible. Pensada para imprimir UN solo QR fijo (ver boton en
// ModoOperador.js) que el operador escanea cuantas veces quiera durante el
// dia sin necesitar cuenta ni entrar a la app -- por eso no tiene login,
// botones de accion, ni nada que pueda cambiar un pedido, solo lectura en
// vivo (realtime) del mismo orden que ya se ve en Modo Operador.
const ColorChip = ({ color }) => {
  if (!color) return null;
  const bg = chipColor(color);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#181b24", borderRadius: 20, padding: "3px 10px 3px 6px", border: "1px solid #2a2d3a" }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: bg || "transparent", border: bg ? (bg === "#FFFFFF" ? "1.5px solid #888" : "none") : "2px dashed #888", display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>{color}</span>
    </span>
  );
};

export default function PizarraOperador() {
  const [pedidos, setPedidos] = useState([]);
  // Pedidos ya terminados con sus tiempos -- solo para saber cuanto saca la
  // maquina y armar el mismo programa que Modo Operador.
  const [historial, setHistorial] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const tituloPrevio = document.title;
    document.title = "EEMSA - Pizarra";
    return () => { document.title = tituloPrevio; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const cargar = async () => {
    // Esta pizarra es solo de la SIAT L36 (cinta personalizada de cliente)
    // -- los jumbos que se planean en Modo Rebobinado tambien usan status
    // "anotado"/"proceso" (ver Rebobinado.js), asi que se excluyen aqui
    // para que no se mezclen con los pedidos reales.
    const [{ data }, { data: hechos }] = await Promise.all([
      supabase.from("pedidos").select(PEDIDOS_COLUMNAS_PUBLICAS).in("status", ["anotado", "proceso"]).neq("cliente", REBOB_CLIENTE),
      supabase.from("pedidos").select("cliente, status, medida, cajas, piezas_prod, rollos_caja, inicio_ts, fin_ts, pausas").eq("status", "terminado").not("fin_ts", "is", null).order("fin_ts", { ascending: false }).limit(300),
    ]);
    setPedidos(data || []);
    setHistorial(hechos || []);
    setCargado(true);
  };

  useEffect(() => { cargar(); }, []);

  // Cualquier cambio en pedidos (nuevo, cambio de status, se reordeno, se
  // finalizo) recarga el tablero entero -- mas simple y confiable que
  // parchar el estado a mano, y pedidos no es una tabla tan grande como
  // para que importe el viaje extra.
  useEffect(() => {
    const canal = supabase.channel("rt_pizarra_operador")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => cargar())
      .subscribe();
    // Respaldo por si el tiempo real deja de avisar a la anon key (pedidos
    // solo le deja leer algunas columnas, ver PEDIDOS_COLUMNAS_PUBLICAS).
    const t = setInterval(cargar, 60000);
    return () => { supabase.removeChannel(canal); clearInterval(t); };
  }, []);

  const pedidosEnProceso = pedidos.filter(p => p.status === "proceso");
  // Mismo programa que Modo Operador: de tinta clara a intensa, sin que
  // ningun pedido llegue tarde (lib/entregas.js).
  const pedidosAnotados = useMemo(
    () => programarProduccion(pedidos, tasasProduccion(historial)).anotadosEnOrden,
    [pedidos, historial]
  );

  const card = { background: "#181b24", borderRadius: 14, padding: 18, marginBottom: 14 };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d11", color: "#e0e0e0" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "2px solid #c9922a", position: "sticky", top: 0, background: "#0b0d11", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo192.png" alt="EEMSA" style={{ height: 32, width: "auto" }} />
          <div>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: ".05em" }}>EEMSA · Pizarra en vivo</div>
            <div style={{ fontSize: 10, color: "#c9922a", fontWeight: 700, letterSpacing: ".08em" }}>SOLO LECTURA · SE ACTUALIZA SOLA</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#666", textAlign: "right" }}>{ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      <main style={{ padding: "18px 16px 40px", maxWidth: 620, margin: "0 auto" }}>
        {!cargado ? (
          <p style={{ textAlign: "center", color: "#666", fontSize: 13, marginTop: 40 }}>Cargando…</p>
        ) : (
          <>
            <h2 style={{ color: "#4b8fe8", fontSize: 14, margin: "8px 0 10px", textTransform: "uppercase", letterSpacing: ".08em" }}>▶ En proceso</h2>
            {pedidosEnProceso.length === 0 ? (
              <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>Sin pedidos en proceso.</p>
            ) : pedidosEnProceso.map(p => {
              const al = alertaEntrega(p.fecha_estimada, p.status);
              return (
                <div key={p.id} style={{ ...card, borderLeft: `4px solid ${al ? al.borde : "#4b8fe8"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{p.cliente}<BadgeUrgente pedido={p} /></div>
                    {al && <span style={{ fontSize: 12, fontWeight: 700, color: al.color, whiteSpace: "nowrap" }}>{al.txt}</span>}
                  </div>
                  <div style={{ color: "#c9922a", fontSize: 23, fontWeight: 800, marginBottom: 6 }}>{p.medida}</div>
                  <div style={{ display: "flex", gap: 10, fontSize: 15, color: "#9aa0bc", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{p.cajas} cajas</span>
                    <span style={{ fontWeight: 700 }}>{p.tipo}</span>
                    {(p.color || p.tinta_tipo) && <ColorChip color={p.color || p.tinta_tipo} />}
                    {p.color2 && <ColorChip color={p.color2} />}
                    <span style={{ color: "#666", fontSize: 12, fontWeight: 400 }}>#Ped {p.num}</span>
                  </div>
                </div>
              );
            })}

            <h2 style={{ color: "#ff9900", fontSize: 14, margin: "22px 0 10px", textTransform: "uppercase", letterSpacing: ".08em" }}>📋 Próximos — de color claro a intenso</h2>
            {pedidosAnotados.length === 0 ? (
              <p style={{ color: "#666", fontSize: 13 }}>Sin pedidos anotados en cola.</p>
            ) : pedidosAnotados.map((p, i) => {
              const al = alertaEntrega(p.fecha_estimada, p.status);
              return (
                <div key={p.id} style={{ ...card, borderLeft: `4px solid ${al ? al.borde : "#ff9900"}`, display: "flex", gap: 12 }}>
                  <div style={{ color: "#ff9900", fontWeight: 800, fontSize: 20, minWidth: 24, textAlign: "center" }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{p.cliente}<BadgeUrgente pedido={p} /></div>
                      {al && <span style={{ fontSize: 11, fontWeight: 700, color: al.color, whiteSpace: "nowrap", marginLeft: 6 }}>{al.txt}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 14, alignItems: "center" }}>
                      <span style={{ color: "#c9922a", fontWeight: 800, fontSize: 17 }}>{p.medida}</span>
                      <span style={{ color: "#9aa0bc", fontWeight: 700 }}>{p.tipo}</span>
                      {(p.color || p.tinta_tipo) && <ColorChip color={p.color || p.tinta_tipo} />}
                      {p.color2 && <ColorChip color={p.color2} />}
                      <span style={{ color: "#9aa0bc", fontWeight: 700 }}>{p.cajas} cajas</span>
                    </div>
                    {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Solicitud: {p.fecha_solicitud}</div>}
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
