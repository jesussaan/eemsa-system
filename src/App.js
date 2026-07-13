import { useState, useEffect, lazy, Suspense } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";
import NotifBell from "./components/NotifBell";
import { IcoDash, IcoPed, IcoProd, IcoRef, IcoFal, IcoCli, IcoIA, IcoCal, IcoLock, IcoOperador, IcoVentas, IcoEmilio, IcoCotizador, IcoSpinner, IcoRoll } from "./components/Icons";

// Cada pantalla se carga solo cuando se visita, en vez de todas juntas en el
// bundle inicial (Dashboard/Refacciones/etc. cargan jspdf, recharts, xlsx...).
const Dashboard = lazy(() => import("./components/Dashboard"));
const Pedidos = lazy(() => import("./components/Pedidos"));
const Produccion = lazy(() => import("./components/Produccion"));
const Refacciones = lazy(() => import("./components/Refacciones"));
const Fallas = lazy(() => import("./components/Fallas"));
const Rebobinado = lazy(() => import("./components/Rebobinado"));
const Clientes = lazy(() => import("./components/Clientes"));
const AsistenteIA = lazy(() => import("./components/AsistenteIA"));
const ModoOperador = lazy(() => import("./components/ModoOperador"));
const ModoVentas = lazy(() => import("./components/ModoVentas"));
const ModoEmilio = lazy(() => import("./components/ModoEmilio"));
const Cotizador = lazy(() => import("./components/Cotizador"));
const CalendarioEntregas = lazy(() => import("./components/CalendarioEntregas"));
const PortalCliente = lazy(() => import("./components/PortalCliente"));

const PantallaCargando = () => (
  <div className="loading-screen">
    <div className="loading-icon"><IcoSpinner /></div>
    <div className="loading-text">CARGANDO EEMSA SYSTEM…</div>
  </div>
);

// Avisa cuando hay una version nueva desplegada (el Service Worker ya tomo
// control) en vez de recargar solo -- asi no se pierde algo que alguien
// este llenando a la mitad.
const AvisoActualizacion = () => {
  const [hayActualizacion, setHayActualizacion] = useState(false);
  useEffect(() => {
    const onUpdate = () => setHayActualizacion(true);
    window.addEventListener('eemsa:actualizacion-disponible', onUpdate);
    return () => window.removeEventListener('eemsa:actualizacion-disponible', onUpdate);
  }, []);
  if (!hayActualizacion) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, background: "var(--accent)", color: "#0b0d11", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 13, fontWeight: 700, boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
      Hay una actualización disponible
      <button onClick={() => window.location.reload()} style={{ background: "#0b0d11", color: "var(--accent)", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
        Actualizar ahora
      </button>
    </div>
  );
};

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

export default function App() {
  const portalMatch = window.location.pathname.match(/^\/cliente\/([^/]+)\/?$/);
  return (
    <>
      <AvisoActualizacion />
      {portalMatch
        ? <Suspense fallback={<PantallaCargando />}><PortalCliente token={portalMatch[1]} /></Suspense>
        : <EemsaApp />}
    </>
  );
}

function EemsaApp() {
  const [tab, setTab] = useState("dash");
  const [pedidos, setPedidos] = useState([]);
  const [fallas, setFallas] = useState([]);
  const [refs, setRefs] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [prodDiaria, setProdDiaria] = useState([]);
  const [listaMateriales, setListaMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [modo, setModo] = useState(null); // null | "operador" | "supervisor"
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinTarget, setPinTarget] = useState("supervisor");
  const [pinVerificando, setPinVerificando] = useState(false);

  const cargarTablas = async (tablas) => {
    const mapa = {
      pedidos:          (d) => setPedidos(d),
      fallas:           (d) => setFallas(d),
      refacciones:      (d) => setRefs(d),
      proveedores:      (d) => setProveedores(d),
      prod_diaria:      (d) => setProdDiaria(d),
      lista_materiales: (d) => setListaMateriales(d),
    };
    const fallidas = [];
    await Promise.all(tablas.map(async t => {
      const { data, error } = await supabase.from(t).select("*");
      if (error) { fallidas.push(t); return; }
      if (data && mapa[t]) mapa[t](data);
    }));
    setErrorCarga(fallidas.length ? `No se pudo cargar: ${fallidas.join(", ")}. Revisa tu conexión y recarga la página.` : null);
  };

  useEffect(() => {
    const cargar = async () => {
      await cargarTablas(["pedidos", "fallas", "refacciones", "proveedores", "prod_diaria", "lista_materiales"]);
      setCargando(false);
    };
    cargar();
  }, []);

  // Realtime: actualiza el estado local cuando otro usuario cambia datos en Supabase
  useEffect(() => {
    const setters = {
      pedidos:          { set: setPedidos },
      fallas:           { set: setFallas },
      refacciones:      { set: setRefs },
      proveedores:      { set: setProveedores },
      prod_diaria:      { set: setProdDiaria },
      lista_materiales: { set: setListaMateriales },
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

  const handlePinDigit = async (d) => {
    const next = pinInput + d;
    setPinError(false);
    if (next.length < 4) { setPinInput(next); return; }
    setPinInput("");
    setPinVerificando(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: next, target: pinTarget }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem(`token_${pinTarget}`, data.token);
        setModo(pinTarget);
        setShowPinModal(false);
      } else {
        setPinError(true);
      }
    } catch {
      setPinError(true);
    }
    setPinVerificando(false);
  };

  const abrirPin = (target) => { setPinTarget(target); setShowPinModal(true); setPinInput(""); setPinError(false); };

  if (cargando) return (
    <div className="loading-screen">
      <div className="loading-icon"><IcoSpinner /></div>
      <div className="loading-text">CARGANDO EEMSA SYSTEM…</div>
    </div>
  );

  if (!modo) return (
    <div className="mode-screen">
      <div className="mode-glow" aria-hidden="true" />
      <div className="mode-top">EEMSA System</div>

      <div className="mode-hero">
        <img src="/logo192.png" alt="EEMSA" className="mode-logo" />
        <div className="mode-tagline">Control SIAT L36 · Calidad · Innovación</div>
        {errorCarga && (
          <div style={{ background: "rgba(232,75,75,0.12)", border: "1px solid rgba(232,75,75,0.4)", color: "#ff9b9b", borderRadius: 10, padding: "10px 16px", fontSize: 12, maxWidth: 300, textAlign: "center", marginBottom: 16 }}>
            ⚠ {errorCarga}
          </div>
        )}
        <div className="mode-buttons">
          <button className="mode-btn mode-btn-op" onClick={() => setModo("operador")}>
            <span style={{ display: "inline-flex", fontSize: 20 }}><IcoOperador /></span> Modo Operador
          </button>
          <button className="mode-btn mode-btn-ven" onClick={() => setModo("ventas")}>
            <span style={{ display: "inline-flex", fontSize: 20 }}><IcoVentas /></span> Módulo Ventas
          </button>
          <button className="mode-btn mode-btn-emi" onClick={() => setModo("emilio")}>
            <span style={{ display: "inline-flex", fontSize: 20 }}><IcoEmilio /></span> Modo Emilio
          </button>
          <button className="mode-btn mode-btn-reb" onClick={() => setModo("rebobinado")}>
            <span style={{ display: "inline-flex", fontSize: 20 }}><IcoRoll /></span> Modo Rebobinado
          </button>
          <button className="mode-btn mode-btn-sup" onClick={() => abrirPin("supervisor")}>
            <span style={{ display: "inline-flex", fontSize: 20 }}><IcoDash /></span> Modo Supervisor
            <span className="mode-btn-lock" style={{ display: "inline-flex" }}><IcoLock /></span>
          </button>
          <button className="mode-btn mode-btn-cot" onClick={() => abrirPin("cotizador")}>
            <span style={{ display: "inline-flex", fontSize: 20 }}><IcoCotizador /></span> Cotizador
            <span className="mode-btn-lock" style={{ display: "inline-flex" }}><IcoLock /></span>
          </button>
        </div>
      </div>

      <div className="mode-bottom">Asesoría · Calidad · Innovación</div>

      {showPinModal && (
        <div className="pin-overlay">
          <div className="pin-dialog">
            <div className="pin-title" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", fontSize: 18 }}>{pinTarget === "cotizador" ? <IcoCotizador /> : <IcoLock />}</span>
              {pinTarget === "cotizador" ? "PIN Cotizador" : "PIN Supervisor"}
            </div>
            <div className="pin-dots">
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-dot${pinInput.length > i ? " filled" : ""}`} />
              ))}
            </div>
            {pinError && <div className="pin-error">PIN incorrecto</div>}
            {pinVerificando && <div className="muted" style={{ textAlign: "center", marginBottom: 8 }}>Verificando…</div>}
            <div className="pin-grid" style={{ opacity: pinVerificando ? 0.5 : 1, pointerEvents: pinVerificando ? "none" : "auto" }}>
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
    <Suspense fallback={<PantallaCargando />}>
      <ModoOperador
        pedidos={pedidos} setPedidos={setPedidos}
        fallas={fallas} setFallas={setFallas}
        onSalir={() => setModo(null)}
      />
    </Suspense>
  );

  if (modo === "ventas") return (
    <Suspense fallback={<PantallaCargando />}>
      <ModoVentas
        pedidos={pedidos} setPedidos={setPedidos}
        onSalir={() => setModo(null)}
      />
    </Suspense>
  );

  if (modo === "rebobinado") return (
    <Suspense fallback={<PantallaCargando />}>
      <Rebobinado
        pedidos={pedidos} setPedidos={setPedidos}
        onSalir={() => setModo(null)}
      />
    </Suspense>
  );

  if (modo === "emilio") return (
    <Suspense fallback={<PantallaCargando />}>
      <ModoEmilio
        pedidos={pedidos} setPedidos={setPedidos}
        listaMateriales={listaMateriales} setListaMateriales={setListaMateriales}
        onSalir={() => setModo(null)}
      />
    </Suspense>
  );

  if (modo === "cotizador") return (
    <Suspense fallback={<PantallaCargando />}>
      <Cotizador onSalir={() => setModo(null)} />
    </Suspense>
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
      {errorCarga && (
        <div style={{ background: "rgba(232,75,75,0.12)", borderBottom: "1px solid rgba(232,75,75,0.4)", color: "#ff9b9b", padding: "8px 16px", fontSize: 12, textAlign: "center" }}>
          ⚠ {errorCarga}
        </div>
      )}
      <main className="main">
        <Suspense fallback={<PantallaCargando />}>
          {tab === "dash" && <Dashboard pedidos={pedidos} fallas={fallas} refacciones={refs} proveedores={proveedores} prodDiaria={prodDiaria} />}
          {tab === "ped"  && <Pedidos pedidos={pedidos} setPedidos={setPedidos} />}
          {tab === "cal"  && <CalendarioEntregas pedidos={pedidos} setPedidos={setPedidos} />}
          {tab === "prod" && <Produccion prodDiaria={prodDiaria} setProdDiaria={setProdDiaria} pedidos={pedidos} />}
          {tab === "ref"  && <Refacciones refs={refs} setRefs={setRefs} proveedores={proveedores} setProveedores={setProveedores} />}
          {tab === "fal"  && <Fallas fallas={fallas} setFallas={setFallas} />}
          {tab === "cli"  && <Clientes pedidos={pedidos} />}
          {tab === "ia"   && <AsistenteIA onRefrescar={cargarTablas} />}
        </Suspense>
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
