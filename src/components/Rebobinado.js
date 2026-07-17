import { useState } from "react";
import { authHeaders } from '../lib/auth';
import { uid, today } from '../lib/utils';
import { REBOB_CLIENTE, REBOB_COLOR, REBOB_OPERADOR_EQUIPO, REBOB_TIPOS, REBOB_MATERIALES, REBOB_ANCHOS, REBOB_LARGOS_PIEZA, REBOB_LARGO_JUMBO_M, REBOB_PIEZAS_POR_CAJA, REBOB_PIEZAS_POR_VUELTA, calcularPiezasTeoricas } from '../lib/constants';
import { IcoCheck } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

const corteInicial = () => ({ id: uid(), ancho: REBOB_ANCHOS[0], largoPieza: REBOB_LARGOS_PIEZA[0], cajasCompletas: "", piezasSueltas: "", merma: "" });

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
    const piezasPorCaja = REBOB_PIEZAS_POR_CAJA[c.ancho] || 1;
    // Cajas completas se escriben directo (2"=36, 3"=24 pzas/caja, mismo
    // criterio que rollosPorCaja en pedidos normales) -- las piezas sueltas
    // que no alcanzan a llenar una caja se capturan aparte, para no inflar
    // "cajas" con una caja que en realidad no existe (antes se redondeaba
    // hacia arriba con Math.ceil).
    const cajasCompletasN = Number(c.cajasCompletas) || 0;
    const piezasSueltasN  = Number(c.piezasSueltas)  || 0;
    const piezasReal = cajasCompletasN * piezasPorCaja + piezasSueltasN;
    const hayDato = c.cajasCompletas !== "" || c.piezasSueltas !== "";
    const diferencia = hayDato ? piezasReal - piezasTeoricas : null;
    const mermaNum = c.merma !== "" ? Number(c.merma) : null;
    const mermaPct = mermaNum != null && piezasReal > 0 ? ((mermaNum / piezasReal) * 100).toFixed(2) : null;

    // Cuando el rollo sale mixto, cada medida solo se llevo una parte del
    // jumbo de 8000m, no un rollo completo -- antes se guardaba "1 rollo
    // usado" por cada medida, lo que inflaba el consumo si eran 2-3 cortes
    // del mismo rollo fisico. Aqui se calcula que fraccion del rollo se fue
    // en esta medida: piezas reales / piezas-por-vuelta = vueltas usadas;
    // vueltas x largo de pieza = metros usados; metros / 8000m = fraccion.
    const piezasPorVuelta = REBOB_PIEZAS_POR_VUELTA[c.ancho] || 0;
    const vueltasUsadas = piezasPorVuelta > 0 ? piezasReal / piezasPorVuelta : 0;
    const metrosUsados = vueltasUsadas * (Number(c.largoPieza) || 0);
    const rollosUsadosFraccion = REBOB_LARGO_JUMBO_M > 0 ? metrosUsados / REBOB_LARGO_JUMBO_M : 0;

    return { vueltas, piezasTeoricas, piezasReal, diferencia, piezasPorCaja, cajasCompletasN, piezasSueltasN, mermaNum, mermaPct, vueltasUsadas, rollosUsadosFraccion };
  };

  const esMixto = cortes.length > 1;

  const save = async () => {
    const validos = cortes.filter(c => (Number(c.cajasCompletas) || 0) > 0 || (Number(c.piezasSueltas) || 0) > 0);
    if (validos.length === 0) { showToast("⚠ Llena cajas completas o piezas sueltas en al menos una medida"); return; }
    setLoading(true);

    // Folio propio de Rebobinado (empieza en 1) en su propia columna --
    // "num" antes era el mismo consecutivo compartido con pedidos de
    // cliente (por eso los registros viejos tienen numeros altos, 84, 90...);
    // usar folio_rebobinado en vez de num para contar evita que esos
    // numeros viejos empujen el folio nuevo para arriba. Un rollo mixto
    // sigue siendo un solo rollo fisico aunque salga en varias medidas, asi
    // que todos sus cortes comparten el folio base con una letra
    // (1A, 1B, 1C...) -- eso mismo los agrupa en Modo Emilio sin necesitar
    // un campo aparte para "pertenecen al mismo lote".
    const folioNum = Math.max(0, ...pedidos
      .filter(p => p.cliente === REBOB_CLIENTE)
      .map(p => Number(p.folio_rebobinado) || 0)) + 1;
    const mixtoReal = validos.length > 1;
    const nuevos = [];
    for (let i = 0; i < validos.length; i++) {
      const c = validos[i];
      const calc = calcCorte(c);
      const notaSueltas = calc.piezasSueltasN > 0 ? ` · ${calc.piezasSueltasN} pzas sueltas (no completan caja)` : "";
      const num = mixtoReal ? `${folioNum}${String.fromCharCode(65 + i)}` : String(folioNum);
      const nuevo = {
        id: uid(), created: today(),
        cliente: REBOB_CLIENTE, num, folio_rebobinado: folioNum,
        // tipo = material del rollo (Transparente/Canela), color = adhesivo (Hotmelt/Acrílico):
        // asi la tarjeta de Modo Emilio los muestra en el encabezado y bajo "Rollos MP usados"
        // sin tocar su logica, igual que con los pedidos normales de cliente.
        tipo: form.material, color: form.adhesivo, medida: `${c.ancho} x ${c.largoPieza}m`,
        cajas: calc.cajasCompletasN, piezas_prod: calc.piezasReal, rollos_usados: Number(calc.rollosUsadosFraccion.toFixed(4)), op: REBOB_OPERADOR_EQUIPO,
        merma: calc.mermaNum, merma_pct: calc.mermaPct,
        fecha_solicitud: today(), fecha_inicio: form.fecha_inicio, fecha_termino: form.fecha_termino,
        notas: (form.notas
          ? (esMixto ? `${form.notas} (rollo mixto)` : form.notas)
          : `Teórico: ${calc.piezasTeoricas} pzas (${calc.vueltas} vueltas x ${c.ancho})${esMixto ? " — rollo mixto" : ""}`) + notaSueltas,
        status: "pendiente",
      };
      const res = await fetch('/api/pedidos', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
      const data = await res.json();
      if (!res.ok) {
        showToast(`❌ Error en ${c.ancho} x ${c.largoPieza}m: ${data.error || "desconocido"}`);
        if (nuevos.length) setPedidos(ps => [...nuevos, ...ps]);
        setLoading(false);
        return;
      }
      nuevos.push(nuevo);
    }

    setPedidos(ps => [...nuevos, ...ps]);
    setCortes([corteInicial()]);
    setForm(f => ({ ...formInicial, adhesivo: f.adhesivo, material: f.material }));
    showToast(nuevos.length > 1
      ? `✓ Folio ${folioNum} — ${nuevos.length} medidas registradas — ya aparecen en Modo Emilio para dar de alta`
      : `✓ Folio ${folioNum} registrado — ya aparece en Modo Emilio para dar de alta`);
    setLoading(false);
  };

  const historial = pedidos.filter(p => p.cliente === REBOB_CLIENTE).sort((a, b) => (b.created || "").localeCompare(a.created || ""));

  // Agrupa los cortes de un mismo rollo mixto (comparten folio_rebobinado)
  // para que salgan juntos en el historial y no se confundan con otro
  // lote registrado despues. Los registros viejos sin folio_rebobinado
  // quedan cada uno en su propio grupo de 1.
  const gruposHistorial = Object.values(
    historial.reduce((acc, p, i) => {
      const key = p.folio_rebobinado != null ? `f${p.folio_rebobinado}` : `legacy${i}`;
      (acc[key] = acc[key] || []).push(p);
      return acc;
    }, {})
  ).map(grupo => [...grupo].sort((a, b) => String(a.num).localeCompare(String(b.num))));

  // Solo se puede borrar/editar mientras siga "pendiente" (antes de que
  // Emilio le de de alta) -- para corregir un error de captura sin
  // necesitar al supervisor. Una vez dado de alta, ya no aparecen los botones.
  const borrar = async (id) => {
    if (!window.confirm("¿Borrar este registro para volver a capturarlo?")) return;
    const res = await fetch('/api/pedidos', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
    if (!res.ok) { showToast("❌ Error al borrar"); return; }
    setPedidos(ps => ps.filter(p => p.id !== id));
    showToast("✓ Borrado — ya lo puedes volver a capturar arriba");
  };

  // Edicion inline: corrige cajas/piezas sueltas/merma sin borrar y volver
  // a capturar. Ancho y largo de pieza se sacan de "medida" (ej. 2" x 100m,
  // formato que el propio Rebobinado genera al guardar).
  const parseMedidaRebob = (medida) => {
    const [a, l] = String(medida || "").split(" x ");
    return { ancho: a || "", largoPieza: (l || "").replace(/m$/i, "") };
  };
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ cajasCompletas: "", piezasSueltas: "", merma: "" });
  const abrirEdicion = (p) => {
    const { ancho } = parseMedidaRebob(p.medida);
    const piezasPorCaja = REBOB_PIEZAS_POR_CAJA[ancho] || 1;
    const cajasN = Number(p.cajas) || 0;
    const sueltasN = Math.max(0, (Number(p.piezas_prod) || 0) - cajasN * piezasPorCaja);
    setEditId(p.id);
    setEditForm({
      cajasCompletas: p.cajas != null ? String(p.cajas) : "",
      piezasSueltas: sueltasN > 0 ? String(sueltasN) : "",
      merma: p.merma != null ? String(p.merma) : "",
    });
  };
  const guardarEdicion = async (p) => {
    const { ancho, largoPieza } = parseMedidaRebob(p.medida);
    const piezasPorCaja = REBOB_PIEZAS_POR_CAJA[ancho] || 1;
    const piezasPorVuelta = REBOB_PIEZAS_POR_VUELTA[ancho] || 0;
    const cajasN = Number(editForm.cajasCompletas) || 0;
    const sueltasN = Number(editForm.piezasSueltas) || 0;
    const piezasReal = cajasN * piezasPorCaja + sueltasN;
    const vueltasUsadas = piezasPorVuelta > 0 ? piezasReal / piezasPorVuelta : 0;
    const rollosUsadosFraccion = REBOB_LARGO_JUMBO_M > 0 ? (vueltasUsadas * (Number(largoPieza) || 0)) / REBOB_LARGO_JUMBO_M : 0;
    const mermaNum = editForm.merma !== "" ? Number(editForm.merma) : null;
    const mermaPct = mermaNum != null && piezasReal > 0 ? ((mermaNum / piezasReal) * 100).toFixed(2) : null;

    const body = {
      action: "rebobinado_editar", id: p.id,
      cajas: cajasN, piezas_prod: piezasReal,
      merma: mermaNum, merma_pct: mermaPct,
      rollos_usados: Number(rollosUsadosFraccion.toFixed(4)),
    };
    const res = await fetch('/api/pedidos', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    if (!res.ok) { showToast("❌ Error al guardar"); return; }
    setPedidos(ps => ps.map(x => x.id === p.id ? { ...x, ...body } : x));
    setEditId(null);
    showToast("✓ Corregido");
  };

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
          ⚠ Rollo mixto: se van a crear {cortes.length} pedidos por separado, uno por cada medida, para que Modo Emilio muestre cuántas piezas salieron de cada una. Comparten el mismo folio (ej. 1A, 1B, 1C) para que se identifiquen como del mismo rollo.
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
              <div className="field"><label>Cajas completas * <span style={{ color: "#666", fontWeight: 400 }}>({calc.piezasPorCaja}/caja)</span></label><input type="number" value={c.cajasCompletas} onChange={e => updCorte(c.id, "cajasCompletas", e.target.value)} placeholder="27" /></div>
              <div className="field"><label>Piezas sueltas <span style={{ color: "#666", fontWeight: 400 }}>(no completan caja)</span></label><input type="number" value={c.piezasSueltas} onChange={e => updCorte(c.id, "piezasSueltas", e.target.value)} placeholder="18" /></div>
              <div className="field"><label>Total piezas (automático)</label><input readOnly value={(c.cajasCompletas || c.piezasSueltas) ? `${calc.piezasReal} pzas` : "—"} style={{ background: "#1a2744", color: "#c9922a" }} /></div>
              <div className="field"><label>Rollo MP usado <span style={{ color: "#666", fontWeight: 400 }}>(fracción, automático)</span></label><input readOnly value={(c.cajasCompletas || c.piezasSueltas) ? calc.rollosUsadosFraccion.toFixed(2) : "—"} style={{ background: "#1a2744", color: "#4b8fe8" }} /></div>
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
      {esMixto && (() => {
        const sumaFraccion = cortes.reduce((s, c) => s + calcCorte(c).rollosUsadosFraccion, 0);
        return (
          <div style={{ textAlign: "right", fontSize: 12, color: "#aaa", marginBottom: 8 }}>
            Suma de rollo usado entre las {cortes.length} medidas: <strong style={{ color: Math.abs(sumaFraccion - 1) > 0.1 ? "#ff4d4d" : "#4be87a" }}>{sumaFraccion.toFixed(2)}</strong> <span style={{ color: "#555" }}>(debería acercarse a 1 = un jumbo completo)</span>
          </div>
        );
      })()}
      <button className="btn btn-ghost btn-block" style={{ marginBottom: 20 }} onClick={agregarCorte}>+ Agregar otra medida (rollo mixto)</button>

      <div className="form-grid">
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Opcional — si no escribes nada, se guarda el cálculo teórico" /></div>
      </div>
      <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={save} disabled={loading}>
        {loading ? "Guardando…" : <><Ico icon={IcoCheck} size={15} /> {esMixto ? `Registrar ${cortes.length} medidas` : "Registrar"} y mandar a Modo Emilio</>}
      </button>

      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      {gruposHistorial.length === 0 ? <p className="empty">Sin registros todavía.</p> : gruposHistorial.map(grupo => (
        <div key={grupo[0].id} style={{
          background: grupo.length > 1 ? "rgba(62,207,192,0.06)" : "transparent",
          border: grupo.length > 1 ? `1px solid ${REBOB_COLOR}44` : "none",
          borderRadius: 10, padding: grupo.length > 1 ? 8 : 0, marginBottom: 12,
        }}>
          {grupo.length > 1 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: REBOB_COLOR, letterSpacing: ".05em", marginBottom: 6 }}>
              🧵 LOTE #{grupo[0].folio_rebobinado} — ROLLO MIXTO ({grupo.length} medidas)
            </div>
          )}
          {grupo.map(p => (
            <div key={p.id} className="list-item" style={{ marginTop: 4 }}>
              {editId === p.id ? (
                <div>
                  <div className="form-grid">
                    <div className="field"><label>Cajas completas</label><input type="number" value={editForm.cajasCompletas} onChange={e => setEditForm(f => ({ ...f, cajasCompletas: e.target.value }))} /></div>
                    <div className="field"><label>Piezas sueltas</label><input type="number" value={editForm.piezasSueltas} onChange={e => setEditForm(f => ({ ...f, piezasSueltas: e.target.value }))} /></div>
                    <div className="field"><label>Merma (piezas)</label><input type="number" value={editForm.merma} onChange={e => setEditForm(f => ({ ...f, merma: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => guardarEdicion(p)}>💾 Guardar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div><strong>#{p.num}</strong> · {p.tipo} · {p.color} · {p.medida}</div>
                    <span className={`badge ${p.status === "terminado" ? "b-green" : "b-orange"}`}>{p.status === "terminado" ? "Terminado" : "Falta dar de alta"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div className="muted">{p.cajas} cajas · {p.piezas_prod} piezas · {p.op}</div>
                    {p.status === "pendiente" && (
                      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                        <button onClick={() => abrirEdicion(p)} style={{ background: "transparent", border: "none", color: "#4b8fe8", cursor: "pointer", fontSize: 11 }}>✏️ Editar</button>
                        <button onClick={() => borrar(p.id)} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 11 }}>🗑️ Borrar</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
