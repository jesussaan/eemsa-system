import { useState, useEffect, lazy, Suspense } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";
import { initAuth, authHeaders, cerrarSesion } from "./lib/auth";
import NotifBell from "./components/NotifBell";
import Login from "./components/Login";
import { IcoDash, IcoPed, IcoProd, IcoRef, IcoFal, IcoCli, IcoIA, IcoCal, IcoOperador, IcoVentas, IcoEmilio, IcoCotizador, IcoSpinner, IcoRoll } from "./components/Icons";

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
const AdminUsuarios = lazy(() => import("./components/AdminUsuarios"));

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

// Un modo por checkbox del panel de Usuarios (src/components/AdminUsuarios.js).
const MODOS_DISPONIBLES = [
  { id: "operador",   Icon: IcoOperador,  lbl: "Modo Operador",   cls: "mode-btn-op" },
  { id: "ventas",     Icon: IcoVentas,    lbl: "Módulo Ventas",   cls: "mode-btn-ven" },
  { id: "emilio",     Icon: IcoEmilio,    lbl: "Modo Emilio",     cls: "mode-btn-emi" },
  { id: "rebobinado", Icon: IcoRoll,      lbl: "Modo Rebobinado", cls: "mode-btn-reb" },
  { id: "supervisor", Icon: IcoDash,      lbl: "Modo Supervisor", cls: "mode-btn-sup" },
  { id: "cotizador",  Icon: IcoCotizador, lbl: "Cotizador",       cls: "mode-btn-cot" },
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
  const [errorCarga, setErrorCarga] = useState(null);
  // Se recuerda en localStorage -- si el celular/tablet mata la app en
  // segundo plano (o la recarga por una actualizacion), regresa directo al
  // modo donde estabas en vez de mandar siempre al menu.
  const [modo, setModo] = useState(() => localStorage.getItem("eemsa_modo") || null);

  // undefined = todavia verificando si hay sesion guardada; null = sin sesion.
  const [sesion, setSesion] = useState(undefined);
  // undefined = cargando el perfil; null = error al cargarlo.
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    initAuth().then(setSesion);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sesion === undefined) return;
    if (!sesion) { setPerfil(null); localStorage.removeItem("eemsa_modo"); return; }
    setPerfil(undefined);
    fetch("/api/usuarios?propio=1", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setPerfil(d?.error ? null : d))
      .catch(() => setPerfil(null));
  }, [sesion]);

  // Valida el modo recordado contra los permisos reales una vez que el
  // perfil carga -- por si a alguien le quitaron acceso a ese modulo
  // mientras la app estaba cerrada.
  useEffect(() => {
    if (!perfil || !modo) return;
    const valido = modo === "usuarios" ? perfil.esAdmin : (perfil.esAdmin || perfil.modos.includes(modo));
    if (!valido) setModo(null);
  }, [perfil, modo]);

  useEffect(() => {
    if (modo) localStorage.setItem("eemsa_modo", modo);
    else localStorage.removeItem("eemsa_modo");
  }, [modo]);

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

  // Se pide de una vez, en paralelo con el login -- asi no hay espera extra
  // despues de iniciar sesion (las tablas ya tienen lectura anon abierta).
  useEffect(() => {
    cargarTablas(["pedidos", "fallas", "refacciones", "proveedores", "prod_diaria", "lista_materiales"]);
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

  if (sesion === undefined || perfil === undefined) return (
    <div className="loading-screen">
      <div className="loading-icon"><IcoSpinner /></div>
      <div className="loading-text">CARGANDO EEMSA SYSTEM…</div>
    </div>
  );

  if (!sesion) return <Login />;

  if (perfil === null) return (
    <div className="mode-screen">
      <div className="mode-glow" aria-hidden="true" />
      <div className="mode-top">EEMSA System</div>
      <div className="mode-hero">
        <img src="/logo192.png" alt="EEMSA" className="mode-logo" />
        <div style={{ color: "#ff9b9b", fontSize: 13, textAlign: "center", maxWidth: 300, marginBottom: 16 }}>
          No se pudo cargar tu perfil. Revisa tu conexión y recarga la página.
        </div>
        <button className="btn btn-primary" onClick={() => cerrarSesion()}>Cerrar sesión</button>
      </div>
    </div>
  );

  if (!perfil.activo || (perfil.modos.length === 0 && !perfil.esAdmin)) return (
    <div className="mode-screen">
      <div className="mode-glow" aria-hidden="true" />
      <div className="mode-top">EEMSA System</div>
      <div className="mode-hero">
        <img src="/logo192.png" alt="EEMSA" className="mode-logo" />
        <div className="mode-tagline">Control SIAT L36 · Calidad · Innovación</div>
        <div style={{ background: "rgba(201,146,42,0.12)", border: "1px solid rgba(201,146,42,0.4)", color: "#c9922a", borderRadius: 10, padding: "14px 18px", fontSize: 13, textAlign: "center", maxWidth: 320, marginBottom: 20, lineHeight: 1.6 }}>
          Tu cuenta ({perfil.email}) está esperando a que un administrador te dé acceso a un módulo. Avísale a Jesús.
        </div>
        <button className="btn btn-primary" onClick={() => cerrarSesion()}>Cerrar sesión</button>
      </div>
      <div className="mode-bottom">Asesoría · Calidad · Innovación</div>
    </div>
  );

  const modosVisibles = perfil.esAdmin ? MODOS_DISPONIBLES : MODOS_DISPONIBLES.filter(m => perfil.modos.includes(m.id));

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
          {modosVisibles.map(m => (
            <button key={m.id} className={`mode-btn ${m.cls}`} onClick={() => setModo(m.id)}>
              <span style={{ display: "inline-flex", fontSize: 20 }}><m.Icon /></span> {m.lbl}
            </button>
          ))}
          {perfil.esAdmin && (
            <button className="mode-btn mode-btn-usr" onClick={() => setModo("usuarios")}>
              <span style={{ display: "inline-flex", fontSize: 20 }}><IcoCli /></span> Usuarios
            </button>
          )}
        </div>
        <button
          onClick={() => cerrarSesion()}
          style={{ marginTop: 22, background: "transparent", border: "none", color: "var(--text-2)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
        >
          Cerrar sesión ({perfil.email})
        </button>
      </div>

      <div className="mode-bottom">Asesoría · Calidad · Innovación</div>
    </div>
  );

  if (modo === "usuarios") return (
    <Suspense fallback={<PantallaCargando />}>
      <AdminUsuarios onSalir={() => setModo(null)} />
    </Suspense>
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
