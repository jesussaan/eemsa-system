import { useState, useEffect } from "react";
import CalculadoraProduccion from './CalculadoraProduccion';
import ClicheImg from './ClicheImg';
import { supabase } from '../lib/supabase';
import { today, alertaEntrega } from '../lib/utils';
import { calcularCosto } from '../lib/costos';
import { sendPush } from '../lib/push';
import { notificar } from '../lib/notificaciones';
import { COMPS, SEV, UMBRAL_MERMA } from '../lib/constants';
import { sendWhatsApp } from '../utils/whatsapp';
import { IcoOperador } from './Icons';
import NotifBell from './NotifBell';

export default function ModoOperador({ pedidos, setPedidos, fallas, setFallas, onSalir }) {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [costosDB, setCostosDB] = useState(null);
  useEffect(() => {
    supabase.from('costos').select('*').then(({ data }) => {
      if (!data?.length) return;
      const obj = {};
      data.forEach(r => { obj[r.key] = Number(r.valor); });
      setCostosDB(obj);
    });
  }, []);
  const pedidosEnProceso = pedidos.filter(p => p.status === "proceso");
  const pedidosAnotados = pedidos
    .filter(p => p.status === "anotado")
    .sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || (a.fecha_solicitud || "").localeCompare(b.fecha_solicitud || ""));
  const [pedidoSel, setPedidoSel] = useState(null);
  const [vista, setVista] = useState(null); // null | "finalizar" | "falla"
  const [fotoProducto, setFotoProducto] = useState(null);
  const [formFalla, setFormFalla] = useState({ comp: "Rodillo anilox", min_paro: "", sev: "leve", descripcion: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const compsSugeridos = [...new Set([...COMPS, ...fallas.map(f => f.comp).filter(Boolean)])];

  const seleccionarPedido = (p) => {
    setPedidoSel(p);
    setVista(null);
    setFotoProducto(null);
    setFormFalla({ comp: "Rodillo anilox", min_paro: "", sev: "leve", descripcion: "" });
  };

  const moverPedido = async (id, dir) => {
    const idx = pedidosAnotados.findIndex(p => p.id === id);
    const otroIdx = idx + dir;
    if (otroIdx < 0 || otroIdx >= pedidosAnotados.length) return;
    const nuevaLista = [...pedidosAnotados];
    [nuevaLista[idx], nuevaLista[otroIdx]] = [nuevaLista[otroIdx], nuevaLista[idx]];
    const updates = nuevaLista.map((p, i) => ({ id: p.id, orden: i }));
    await Promise.all(updates.map(u => supabase.from("pedidos").update({ orden: u.orden }).eq("id", u.id)));
    setPedidos(ps => ps.map(p => {
      const u = updates.find(x => x.id === p.id);
      return u ? { ...p, orden: u.orden } : p;
    }));
  };

  const iniciarPedido = async () => {
    setLoading(true);
    const update = { status: "proceso", fecha_inicio: pedidoSel.fecha_inicio || today() };
    const { error } = await supabase.from("pedidos").update(update).eq("id", pedidoSel.id);
    if (error) { showToast("❌ Error al iniciar pedido"); setLoading(false); return; }
    // Guarda timestamp exacto para el cronómetro en Modo TV (requiere columna inicio_ts TEXT en Supabase)
    const ts = new Date().toISOString();
    supabase.from("pedidos").update({ inicio_ts: ts }).eq("id", pedidoSel.id);
    update.inicio_ts = ts;
    setPedidos(ps => ps.map(p => p.id === pedidoSel.id ? { ...p, ...update } : p));
    setPedidoSel(p => ({ ...p, ...update }));
    showToast("▶ Pedido en proceso");
    setLoading(false);
  };

  const finalizarPedido = async (fin) => {
    setLoading(true);
    const piezas = fin.piezas_prod != null && fin.piezas_prod !== "" ? Number(fin.piezas_prod) : null;
    const mermaNum = fin.merma != null && fin.merma !== "" ? Number(fin.merma) : null;
    const mermaPct = fin.mermaPct ?? (piezas && mermaNum != null && piezas > 0
      ? ((mermaNum / piezas) * 100).toFixed(2)
      : null);
    const update = {
      status: "pendiente",
      fecha_termino: today(),
      notas: fin.notas || pedidoSel.notas || null,
    };
    if (piezas != null) update.piezas_prod = piezas;
    if (mermaNum != null) update.merma = mermaNum;
    if (mermaPct != null) update.merma_pct = mermaPct;
    if (fin.rollos_usados != null && fin.rollos_usados !== "") update.rollos_usados = Number(fin.rollos_usados);
    if (fin.tinta_kg != null && fin.tinta_kg !== "") update.tinta_kg = Number(fin.tinta_kg);
    if (fin.alcohol_litros != null && fin.alcohol_litros !== "") update.alcohol_litros = Number(fin.alcohol_litros);
    if (fin.stickyback != null) update.stickyback = Number(fin.stickyback);

    // Calcular costo automáticamente sin mostrar a William
    const tintaKgNum   = fin.tinta_kg     ? Number(fin.tinta_kg)     : 0;
    const solventeKgNum= fin.alcohol_litros ? Number(fin.alcohol_litros) : 0;
    const rollosNum    = fin.rollos_usados ? Number(fin.rollos_usados) : 0;
    const diasProd     = pedidoSel.inicio_ts
      ? Math.max(0.5, Math.ceil((Date.now() - new Date(pedidoSel.inicio_ts).getTime()) / 86400000))
      : 1;
    if (piezas != null && piezas > 0) {
      const costoCalc = calcularCosto({
        rollosMP: rollosNum, tintaKg: tintaKgNum, solventeKg: solventeKgNum,
        cajas: Number(pedidoSel.cajas || 0), piezasBuenas: piezas,
        sticky: fin.stickyback || 0, diasProd,
        colorKey: pedidoSel.color || pedidoSel.tinta_tipo || '',
        tipoCentro: '2', costosDB,
      });
      update.costo_pieza = Number(costoCalc.porPieza.toFixed(6));
    }

    if (fotoProducto) {
      const ext = fotoProducto.name.split('.').pop();
      const path = `producto_${pedidoSel.id}_${Date.now()}.${ext}`;
      const { data: up } = await supabase.storage.from("cliches").upload(path, fotoProducto, { upsert: true });
      if (up) update.foto_producto_url = up.path;
    }
    const { error } = await supabase.from("pedidos").update(update).eq("id", pedidoSel.id);
    if (error) { showToast("❌ Error al finalizar pedido"); setLoading(false); return; }

    const finTs = new Date().toISOString();
    supabase.from("pedidos").update({ fin_ts: finTs }).eq("id", pedidoSel.id);
    update.fin_ts = finTs;

    setPedidos(ps => ps.map(p => p.id === pedidoSel.id ? { ...p, ...update } : p));
    sendWhatsApp(`📝 William anotó los datos del pedido #${pedidoSel.num} ${pedidoSel.cliente}`);
    sendPush('✅ Pedido terminado', `#${pedidoSel.num} ${pedidoSel.cliente} — finalizado por William`);
    if (mermaPct != null && Number(mermaPct) > UMBRAL_MERMA) {
      sendWhatsApp(`⚠️ Merma alta: ${mermaPct}% en pedido #${pedidoSel.num}`);
    }
    notificar('pedido_finalizado', {
      num: pedidoSel.num, cliente: pedidoSel.cliente,
      medida: pedidoSel.medida, tipo: pedidoSel.tipo, cajas: pedidoSel.cajas,
      merma_pct: mermaPct, rollos_usados: update.rollos_usados,
      tinta_kg: update.tinta_kg, alcohol_litros: update.alcohol_litros,
      notas: update.notas,
    });
    setPedidoSel(null);
    setVista(null);
    showToast("✓ Pedido finalizado");
    setLoading(false);
  };

  const guardarFalla = async () => {
    if (!formFalla.descripcion || !formFalla.min_paro) { showToast("⚠ Descripción y minutos obligatorios"); return; }
    setLoading(true);
    const nueva = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
      created: today(), fecha: today(),
      maq: pedidoSel?.maq || "SIAT L36 #1",
      comp: formFalla.comp, min_paro: formFalla.min_paro,
      sev: formFalla.sev, op: "William",
      descripcion: formFalla.descripcion, accion: "", status: "abierta",
    };
    const { error } = await supabase.from("fallas").insert([nueva]);
    if (error) { showToast("❌ Error al guardar falla"); setLoading(false); return; }
    setFallas(fs => [nueva, ...fs]);
    setVista(null);
    setFormFalla({ comp: "Rodillo anilox", min_paro: "", sev: "leve", descripcion: "" });
    showToast("✓ Falla reportada");
    setLoading(false);
  };

  const textoSobre = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1a1a1a" : "#fff";
  };
  const card = { background: "var(--card)", borderRadius: "var(--r-md)", padding: 16, marginBottom: 12 };
  const miniCard = { background: "var(--surface)", borderRadius: "var(--r-sm)", padding: "8px 12px" };
  const miniLbl = { fontSize: 10, color: "var(--muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: ".05em" };

  const COLOR_MAP = {
    blanco: "#FFFFFF", blanca: "#FFFFFF",
    negro: "#222222", negra: "#222222",
    rojo: "#E63946", roja: "#E63946",
    azul: "#4A90E2",
    verde: "#3DAA5C",
    amarillo: "#FFD700", amarilla: "#FFD700",
    naranja: "#FF8C00",
    morado: "#9B59B6", morada: "#9B59B6",
    rosa: "#FF69B4",
    café: "#795548", cafe: "#795548",
    canela: "#C19A6B",
    gris: "#9E9E9E", gris_claro: "#D3D3D3",
    transparente: null,
  };
  const chipColor = (color) => {
    if (!color) return null;
    const key = color.toLowerCase().trim().replace(/\s+/g, "_");
    for (const [k, v] of Object.entries(COLOR_MAP)) { if (key.includes(k)) return v; }
    return "#c9922a";
  };
  const ColorChip = ({ color }) => {
    if (!color) return null;
    const bg = chipColor(color);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#0d0f14", borderRadius: 20, padding: "3px 10px 3px 6px", border: "1px solid #2a2d3a" }}>
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: bg || "transparent", border: bg ? (bg === "#FFFFFF" ? "1.5px solid #aaa" : "none") : "2px dashed #aaa", display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>{color}</span>
      </span>
    );
  };

  const combinaciones = [
    {
      titulo: "Amarillo + Rojo 032C",
      desc: "Produce naranjas. Más amarillo = naranja claro. Más rojo = naranja intenso.",
      tonos: [
        { prop: "70/30", nombre: "Naranja claro cálido", hex: "#F9AA13" },
        { prop: "50/50", nombre: "Naranja brillante", hex: "#F68820" },
        { prop: "30/70", nombre: "Naranja rojizo", hex: "#F3662C" },
      ],
    },
    {
      titulo: "Amarillo + Azul Reflex",
      desc: "Produce verdes. Más amarillo = más cálido. Más azul = más frío.",
      tonos: [
        { prop: "70/30", nombre: "Verde olivo", hex: "#B1AD31" },
        { prop: "50/50", nombre: "Verde medio", hex: "#7F8D52" },
        { prop: "30/70", nombre: "Verde azulado", hex: "#4C6D73" },
      ],
    },
    {
      titulo: "Azul Reflex + Rojo 032C",
      desc: "Produce morados. Más azul = morado frío. Más rojo = morado cálido.",
      tonos: [
        { prop: "70/30", nombre: "Morado azulado", hex: "#473986" },
        { prop: "50/50", nombre: "Morado vibrante", hex: "#773872" },
        { prop: "30/70", nombre: "Morado rojizo", hex: "#A7365E" },
      ],
    },
    {
      titulo: "Blanco C + Rojo 032C",
      desc: "Rosas y rojos suaves. El blanco va primero.",
      tonos: [
        { prop: "70/30", nombre: "Rosa claro", hex: "#FAC1C5" },
        { prop: "50/50", nombre: "Rosa medio", hex: "#F7999F" },
        { prop: "30/70", nombre: "Rosa oscuro", hex: "#F37079" },
      ],
    },
    {
      titulo: "Blanco C + Naranja 172C",
      desc: "Salmón y melocotón. El blanco va primero.",
      tonos: [
        { prop: "70/30", nombre: "Melocotón", hex: "#FDC7B9" },
        { prop: "50/50", nombre: "Salmón claro", hex: "#FCA28A" },
        { prop: "30/70", nombre: "Salmón intenso", hex: "#FB7D5B" },
      ],
    },
    {
      titulo: "Negro C + Azul Reflex",
      desc: "Azules muy oscuros.",
      tonos: [
        { prop: "70/30", nombre: "Azul casi negro", hex: "#122443" },
        { prop: "50/50", nombre: "Azul marino oscuro", hex: "#0D2B5F" },
        { prop: "30/70", nombre: "Azul oscuro intenso", hex: "#07327B" },
      ],
    },
    {
      titulo: "Naranja 172C + Gris 425C",
      desc: "Tonos café y tierra.",
      tonos: [
        { prop: "70/30", nombre: "Naranja apagado", hex: "#D25434" },
        { prop: "50/50", nombre: "Café dorado", hex: "#B85E48" },
        { prop: "30/70", nombre: "Café gris", hex: "#9D685C" },
      ],
    },
    {
      titulo: "Rojo 032C + Gris 425C",
      desc: "Rojos apagados y sofisticados.",
      tonos: [
        { prop: "70/30", nombre: "Rojo ladrillo", hex: "#CA4751" },
        { prop: "50/50", nombre: "Terracota", hex: "#B2555D" },
        { prop: "30/70", nombre: "Gris rojizo", hex: "#9A6269" },
      ],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ background: "var(--surface)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--blue)" }}>
        <div>
          <div style={{ color: "var(--blue)", fontWeight: 700, fontSize: 16, fontFamily: "var(--font-h)", letterSpacing: ".05em" }}>EEMSA · Modo Operador</div>
          <div style={{ color: "var(--green)", fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-flex" }}><IcoOperador /></span> William</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <NotifBell />
          <button className="btn btn-ghost btn-sm" onClick={onSalir}>Salir</button>
        </div>
      </header>

      <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>

        {/* Lista de pedidos */}
        {!pedidoSel && vista !== "colores" && (
          <>
            <button className="btn btn-ghost btn-sm btn-block" style={{ marginBottom: 12 }} onClick={() => setVista("colores")}>🎨 Carta de colores</button>
            <h2 style={{ color: "#4a9eff", fontSize: 13, margin: "12px 0 8px", textTransform: "uppercase", letterSpacing: ".08em" }}>▶ En proceso</h2>
            {pedidosEnProceso.length === 0
              ? <p style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>Sin pedidos en proceso.</p>
              : pedidosEnProceso.map(p => {
                const al = alertaEntrega(p.fecha_estimada, p.status);
                return (
                <div key={p.id} onClick={() => seleccionarPedido(p)} style={{ ...card, borderLeft: `4px solid ${al ? al.borde : "#4a9eff"}`, background: al ? al.bg : card.background, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{p.cliente}</div>
                    {al && <span style={{ fontSize: 12, fontWeight: 700, color: al.color, whiteSpace: "nowrap" }}>{al.txt}</span>}
                  </div>
                  <div style={{ color: "#c9922a", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>📏 {p.medida}</div>
                  <div style={{ display: "flex", gap: 8, fontSize: 13, color: "#aaa", flexWrap: "wrap", alignItems: "center" }}>
                    <span>📦 {p.cajas} cajas</span>
                    {p.rollos_totales && <span>🧻 {p.rollos_totales} piezas/rollos</span>}
                    <span>🎨 {p.tipo}</span>
                    {(p.color || p.tinta_tipo) && <ColorChip color={p.color || p.tinta_tipo} />}
                    <span style={{ color: "#555" }}>#Ped {p.num}</span>
                  </div>
                </div>
                );
              })}

            {pedidosAnotados.length > 0 && (
              <>
                <h2 style={{ color: "#ff9900", fontSize: 13, margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: ".08em" }}>📋 Próximos anotados — orden de salida</h2>
                {pedidosAnotados.map((p, i) => {
                  const al = alertaEntrega(p.fecha_estimada, p.status);
                  return (
                  <div key={p.id} onClick={() => seleccionarPedido(p)} style={{ ...card, borderLeft: `4px solid ${al ? al.borde : "#ff9900"}`, background: al ? al.bg : card.background, cursor: "pointer", display: "flex", gap: 10, alignItems: "stretch" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <div style={{ color: "#ff9900", fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{i + 1}</div>
                      <button
                        onClick={e => { e.stopPropagation(); moverPedido(p.id, -1); }}
                        disabled={i === 0}
                        style={{ background: "#0d0f14", border: "1px solid #2a2d3a", borderRadius: 6, color: i === 0 ? "#333" : "#e0e0e0", width: 28, height: 28, cursor: i === 0 ? "default" : "pointer" }}
                      >▲</button>
                      <button
                        onClick={e => { e.stopPropagation(); moverPedido(p.id, 1); }}
                        disabled={i === pedidosAnotados.length - 1}
                        style={{ background: "#0d0f14", border: "1px solid #2a2d3a", borderRadius: 6, color: i === pedidosAnotados.length - 1 ? "#333" : "#e0e0e0", width: 28, height: 28, cursor: i === pedidosAnotados.length - 1 ? "default" : "pointer" }}
                      >▼</button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0" }}>{p.cliente}</div>
                        {al && <span style={{ fontSize: 11, fontWeight: 700, color: al.color, whiteSpace: "nowrap", marginLeft: 6 }}>{al.txt}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                        <span style={{ color: "#c9922a", fontWeight: 700 }}>📏 {p.medida}</span>
                        <span style={{ color: "#aaa" }}>🎨 {p.tipo}</span>
                        {(p.color || p.tinta_tipo) && <ColorChip color={p.color || p.tinta_tipo} />}
                        <span style={{ color: "#aaa" }}>📦 {p.cajas} cajas</span>
                        {p.rollos_caja && <span style={{ color: "#aaa" }}>🧻 {p.rollos_caja} rollos/caja</span>}
                        {p.rollos_totales && <span style={{ color: "#aaa" }}>🧮 {p.rollos_totales} piezas/rollos</span>}
                      </div>
                      {p.fecha_solicitud && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Solicitud: {p.fecha_solicitud}</div>}
                      {p.cliche_url && <div style={{ fontSize: 11, color: "#ff9900", marginTop: 4 }}>📷 Ver diseño →</div>}
                    </div>
                  </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Carta de colores */}
        {!pedidoSel && vista === "colores" && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setVista(null)}>← Volver</button>
            <h2 style={{ color: "#c9922a", fontSize: 13, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: ".08em" }}>🎨 Carta de colores — combinaciones</h2>
            {combinaciones.map(c => (
              <div key={c.titulo} style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{c.titulo}</div>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>{c.desc}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {c.tonos.map(t => (
                    <div key={t.prop} style={{ background: t.hex, borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ display: "inline-block", background: "#fff", color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 6px", marginBottom: 6 }}>{t.prop}</div>
                      <div style={{ color: textoSobre(t.hex), fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{t.nombre}</div>
                      <div style={{ color: textoSobre(t.hex), fontSize: 11, opacity: .8 }}>{t.hex}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#666", marginTop: -4 }}>Los colores son aproximados. Siempre haz una prueba antes de producción.</p>
          </>
        )}

        {/* Detalle del pedido */}
        {pedidoSel && vista === null && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setPedidoSel(null)}>← Volver</button>
            <div style={{ ...card, borderLeft: "4px solid #4a9eff" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{pedidoSel.cliente}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={miniCard}><div style={miniLbl}>Medida</div><div style={{ color: "#c9922a", fontWeight: 700, fontSize: 18 }}>{pedidoSel.medida}</div></div>
                <div style={miniCard}><div style={miniLbl}>Cajas</div><div style={{ color: "#4be87a", fontWeight: 700, fontSize: 18 }}>{pedidoSel.cajas}</div></div>
                {pedidoSel.rollos_totales && <div style={miniCard}><div style={miniLbl}>Piezas / rollos totales</div><div style={{ color: "#4be87a", fontWeight: 700, fontSize: 18 }}>{pedidoSel.rollos_totales}</div></div>}
                <div style={miniCard}><div style={miniLbl}>Tipo</div><div style={{ color: "#e0e0e0", fontSize: 14 }}>{pedidoSel.tipo}</div></div>
                <div style={miniCard}><div style={miniLbl}>Máquina</div><div style={{ color: "#e0e0e0", fontSize: 14 }}>{pedidoSel.maq}</div></div>
                {(pedidoSel.color || pedidoSel.tinta_tipo) && <div style={miniCard}><div style={miniLbl}>Tinta / Color</div><div style={{ marginTop: 4 }}><ColorChip color={pedidoSel.color || pedidoSel.tinta_tipo} /></div></div>}
              </div>
            </div>
            {pedidoSel.cliche_url && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6 }}>📷 Cliché</div>
                <ClicheImg src={pedidoSel.cliche_url} style={{ width: "100%", borderRadius: 10, border: "1px solid #2a2d3a" }} />
              </div>
            )}
            {/* Bloque rollos MP necesarios */}
            {(() => {
              const anchoN      = parseFloat(pedidoSel.ancho)     || 0;
              const largoN      = parseFloat(pedidoSel.largo)     || 0;
              const cajasN      = parseInt(pedidoSel.cajas)       || 0;
              const rollosCajaN = parseInt(pedidoSel.rollos_caja) || 36;
              if (!anchoN || !largoN || !cajasN) return null;
              const largoReal    = largoN > 4 ? largoN - 4 : largoN;
              const pistas       = Math.floor(6 / anchoN);
              const rollosPista  = largoReal > 0 ? Math.floor(914 / largoReal) : 0;
              const rendimiento  = pistas * rollosPista;
              const piezasBuenas = cajasN * rollosCajaN;
              const rollosExacto = rendimiento > 0 ? piezasBuenas / rendimiento : 0;
              const rollosMP     = Math.ceil(rollosExacto);
              return (
                <div style={{ background: "#0e1a2e", border: "1px solid #1e3a5f", borderRadius: 12, padding: "14px 16px", marginBottom: 14, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#4a9eff", fontWeight: 700, letterSpacing: ".07em", marginBottom: 8 }}>🧻 ROLLOS MP A UTILIZAR</div>
                  <div style={{ fontSize: 52, fontWeight: 900, color: "#4a9eff", lineHeight: 1 }}>{rollosMP}</div>
                  <div style={{ fontSize: 12, color: "#3a3f5a", marginTop: 4 }}>{rollosExacto.toFixed(2)} exacto</div>
                </div>
              );
            })()}

            {pedidoSel.status === "proceso" && (() => {
              let elapsed = null;
              if (pedidoSel.inicio_ts) {
                const ms = ahora - new Date(pedidoSel.inicio_ts);
                if (ms >= 0) {
                  const d = Math.floor(ms / 86400000);
                  const h = Math.floor((ms % 86400000) / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  const s = Math.floor((ms % 60000) / 1000);
                  elapsed = d > 0 ? `${d}d ${h}h ${String(m).padStart(2,'0')}m`
                          : h > 0 ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
                          : `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
                }
              }
              return (
                <>
                  {elapsed && (
                    <div style={{ textAlign: "center", background: "#0d1a0d", border: "1px solid #1e3a1e", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#4be87a", fontWeight: 700, letterSpacing: ".07em", marginBottom: 4 }}>⏱ TIEMPO EN PRODUCCIÓN</div>
                      <div style={{ fontSize: 36, fontWeight: 900, color: "#4be87a", fontVariantNumeric: "tabular-nums" }}>{elapsed}</div>
                    </div>
                  )}
                  <button className="btn btn-primary btn-block" style={{ marginBottom: 10, padding: 16, fontSize: 16 }} onClick={() => setVista("calc")}>✅ Finalizar pedido</button>
                  <button className="btn btn-danger btn-block" style={{ padding: 16, fontSize: 16 }} onClick={() => setVista("falla")}>⚠️ Reportar falla</button>
                </>
              );
            })()}
            {pedidoSel.status === "anotado" && (
              <button className="btn btn-primary btn-block" style={{ padding: 16, fontSize: 16 }} onClick={iniciarPedido} disabled={loading}>
                {loading ? "Guardando…" : "▶ Poner en proceso"}
              </button>
            )}
          </>
        )}

        {/* Calculadora de producción — flujo finalizar */}
        {pedidoSel && vista === "calc" && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setVista(null)}>← Volver</button>
            {loading
              ? <div style={{ textAlign: "center", padding: 32, color: "#4be87a", fontSize: 15 }}>Guardando…</div>
              : <CalculadoraProduccion
                  pedidoInicial={pedidoSel}
                  inline
                  onConfirmar={(res) => finalizarPedido({
                    piezas_prod:    res.piezasProd  != null ? String(res.piezasProd)  : "",
                    merma:          res.mermaReal   != null ? String(res.mermaReal)   : "",
                    mermaPct:       res.mermaPct,
                    rollos_usados:  res.rollosExacto != null ? res.rollosExacto.toFixed(2) : "",
                    tinta_kg:       res.tintaKg     != null ? res.tintaKg.toFixed(3)  : "",
                    alcohol_litros: res.solventeKg  != null ? res.solventeKg.toFixed(3) : "",
                    notas:          res.notas       || "",
                    stickyback:     res.stickyback,
                    costoPieza:     res.costoPieza,
                    precioPieza:    res.precioPieza,
                    margenPct:      res.margenPct,
                  })}
                />
            }
          </>
        )}

        {/* Formulario de falla */}
        {pedidoSel && vista === "falla" && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setVista(null)}>← Volver</button>
            <h3 style={{ color: "#ff4d4d", marginBottom: 12 }}>⚠️ Reportar falla</h3>
            <div className="form-grid">
              <div className="field">
                <label>Componente</label>
                <input list="comps-list-op" value={formFalla.comp} onChange={e => setFormFalla(f => ({ ...f, comp: e.target.value }))} placeholder="Escribe o elige un componente" />
                <datalist id="comps-list-op">{compsSugeridos.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="field">
                <label>Minutos de paro *</label>
                <input type="number" placeholder="30" value={formFalla.min_paro} onChange={e => setFormFalla(f => ({ ...f, min_paro: e.target.value }))} />
              </div>
              <div className="field">
                <label>Severidad</label>
                <select value={formFalla.sev} onChange={e => setFormFalla(f => ({ ...f, sev: e.target.value }))}>
                  {Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>Descripción *</label>
                <textarea placeholder="¿Qué ocurrió?" value={formFalla.descripcion} onChange={e => setFormFalla(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-danger btn-block" onClick={guardarFalla} disabled={loading} style={{ padding: 16, fontSize: 16 }}>
              {loading ? "Guardando…" : "⚠️ Reportar falla"}
            </button>
          </>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
