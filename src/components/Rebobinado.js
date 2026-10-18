import { useState, useEffect } from "react";
import { QRCodeSVG } from 'qrcode.react';
import { authHeaders } from '../lib/auth';
import { uid, today } from '../lib/utils';
import { REBOB_CLIENTE, REBOB_COLOR, REBOB_OPERADOR_EQUIPO, REBOB_TIPOS, REBOB_MATERIALES, REBOB_ANCHOS, REBOB_LARGOS_PIEZA, REBOB_LARGO_JUMBO_M, REBOB_PIEZAS_POR_VUELTA, REBOB_CAJAS_POR_CAMA, calcularPiezasTeoricas, piezasPorCajaDe } from '../lib/constants';
import { horasEfectivasPedido, JORNADA_HORAS } from '../lib/horario';
import { confirmar } from '../lib/confirm';
import { IcoCheck, IcoPause, IcoPlay } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

// anchoTocado/largoPiezaTocado: Ancho y Largo de pieza siempre traen un
// default (el primero de la lista) -- se marcan pendiente hasta que se
// tocan de verdad, igual que en Cotizador/CalculadoraProduccion, para no
// dejar la primera opcion puesta sin querer.
// Folios ya planeados/en proceso con una medida retirada de REBOB_LARGOS_PIEZA
// (ej. 147m) siguen trayendo ese valor en largoPieza -- esta funcion la
// vuelve a meter en las opciones SOLO para ese corte, para no dejar el
// <select disabled> mostrando un valor sin texto. No aparece en formularios
// nuevos porque ahi largoPieza nunca cae en un valor ya retirado.
const opcionesLargoPieza = (valorActual) => {
  const n = Number(valorActual);
  return REBOB_LARGOS_PIEZA.includes(n) ? REBOB_LARGOS_PIEZA : [...REBOB_LARGOS_PIEZA, n].sort((a, b) => a - b);
};

const corteInicial = () => ({
  id: uid(), ancho: REBOB_ANCHOS[0], largoPieza: REBOB_LARGOS_PIEZA[0], cajasCompletas: "", piezasSueltas: "", merma: "", anchoTocado: false, largoPiezaTocado: false,
  // "Cajas completas" ya no se escribe a mano -- se cuenta por camas (capas
  // apiladas de 12) para no salir de la app a usar la calculadora del celular.
  camasCompletas: "", cajasUltimaCama: "",
});

// Metros de MP que se llevo un corte: piezas reales / piezas-por-vuelta =
// vueltas usadas; vueltas x largo de pieza = metros.
const metrosDeCorte = (c) => {
  const piezasPorCaja = piezasPorCajaDe(c.ancho, c.largoPieza) || 1;
  const piezasPorVuelta = REBOB_PIEZAS_POR_VUELTA[c.ancho] || 0;
  const cajasN = Number(c.cajasCompletas) || 0;
  const sueltasN = Number(c.piezasSueltas) || 0;
  const piezasReal = cajasN * piezasPorCaja + sueltasN;
  const vueltasUsadas = piezasPorVuelta > 0 ? piezasReal / piezasPorVuelta : 0;
  return vueltasUsadas * (Number(c.largoPieza) || 0);
};

// Fraccion de rollo por corte, proporcional a los metros reales de cada
// uno -- asi la suma entre los cortes de un mismo rollo SIEMPRE da
// exactamente 1, en vez de comparar cada uno contra su propio 100%
// teorico por separado (eso solo se acercaba a 1 por casualidad
// geometrica, nunca exacto, por la vuelta final que no se completa).
const calcularFraccionesRollo = (listaCortes) => {
  if (listaCortes.length <= 1) return listaCortes.map(() => 1);
  const metros = listaCortes.map(metrosDeCorte);
  const total = metros.reduce((s, m) => s + m, 0);
  if (total <= 0) return listaCortes.map(() => 0);
  const crudas = metros.map(m => m / total);
  // El ultimo corte absorbe el redondeo de los demas para que la suma
  // guardada de exactamente 1, no 0.999... o 1.001... por punto flotante.
  const sumaMenosUltimo = crudas.slice(0, -1).reduce((s, f) => s + Number(f.toFixed(4)), 0);
  return crudas.map((f, i) => i === crudas.length - 1
    ? Number((1 - sumaMenosUltimo).toFixed(4))
    : Number(f.toFixed(4)));
};

// Material/adhesivo de un jumbo -- se lee de match_valor, que Inventario.js
// ya guarda estructurado como "Material|Adhesivo" (selects propios para
// categoria "jumbo", no texto libre) para que esto nunca falle ni haya que
// corregirlo a mano en Rebobinado. Si el material es de antes de ese cambio
// y no trae ese formato, se cae a adivinar por el nombre (mismo criterio de
// substring que chipColor en ModoOperador.js) solo para no dejar la
// planeacion en blanco -- de todos modos ya no es editable, asi que si la
// adivinada esta mal hay que corregir el match_valor del material en
// Inventario, no aqui.
const materialAdhesivoDe = (material) => {
  const [m1, a1] = String(material?.match_valor || '').split('|');
  if (REBOB_MATERIALES.includes(m1) && REBOB_TIPOS.includes(a1)) return { material: m1, adhesivo: a1 };
  const t = (material?.nombre || material?.match_valor || '').toLowerCase();
  const material2 = REBOB_MATERIALES.find(m => t.includes(m.toLowerCase())) || REBOB_MATERIALES[0];
  const adhesivo2 = REBOB_TIPOS.find(a => t.includes(a.toLowerCase()) || (a === 'Acrílico' && t.includes('acril'))) || REBOB_TIPOS[0];
  return { material: material2, adhesivo: adhesivo2 };
};

// Color real de cada rollo, para los chips de la cola/planeacion.
const COLOR_MATERIAL_REBOB = { Transparente: "#a9dcf0", Canela: "#c68a4a", Blanca: "#ededed" };
// Un color por medida en un rollo mixto (borde de su tarjeta + su tramo en la barra del jumbo).
const PALETA_MEDIDAS = ["var(--teal)", "var(--accent)", "var(--violet)", "var(--blue)", "var(--green)"];

export default function Rebobinado({ pedidos, setPedidos, tarimas = [], materiales = [], onSalir }) {
  const formInicial = {
    adhesivo: REBOB_TIPOS[0], material: REBOB_MATERIALES[0],
    fecha_inicio: today(), fecha_termino: today(), notas: "",
  };
  const [form, setForm] = useState(formInicial);
  const [cortes, setCortes] = useState([corteInicial()]);
  // Rollo (material) y Adhesivo tambien traen un default -- mismo criterio.
  const [materialTocado, setMaterialTocado] = useState(false);
  const [adhesivoTocado, setAdhesivoTocado] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const showToast = t => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updCorte = (id, k, v) => setCortes(cs => cs.map(c => c.id === id ? { ...c, [k]: v } : c));
  const agregarCorte = () => setCortes(cs => [...cs, corteInicial()]);
  const quitarCorte = (id) => setCortes(cs => cs.filter(c => c.id !== id));

  // ── Planeacion de jumbos ───────────────────────────────────────────────
  // Cada jumbo fisico ya es una tarima (categoria "jumbo" en Inventario,
  // ver supabase_jumbos.sql). Planear = crear pedido(s) status "anotado"
  // ligados a esa tarima (tarima_jumbo_id) ANTES de cortar -- el corte real
  // de mas abajo, cuando carga un plan, actualiza esos mismos registros en
  // vez de crear otros nuevos, y descuenta 1 jumbo de la tarima.
  const [planeandoMaterialId, setPlaneandoMaterialId] = useState(null);
  const planCorteInicial = () => ({ id: uid(), ancho: REBOB_ANCHOS[0], largoPieza: REBOB_LARGOS_PIEZA[0], anchoTocado: false, largoPiezaTocado: false, cajasDeseadas: "" });
  const [planCortes, setPlanCortes] = useState([planCorteInicial()]);

  // Calculo de vueltas/piezas para la planeacion -- distinto segun si es
  // una sola medida o un rollo mixto:
  //  - Una sola medida: se asume que se usa el jumbo COMPLETO (8000m) a esa
  //    medida, igual que ya hace calcularPiezasTeoricas.
  //  - Mixto: aqui no tiene sentido asumir el jumbo completo por medida (se
  //    reparte entre varias) -- en vez de eso, tu metes cuantas CAJAS
  //    quieres de cada una y se calculan las vueltas que hacen falta para
  //    esa meta (piezas deseadas / piezas por vuelta), redondeando hacia
  //    arriba (no se puede dar "media vuelta" de menos y quedar corto).
  const calcPlanCorte = (c, mixto) => {
    const piezasPorVuelta = REBOB_PIEZAS_POR_VUELTA[c.ancho] || 0;
    const piezasPorCaja = piezasPorCajaDe(c.ancho, c.largoPieza) || 0;
    const largo = Number(c.largoPieza) || 0;
    if (!mixto) {
      const vueltas = largo > 0 ? Math.floor(REBOB_LARGO_JUMBO_M / largo) : 0;
      const piezas = vueltas * piezasPorVuelta;
      const cajas = piezasPorCaja > 0 ? Math.floor(piezas / piezasPorCaja) : 0;
      return { vueltas, piezas, cajas, metros: vueltas * largo };
    }
    const cajasDeseadasN = Number(c.cajasDeseadas) || 0;
    const piezasNecesarias = cajasDeseadasN * piezasPorCaja;
    const vueltas = piezasPorVuelta > 0 ? Math.ceil(piezasNecesarias / piezasPorVuelta) : 0;
    const piezas = vueltas * piezasPorVuelta; // piezas reales que da ese num. de vueltas (>= lo pedido, por el redondeo)
    return { vueltas, piezas, cajas: cajasDeseadasN, metros: vueltas * largo };
  };
  // Vueltas de un pedido ya planeado/cortado -- se recalculan de piezas_prod
  // (guardado como meta al planear, ver guardarPlan) en vez de guardarse
  // aparte, para no duplicar el dato.
  const vueltasDe = (p) => {
    const { ancho } = parseMedidaRebob(p.medida);
    const ppv = REBOB_PIEZAS_POR_VUELTA[ancho] || 0;
    return ppv > 0 ? Math.round((Number(p.piezas_prod) || 0) / ppv) : 0;
  };
  const [planMaterial, setPlanMaterial] = useState(REBOB_MATERIALES[0]);
  const [planAdhesivo, setPlanAdhesivo] = useState(REBOB_TIPOS[0]);
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  // Cuando se elige "Cortar este jumbo" de la cola, el formulario de abajo
  // (el mismo de siempre) se prellena con lo planeado y se recuerda aqui
  // para que Guardar actualice esos registros en vez de crear otros, y
  // descuente el jumbo -- null significa flujo libre (como siempre fue).
  const [grupoActivo, setGrupoActivo] = useState(null);
  const [qrPizarraAbierto, setQrPizarraAbierto] = useState(false);
  const urlPizarraRebobinado = `${window.location.origin}/pizarra-rebobinado`;

  // Jumbos disponibles: tarimas activas de categoria "jumbo" con al menos 1
  // sin comprometer todavia en un plan (anotado/proceso).
  const gruposPlaneados = Object.values(
    pedidos.filter(p => p.cliente === REBOB_CLIENTE && (p.status === "anotado" || p.status === "proceso"))
      .reduce((acc, p) => {
        const key = p.folio_rebobinado != null ? `f${p.folio_rebobinado}` : p.id;
        (acc[key] = acc[key] || []).push(p);
        return acc;
      }, {})
  ).map(g => [...g].sort((a, b) => String(a.num).localeCompare(String(b.num))))
   .sort((a, b) => (a[0].orden ?? 9999) - (b[0].orden ?? 9999));
  const comprometidosPorTarima = {};
  gruposPlaneados.forEach(g => {
    const tid = g[0].tarima_jumbo_id;
    if (tid) comprometidosPorTarima[tid] = (comprometidosPorTarima[tid] || 0) + 1;
  });
  const candidatosJumbo = tarimas
    .filter(t => t.activa && Number(t.cantidad_actual) > 0)
    .filter(t => materiales.find(m => m.id === t.material_id)?.categoria === "jumbo")
    .map(t => ({ tarima: t, disponibles: Number(t.cantidad_actual) - (comprometidosPorTarima[t.id] || 0) }))
    .filter(x => x.disponibles > 0)
    .sort((a, b) => (a.tarima.numero ?? 0) - (b.tarima.numero ?? 0));
  // Planear se elige por TIPO (material: ej. "Jumbo Transparente Hotmelt"),
  // no por numero de tarima -- puede haber varias tarimas del mismo tipo
  // (distintos lotes recibidos en distintas fechas), asi que se agrupan
  // aqui y la tarima especifica se resuelve sola al guardar (la que tenga
  // menos disponibles primero, mismo criterio que ya usa la tinta, para no
  // dejar varias tarimas del mismo tipo abiertas a medias).
  const tiposJumboDisponibles = Object.values(
    candidatosJumbo.reduce((acc, x) => {
      const matId = x.tarima.material_id;
      if (!acc[matId]) acc[matId] = { material_id: matId, disponibles: 0, candidatos: [] };
      acc[matId].disponibles += x.disponibles;
      acc[matId].candidatos.push(x);
      return acc;
    }, {})
  ).map(g => ({ ...g, material: materiales.find(m => m.id === g.material_id) }))
   .sort((a, b) => (a.material?.nombre || "").localeCompare(b.material?.nombre || ""));
  const resolverTarimaParaTipo = (materialId) => {
    const grupo = tiposJumboDisponibles.find(g => g.material_id === materialId);
    if (!grupo) return null;
    const ordenado = [...grupo.candidatos].sort((a, b) => a.disponibles - b.disponibles || (a.tarima.numero ?? 0) - (b.tarima.numero ?? 0));
    return ordenado[0]?.tarima || null;
  };

  const actualizarPedidoRebob = (id, campos) => fetch('/api/pedidos', {
    method: 'PUT', headers: authHeaders(),
    body: JSON.stringify({ action: 'rebobinado_editar', id, ...campos }),
  });

  const abrirPlaneacion = (materialId) => {
    setPlaneandoMaterialId(materialId);
    const mat = materiales.find(m => m.id === materialId);
    const { material, adhesivo } = materialAdhesivoDe(mat);
    setPlanMaterial(material);
    setPlanAdhesivo(adhesivo);
    setPlanCortes([planCorteInicial()]);
  };
  const cerrarPlaneacion = () => setPlaneandoMaterialId(null);
  const agregarPlanCorte = () => setPlanCortes(cs => [...cs, planCorteInicial()]);
  const quitarPlanCorte = (id) => setPlanCortes(cs => cs.filter(c => c.id !== id));
  const updPlanCorte = (id, k, v) => setPlanCortes(cs => cs.map(c => c.id === id ? { ...c, [k]: v } : c));

  const guardarPlan = async () => {
    if (!planeandoMaterialId || planCortes.length === 0) { showToast("⚠ Elige un tipo de jumbo y al menos una medida"); return; }
    const tarimaElegida = resolverTarimaParaTipo(planeandoMaterialId);
    if (!tarimaElegida) { showToast("⚠ Ya no hay tarima disponible de ese tipo"); return; }
    const mixto = planCortes.length > 1;
    if (mixto && planCortes.some(c => !(Number(c.cajasDeseadas) > 0))) {
      showToast("⚠ Falta poner cuántas cajas quieres de cada medida"); return;
    }
    setGuardandoPlan(true);
    const folioNum = Math.max(0, ...pedidos.filter(p => p.cliente === REBOB_CLIENTE).map(p => Number(p.folio_rebobinado) || 0)) + 1;
    const ordenNuevo = Math.max(0, ...gruposPlaneados.map(g => g[0].orden ?? 0)) + 1;
    const nuevos = [];
    for (let i = 0; i < planCortes.length; i++) {
      const c = planCortes[i];
      const num = mixto ? `${folioNum}${String.fromCharCode(65 + i)}` : String(folioNum);
      const calcPlan = calcPlanCorte(c, mixto);
      const nuevo = {
        id: uid(), created: today(),
        cliente: REBOB_CLIENTE, num, folio_rebobinado: folioNum, orden: ordenNuevo,
        tipo: planMaterial, color: planAdhesivo, medida: `${c.ancho} x ${c.largoPieza}m`,
        // Meta planeada (vueltas/piezas/cajas que se calcularon arriba) --
        // se muestra en la cola y en la pizarra mientras el jumbo sigue sin
        // cortar; al registrar el corte real (grupoActivo en save()) se
        // sobreescribe con lo que de verdad salio.
        cajas: mixto ? Number(c.cajasDeseadas) : calcPlan.cajas,
        piezas_prod: calcPlan.piezas,
        fecha_solicitud: today(), status: "anotado",
        tarima_jumbo_id: tarimaElegida.id,
        notas: mixto
          ? `Planeado: ${calcPlan.vueltas} vueltas → ${calcPlan.piezas} pzas (pediste ${Number(c.cajasDeseadas) || 0} cajas) — rollo mixto`
          : `Planeado: jumbo completo — ${calcPlan.vueltas} vueltas → ${calcPlan.piezas} pzas teóricas`,
      };
      const res = await fetch('/api/pedidos', { method: 'POST', headers: authHeaders(), body: JSON.stringify(nuevo) });
      const data = await res.json();
      if (!res.ok) {
        showToast(`❌ Error al planear ${c.ancho} x ${c.largoPieza}m: ${data.error || "desconocido"}`);
        if (nuevos.length) setPedidos(ps => [...nuevos, ...ps]);
        setGuardandoPlan(false);
        return;
      }
      nuevos.push(nuevo);
    }
    setPedidos(ps => {
      const idsExistentes = new Set(ps.map(x => x.id));
      const faltantes = nuevos.filter(n => !idsExistentes.has(n.id));
      return [...faltantes, ...ps];
    });
    setPlaneandoMaterialId(null);
    showToast(`✓ Jumbo planeado — folio ${folioNum}${mixto ? ` (${planCortes.length} medidas)` : ""}`);
    setGuardandoPlan(false);
  };

  const moverPlan = async (folio, dir) => {
    const idx = gruposPlaneados.findIndex(g => g[0].folio_rebobinado === folio);
    const otroIdx = idx + dir;
    if (idx < 0 || otroIdx < 0 || otroIdx >= gruposPlaneados.length) return;
    const a = gruposPlaneados[idx], b = gruposPlaneados[otroIdx];
    const ordenA = a[0].orden ?? 0, ordenB = b[0].orden ?? 0;
    await Promise.all([
      ...a.map(p => actualizarPedidoRebob(p.id, { orden: ordenB })),
      ...b.map(p => actualizarPedidoRebob(p.id, { orden: ordenA })),
    ]);
    setPedidos(ps => ps.map(p => {
      if (a.some(x => x.id === p.id)) return { ...p, orden: ordenB };
      if (b.some(x => x.id === p.id)) return { ...p, orden: ordenA };
      return p;
    }));
  };

  const cancelarPlan = async (grupo) => {
    if (!(await confirmar(`¿Cancelar el plan del folio #${grupo[0].folio_rebobinado}? El jumbo se queda disponible para planear de nuevo.`))) return;
    await Promise.all(grupo.map(p => fetch('/api/pedidos', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id: p.id }) })));
    setPedidos(ps => ps.filter(p => !grupo.some(g => g.id === p.id)));
    showToast("✓ Plan cancelado — jumbo disponible de nuevo");
  };

  // Carga un jumbo planeado en el formulario de siempre (Medidas que
  // salieron) para capturar lo real -- ancho/largo quedan fijos a lo
  // planeado (si la realidad de verdad salio en otras medidas, mejor
  // cancelar el plan y registrar libre). id de cada corte = id real del
  // pedido "anotado" para poder actualizarlo en vez de crear otro.
  // "Cortar este jumbo" arranca el cronometro (inicio_ts + status=proceso)
  // igual que Modo Operador -- antes no habia forma de saber cuanto tardo
  // de verdad un jumbo, ni de pausarlo si el operador no vino o la maquina
  // no se prendio ese dia (mismo mecanismo de pausas que Modo Operador,
  // ver lib/horario.js). Se guarda en TODOS los pedidos del grupo (un
  // rollo mixto reparte el mismo tiempo entre sus medidas, igual que ya
  // se muestra un solo cronometro compartido en Modo Emilio).
  const cargarPlanParaCortar = async (grupo) => {
    setForm(f => ({ ...f, adhesivo: grupo[0].color, material: grupo[0].tipo }));
    setMaterialTocado(true);
    setAdhesivoTocado(true);
    setCortes(grupo.map(p => {
      const { ancho, largoPieza } = parseMedidaRebob(p.medida);
      return { id: p.id, ancho, largoPieza, cajasCompletas: "", piezasSueltas: "", merma: "", anchoTocado: true, largoPiezaTocado: true, camasCompletas: "", cajasUltimaCama: "" };
    }));
    const inicio_ts = grupo[0].inicio_ts || new Date().toISOString();
    const grupoConInicio = grupo.map(p => ({ ...p, inicio_ts, status: "proceso" }));
    setGrupoActivo(grupoConInicio);
    if (!grupo[0].inicio_ts) {
      await Promise.all(grupo.map(p => actualizarPedidoRebob(p.id, { inicio_ts, status: "proceso" })));
      setPedidos(ps => ps.map(p => grupo.some(g => g.id === p.id) ? { ...p, inicio_ts, status: "proceso" } : p));
    }
    showToast(`📋 Cargado folio #${grupo[0].folio_rebobinado} — cronómetro en marcha`);
  };
  // Cancelar regresa el jumbo a "anotado" y borra inicio_ts/pausas -- si no,
  // se queda atorado en "proceso" para siempre en la pizarra.
  const cancelarCargaPlan = async () => {
    if (grupoActivo) {
      await Promise.all(grupoActivo.map(p => actualizarPedidoRebob(p.id, { status: "anotado", inicio_ts: null, pausas: [] })));
      setPedidos(ps => ps.map(p => grupoActivo.some(g => g.id === p.id) ? { ...p, status: "anotado", inicio_ts: null, pausas: [] } : p));
    }
    setGrupoActivo(null);
    setCortes([corteInicial()]);
    setForm(formInicial);
    setMaterialTocado(false);
    setAdhesivoTocado(false);
  };

  const estaPausadoJumbo = !!(grupoActivo?.[0]?.pausas?.length && !grupoActivo[0].pausas[grupoActivo[0].pausas.length - 1].fin);
  const pausarJumbo = async () => {
    const nuevasPausas = [...(grupoActivo[0].pausas || []), { inicio: new Date().toISOString(), fin: null }];
    await Promise.all(grupoActivo.map(p => actualizarPedidoRebob(p.id, { pausas: nuevasPausas })));
    setGrupoActivo(g => g.map(p => ({ ...p, pausas: nuevasPausas })));
    setPedidos(ps => ps.map(p => grupoActivo.some(g => g.id === p.id) ? { ...p, pausas: nuevasPausas } : p));
    showToast("⏸ Jumbo pausado");
  };
  const reanudarJumbo = async () => {
    const pausas = [...(grupoActivo[0].pausas || [])];
    if (pausas.length && !pausas[pausas.length - 1].fin) {
      pausas[pausas.length - 1] = { ...pausas[pausas.length - 1], fin: new Date().toISOString() };
    }
    await Promise.all(grupoActivo.map(p => actualizarPedidoRebob(p.id, { pausas })));
    setGrupoActivo(g => g.map(p => ({ ...p, pausas })));
    setPedidos(ps => ps.map(p => grupoActivo.some(g => g.id === p.id) ? { ...p, pausas } : p));
    showToast("▶ Jumbo reanudado");
  };

  // Reloj en vivo solo mientras hay un jumbo cortandose -- para el
  // cronometro de "Cortar este jumbo" (mismo patron que Modo Operador).
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    if (!grupoActivo) return;
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, [grupoActivo]);

  // Mismo rollo MP (8000m) a veces sale mezclado -- parte a una medida y
  // parte a otra -- en vez de una sola medida fija para todo el rollo.
  // Cada "corte" de la lista se registra como su propio pedido, para que
  // Modo Emilio muestre por separado cuantas piezas salieron de cada medida.
  const calcCorte = (c) => {
    const vueltas = Math.floor(REBOB_LARGO_JUMBO_M / (Number(c.largoPieza) || 1));
    const piezasTeoricas = calcularPiezasTeoricas(c.ancho, c.largoPieza);
    const piezasPorCaja = piezasPorCajaDe(c.ancho, c.largoPieza) || 1;
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

    return { vueltas, piezasTeoricas, piezasReal, diferencia, piezasPorCaja, cajasCompletasN, piezasSueltasN, mermaNum, mermaPct };
  };

  const esMixto = cortes.length > 1;

  const save = async () => {
    const validos = cortes.filter(c => (Number(c.cajasCompletas) || 0) > 0 || (Number(c.piezasSueltas) || 0) > 0);
    if (validos.length === 0) { showToast("⚠ Llena cajas completas o piezas sueltas en al menos una medida"); return; }
    setLoading(true);
    const fracciones = calcularFraccionesRollo(validos);

    // Si se cargo un jumbo planeado (grupoActivo), esto ya no crea pedidos
    // nuevos -- actualiza los mismos registros "anotado" que la planeacion
    // ya creo (mismo folio/num de siempre) y descuenta el jumbo de su
    // tarima. Si alguna medida planeada se quedo en blanco (no salio de
    // verdad), se borra en vez de dejarla huerfana en "anotado".
    if (grupoActivo) {
      const idsAUsar = new Set(validos.map(c => c.id));
      const sobrantes = grupoActivo.filter(p => !idsAUsar.has(p.id));
      for (let i = 0; i < validos.length; i++) {
        const c = validos[i];
        const calc = calcCorte(c);
        const notaSueltas = calc.piezasSueltasN > 0 ? ` · ${calc.piezasSueltasN} pzas sueltas (no completan caja)` : "";
        const updates = {
          cajas: calc.cajasCompletasN, piezas_prod: calc.piezasReal, rollos_usados: fracciones[i],
          merma: calc.mermaNum, merma_pct: calc.mermaPct, status: "pendiente",
          fin_ts: new Date().toISOString(),
          notas: (form.notas || `Teórico: ${calc.piezasTeoricas} pzas (${calc.vueltas} vueltas x ${c.ancho})`) + notaSueltas,
        };
        const res = await actualizarPedidoRebob(c.id, updates);
        if (!res.ok) { showToast(`❌ Error al guardar ${c.ancho} x ${c.largoPieza}m`); setLoading(false); return; }
        setPedidos(ps => ps.map(p => p.id === c.id ? { ...p, ...updates } : p));
      }
      if (sobrantes.length) {
        await Promise.all(sobrantes.map(p => fetch('/api/pedidos', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id: p.id }) })));
        setPedidos(ps => ps.filter(p => !sobrantes.some(s => s.id === p.id)));
      }
      // Descuenta 1 jumbo de la tarima -- se pidio que sea en cuanto se
      // registra el corte real, sin esperar a que Emilio de de alta.
      try {
        await fetch('/api/inventario?accion=consumo-jumbo', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ tarima_id: grupoActivo[0].tarima_jumbo_id, pedido_num: grupoActivo[0].folio_rebobinado }),
        });
      } catch (_) {}
      const folioNum = grupoActivo[0].folio_rebobinado;
      setGrupoActivo(null);
      setCortes([corteInicial()]);
      setForm(formInicial);
      setMaterialTocado(false);
      setAdhesivoTocado(false);
      showToast(`✓ Folio ${folioNum} registrado — jumbo descontado — ya aparece en Modo Emilio para dar de alta`);
      setLoading(false);
      return;
    }

    // Flujo libre (sin plan previo) -- exactamente como siempre funciono.
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
        cajas: calc.cajasCompletasN, piezas_prod: calc.piezasReal, rollos_usados: fracciones[i], op: REBOB_OPERADOR_EQUIPO,
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

    // Con varios cortes en un mixto, cada POST puede llegar por realtime
    // (App.js) antes de que termine este loop -- sin este chequeo se
    // duplicaba el registro (uno del realtime, otro de este prepend).
    setPedidos(ps => {
      const idsExistentes = new Set(ps.map(x => x.id));
      const faltantes = nuevos.filter(n => !idsExistentes.has(n.id));
      return [...faltantes, ...ps];
    });
    setCortes([corteInicial()]);
    setForm(f => ({ ...formInicial, adhesivo: f.adhesivo, material: f.material }));
    setMaterialTocado(false);
    setAdhesivoTocado(false);
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
    if (!(await confirmar("¿Borrar este registro para volver a capturarlo?"))) return;
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
    const { ancho, largoPieza } = parseMedidaRebob(p.medida);
    const piezasPorCaja = piezasPorCajaDe(ancho, largoPieza) || 1;
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
    const piezasPorCaja = piezasPorCajaDe(ancho, largoPieza) || 1;
    const piezasTeoricas = calcularPiezasTeoricas(ancho, largoPieza);
    const cajasN = Number(editForm.cajasCompletas) || 0;
    const sueltasN = Number(editForm.piezasSueltas) || 0;
    const piezasReal = cajasN * piezasPorCaja + sueltasN;
    const rollosUsadosFraccion = piezasTeoricas > 0 ? piezasReal / piezasTeoricas : 0;
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

  // ── Piezas visuales de la cola y la planeacion de jumbos ────────────────
  // Todo con las variables de App.css (--card, --bg, --teal...) para que se
  // vea bien en tema oscuro y claro.
  const ent = (n) => Math.round(Number(n) || 0).toLocaleString("es-MX");
  const chip = (texto, color = "var(--text-2)") => (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{texto}</span>
  );
  // El material del rollo con su color de verdad, para reconocerlo de un vistazo.
  const chipMaterial = (material) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text)", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLOR_MATERIAL_REBOB[material] || "var(--muted)", border: "1px solid rgba(0,0,0,.35)" }} />{material}
    </span>
  );
  const pasoTitulo = (num, texto) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--teal)", color: "#0b0d11", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{num}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{texto}</span>
    </div>
  );
  // Botones en vez de select: se ven todas las opciones y se elige de un
  // toque. Borde naranja = todavia no se confirma (mismo significado que
  // campo-pendiente en el resto del sistema).
  const opcionesPicker = (opciones, valor, tocado, alElegir, etiqueta) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: 4, borderRadius: 10, border: `1.5px solid ${tocado ? "var(--border)" : "var(--orange)"}`, background: "var(--card)" }}>
      {opciones.map(o => {
        const activo = String(o) === String(valor);
        return (
          <button key={o} type="button" onClick={() => alElegir(o)} style={{ flex: "1 0 auto", minWidth: 52, padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 15, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".03em", background: activo ? (tocado ? "var(--teal)" : "var(--orange-dim)") : "transparent", color: activo ? (tocado ? "#0b0d11" : "var(--orange)") : "var(--text-2)" }}>{etiqueta(o)}</button>
        );
      })}
    </div>
  );
  const statTile = (etiqueta, valor, destacado = false) => (
    <div style={{ flex: 1, background: "var(--card)", border: `1px solid ${destacado ? "var(--teal)" : "var(--border)"}`, borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: destacado ? "var(--teal)" : "var(--text)", lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", marginTop: 4 }}>{etiqueta}</div>
    </div>
  );
  // Barra de los 8000m del jumbo repartidos entre medidas (rollo mixto) --
  // si se pasa, la barra se pinta en rojo y se dice.
  const barraJumbo = (segmentos) => {
    const total = segmentos.reduce((s, x) => s + x.metros, 0);
    const pasa = total > REBOB_LARGO_JUMBO_M;
    const escala = Math.max(total, REBOB_LARGO_JUMBO_M);
    return (
      <div>
        <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--card)", border: `1px solid ${pasa ? "var(--red)" : "var(--border)"}` }}>
          {segmentos.map((s, i) => s.metros > 0 && (
            <div key={i} title={`${s.label}: ${ent(s.metros)} m`} style={{ width: `${(s.metros / escala) * 100}%`, background: PALETA_MEDIDAS[i % PALETA_MEDIDAS.length], borderRight: "2px solid var(--card)" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 11, marginTop: 6, color: pasa ? "var(--red)" : "var(--text-2)" }}>
          <span>
            {segmentos.map((s, i) => (
              <span key={i} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: PALETA_MEDIDAS[i % PALETA_MEDIDAS.length], marginRight: 4 }} />{s.label}
              </span>
            ))}
          </span>
          <span><strong>{ent(total)}</strong> / {ent(REBOB_LARGO_JUMBO_M)} m{pasa ? " · te pasas del jumbo" : ""}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface)", borderBottom: "2px solid var(--teal)", position: "sticky", top: 0, zIndex: 10 }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 36, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 16, color: "#e0e0e0", letterSpacing: ".06em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 700, letterSpacing: ".08em" }}>MODO REBOBINADO</div>
        </div>
        <button onClick={() => setQrPizarraAbierto(true)} style={{ marginLeft: "auto", fontSize: 11, color: "var(--teal)", background: "transparent", border: "1px solid var(--teal)", borderRadius: 6, cursor: "pointer", padding: "5px 10px" }}>🖨️ QR Pizarra</button>
        <button onClick={onSalir} style={{ fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px" }}>← Salir</button>
      </header>

      <main style={{ flex: 1, padding: "16px 16px 82px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
      <h2 className="sec-title">Rebobinado</h2>

      {(() => {
        const totalCajasCola = gruposPlaneados.reduce((s, g) => s + g.reduce((t, p) => t + (Number(p.cajas) || 0), 0), 0);
        const totalVueltasCola = gruposPlaneados.reduce((s, g) => s + g.reduce((t, p) => t + vueltasDe(p), 0), 0);
        return (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <h3 className="sub-title" style={{ margin: 0 }}>Cola de jumbos</h3>
            {gruposPlaneados.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                <strong style={{ color: "var(--teal)" }}>{gruposPlaneados.length}</strong> jumbo{gruposPlaneados.length === 1 ? "" : "s"} · <strong style={{ color: "var(--text)" }}>{ent(totalCajasCola)}</strong> cajas · <strong style={{ color: "var(--text)" }}>{ent(totalVueltasCola)}</strong> vueltas
              </span>
            )}
          </div>
        );
      })()}
      {gruposPlaneados.length === 0 ? (
        <div style={{ border: "1px dashed var(--border-light)", borderRadius: 14, padding: "22px 16px", textAlign: "center", marginBottom: 14, color: "var(--text-2)", fontSize: 13 }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>🧻</div>
          Sin jumbos planeados todavía — planea uno abajo o registra libre como siempre.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
          {gruposPlaneados.map((g, i) => {
            const enProceso = g[0].status === "proceso";
            // "Siguiente" = el primero de la cola que todavia no se esta cortando.
            const idxSiguiente = gruposPlaneados.findIndex(x => x[0].status !== "proceso");
            const estado = enProceso
              ? { txt: "Cortando", color: "var(--teal)", fondo: "var(--teal-dim)" }
              : i === idxSiguiente
                ? { txt: "Siguiente", color: "var(--accent)", fondo: "var(--accent-dim)" }
                : { txt: "En cola", color: "var(--text-2)", fondo: "var(--bg)" };
            const tarima = tarimas.find(x => x.id === g[0].tarima_jumbo_id);
            const mixto = g.length > 1;
            const segmentos = g.map(p => {
              const { largoPieza } = parseMedidaRebob(p.medida);
              return { label: p.medida, metros: vueltasDe(p) * (Number(largoPieza) || 0) };
            });
            const primero = i === 0, ultimo = i === gruposPlaneados.length - 1;
            const btnMover = (deshabilitado) => ({ width: 30, height: 26, borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg)", color: deshabilitado ? "var(--border-light)" : "var(--text-2)", cursor: deshabilitado ? "default" : "pointer", fontSize: 11 });
            return (
              <div key={g[0].folio_rebobinado ?? g[0].id} style={{ background: "var(--card)", border: `1px solid ${enProceso ? "var(--teal)" : "var(--border)"}`, borderLeft: `4px solid ${estado.color}`, borderRadius: 14, padding: 14, boxShadow: "var(--shadow-sm)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--teal-dim)", color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: ".02em", lineHeight: 1 }}>Folio #{g[0].folio_rebobinado}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: estado.color, background: estado.fondo, border: `1px solid ${estado.color}`, borderRadius: 999, padding: "2px 9px", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {enProceso && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal)" }} />}{estado.txt}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button title="Subir en la cola" onClick={() => moverPlan(g[0].folio_rebobinado, -1)} disabled={primero} style={btnMover(primero)}>▲</button>
                    <button title="Bajar en la cola" onClick={() => moverPlan(g[0].folio_rebobinado, 1)} disabled={ultimo} style={btnMover(ultimo)}>▼</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {chipMaterial(g[0].tipo)}
                  {chip(g[0].color)}
                  {tarima && chip(`Tarima #${tarima.numero ?? "?"}${tarima.lote ? ` · ${tarima.lote}` : ""}`)}
                  {mixto && chip(`Rollo mixto · ${g.length} medidas`, "var(--teal)")}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: mixto ? 10 : 12 }}>
                  {g.map((p, j) => (
                    <div key={p.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderTop: mixto ? `3px solid ${PALETA_MEDIDAS[j % PALETA_MEDIDAS.length]}` : "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 800, color: "var(--accent)", lineHeight: 1.1 }}>{p.medida}</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--teal)" }}>{ent(vueltasDe(p))} vueltas</div>
                        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{ent(p.cajas)} cajas · {ent(p.piezas_prod)} pzas</div>
                      </div>
                    </div>
                  ))}
                </div>

                {mixto && <div style={{ marginBottom: 12 }}>{barraJumbo(segmentos)}</div>}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => cargarPlanParaCortar(g)}>{enProceso ? "▶ Continuar corte" : "✂️ Cortar este jumbo"}</button>
                  <button onClick={() => cancelarPlan(g)} style={{ background: "transparent", border: "1px solid var(--border-light)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "10px 12px" }}>Cancelar plan</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!planeandoMaterialId && (
        <button onClick={() => abrirPlaneacion(tiposJumboDisponibles[0]?.material_id || "elegir")} style={{ width: "100%", marginBottom: 20, padding: "14px 0", borderRadius: 14, border: "1.5px dashed var(--teal)", background: "var(--teal-dim)", color: "var(--teal)", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: ".05em" }}>
          + Planear un jumbo
        </button>
      )}

      {planeandoMaterialId && (
        <div style={{ background: "var(--card)", border: "1px solid var(--teal)", borderRadius: 16, padding: 16, marginBottom: 20, boxShadow: "var(--shadow-md)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 800, color: "var(--teal)", letterSpacing: ".05em" }}>PLANEAR JUMBO</span>
            <button onClick={cerrarPlaneacion} title="Cerrar" style={{ background: "transparent", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          {tiposJumboDisponibles.length === 0 ? (
            <div style={{ border: "1px dashed var(--border-light)", borderRadius: 12, padding: 16, textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
              No hay jumbos disponibles en Inventario (categoría "Jumbo") sin planear todavía. Da uno de alta ahí primero.
            </div>
          ) : (
            <>
              {pasoTitulo("1", "¿Qué tipo de jumbo?")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginBottom: 16 }}>
                {tiposJumboDisponibles.map(t => {
                  const activo = t.material_id === planeandoMaterialId;
                  const { material, adhesivo } = materialAdhesivoDe(t.material);
                  return (
                    <button key={t.material_id} type="button" onClick={() => abrirPlaneacion(t.material_id)} style={{ textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", borderRadius: 12, padding: "10px 12px", background: activo ? "var(--teal-dim)" : "var(--bg)", border: `1.5px solid ${activo ? "var(--teal)" : "var(--border)"}`, color: "var(--text)" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{t.material?.nombre || "Jumbo"}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {chipMaterial(material)}
                        {chip(adhesivo)}
                      </div>
                      <div style={{ fontSize: 12, color: activo ? "var(--teal)" : "var(--text-2)", fontWeight: 700, marginTop: 8 }}>{t.disponibles} disponible{t.disponibles === 1 ? "" : "s"}</div>
                    </button>
                  );
                })}
              </div>

              {planeandoMaterialId !== "elegir" && (
                <>
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: -8, marginBottom: 16 }}>
                    Rollo <strong style={{ color: "var(--text)" }}>{planMaterial}</strong> · Adhesivo <strong style={{ color: "var(--text)" }}>{planAdhesivo}</strong> <span style={{ color: "var(--muted)" }}>— automático según el tipo; se corrige en Inventario.</span>
                  </div>

                  {pasoTitulo("2", planCortes.length > 1 ? "¿A qué medidas lo vas a cortar?" : "¿A qué medida lo vas a cortar?")}
                  {(() => {
                    const mixtoPlan = planCortes.length > 1;
                    const calculos = planCortes.map(c => ({ c, calc: calcPlanCorte(c, mixtoPlan) }));
                    const anchosUnicos = [...new Set(planCortes.map(c => c.ancho))];
                    const porAncho = mixtoPlan && anchosUnicos.length > 1 ? anchosUnicos.map(a => ({
                      ancho: a,
                      vueltas: calculos.filter(x => x.c.ancho === a).reduce((s, x) => s + x.calc.vueltas, 0),
                    })) : null;
                    return (
                      <>
                        {calculos.map(({ c, calc }, idx) => (
                          <div key={c.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderTop: mixtoPlan ? `3px solid ${PALETA_MEDIDAS[idx % PALETA_MEDIDAS.length]}` : "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                            {mixtoPlan && (
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-2)", letterSpacing: ".06em", textTransform: "uppercase" }}>Medida {String.fromCharCode(65 + idx)}</span>
                                <button onClick={() => quitarPlanCorte(c.id)} style={{ background: "transparent", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕ Quitar</button>
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 5 }}>Ancho {!c.anchoTocado && <span style={{ color: "var(--orange)", textTransform: "none", letterSpacing: 0 }}>· toca para confirmar</span>}</div>
                            {opcionesPicker(REBOB_ANCHOS, c.ancho, c.anchoTocado, a => { updPlanCorte(c.id, "ancho", a); updPlanCorte(c.id, "anchoTocado", true); }, a => a)}
                            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: "10px 0 5px" }}>Largo de pieza {!c.largoPiezaTocado && <span style={{ color: "var(--orange)", textTransform: "none", letterSpacing: 0 }}>· toca para confirmar</span>}</div>
                            {opcionesPicker(REBOB_LARGOS_PIEZA, c.largoPieza, c.largoPiezaTocado, l => { updPlanCorte(c.id, "largoPieza", l); updPlanCorte(c.id, "largoPiezaTocado", true); }, l => `${l}m`)}
                            {mixtoPlan && (
                              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                                <label>Cajas que quiero</label>
                                <input className={c.cajasDeseadas !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" min="0" value={c.cajasDeseadas} onChange={e => updPlanCorte(c.id, "cajasDeseadas", e.target.value)} placeholder="Ej: 50" />
                              </div>
                            )}
                            <div style={{ marginTop: 12 }}>
                              {mixtoPlan && !(Number(c.cajasDeseadas) > 0)
                                ? <div style={{ fontSize: 12, color: "var(--text-2)" }}>Pon cuántas cajas quieres de esta medida para calcular las vueltas.</div>
                                : (
                                  <>
                                    {!mixtoPlan && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Jumbo completo a esta medida</div>}
                                    <div style={{ display: "flex", gap: 8 }}>
                                      {statTile("Vueltas", ent(calc.vueltas), true)}
                                      {statTile(mixtoPlan ? "Piezas" : "Piezas teóricas", ent(calc.piezas))}
                                      {mixtoPlan ? statTile("Metros", ent(calc.metros)) : statTile("Cajas teóricas", ent(calc.cajas))}
                                    </div>
                                  </>
                                )}
                            </div>
                          </div>
                        ))}
                        {mixtoPlan && (
                          <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>Metros del jumbo</div>
                            {barraJumbo(calculos.map(({ c, calc }) => ({ label: `${c.ancho} x ${c.largoPieza}m`, metros: calc.metros })))}
                            {porAncho && (
                              <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8 }}>
                                {porAncho.map(x => <span key={x.ancho} style={{ marginRight: 14 }}>{x.ancho}: <strong style={{ color: "var(--teal)" }}>{ent(x.vueltas)}</strong> vueltas</span>)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <button className="btn btn-ghost btn-sm" onClick={agregarPlanCorte}>+ Agregar otra medida (rollo mixto)</button>
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={guardarPlan} disabled={guardandoPlan}>{guardandoPlan ? "Guardando…" : "✓ Guardar plan"}</button>
                    <button className="btn btn-ghost" onClick={cerrarPlaneacion}>Cancelar</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {grupoActivo && (
        <>
          <div style={{ background: "rgba(62,207,192,0.12)", border: "1px solid var(--teal)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--teal)" }}>📋 Capturando el corte real del folio #{grupoActivo[0].folio_rebobinado} planeado</span>
            <button onClick={cancelarCargaPlan} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 12 }}>✕ Salir sin guardar</button>
          </div>
          {(() => {
            const totalMin = Math.floor(horasEfectivasPedido(new Date(grupoActivo[0].inicio_ts), ahora, grupoActivo[0].pausas) * 60);
            const d = Math.floor(totalMin / (JORNADA_HORAS * 60));
            const restoMin = totalMin - d * JORNADA_HORAS * 60;
            const h = Math.floor(restoMin / 60);
            const m = restoMin % 60;
            const elapsed = d > 0 ? `${d}d ${h}h ${String(m).padStart(2,'0')}m` : h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`;
            return (
              <div style={{ marginBottom: 14 }}>
                {estaPausadoJumbo ? (
                  <div style={{ textAlign: "center", background: "rgba(232,184,75,0.1)", border: "1px solid #e8b84b", borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#e8b84b", fontWeight: 700, letterSpacing: ".07em", marginBottom: 4 }}><Ico icon={IcoPause} size={11} /> PAUSADO</div>
                    <div style={{ fontSize: 13, color: "#9aa0bc" }}>El tiempo pausado no se le carga al jumbo</div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", background: "rgba(75,232,122,0.08)", border: "1px solid var(--green)", borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, letterSpacing: ".07em", marginBottom: 4 }}>⏱ TIEMPO EN PRODUCCIÓN</div>
                    <div style={{ fontSize: 30, fontWeight: 900, color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>{elapsed}</div>
                  </div>
                )}
                <button className="btn btn-block" style={{ padding: 12, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "1px solid #e8b84b", color: "#e8b84b", background: "transparent" }} onClick={estaPausadoJumbo ? reanudarJumbo : pausarJumbo}>
                  <Ico icon={estaPausadoJumbo ? IcoPlay : IcoPause} size={14} /> {estaPausadoJumbo ? "Reanudar" : "Pausar (operador ausente / máquina apagada)"}
                </button>
              </div>
            );
          })()}
        </>
      )}

      <h3 className="sub-title">Rollo (material) del jumbo — {REBOB_LARGO_JUMBO_M}m</h3>
      <div className="form-grid">
        <div className="field"><label>Rollo (material) *</label><select disabled={!!grupoActivo} className={materialTocado ? 'campo-listo' : 'campo-pendiente'} value={form.material} onChange={e => { upd("material", e.target.value); setMaterialTocado(true); }} onClick={() => setMaterialTocado(true)}>{REBOB_MATERIALES.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>Adhesivo *</label><select disabled={!!grupoActivo} className={adhesivoTocado ? 'campo-listo' : 'campo-pendiente'} value={form.adhesivo} onChange={e => { upd("adhesivo", e.target.value); setAdhesivoTocado(true); }} onClick={() => setAdhesivoTocado(true)}>{REBOB_TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
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
      {(() => { const fraccionesRollo = calcularFraccionesRollo(cortes); return cortes.map((c, i) => {
        const calc = calcCorte(c);
        const fraccionRollo = fraccionesRollo[i];
        return (
          <div key={c.id} style={{ background: "#1a1d26", borderRadius: 10, padding: 12, marginBottom: 12, border: esMixto ? "1px solid #2a2e3a" : "none" }}>
            {esMixto && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#888", letterSpacing: ".05em" }}>MEDIDA {i + 1}</span>
                {cortes.length > 1 && !grupoActivo && <button onClick={() => quitarCorte(c.id)} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 12 }}>✕ Quitar</button>}
              </div>
            )}
            <div className="form-grid">
              <div className="field"><label>Ancho de corte{grupoActivo ? " (planeado)" : ""}</label>
                <select disabled={!!grupoActivo} className={c.anchoTocado ? 'campo-listo' : 'campo-pendiente'} value={c.ancho} onChange={e => { updCorte(c.id, "ancho", e.target.value); updCorte(c.id, "anchoTocado", true); }} onClick={() => updCorte(c.id, "anchoTocado", true)}>{REBOB_ANCHOS.map(a => <option key={a} value={a}>{a}</option>)}</select>
              </div>
              <div className="field"><label>Largo de pieza (m){grupoActivo ? " (planeado)" : ""}</label>
                <select disabled={!!grupoActivo} className={c.largoPiezaTocado ? 'campo-listo' : 'campo-pendiente'} value={c.largoPieza} onChange={e => { updCorte(c.id, "largoPieza", e.target.value); updCorte(c.id, "largoPiezaTocado", true); }} onClick={() => updCorte(c.id, "largoPiezaTocado", true)}>{opcionesLargoPieza(c.largoPieza).map(l => <option key={l} value={l}>{l}m</option>)}</select>
              </div>
              <div className="field full">
                <label>Conteo por camas <span style={{ color: "#666", fontWeight: 400 }}>({REBOB_CAJAS_POR_CAMA}/cama · {calc.piezasPorCaja} pzas/caja)</span></label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className={c.camasCompletas !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" min="0" value={c.camasCompletas} placeholder="Camas completas" onChange={e => {
                    const v = e.target.value;
                    updCorte(c.id, "camasCompletas", v);
                    updCorte(c.id, "cajasCompletas", String((Number(v) || 0) * REBOB_CAJAS_POR_CAMA + (Number(c.cajasUltimaCama) || 0)));
                  }} style={{ flex: 1 }} />
                  <input className={c.cajasUltimaCama !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" min="0" max={REBOB_CAJAS_POR_CAMA - 1} value={c.cajasUltimaCama} placeholder="Últ. cama (0-11)" onChange={e => {
                    const v = e.target.value;
                    updCorte(c.id, "cajasUltimaCama", v);
                    updCorte(c.id, "cajasCompletas", String((Number(c.camasCompletas) || 0) * REBOB_CAJAS_POR_CAMA + (Number(v) || 0)));
                  }} style={{ flex: 1 }} />
                </div>
              </div>
              <div className="field"><label>Piezas sueltas <span style={{ color: "#666", fontWeight: 400 }}>(no completan caja)</span></label><input className={c.piezasSueltas !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" value={c.piezasSueltas} onChange={e => updCorte(c.id, "piezasSueltas", e.target.value)} placeholder="18" /></div>
              <div className="field"><label>Cajas completas (automático)</label><input readOnly value={c.cajasCompletas || "—"} style={{ background: "#1a2744", color: "#c9922a" }} /></div>
              <div className="field"><label>Piezas producidas (automático)</label><input readOnly value={(c.cajasCompletas || c.piezasSueltas) ? `${calc.piezasReal} pzas` : "—"} style={{ background: "#1a2744", color: "#4be87a", fontWeight: 700 }} /></div>
              <div className="field"><label>Rollo MP usado <span style={{ color: "#666", fontWeight: 400 }}>(fracción, automático)</span></label><input readOnly value={(c.cajasCompletas || c.piezasSueltas) ? fraccionRollo.toFixed(2) : "—"} style={{ background: "#1a2744", color: "#4b8fe8" }} /></div>
              <div className="field"><label>Merma (piezas)</label><input className={c.merma !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" value={c.merma} onChange={e => updCorte(c.id, "merma", e.target.value)} placeholder="0" /></div>
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
      }); })()}
      {esMixto && (() => {
        // Las fracciones ya se calculan proporcionales entre si (ver
        // calcularFraccionesRollo), asi que esta suma siempre da 1 exacto
        // -- se deja como confirmacion visual, no como advertencia.
        const suma = calcularFraccionesRollo(cortes).reduce((s, f) => s + f, 0);
        return (
          <div style={{ textAlign: "right", fontSize: 12, color: "#aaa", marginBottom: 8 }}>
            Suma de rollo usado entre las {cortes.length} medidas: <strong style={{ color: "#4be87a" }}>{suma.toFixed(2)}</strong>
          </div>
        );
      })()}
      {!grupoActivo && <button className="btn btn-ghost btn-block" style={{ marginBottom: 20 }} onClick={agregarCorte}>+ Agregar otra medida (rollo mixto)</button>}

      <div className="form-grid">
        <div className="field full"><label>Notas</label><textarea value={form.notas} onChange={e => upd("notas", e.target.value)} placeholder="Opcional — si no escribes nada, se guarda el cálculo teórico" /></div>
      </div>
      <button className="btn btn-primary btn-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={save} disabled={loading}>
        {loading ? "Guardando…" : <><Ico icon={IcoCheck} size={15} /> {esMixto ? `Registrar ${cortes.length} medidas` : "Registrar"} y mandar a Modo Emilio</>}
      </button>

      <h3 className="sub-title" style={{ marginTop: 20 }}>Historial</h3>
      {gruposHistorial.length === 0 ? <p className="empty">Sin registros todavía.</p> : gruposHistorial.map(grupo => {
        const esLote = grupo.length > 1;
        const statusGeneral = grupo.every(p => p.status === "terminado") ? "terminado" : "pendiente";
        return (
          <div key={grupo[0].id} className="list-item" style={{ marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <strong>{esLote ? `🧵 Lote #${grupo[0].folio_rebobinado}` : `#${grupo[0].num}`}</strong> · {grupo[0].tipo} · {grupo[0].color}
              </div>
              <span className={`badge ${statusGeneral === "terminado" ? "b-green" : "b-orange"}`}>{statusGeneral === "terminado" ? "Terminado" : "Falta dar de alta"}</span>
            </div>
            {grupo.map((p, i) => {
              const corteLetra = esLote ? (String(p.num).match(/^\d+([A-Za-z])$/) || [])[1] : null;
              return (
                <div key={p.id} style={{ marginTop: 6, paddingTop: i > 0 || esLote ? 6 : 0, borderTop: esLote && i > 0 ? "1px solid #22252f" : "none" }}>
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div className="muted">
                        {corteLetra && <strong style={{ color: REBOB_COLOR }}>{corteLetra} </strong>}
                        {p.medida} · {p.cajas} cajas · {p.piezas_prod} piezas
                        {esLote && (() => {
                          const { ancho, largoPieza } = parseMedidaRebob(p.medida);
                          return ` · teórico ${calcularPiezasTeoricas(ancho, largoPieza)} pzas`;
                        })()}
                      </div>
                      {p.status === "pendiente" && (
                        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                          <button onClick={() => abrirEdicion(p)} style={{ background: "transparent", border: "none", color: "#4b8fe8", cursor: "pointer", fontSize: 11 }}>✏️ Editar</button>
                          <button onClick={() => borrar(p.id)} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 11 }}>🗑️ Borrar</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {toast && <div className="toast">{toast}</div>}
      </main>

      {qrPizarraAbierto && (
        <div className="vista-grande-overlay" style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <button className="no-imprimir" onClick={() => setQrPizarraAbierto(false)} aria-label="Cerrar"
            style={{ position: "absolute", top: 16, right: 16, fontSize: 30, lineHeight: 1, background: "transparent", border: "none", color: "#000", cursor: "pointer", padding: 8 }}>✕</button>
          <div className="imprimible qr-pagina-completa" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <div style={{ fontSize: "clamp(24px, 5vw, 48px)", fontWeight: 800, color: "#111", textAlign: "center", marginBottom: 10, lineHeight: 1.1 }}>Pizarra en vivo — Rebobinado</div>
            <div style={{ fontSize: "clamp(13px, 2vw, 20px)", color: "#444", marginBottom: 24 }}>Escanea para ver los jumbos planeados y a qué medida va cada uno</div>
            <div className="qr-grande"><QRCodeSVG value={urlPizarraRebobinado} size={280} bgColor="#ffffff" fgColor="#000000" /></div>
            <div style={{ fontSize: "clamp(11px, 1.5vw, 16px)", color: "#999", marginTop: 20, wordBreak: "break-all", maxWidth: "90vw", textAlign: "center" }}>{urlPizarraRebobinado}</div>
          </div>
          <div className="no-imprimir" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => window.print()}>🖨️ Imprimir</button>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, color: "#666", border: "1px solid #ccc" }} onClick={() => setQrPizarraAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
