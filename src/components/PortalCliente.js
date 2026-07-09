import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fechaLegible } from "../lib/utils";
import { IcoLock, IcoPed } from "./Icons";

const STATUS_BADGE = {
  anotado:   { lbl: "Anotado",    cls: "b-accent" },
  proceso:   { lbl: "En proceso", cls: "b-blue" },
  pendiente: { lbl: "En proceso", cls: "b-blue" },
  terminado: { lbl: "Entregado",  cls: "b-green" },
};

const PASOS = ["Anotado", "Producción", "Listo"];
const PASOS_COLOR = ["var(--orange)", "var(--blue)", "var(--green)"];

const pasoDe = (status) => {
  if (status === "terminado") return 3;
  if (status === "proceso" || status === "pendiente") return 2;
  return 1;
};

const ProgresoPedido = ({ status }) => {
  const paso = pasoDe(status);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {PASOS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < paso ? PASOS_COLOR[i] : "var(--border-light)" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        {PASOS.map((p, i) => (
          <span key={p} style={{ fontSize: 10, color: i < paso ? PASOS_COLOR[i] : "var(--muted)", fontWeight: i < paso ? 700 : 400 }}>{p}</span>
        ))}
      </div>
    </div>
  );
};

const PedidoCard = ({ p }) => {
  const badge = STATUS_BADGE[p.status] || { lbl: p.status, cls: "b-accent" };
  return (
    <div className="list-item">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Pedido #{p.num}</strong>
        <span className={`badge ${badge.cls}`}>{badge.lbl}</span>
      </div>
      <div className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
        {p.medida && <span>{p.medida}</span>}
        {p.cajas != null && <span>{p.cajas} cajas</span>}
        {p.piezas_prod != null && p.piezas_prod !== "" && <span>{p.piezas_prod} piezas</span>}
        {(p.color || p.tinta_tipo) && <span>Tinta: {p.color || p.tinta_tipo}</span>}
      </div>
      {p.fecha_estimada && (
        <div style={{ marginTop: 8, background: "var(--surface)", borderRadius: "var(--r-sm)", padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>Entrega estimada</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>{fechaLegible(p.fecha_estimada)}</div>
        </div>
      )}
      {p.fecha_original && p.fecha_original !== p.fecha_estimada && (
        <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6 }}>
          Fecha actualizada — nueva entrega estimada: {fechaLegible(p.fecha_estimada)}
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
      const { data: clientes, error } = await supabase.rpc("portal_get_cliente", { p_token: token });
      const cli = clientes?.[0];

      if (error || !cli) { setEstado("invalido"); return; }
      setCliente(cli);

      const { data: peds, error: errorPeds } = await supabase.rpc("portal_get_pedidos", { p_token: token });
      if (errorPeds) { setEstado("error"); return; }

      setPedidos(peds || []);
      setEstado("ok");
    };
    cargar();
  }, [token]);

  if (estado === "cargando") {
    return (
      <div className="loading-screen">
        <div className="loading-icon"><IcoPed /></div>
        <div className="loading-text">CARGANDO TUS PEDIDOS…</div>
      </div>
    );
  }

  if (estado === "invalido") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", textAlign: "center", padding: 24 }}>
        <div style={{ width: 44, height: 44, color: "var(--muted)", marginBottom: 14 }}><IcoLock /></div>
        <div style={{ fontFamily: "var(--font-h)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Link no válido</div>
        <div className="muted" style={{ marginTop: 6 }}>Verifica el enlace o solicita uno nuevo a EEMSA.</div>
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", textAlign: "center", padding: 24 }}>
        <div style={{ fontFamily: "var(--font-h)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>No pudimos cargar tus pedidos</div>
        <div className="muted" style={{ marginTop: 6, marginBottom: 16 }}>Puede ser tu conexión. Intenta de nuevo en un momento.</div>
        <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Reintentar</button>
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
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 32 }}>
      <header className="header" style={{ position: "static", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", maxWidth: 640 }}>
          <div className="logo">E</div>
          <div>
            <div className="header-title">EEMSA System</div>
            <div className="header-sub">Portal de Clientes</div>
          </div>
        </div>
      </header>

      <main style={{ padding: "20px 16px 32px", maxWidth: 640, margin: "0 auto" }}>
        <h2 className="sec-title">Hola, {cliente.nombre}</h2>

        <div className="stat-grid">
          <div className="stat-card accent"><div className="stat-val">{cAnotados}</div><div className="stat-lbl">Anotados</div></div>
          <div className="stat-card blue"><div className="stat-val">{cProceso}</div><div className="stat-lbl">En proceso</div></div>
          <div className="stat-card green"><div className="stat-val">{cEntregados}</div><div className="stat-lbl">Entregados</div></div>
        </div>

        <h3 className="sub-title">Pedidos activos</h3>
        {activos.length === 0
          ? <div className="empty">No tienes pedidos activos en este momento.</div>
          : <div className="list" style={{ marginBottom: 8 }}>{activos.map(p => <PedidoCard key={p.num} p={p} />)}</div>
        }

        {entregados.length > 0 && (
          <>
            <h3 className="sub-title" style={{ marginTop: 24 }}>Últimos entregados</h3>
            <div className="list">
              {entregados.map(p => (
                <div key={p.num} className="list-item" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Pedido #{p.num}</div>
                    <div className="muted">{p.medida} · {p.cajas} cajas</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>{p.fecha_termino}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "18px 16px 24px", color: "var(--muted)", fontSize: 11, borderTop: "1px solid var(--border)" }}>
        EEMSA · Contacto: (871) 103-9578<br />
        Este enlace es personal e intransferible.
      </footer>
    </div>
  );
}
