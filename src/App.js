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

const TABS = [
  { id: "dash", ico: "📊", lbl: "Dashboard" },
  { id: "ped",  ico: "📋", lbl: "Pedidos" },
  { id: "prod", ico: "📅", lbl: "Producción" },
  { id: "ref",  ico: "🔧", lbl: "Refacciones" },
  { id: "fal",  ico: "⚠️", lbl: "Fallas" },
  { id: "cli",  ico: "👥", lbl: "Clientes" },
  { id: "ia",   ico: "🤖", lbl: "Asistente" },
];

export default function App() {
  const [tab, setTab] = useState("dash");
  const [pedidos, setPedidos] = useState([]);
  const [fallas, setFallas] = useState([]);
  const [refs, setRefs] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [prodDiaria, setProdDiaria] = useState([]);
  const [cargando, setCargando] = useState(true);

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

  if (cargando) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16, background: "#0d0f14", color: "#e8b84b" }}>
      <div style={{ fontSize: 40 }}>⚙️</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: ".1em" }}>CARGANDO EEMSA SYSTEM…</div>
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <div className="logo">EE</div>
        <div>
          <div className="header-title">EEMSA System</div>
          <div className="header-sub">Control SIAT L36 · Asesoría · Calidad · Innovación</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#4be87a" }}>● En línea</div>
      </header>
      <div className="tab-bar">
        {TABS.map(t => {
          const badge = t.id === "fal" ? fallas.filter(f => f.status === "abierta").length
                      : t.id === "ref" ? refs.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length
                      : 0;
          return (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <span style={{ position: "relative", display: "inline-block" }}>
                {t.ico}
                {badge > 0 && <span style={{ position: "absolute", top: -4, right: -7, background: "#ff4d4d", color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 700, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
              </span>
              <span>{t.lbl}</span>
            </button>
          );
        })}
      </div>
      <main className="main">
        {tab === "dash" && <Dashboard pedidos={pedidos} fallas={fallas} refacciones={refs} proveedores={proveedores} prodDiaria={prodDiaria} />}
        {tab === "ped"  && <Pedidos pedidos={pedidos} setPedidos={setPedidos} />}
        {tab === "prod" && <Produccion prodDiaria={prodDiaria} setProdDiaria={setProdDiaria} pedidos={pedidos} />}
        {tab === "ref"  && <Refacciones refs={refs} setRefs={setRefs} proveedores={proveedores} setProveedores={setProveedores} />}
        {tab === "fal"  && <Fallas fallas={fallas} setFallas={setFallas} />}
        {tab === "cli"  && <Clientes pedidos={pedidos} />}
        {tab === "ia"   && <AsistenteIA onRefrescar={cargarTablas} />}
      </main>
    </div>
  );
}
