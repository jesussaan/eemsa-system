import { useState } from "react";
import { uid, today, siguienteNumPedido } from '../lib/utils';
import { REBOB_CLIENTE, REBOB_OPERADOR_EQUIPO, REBOB_TIPOS, REBOB_MATERIALES, REBOB_ANCHOS, REBOB_LARGOS_PIEZA, REBOB_LARGO_JUMBO_M, REBOB_PIEZAS_POR_CAJA, calcularPiezasTeoricas } from '../lib/constants';
import { IcoCheck } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

const corteInicial = () => ({ id: uid(), ancho: REBOB_ANCHOS[0], largoPieza: REBOB_LARGOS_PIEZA[0], piezas: "", merma: "" });

export default function Rebobinado({ pedidos, setPedidos, onSalir }) {
  const formInicial = {
    adhesivo: REBOB_TIPOS[0], material: REBOB_MATERIALES[0],
    fecha_inicio: today(), fecha_termino: today(), notas: "",
  };
  const [form, setForm] = useState(formInicial);
  const [cortes, setCortes] = useState([corteInicial()]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updCorte = (id, k, v) => setCortes(cs => cs.map(c => c.id === id ? { ...c, [k]: v } : c));
  const agregarCorte = () => setCortes(cs => [...cs, corteInicial()]);
  const quitarCorte = (id) => setCortes(cs => cs.filter(c => c.id !== id));

  // Mismo rollo MP (8000m) a veces sale mezclado -- parte a una medida y
  // parte a otra -- en vez de una sola medida fija para todo el rollo.
  // Cada "corte" de la lista se registra como su propio pedido, para que
  // Modo Emilio muestre por separado cuantas piezas salieron de cada medida.
  const calcCorte = (c) => {
    const vueltas = Math.floor(REBOB_LARGO_JUMBO_M / (Number(c.largoPieza) || 1));
    const piezasTeoricas = calcularPiezasTeoricas(c.ancho, c.largoPieza);
    const piezasReal = Number(c.piezas) || 0;
    const diferencia = c.piezas !== "" ? piezasReal - piezasTeoricas : null;
    const piezasPorCaja = REBOB_PIEZAS_POR_CAJA[c.ancho] || 1;
    const cajasCalc = piezasReal > 0 ? Math.ceil(piezasReal / piezasPorCaja) : 0;
    const mermaNum = c.merma !== "" ? Number(c.merma) : null;
    const mermaPct = mermaNum != null && piezasReal > 0 ? ((mermaNum / piezasReal) * 100).toFixed(2) : null;
    return { vueltas, piezasTeoricas, piezasReal, diferencia, piezasPorCaja, cajasCalc, mermaNum, mermaPct };
  };

  const esMixto = cortes.length > 1;

  const save = async () => {
    const validos = cortes.filter(c => Number(c.piezas) > 0);
    if (validos.length === 0) { showToast("⚠ Llena piezas reales en al menos una medida"); return; }
    setLoading(true);

    let siguiente = parseInt(siguienteNumPedido(pedidos), 10);
    const nuevos = [];
    for (const c of validos) {
      const calc = calcCorte(c);
      const nuevo = {
        id: uid(), created: today(),
        cliente: REBOB_CLIENTE, num: String(siguiente),
        // tipo = material del rollo (Transparente/Canela), color = adhesivo (Hotmelt/Acrílico):
        // asi la tarjeta de Modo Emilio los muestra en el encabezado y bajo "Rollos MP usados"
        // sin tocar su logica, igual que con los pedidos normales de cliente.
        tipo: form.material, color: form.adhesivo, medida: `${c.ancho} x ${c.largoPieza}m`,
        cajas: calc.cajasCalc, piezas_prod: c.piezas, rollos_usados: 1, op: REBOB_OPERADOR_EQUIPO,
        merma: calc.mermaNum, merma_pct: calc.mermaPct,
        fecha_solicitud: today(), fecha_inicio: form.fecha_inicio, fecha_termino: form.fecha_termino,
        notas: form.notas
          ? (esMixto ? `${form.notas} (rollo mixto)` : form.notas)
          : `Teórico: ${calc.piezasTeoricas} pzas (${calc.vueltas} vueltas x ${c.ancho})${esMixto ? " — rollo mixto" : ""}`,
        status: "pendiente",
      };
      const res = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevo) });
      const data = await res.json();
      if (!res.ok) {
        showToast(`❌ Error en ${c.ancho} x ${c.largoPieza}m: ${data.error || "desconocido"}`);
        if (nuevos.length) setPedidos(ps => [...nuevos, ...ps]);
        setLoading(false);
        return;
      }
      nuevos.push(nuevo);
      siguiente += 1;
    }

    setPedidos(ps => [...nuevos, ...ps]);
    setCortes([corteInicial()]);
    setForm(f => ({ ...formInicial, adhesivo: f.adhesivo, material: f.material }));
    showToast(nuevos.length > 1
      ? `✓ ${nuevos.length} medidas registradas — ya aparecen en Modo Emilio para dar de alta`
      : "✓ Registrado — ya aparece en Modo Emilio para dar de alta");
    setLoading(false);
  };

  const historial = pedidos.filter(p => p.cliente === REBOB_CLIENTE).sort((a, b) => (b.created || "").localeCompare(a.created || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--teal)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 700, letterSpacing: ".08em" }}>MODO REBOBINADO</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft: "auto", fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
      <h2 className="sec-title">Rebobinado</h2>

      <h3 className="sub-title">Rollo (material) del jumbo — {REBOB_LARGO_JUMBO_M}m</h3>
      <div className="form-grid">
        <div className="field"><label>Rollo (material) *</label><select value={form.material} onChange={e => upd("material", e.target.value)}>{REBOB_MATERIALES.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>Adhesivo *</label><select value={form.adhesivo} onChange={e => upd("adhesivo", e.target.value)}>{REBOB_TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label>Operador</label><input readOnly value={REBOB_OPERADOR_EQUIPO} style={{ background: "#1a2744", color: "#c9922a" }} /></div>
        <div className="field"><label>Fecha inicio</label><input type="date" value={form.fecha_inicio} onChange={e => upd("fecha_inicio", e.target.value)} /></div>
        <div className="field"><label>Fecha término</label><input type="date" value={form.fecha_termino} onChange={e => upd("fecha_termino", e.target.value)} /></div>
      </div>

      <h3 className="sub-title" style={{ marginTop: 20 }}>Medidas que salieron</h3>
      {esMixto && (
        <div style={{ background: "rgba(201,146,42,0.12)", border: "1px solid rgba(201,146,42,0.4)", color: "#c9922a", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          ⚠ Rollo mixto: se van a crear {cortes.length} pedidos por separado, uno por cada medida, para que Modo Emilio muestre cuántas piezas salieron de cada una.
        </div>
      )}
      {cortes.map((c, i) => {
        const calc = calcCorte(c);
        return (
          <div key={c.id} style={{ background: "#1a1d26", borderRadius: 10, padding: 12, marginBottom: 12, border: esMixto ? "1px solid #2a2e3a" : "none" }}>
            {esMixto && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: ".05em" }}>MEDIDA {i + 1}</span>
                {cortes.length > 1 && <button onClick={() => quitarCorte(c.id)} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 12 }}>✕ Quitar</button>}
              </div>
            )}
            <div className="form-grid">
              <div className="field"><label>Ancho de corte</label>
                <select value={c.ancho} onChange={e => updCorte(c.id, "ancho", e.target.value)}>{REBOB_ANCHOS.map(a => <option key={a} value={a}>{a}</option>)}</select>
              </div>
              <div className="field"><label>Largo de pieza (m)</label>
                <select value={c.largoPieza} onChange={e => updCorte(c.id, "largoPieza", e.target.value)}>{REBOB_LARGOS_PIEZA.map(l => <option key={l} value={l}>{l}m</option>)}</select>
              </div>
              <div className="field"><label>Piezas reales *</label><input type="number" value={c.piezas} onChange={e => updCorte(c.id, "piezas", e.target.value)} placeholder={String(calc.piezasTeoricas)} /></div>
              <div className="field"><label>Cajas (automático, {calc.piezasPorCaja}/caja)</label><input readOnly value={c.piezas ? `${calc.cajasCalc} cajas` : "—"} style={{ background: "#1a2744", color: "#c9922a" }} /></div>
              <div className="field"><label>Merma (piezas)</label><input type="number" value={c.merma} onChange={e => updCorte(c.id, "merma", e.target.value)} placeholder="0" /></div>
              <div className="field"><label>% Merma</label><input readOnly value={calc.mermaPct != null ? `${calc.mermaPct}%` : "—"} style={{ background: "#1a2744", color: calc.mermaPct > 3 ? "#ff4d4d" : "#4be87a" }} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#aaa", marginTop: 8 }}>
              <span>{REBOB_LARGO_JUMBO_M}m ÷ {c.largoPieza}m = {calc.vueltas} vueltas · teórico {calc.piezasTeoricas} pzas</span>
              {calc.diferencia !== null && (
                <span style={{ color: calc.diferencia < 0 ? "#ff4d4d" : "#4be87a", fontWeight: 700 }}>{calc.diferencia > 0 ? "+" : ""}{calc.diferencia} vs. teórico</span>
              )}
            </div>
          </div>
        );
      })}
      <button className="btn btn-ghost btn-block" style={{ marginBottom: 20 }} onClick={agregarCorte}>+ Agregar otra medida (rollo mixto)</button>

      <div className="form-grid">
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Opcional — si no escribes nada, se guarda el cálculo teórico" /></div>
      </div>
      <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={save} disabled={loading}>
        {loading ? "Guardando…" : <><Ico icon={IcoCheck} size={15} /> {esMixto ? `Registrar ${cortes.length} medidas` : "Registrar"} y mandar a Modo Emilio</>}
      </button>

      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      {historial.length === 0 ? <p className="empty">Sin registros todavía.</p> : historial.map(p => (
        <div key={p.id} className="list-item" style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div><strong>#{p.num}</strong> · {p.tipo} · {p.color} · {p.medida}</div>
            <span className={`badge ${p.status === "terminado" ? "b-green" : "b-orange"}`}>{p.status === "terminado" ? "Terminado" : "Falta dar de alta"}</span>
          </div>
          <div className="muted">{p.cajas} cajas · {p.piezas_prod} piezas · {p.op}</div>
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
