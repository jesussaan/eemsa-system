import { useState, useEffect, useRef, useMemo } from "react";
import { authHeaders } from "../lib/auth";
import { today, uid, siguienteNumPedido, unificarPorTexto, normalizarMedida, cargarBorrador, guardarBorrador, ultimoPedidoDeCliente, avisoMedidaCliente, avisoCajasCliente, avisoTintaCliente, avisoTipoCliente } from "../lib/utils";
import { rollosPorCaja } from "../lib/produccion";
import { tasasProduccion, programarProduccion, fechaEntregaSugerida, fechaCorta, esManual } from "../lib/entregas";
import { chipColor as hexDeTinta } from "../lib/colores";
import { TIPOS, REBOB_CLIENTE } from "../lib/constants";
import { sendWhatsApp, mensajePedidoNuevo } from "../utils/whatsapp";
import Clientes from "./Clientes";
import CalendarGrid from "./CalendarGrid";

// La Medida se escribe como "2x100" -- las pulgadas son el numero inicial.
const anchoDeMedida = (medida) => (String(medida).match(/^\s*(\d+(\.\d+)?)/) || [])[1] || '';

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const S = { fill:"none", stroke:"currentColor", strokeWidth:2, strokeLinecap:"round", strokeLinejoin:"round" };
const IcoAgenda = () => (<svg viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/></svg>);
const IcoNuevo  = () => (<svg viewBox="0 0 24 24" {...S}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>);
const IcoCli    = () => (<svg viewBox="0 0 24 24" {...S}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>);

const FORM_INIT = { cliente:"", num:"", tipo:"Blanca", medida:"", cajas:"", rollos_caja:"", rollos_totales:"", tinta_tipo:"", color2:"", notas:"" };

const STATUS_LBL = { pendiente:"Pendiente", anotado:"Anotado", proceso:"En proceso", terminado:"Terminado" };

export default function ModoVentas({ pedidos, setPedidos, clientesDisenos = [], onSalir }) {
  const hoy = today();
  // El tab activo y el pedido a medio anotar se recuerdan en localStorage --
  // si sales de la app a revisar algo y regresas (o la app se recarga sola),
  // sigues donde ibas en vez de perder lo que llevabas escrito.
  const [tab, setTab]   = useState(() => cargarBorrador("eemsa_ventas_tab", "agenda"));
  // El num sugerido se recalcula siempre al entrar (el "siguiente
  // disponible" cambia aunque el resto del borrador se conserve tal cual
  // quedo) -- si el borrador no traia nada guardado, arranca de FORM_INIT.
  const [form, setForm] = useState(() => {
    const guardado = cargarBorrador("eemsa_ventas_form", null);
    return { ...(guardado || FORM_INIT), num: siguienteNumPedido(pedidos) };
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState("");
  // Antes se guardaba directo al dar clic en "Registrar Pedido" -- ahora
  // primero se muestra un resumen para confirmar, mismo patron que la
  // pantalla de revision de Modo Operador al finalizar.
  const [revisando, setRevisando] = useState(false);
  // "Tipo de cinta" siempre trae un valor (Blanca por default) -- se marca
  // como pendiente hasta que se toca de verdad, para no dejarlo en Blanca
  // sin querer cuando en realidad es Canela o Transparente.
  const [tipoTocado, setTipoTocado] = useState(false);

  useEffect(() => guardarBorrador("eemsa_ventas_tab", tab), [tab]);
  useEffect(() => guardarBorrador("eemsa_ventas_form", form), [form]);

  const initMes = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; };
  const [mes, setMes]       = useState(initMes);
  const [diaSel, setDiaSel] = useState(null);
  const setMesYLimpiar = (updater) => { setMes(updater); setDiaSel(null); };

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const upd = (k, v) => setForm(f => {
    if (k === "tipo") setTipoTocado(true);
    const nf = {...f, [k]: v};
    // Rollos/caja ya no se escribe a mano -- se calcula solo de tipo + las
    // pulgadas que trae la Medida (2"=36, 3"=24, Engomado=10).
    if (k === "medida" || k === "tipo") {
      const medidaActual = k === "medida" ? v : nf.medida;
      const tipoActual    = k === "tipo"   ? v : nf.tipo;
      nf.rollos_caja = String(rollosPorCaja(anchoDeMedida(medidaActual), tipoActual === "Engomado"));
    }
    if (k === "cajas" || k === "medida" || k === "tipo") {
      const c = k === "cajas" ? v : nf.cajas;
      nf.rollos_totales = (c && nf.rollos_caja) ? String(Number(c) * Number(nf.rollos_caja)) : "";
    }
    return nf;
  });

  // Al escribir/elegir un cliente que ya existe, se llena con lo de su
  // ultimo pedido (tipo, medida, cajas, tintas) -- mismo criterio que
  // Pedidos.js: solo si Medida sigue vacia o trae lo que se autolleno antes.
  // Lo autollenado se guarda DENTRO del form (medida_autollenada) y no en un
  // estado aparte, para que sobreviva en el borrador si se recarga la app --
  // antes, tras recargar, cambiar de cliente ya no volvia a llenar.
  // Avisos (no bloquean) cuando medida, cajas o tinta no cuadran con lo que
  // ese cliente pide siempre -- ver avisoMedidaCliente y compania en utils.js.
  const pedidosDeClientes = pedidos.filter(p => p.cliente !== REBOB_CLIENTE);
  const nombreCliente = form.cliente.trim();
  const avisoMedida = avisoMedidaCliente(pedidosDeClientes, form.cliente, form.medida);
  const avisoCajas  = avisoCajasCliente(pedidosDeClientes, form.cliente, form.cajas);
  const avisoTinta  = avisoTintaCliente(pedidosDeClientes, form.cliente, form.tinta_tipo);
  const avisoTipo   = avisoTipoCliente(pedidosDeClientes, form.cliente, form.tipo);
  const textoAvisoMedida = avisoMedida && `${nombreCliente} no ha pedido esta medida en sus últimos ${avisoMedida.total} pedidos — normalmente pide ${avisoMedida.habitual}`;
  const textoAvisoCajas  = avisoCajas && `${nombreCliente} normalmente pide ${avisoCajas.min === avisoCajas.max ? avisoCajas.min : `entre ${avisoCajas.min} y ${avisoCajas.max}`} cajas`;
  const textoAvisoTinta  = avisoTinta && `${nombreCliente} no ha usado esta tinta en sus últimos ${avisoTinta.total} pedidos — normalmente lleva ${avisoTinta.habitual}`;
  const textoAvisoTipo   = avisoTipo && `${nombreCliente} no ha pedido cinta ${form.tipo} en sus últimos ${avisoTipo.total} pedidos — normalmente pide ${avisoTipo.habitual}`;
  const avisosPedido = [textoAvisoTipo, textoAvisoMedida, textoAvisoCajas, textoAvisoTinta].filter(Boolean);
  const estiloAviso = { fontSize:12, color:"#ff9900", marginTop:5, fontWeight:600 };
  const cambiarCliente = (v) => {
    const ult = ultimoPedidoDeCliente(pedidos.filter(p => p.cliente !== REBOB_CLIENTE), v);
    // "Vino del autollenado" = la medida es la marcada al autollenar, o es la
    // misma del ultimo pedido del cliente que estaba escrito (cubre borradores
    // de antes de que existiera la marca).
    const ultActual = ultimoPedidoDeCliente(pedidosDeClientes, form.cliente);
    const vinoDeAutollenado = form.medida === form.medida_autollenada
      || (ultActual && normalizarMedida(form.medida) === normalizarMedida(ultActual.medida));
    const puedeLlenar = !form.medida || vinoDeAutollenado;
    // Se borro el cliente: si lo de abajo vino del autollenado (la medida
    // sigue igual), se limpia para que el siguiente cliente llene desde cero.
    if (!v.trim() && form.medida && puedeLlenar) {
      setForm(f => ({ ...f, cliente: v, tipo: FORM_INIT.tipo, medida: "", cajas: "", rollos_caja: "", rollos_totales: "", tinta_tipo: "", color2: "", medida_autollenada: "" }));
      setTipoTocado(false);
      return;
    }
    if (!ult || !puedeLlenar) { upd("cliente", v); return; }
    const tipo = ult.tipo || "Blanca";
    const medida = ult.medida || "";
    const rollosCaja = String(rollosPorCaja(anchoDeMedida(medida), tipo === "Engomado"));
    const cajas = ult.cajas != null ? String(ult.cajas) : "";
    setForm(f => ({
      ...f,
      cliente: v, tipo, medida, cajas,
      rollos_caja: rollosCaja,
      rollos_totales: cajas ? String(Number(cajas) * Number(rollosCaja)) : "",
      tinta_tipo: ult.tinta_tipo || ult.color || "",
      color2: ult.color2 || "",
      medida_autollenada: medida,
    }));
    setTipoTocado(true);
    showToast(`📋 Llenado con el último pedido de ${ult.cliente} (#${ult.num}) — revísalo`);
  };

  // Si se entra con un borrador que ya trae cliente pero nada mas (se
  // escribio antes y se salio de la app), se llena al entrar -- escribir el
  // cliente no vuelve a disparar el autollenado si el nombre ya esta puesto.
  // Espera a que lleguen los pedidos y corre una sola vez.
  const autollenadoAlEntrar = useRef(false);
  useEffect(() => {
    if (autollenadoAlEntrar.current || pedidos.length === 0) return;
    autollenadoAlEntrar.current = true;
    if (form.cliente.trim() && !form.medida) cambiarCliente(form.cliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos.length]);


  const mesStr  = `${mes.y}-${String(mes.m+1).padStart(2,"0")}`;

  const pedActivos = pedidos.filter(p => p.status !== "terminado" && p.cliente !== REBOB_CLIENTE);
  // Ademas del nombre fijo actual, hay pedidos viejos de antes de Modo
  // Rebobinado con nombres sueltos ("REBOBINADO ACRILICO", etc.) -- se
  // excluyen tambien para que no salgan sugeridos como si fueran clientes.
  const clientesSugeridos = [...new Set(pedidos.map(p => p.cliente).filter(Boolean).filter(c => !c.toLowerCase().includes("rebobinado")))].sort();
  // Dashboard > Consumibles suma tinta_tipo, color y color2 como si fueran
  // el mismo campo -- se unifican entre si para que "Negro"/"NEGRO" no
  // aparezcan como colores distintos en esa grafica.
  const tintasSugeridas   = [...new Set(pedidos.flatMap(p => [p.tinta_tipo, p.color, p.color2]).filter(Boolean))].sort();
  // Fecha de entrega automatica (ver lib/entregas.js): la cola de la maquina
  // + lo que de verdad saca por hora. cola[id] dice cuando terminaria cada
  // pedido activo y si ya no alcanza su fecha prometida.
  const tasas = useMemo(() => tasasProduccion(pedidos), [pedidos]);
  const programa = useMemo(() => programarProduccion(pedidos, tasas), [pedidos, tasas]);
  const cola = programa.porId;
  const enMaquina = pedActivos.filter(p => p.status === "proceso");
  const fechaSugerida = fechaEntregaSugerida(pedidos, { medida: normalizarMedida(form.medida), cajas: form.cajas, color: form.tinta_tipo, color2: form.color2 }, tasas);
  // Ventas puede cambiarla (cliente que la necesita antes); si no la toca,
  // se queda la calculada y se va actualizando sola con medida/cajas.
  const fechaEntrega = form.fecha_estimada_manual || fechaSugerida || "";
  const conFecha   = pedActivos.filter(p => p.fecha_estimada).sort((a,b) => a.fecha_estimada.localeCompare(b.fecha_estimada));
  const proximos   = conFecha.filter(p => p.fecha_estimada >= hoy).slice(0, 10);

  const porDia = d => {
    const k = `${mesStr}-${String(d).padStart(2,"0")}`;
    return pedActivos.filter(p => p.fecha_estimada === k);
  };

  const chipColor = p => {
    if (p.fecha_estimada && p.fecha_estimada < hoy) return "#e84b4b";
    if (cola[p.id]?.enRiesgo) return "#ff9900";
    if (p.status === "proceso") return "#4b8fe8";
    return "#e8b84b";
  };

  const abrirRevision = () => {
    if (!form.cliente.trim()) { showToast("⚠ Escribe el nombre del cliente"); return; }
    if (!form.medida.trim())  { showToast("⚠ Escribe la medida"); return; }
    if (!form.cajas)          { showToast("⚠ Escribe el número de cajas"); return; }
    setRevisando(true);
  };

  const save = async () => {
    setSaving(true);
    // color y tinta_tipo van iguales -- Modo Operador/Consumibles/PDF leen
    // cualquiera de las dos segun de donde vino el pedido (ver Pedidos.js),
    // asi que se dejan sincronizadas desde que se crea aqui tambien.
    const colorFinal = unificarPorTexto(form.tinta_tipo, tintasSugeridas) || null;
    const nuevo = {
      id:              uid(),
      cliente:         unificarPorTexto(form.cliente, clientesSugeridos),
      num:             form.num.trim() || `V-${Date.now().toString().slice(-5)}`,
      tipo:            form.tipo,
      medida:          normalizarMedida(form.medida),
      cajas:           Number(form.cajas),
      rollos_caja:     form.rollos_caja ? Number(form.rollos_caja) : null,
      rollos_totales:  form.rollos_totales ? Number(form.rollos_totales) : null,
      tinta_tipo:      colorFinal,
      color:           colorFinal,
      color2:          unificarPorTexto(form.color2, tintasSugeridas) || null,
      fecha_solicitud: form.fecha_solicitud || hoy,
      fecha_estimada:  fechaEntrega || null,
      notas:           form.notas.trim() || null,
      status:          "anotado",
      maq:             "SIAT L36 #1",
      op:              "",
    };
    const res = await fetch('/api/pedidos', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
    const data = await res.json();
    if (!res.ok) { showToast("❌ Error: " + (data.error || "desconocido")); setSaving(false); return; }
    const guardado = data || nuevo;
    setPedidos(ps => [guardado, ...ps]);
    setForm({ ...FORM_INIT, num: siguienteNumPedido([guardado, ...pedidos]) });
    setTipoTocado(false);
    setRevisando(false);
    sendWhatsApp(mensajePedidoNuevo(guardado));
    showToast("✅ Pedido registrado correctamente");
    setTab("agenda");
    setSaving(false);
  };

  const selPeds = diaSel ? porDia(diaSel) : [];

  const inputStyle = { width:"100%", background:"var(--card)", border:"1px solid var(--border-light)", borderRadius:"var(--r-sm)", padding:"11px 12px", color:"var(--text)", fontSize:14, boxSizing:"border-box" };
  // Naranja si el campo esta vacio, verde en cuanto se llena -- para no
  // dejar datos a medias sin darse cuenta al anotar un pedido.
  const campoEstilo = (val) => (val ? { border: "1px solid var(--green)", background: "var(--green-dim)" } : { border: "1px solid var(--orange)", background: "var(--orange-dim)" });
  const seccionBox = { background:"var(--surface)", borderRadius:12, padding:"14px", marginBottom:14 };
  const seccionTitulo = { fontSize:11, color:"var(--text-2)", fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", marginBottom:12 };

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"var(--bg)" }}>

      {/* Header */}
      <header style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"var(--surface)", borderBottom:"2px solid var(--green)", position:"sticky", top:0, zIndex:10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height:36, width:"auto" }} />
        <div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:16, color:"var(--text)", letterSpacing:".06em" }}>EEMSA System</div>
          <div style={{ fontSize:10, color:"var(--accent)", fontWeight:700, letterSpacing:".08em" }}>MÓDULO VENTAS</div>
        </div>
        <button onClick={onSalir} style={{ marginLeft:"auto", fontSize:11, color:"var(--text-2)", background:"transparent", border:"none", cursor:"pointer", padding:"4px 8px" }}>← Salir</button>
      </header>

      {/* Main */}
      <main style={{ flex:1, padding:"16px 16px 82px", maxWidth:640, margin:"0 auto", width:"100%" }}>

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <div>
            <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"var(--accent)", letterSpacing:".06em", margin:"0 0 14px" }}>Agenda de Entregas</h2>

            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              <div style={{ background:"var(--surface)", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:24, fontWeight:800, color:"var(--accent)" }}>{proximos.length}</div>
                <div style={{ fontSize:11, color:"var(--text-2)" }}>Próximas entregas</div>
              </div>
              <div style={{ background:"var(--surface)", borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:24, fontWeight:800, color:"var(--red)" }}>{pedActivos.filter(p => p.fecha_estimada && p.fecha_estimada < hoy).length}</div>
                <div style={{ fontSize:11, color:"var(--text-2)" }}>Vencidas</div>
              </div>
            </div>

            {/* Calendario */}
            <CalendarGrid
              mes={mes} setMes={setMesYLimpiar}
              diaSel={diaSel} onSelectDia={(d) => setDiaSel(d)}
              pedidos={pedActivos}
              chipColor={chipColor}
              hoy={hoy}
            />

            {/* Panel día seleccionado */}
            {diaSel !== null && (
              <div style={{ background:"var(--surface)", borderRadius:14, padding:14, marginBottom:16 }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:700, color:"var(--accent)", marginBottom:10 }}>
                  {diaSel} de {MESES[mes.m]} {mes.y}
                </div>
                {selPeds.length === 0
                  ? <p style={{ color:"var(--muted)", fontSize:13, margin:0 }}>Sin entregas programadas para este día.</p>
                  : selPeds.map(p => {
                      const cc = chipColor(p);
                      return (
                        <div key={p.id} style={{ background:cc+"22", border:`1px solid ${cc}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                            <span style={{ fontWeight:700, fontSize:15, color:"var(--text)" }}>Ped. {p.num}</span>
                            <span style={{ background:cc+"33", color:cc, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{STATUS_LBL[p.status]||p.status}</span>
                          </div>
                          <div style={{ fontSize:13, color:"var(--text-2)" }}>{p.cliente}</div>
                          <div style={{ fontSize:12, color:"var(--text-2)", marginTop:2 }}>{p.medida} · {p.cajas} cajas{p.rollos_totales ? ` · ${p.rollos_totales} piezas/rollos` : ""}</div>
                        </div>
                      );
                    })
                }
              </div>
            )}

            {/* Próximas entregas */}
            {proximos.length > 0 && (
              <>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--text-2)", letterSpacing:".06em", marginBottom:8, marginTop:4 }}>PRÓXIMAS ENTREGAS</div>
                {proximos.map(p => {
                  const cc = chipColor(p);
                  const diasFaltan = Math.round((new Date(p.fecha_estimada+"T12:00:00") - new Date(hoy+"T12:00:00")) / 86400000);
                  return (
                    <div key={p.id} style={{ background:"var(--surface)", borderLeft:`3px solid ${cc}`, borderRadius:"0 10px 10px 0", padding:"10px 14px", marginBottom:6 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <strong style={{ color:"var(--text)", fontSize:14 }}>{p.num}</strong>
                          <span style={{ color:"var(--text-2)", fontSize:13 }}> — {p.cliente}</span>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:cc }}>{p.fecha_estimada}</div>
                          <div style={{ fontSize:11, color:"var(--muted)" }}>{diasFaltan===0?"Hoy":diasFaltan>0?`en ${diasFaltan}d`:`hace ${Math.abs(diasFaltan)}d`}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{p.medida} · {p.cajas} cajas{p.rollos_totales ? ` · ${p.rollos_totales} piezas/rollos` : ""}</div>
                      {cola[p.id]?.enRiesgo && <div style={{ fontSize:12, color:"#ff9900", fontWeight:700, marginTop:4 }}>⚠ No alcanza: con la cola actual saldría el {fechaCorta(cola[p.id].fechaFin)}</div>}
                    </div>
                  );
                })}
              </>
            )}

            {/* Orden de produccion -- el mismo programa que ve el operador */}
            {(enMaquina.length > 0 || programa.anotadosEnOrden.length > 0) && (
              <>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--text-2)", letterSpacing:".06em", marginBottom:4, marginTop:16 }}>ORDEN DE PRODUCCIÓN</div>
                <div style={{ fontSize:11, color:"var(--muted)", marginBottom:8 }}>Se acomoda solo: tinta clara a intensa, sin que ningún pedido llegue tarde.</div>
                {[...enMaquina, ...programa.anotadosEnOrden].map((p, i) => {
                  const plan = cola[p.id];
                  const tinta = p.color || p.tinta_tipo;
                  const hex = hexDeTinta(tinta);
                  return (
                    <div key={p.id} style={{ display:"flex", gap:10, alignItems:"center", background:"var(--surface)", borderRadius:10, padding:"10px 12px", marginBottom:6, border: plan?.enRiesgo ? "1px solid #ff9900" : "1px solid var(--border)" }}>
                      <div style={{ minWidth:26, textAlign:"center", fontWeight:800, color: p.status === "proceso" ? "#4b8fe8" : "var(--accent)", fontSize:15 }}>{p.status === "proceso" ? "▶" : (esManual(p) ? "📌" : "") + (i + 1 - enMaquina.length)}</div>
                      <span title={tinta || "Sin tinta"} style={{ width:14, height:14, borderRadius:"50%", flexShrink:0, background: hex || "transparent", border: hex ? "1px solid rgba(0,0,0,.35)" : "2px dashed var(--muted)" }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, color:"var(--text)", fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.num} — {p.cliente}</div>
                        <div style={{ fontSize:11, color:"var(--muted)" }}>{p.medida} · {p.cajas} cajas{tinta ? ` · ${tinta}` : ""}{p.color2 ? ` + ${p.color2}` : ""}</div>
                        {plan?.enRiesgo && <div style={{ fontSize:11, color:"#ff9900", fontWeight:700 }}>⚠ No alcanza su entrega</div>}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        {p.status === "proceso" ? <div style={{ fontSize:11, color:"#4b8fe8", fontWeight:700 }}>En máquina</div>
                          : plan && <div style={{ fontSize:11, color:"var(--teal)", fontWeight:700 }}>🏭 {fechaCorta(plan.fechaFin)}</div>}
                        {p.fecha_estimada && <div style={{ fontSize:11, color:"var(--text-2)" }}>🚚 {fechaCorta(p.fecha_estimada)}</div>}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {proximos.length === 0 && conFecha.length === 0 && (
              <div style={{ textAlign:"center", padding:"32px 0", color:"var(--muted)", fontSize:13 }}>
                No hay entregas pendientes.<br />La fecha de entrega se calcula sola al capturar cada pedido.
              </div>
            )}
          </div>
        )}

        {/* ── NUEVO PEDIDO ── */}
        {tab === "nuevo" && (
          <div>
            <h2 style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:800, color:"var(--accent)", letterSpacing:".06em", margin:"0 0 14px" }}>Nuevo Pedido</h2>

            {!revisando && <>
            <div style={seccionBox}>
              <div style={seccionTitulo}>Cliente y entrega</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Cliente *</label>
                  <input value={form.cliente} onChange={e=>cambiarCliente(e.target.value)} placeholder="Nombre del cliente" style={{ ...inputStyle, ...campoEstilo(form.cliente) }} list="clientes-list-ventas" />
                  <datalist id="clientes-list-ventas">{clientesSugeridos.map(c => <option key={c} value={c} />)}</datalist>
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>No. Pedido <span style={{ color:"var(--muted)", fontWeight:400 }}>(sugerido, edítalo si no aplica)</span></label>
                  <input value={form.num} onChange={e=>upd("num",e.target.value)} placeholder="Ej: 1042" style={inputStyle} />
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>📅 Fecha de solicitud</label>
                  <input type="date" value={form.fecha_solicitud||hoy} onChange={e=>upd("fecha_solicitud",e.target.value)} style={inputStyle} />
                </div>

                <div style={{ gridColumn:"1/-1" }}>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>🚚 Entrega estimada <span style={{ color:"var(--muted)", fontWeight:400 }}>(se calcula sola)</span></label>
                  <input type="date" value={fechaEntrega} onChange={e=>upd("fecha_estimada_manual",e.target.value)} style={{ ...inputStyle, ...(fechaEntrega ? { borderColor:"var(--green)" } : {}) }} />
                  {!fechaSugerida && !form.fecha_estimada_manual && (
                    <div style={{ fontSize:11, color:"var(--muted)", marginTop:5 }}>Pon medida y cajas y se calcula con los pedidos en cola y lo que saca la máquina.</div>
                  )}
                  {fechaSugerida && !form.fecha_estimada_manual && (
                    <div style={{ fontSize:11, color:"var(--green)", marginTop:5, fontWeight:600 }}>✓ {fechaCorta(fechaSugerida)} — con los pedidos en cola y lo que saca la máquina, más 1 día de margen.</div>
                  )}
                  {form.fecha_estimada_manual && fechaSugerida && form.fecha_estimada_manual !== fechaSugerida && (
                    <div style={{ fontSize:11, color: form.fecha_estimada_manual < fechaSugerida ? "#ff9900" : "var(--text-2)", marginTop:5, fontWeight:600 }}>
                      {form.fecha_estimada_manual < fechaSugerida
                        ? <>⚠ Es antes de lo calculado ({fechaCorta(fechaSugerida)}): se adelanta en la cola y puede retrasar otros pedidos. </>
                        : <>Calculada: {fechaCorta(fechaSugerida)}. </>}
                      <button type="button" onClick={() => upd("fecha_estimada_manual", "")} style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", fontSize:11, fontWeight:700, padding:0, textDecoration:"underline" }}>Usar la calculada</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={seccionBox}>
              <div style={seccionTitulo}>Producción</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Tipo de cinta</label>
                  <select value={form.tipo} onChange={e=>upd("tipo",e.target.value)} onClick={() => setTipoTocado(true)} style={{ ...inputStyle, ...campoEstilo(tipoTocado) }}>
                    {TIPOS.map(t => <option key={t}>{t}</option>)}
                  </select>
                  {textoAvisoTipo && <div style={estiloAviso}>⚠ {textoAvisoTipo}</div>}
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Medida *</label>
                  <input value={form.medida} onChange={e=>upd("medida",e.target.value)} placeholder="Ej: 2x100" style={{ ...inputStyle, ...campoEstilo(form.medida) }} />
                  {textoAvisoMedida && <div style={estiloAviso}>⚠ {textoAvisoMedida}</div>}
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Cajas *</label>
                  <input type="number" min="0" value={form.cajas} onChange={e=>upd("cajas",e.target.value)} placeholder="0" style={{ ...inputStyle, ...campoEstilo(form.cajas) }} />
                  {textoAvisoCajas && <div style={estiloAviso}>⚠ {textoAvisoCajas}</div>}
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Rollos / caja <span style={{ color:"var(--muted)", fontWeight:400 }}>(automático)</span></label>
                  <input type="number" readOnly value={form.rollos_caja} placeholder="Ej: 36" style={{ ...inputStyle, background: "var(--blue-dim)", color: "var(--accent)" }} />
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Piezas / rollos totales <span style={{ color:"var(--muted)", fontWeight:400 }}>(automático)</span></label>
                  <input type="number" readOnly value={form.rollos_totales} placeholder="Cajas × Rollos/caja" style={{ ...inputStyle, background: "var(--blue-dim)", color: "var(--accent)" }} />
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>Tinta</label>
                  <input value={form.tinta_tipo} onChange={e=>upd("tinta_tipo",e.target.value)} placeholder="Ej: Roja UV, Azul PMS…" style={{ ...inputStyle, ...campoEstilo(form.tinta_tipo) }} list="tintas-list-ventas" />
                  <datalist id="tintas-list-ventas">{tintasSugeridas.map(t => <option key={t} value={t} />)}</datalist>
                  {textoAvisoTinta && <div style={estiloAviso}>⚠ {textoAvisoTinta}</div>}
                </div>

                <div>
                  <label style={{ fontSize:12, color:"var(--text-2)", display:"block", marginBottom:5, fontWeight:600 }}>2do color (opcional)</label>
                  <input value={form.color2} onChange={e=>upd("color2",e.target.value)} placeholder="Solo si el pedido lleva 2 tintas" style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={seccionBox}>
              <div style={seccionTitulo}>Notas</div>
              <textarea value={form.notas} onChange={e=>upd("notas",e.target.value)} placeholder="Color, instrucciones especiales, urgencia…" rows={3} style={{ ...inputStyle, resize:"vertical" }} />
            </div>

            <button onClick={abrirRevision} style={{ width:"100%", marginTop:20, padding:"15px 0", borderRadius:12, border:"none", background:"var(--accent)", color:"#000", fontSize:16, fontWeight:800, cursor:"pointer", letterSpacing:".04em" }}>
              Revisar y guardar
            </button>
            </>}

            {/* Revision -- ultimo paso antes de guardar de verdad */}
            {revisando && (() => {
              const filas = [
                ["Cliente", unificarPorTexto(form.cliente, clientesSugeridos) || form.cliente],
                ["No. Pedido", form.num.trim() || `V-${Date.now().toString().slice(-5)}`],
                ["Fecha de solicitud", form.fecha_solicitud || hoy],
                ["Entrega estimada", fechaEntrega ? fechaCorta(fechaEntrega) : "—"],
                ["Tipo de cinta", form.tipo],
                ["Medida", normalizarMedida(form.medida)],
                ["Cajas", form.cajas],
                ["Rollos / caja", form.rollos_caja || "—"],
                ["Piezas / rollos totales", form.rollos_totales || "—"],
                ["Tinta", form.tinta_tipo || "—"],
                ["2do color", form.color2 || "—"],
              ];
              return (
                <div>
                  <div style={{ fontSize:11, color:"var(--green)", fontWeight:700, letterSpacing:1, marginBottom:14, textTransform:"uppercase" }}>Revisa antes de guardar</div>
                  {avisosPedido.length > 0 && (
                    <div style={{ padding:"10px 12px", marginBottom:12, borderRadius:8, border:"1px solid #ff9900", background:"#ff990018", color:"#ff9900", fontSize:13, fontWeight:700, display:"grid", gap:6 }}>
                      {avisosPedido.map(t => <div key={t}>⚠ {t}</div>)}
                      <div style={{ fontWeight:600 }}>Revisa que esté bien antes de guardar.</div>
                    </div>
                  )}
                  <div style={{ display:"grid", gap:8, marginBottom:14 }}>
                    {filas.map(([lbl, val]) => (
                      <div key={lbl} style={{ display:"flex", justifyContent:"space-between", padding:"9px 12px", background:"var(--surface)", borderRadius:8, fontSize:13 }}>
                        <span style={{ color:"var(--text-2)" }}>{lbl}</span>
                        <span style={{ color:"var(--text)", fontWeight:700 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  {form.notas.trim() && (
                    <div style={{ marginBottom:16, padding:"9px 12px", background:"var(--surface)", borderRadius:8, fontSize:13 }}>
                      <div style={{ color:"var(--text-2)", marginBottom:4 }}>Notas</div>
                      <div style={{ color:"var(--text)" }}>{form.notas}</div>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:8 }}>
                    <button type="button" onClick={() => setRevisando(false)} style={{ flex:1, padding:"13px 0", borderRadius:12, border:"1px solid var(--border-light)", background:"transparent", color:"var(--text-2)", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      ← Corregir datos
                    </button>
                    <button onClick={save} disabled={saving} style={{ flex:2, padding:"13px 0", borderRadius:12, border:"none", background:saving?"var(--border-light)":"var(--accent)", color:saving?"var(--text-2)":"#000", fontSize:15, fontWeight:800, cursor:saving?"default":"pointer", letterSpacing:".04em" }}>
                      {saving ? "Guardando…" : "✅ Confirmar y guardar"}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── CLIENTES ── */}
        {tab === "clientes" && <Clientes pedidos={pedidos} ocultarMerma clientesDisenos={clientesDisenos} />}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:"var(--card-hover)", border:"1px solid var(--border-light)", borderRadius:10, padding:"10px 22px", color:"var(--text)", fontSize:13, fontWeight:600, zIndex:300, whiteSpace:"nowrap", boxShadow:"var(--shadow-lg)" }}>
          {toast}
        </div>
      )}

      {/* Bottom nav */}
      <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:640, background:"var(--surface)", borderTop:"1px solid var(--border)", display:"flex", paddingBottom:"env(safe-area-inset-bottom,0px)", zIndex:50 }}>
        {[
          { id:"agenda",   Icon:IcoAgenda, lbl:"Agenda" },
          { id:"nuevo",    Icon:IcoNuevo,  lbl:"Nuevo Pedido" },
          { id:"clientes", Icon:IcoCli,    lbl:"Clientes" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, background:"transparent", border:"none", padding:"9px 4px 7px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", color:tab===t.id?"var(--accent)":"var(--muted)", borderTop:tab===t.id?"2px solid var(--accent)":"2px solid transparent" }}>
            <span style={{ width:22, height:22 }}><t.Icon /></span>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:".04em" }}>{t.lbl}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
