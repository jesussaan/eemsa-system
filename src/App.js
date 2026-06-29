import { useState, useEffect } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";
import Dashboard from "./components/Dashboard";
import Pedidos from "./components/Pedidos";
import Produccion from "./components/Produccion";
import Refacciones from "./components/Refacciones";
import Fallas from "./components/Fallas";
import Clientes from "./components/Clientes";
import AsistenteIA from "./components/AsistenteIA";
import ModoOperador from "./components/ModoOperador"
import ModoTV from "./components/ModoTV"
import ModoVentas from "./components/ModoVentas";
import ModoEmilio from "./components/ModoEmilio";
import CalendarioEntregas from "./components/CalendarioEntregas";
import PortalCliente from "./components/PortalCliente";
import NotifBell from "./components/NotifBell";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const IcoDash = () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
const IcoPed  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>);
const IcoProd = () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IcoRef  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>);
const IcoFal  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>);
const IcoCli  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>);
const IcoIA   = () => (<svg viewBox="0 0 24 24" {...S}><rect x="7" y="7" width="10" height="10" rx="1"/><line x1="7" y1="4" x2="7" y2="7"/><line x1="12" y1="4" x2="12" y2="7"/><line x1="17" y1="4" x2="17" y2="7"/><line x1="7" y1="17" x2="7" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/><line x1="17" y1="17" x2="17" y2="20"/><line x1="4" y1="7" x2="7" y2="7"/><line x1="4" y1="12" x2="7" y2="12"/><line x1="4" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="20" y2="7"/><line x1="17" y1="12" x2="20" y2="12"/><line x1="17" y1="17" x2="20" y2="17"/></svg>);
const IcoCal  = () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/></svg>);

const TABS = [
  { id: "dash", Icon: IcoDash, lbl: "Dashboard" },
  { id: "ped",  Icon: IcoPed,  lbl: "Pedidos" },
  { id: "cal",  Icon: IcoCal,  lbl: "Agenda" },
  { id: "prod", Icon: IcoProd, lbl: "Producción" },
  { id: "ref",  Icon: IcoRef,  lbl: "Refacc." },
  { id: "fal",  Icon: IcoFal,  lbl: "Fallas" },
  { id: "cli",  Icon: IcoCli,  lbl: "Clientes" },
  { id: "ia",   Icon: IcoIA,   lbl: "IA" },
];

const PIN_SUPERVISOR = "2312";

export default function App() {
  const portalMatch = window.location.pathname.match(/^\/cliente\/([^/]+)\/?$/);
  if (portalMatch) return <PortalCliente token={portalMatch[1]} />;
  return <EemsaApp />;
}

function EemsaApp() {
  const [tab, setTab] = useState("dash");
  const [pedidos, setPedidos] = useState([]);
  const [fallas, setFallas] = useState([]);
  const [refs, setRefs] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [prodDiaria, setProdDiaria] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState(null); // null | "operador" | "supervisor"
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  const cargarTablas = async (tablas) => {
    const mapa = {
      pedidos:     (d) => setPedidos(d),
      fallas:      (d) => setFallas(d),
      refacciones: (d) => setRefs(d),
      proveedores: (d) => setProveedores(d),
      prod_diaria: (d) => setProdDiaria(d),
    };
    await Promise.all(tablas.map(async t => {
      const { data } = await supabase.from(t).select("*");
      if (data && mapa[t]) mapa[t](data);
    }));
  };

  useEffect(() => {
    const cargar = async () => {
      await cargarTablas(["pedidos", "fallas", "refacciones", "proveedores", "prod_diaria"]);
      setCargando(false);
    };
    cargar();
  }, []);

  // Realtime: actualiza el estado local cuando otro usuario cambia datos en Supabase
  useEffect(() => {
    const setters = {
      pedidos:     { set: setPedidos },
      fallas:      { set: setFallas },
      refacciones: { set: setRefs },
      proveedores: { set: setProveedores },
      prod_diaria: { set: setProdDiaria },
    };
    const canales = Object.entries(setters).map(([tabla, { set }]) =>
      supabase.channel(`rt_${tabla}`)
        .on("postgres_changes", { event: "*", schema: "public", table: tabla }, ({ eventType, new: nuevo, old: viejo }) => {
          if (eventType === "INSERT") set(prev => prev.some(r => r.id === nuevo.id) ? prev : [nuevo, ...prev]);
          if (eventType === "UPDATE") set(prev => prev.map(r => r.id === nuevo.id ? nuevo : r));
          if (eventType === "DELETE") set(prev => prev.filter(r => r.id !== viejo.id));
        })
        .subscribe()
    );
    return () => canales.forEach(c => supabase.removeChannel(c));
  }, []);

  const handlePinDigit = (d) => {
    const next = pinInput + d;
    setPinError(false);
    if (next.length < 4) { setPinInput(next); return; }
    if (next === PIN_SUPERVISOR) {
      setModo("supervisor");
      setShowPinModal(false);
      setPinInput("");
    } else {
      setPinError(true);
      setPinInput("");
    }
  };

  if (cargando) return (
    <div className="loading-screen">
      <div className="loading-icon">⚙️</div>
      <div className="loading-text">CARGANDO EEMSA SYSTEM…</div>
    </div>
  );

  if (!modo) return (
    <div className="mode-screen">
      <img src="/logo192.png" alt="EEMSA" className="mode-logo" />
      <div className="mode-tagline">Control SIAT L36 · Calidad · Innovación</div>
      <div className="mode-buttons">
        <button className="mode-btn mode-btn-op" onClick={() => setModo("operador")}>
          <span>👷</span> Modo Operador
        </button>
        <button className="mode-btn mode-btn-ven" onClick={() => setModo("ventas")}>
          <span>🛒</span> Módulo Ventas
        </button>
        <button className="mode-btn mode-btn-emi" onClick={() => setModo("emilio")}>
          <span>🔔</span> Modo Emilio
        </button>
        <button className="mode-btn mode-btn-sup" onClick={() => { setShowPinModal(true); setPinInput(""); setPinError(false); }}>
          <span>🔒</span> Modo Supervisor
        </button>
        <button className="mode-btn mode-btn-tv" onClick={() => setModo("tv")}>
          <span>📺</span> Modo TV
        </button>
      </div>

      {showPinModal && (
        <div className="pin-overlay">
          <div className="pin-dialog">
            <div className="pin-title">🔒 PIN Supervisor</div>
            <div className="pin-dots">
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-dot${pinInput.length > i ? " filled" : ""}`} />
              ))}
            </div>
            {pinError && <div className="pin-error">PIN incorrecto</div>}
            <div className="pin-grid">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} className="pin-key" onClick={() => handlePinDigit(String(n))}>{n}</button>
              ))}
              <div />
              <button className="pin-key" onClick={() => handlePinDigit("0")}>0</button>
              <button className="pin-key" onClick={() => { setPinInput(p => p.slice(0, -1)); setPinError(false); }}>⌫</button>
            </div>
            <button className="pin-cancel" onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(false); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (modo === "operador") return (
    <ModoOperador
      pedidos={pedidos} setPedidos={setPedidos}
      fallas={fallas} setFallas={setFallas}
      onSalir={() => setModo(null)}
    />
  );

  if (modo === "ventas") return (
    <ModoVentas
      pedidos={pedidos} setPedidos={setPedidos}
      onSalir={() => setModo(null)}
    />
  );

  if (modo === "emilio") return (
    <ModoEmilio
      pedidos={pedidos} setPedidos={setPedidos}
      onSalir={() => setModo(null)}
    />
  );

  if (modo === "tv") return (
    <ModoTV
      pedidos={pedidos}
      fallas={fallas}
      onSalir={() => setModo(null)}
    />
  );

  // modo === "supervisor"
  return (
    <div className="app">
      <header className="header">
        <img src="/logo192.png" alt="EEMSA" style={{ height: 40, width: "auto" }} />
        <div>
          <div className="header-title">EEMSA System</div>
          <div className="header-sub">Control SIAT L36 · Asesoría · Calidad · Innovación</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <NotifBell />
          <button onClick={() => setModo(null)} style={{ fontSize: 11, color: "#aaa", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
        </div>
      </header>
      <main className="main">
        {tab === "dash" && <Dashboard pedidos={pedidos} fallas={fallas} refacciones={refs} proveedores={proveedores} prodDiaria={prodDiaria} />}
        {tab === "ped"  && <Pedidos pedidos={pedidos} setPedidos={setPedidos} />}
        {tab === "cal"  && <CalendarioEntregas pedidos={pedidos} setPedidos={setPedidos} />}
        {tab === "prod" && <Produccion prodDiaria={prodDiaria} setProdDiaria={setProdDiaria} pedidos={pedidos} />}
        {tab === "ref"  && <Refacciones refs={refs} setRefs={setRefs} proveedores={proveedores} setProveedores={setProveedores} />}
        {tab === "fal"  && <Fallas fallas={fallas} setFallas={setFallas} />}
        {tab === "cli"  && <Clientes pedidos={pedidos} />}
        {tab === "ia"   && <AsistenteIA onRefrescar={cargarTablas} />}
      </main>
      <nav className="tab-bar">
        {TABS.map(t => {
          const badge = t.id === "fal" ? fallas.filter(f => f.status === "abierta").length
                      : t.id === "ref" ? refs.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length
                      : t.id === "ped" ? pedidos.filter(p => p.status === "pendiente").length
                      : 0;
          return (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <t.Icon />
                {badge > 0 && <span className="tab-badge">{badge}</span>}
              </span>
              <span className="tab-lbl">{t.lbl}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
