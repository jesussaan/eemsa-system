import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fechaLegible } from "../lib/utils";

const STATUS_BADGE = {
  anotado:   { lbl: "Anotado",    color: "#e8b84b" },
  proceso:   { lbl: "En proceso", color: "#4b8fe8" },
  pendiente: { lbl: "En proceso", color: "#4b8fe8" },
  terminado: { lbl: "Entregado",  color: "#4be87a" },
};

const PASOS = ["Anotado", "Producción", "Listo"];

const pasoDe = (status) => {
  if (status === "terminado") return 3;
  if (status === "proceso" || status === "pendiente") return 2;
  return 1;
};

const ProgresoPedido = ({ status }) => {
  const paso = pasoDe(status);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {PASOS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < paso ? "#c9922a" : "#2a2d3a" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {PASOS.map((p, i) => (
          <span key={p} style={{ fontSize: 10, color: i < paso ? "#c9922a" : "#555", fontWeight: i < paso ? 700 : 400 }}>{p}</span>
        ))}
      </div>
    </div>
  );
};

const PedidoCard = ({ p }) => {
  const badge = STATUS_BADGE[p.status] || { lbl: p.status, color: "#888" };
  return (
    <div style={{ background: "#1a1d26", borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Pedido #{p.num}</span>
        <span style={{ background: badge.color + "22", color: badge.color, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{badge.lbl}</span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#aaa" }}>
        {p.medida && <span>📏 {p.medida}</span>}
        {p.cajas != null && <span>📦 {p.cajas} cajas</span>}
        {p.piezas_prod != null && p.piezas_prod !== "" && <span>🔢 {p.piezas_prod} piezas</span>}
      </div>
      {p.fecha_estimada && (
        <div style={{ marginTop: 8, background: "#0d0f14", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>📅 Entrega estimada</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#c9922a" }}>{fechaLegible(p.fecha_estimada)}</div>
        </div>
      )}
      {p.fecha_original && p.fecha_original !== p.fecha_estimada && (
        <div style={{ fontSize: 11, color: "#e8b84b", marginTop: 6 }}>
          🔄 Fecha actualizada — nueva entrega estimada: {fechaLegible(p.fecha_estimada)}
        </div>
      )}
      <ProgresoPedido status={p.status} />
    </div>
  );
};

export default function PortalCliente({ token }) {
  const [estado, setEstado] = useState("cargando"); // cargando | ok | invalido
  const [cliente, setCliente] = useState(null);
  const [pedidos, setPedidos] = useState([]);

  useEffect(() => {
    const tituloPrevio = document.title;
    document.title = "EEMSA - Portal de Clientes";
    let iconPrevio = null;
    let link = document.querySelector("link[rel~='icon']");
    if (link) {
      iconPrevio = link.getAttribute("href");
      link.setAttribute("href", "/logo192.png");
    }
    return () => {
      document.title = tituloPrevio;
      if (link && iconPrevio) link.setAttribute("href", iconPrevio);
    };
  }, []);

  useEffect(() => {
    const cargar = async () => {
      const { data: cli, error } = await supabase
        .from("clientes")
        .select("nombre, portal_token")
        .eq("portal_token", token)
        .maybeSingle();

      if (error || !cli) { setEstado("invalido"); return; }
      setCliente(cli);

      const { data: peds } = await supabase
        .from("pedidos")
        .select("num, medida, cajas, piezas_prod, status, fecha_solicitud, fecha_estimada, fecha_termino, fecha_original")
        .eq("cliente", cli.nombre);

      setPedidos(peds || []);
      setEstado("ok");
    };
    cargar();
  }, [token]);

  if (estado === "cargando") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d0f14", color: "#888", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  if (estado === "invalido") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d0f14", color: "#888", textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0" }}>Link no válido</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Verifica el enlace o solicita uno nuevo a EEMSA.</div>
      </div>
    );
  }

  const activos = pedidos.filter(p => p.status !== "terminado");
  const entregados = pedidos
    .filter(p => p.status === "terminado")
    .sort((a, b) => (b.fecha_termino || "").localeCompare(a.fecha_termino || ""))
    .slice(0, 5);

  const cAnotados = pedidos.filter(p => p.status === "anotado").length;
  const cProceso = pedidos.filter(p => p.status === "proceso" || p.status === "pendiente").length;
  const cEntregados = pedidos.filter(p => p.status === "terminado").length;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", paddingBottom: 32 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#11131a", borderBottom: "1px solid #1e2130" }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 38, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "#c9922a", fontWeight: 700, letterSpacing: ".08em" }}>PORTAL DE CLIENTES</div>
        </div>
      </header>

      <main style={{ padding: "16px 16px 32px", maxWidth: 640, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: "#e0e0e0", letterSpacing: ".04em", margin: "0 0 14px" }}>
          Hola, {cliente.nombre} 👋
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          <div style={{ background: "#13161e", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#e8b84b" }}>{cAnotados}</div>
            <div style={{ fontSize: 10, color: "#666" }}>Anotados</div>
          </div>
          <div style={{ background: "#13161e", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#4b8fe8" }}>{cProceso}</div>
            <div style={{ fontSize: 10, color: "#666" }}>En proceso</div>
          </div>
          <div style={{ background: "#13161e", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#4be87a" }}>{cEntregados}</div>
            <div style={{ fontSize: 10, color: "#666" }}>Entregados</div>
          </div>
        </div>

        <h3 style={{ fontSize: 13, color: "#c9922a", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 8px" }}>Pedidos activos</h3>
        {activos.length === 0 && <div style={{ color: "#444", fontSize: 13, padding: "16px 0" }}>No tienes pedidos activos en este momento.</div>}
        {activos.map(p => <PedidoCard key={p.num} p={p} />)}

        {entregados.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, color: "#c9922a", textTransform: "uppercase", letterSpacing: ".06em", margin: "20px 0 8px" }}>Últimos entregados</h3>
            {entregados.map(p => (
              <div key={p.num} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#13161e", borderRadius: 10, padding: "10px 14px", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>Pedido #{p.num}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>{p.medida} · {p.cajas} cajas</div>
                </div>
                <div style={{ fontSize: 11, color: "#4be87a", fontWeight: 700 }}>{p.fecha_termino}</div>
              </div>
            ))}
          </>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "16px 16px 24px", color: "#444", fontSize: 11, borderTop: "1px solid #1e2130" }}>
        EEMSA · Contacto: (871) 103-9578<br />
        Este enlace es personal e intransferible.
      </footer>
    </div>
  );
}
