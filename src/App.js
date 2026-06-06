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
import ModoOperador from "./components/ModoOperador";

const TABS = [
  { id: "dash", ico: "📊", lbl: "Dashboard" },
  { id: "ped",  ico: "📋", lbl: "Pedidos" },
  { id: "prod", ico: "📅", lbl: "Producción" },
  { id: "ref",  ico: "🔧", lbl: "Refacciones" },
  { id: "fal",  ico: "⚠️", lbl: "Fallas" },
  { id: "cli",  ico: "👥", lbl: "Clientes" },
  { id: "ia",   ico: "🤖", lbl: "Asistente" },
];

const PIN_SUPERVISOR = "1234";

export default function App() {
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16, background: "#0d0f14", color: "#e8b84b" }}>
      <div style={{ fontSize: 40 }}>⚙️</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: ".1em" }}>CARGANDO EEMSA SYSTEM…</div>
    </div>
  );

  if (!modo) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0d0f14", gap: 0, padding: 24 }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 56, fontWeight: 900, color: "#c9922a", lineHeight: 1 }}>EE</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "#e0e0e0", letterSpacing: ".1em", marginBottom: 8 }}>EEMSA System</div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 40 }}>Control SIAT L36 · Calidad · Innovación</div>
      <button
        onClick={() => setModo("operador")}
        style={{ width: 260, padding: "18px 0", borderRadius: 14, border: "2px solid #4a9eff", background: "#0d1a33", color: "#4a9eff", fontSize: 18, fontWeight: 700, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        👷 Modo Operador
      </button>
      <button
        onClick={() => { setShowPinModal(true); setPinInput(""); setPinError(false); }}
        style={{ width: 260, padding: "18px 0", borderRadius: 14, border: "2px solid #c9922a", background: "#1a1200", color: "#c9922a", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        🔒 Modo Supervisor
      </button>

      {showPinModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#14171f", borderRadius: 16, padding: 28, width: 280, textAlign: "center" }}>
            <div style={{ color: "#c9922a", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>🔒 PIN Supervisor</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "16px 0" }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${pinInput.length > i ? "#c9922a" : "#2a2d3a"}`, background: pinInput.length > i ? "#c9922a" : "transparent" }} />
              ))}
            </div>
            {pinError && <div style={{ color: "#ff4d4d", fontSize: 12, marginBottom: 8 }}>PIN incorrecto</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => handlePinDigit(String(n))}
                  style={{ padding: "14px 0", borderRadius: 10, border: "1px solid #2a2d3a", background: "#1a1d26", color: "#e0e0e0", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>
                  {n}
                </button>
              ))}
              <div />
              <button onClick={() => handlePinDigit("0")}
                style={{ padding: "14px 0", borderRadius: 10, border: "1px solid #2a2d3a", background: "#1a1d26", color: "#e0e0e0", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>
                0
              </button>
              <button onClick={() => { setPinInput(p => p.slice(0, -1)); setPinError(false); }}
                style={{ padding: "14px 0", borderRadius: 10, border: "1px solid #2a2d3a", background: "#1a1d26", color: "#aaa", fontSize: 16, cursor: "pointer" }}>
                ⌫
              </button>
            </div>
            <button onClick={() => { setShowPinModal(false); setPinInput(""); setPinError(false); }}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a2d3a", background: "transparent", color: "#666", cursor: "pointer" }}>
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
      setFallas={setFallas}
      onSalir={() => setModo(null)}
    />
  );

  // modo === "supervisor"
  return (
    <div className="app">
      <header className="header">
        <div className="logo">EE</div>
        <div>
          <div className="header-title">EEMSA System</div>
          <div className="header-sub">Control SIAT L36 · Asesoría · Calidad · Innovación</div>
        </div>
        <button onClick={() => setModo(null)} style={{ marginLeft: "auto", fontSize: 11, color: "#aaa", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>
      <div className="tab-bar">
        {TABS.map(t => {
          const badge = t.id === "fal" ? fallas.filter(f => f.status === "abierta").length
                      : t.id === "ref" ? refs.filter(r => { const min = r.stock_min ?? 1; return min > 0 && Number(r.stock || 0) <= min; }).length
                      : t.id === "ped" ? pedidos.filter(p => p.status === "pendiente").length
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
