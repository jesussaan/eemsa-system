import { useState } from "react";
import { QRCodeSVG } from 'qrcode.react';
import { authHeaders } from '../lib/auth';
import { uid, today, fmt } from '../lib/utils';
import { REBOB_CLIENTE, REBOB_COLOR, REBOB_OPERADOR_EQUIPO, REBOB_TIPOS, REBOB_MATERIALES, REBOB_ANCHOS, REBOB_LARGOS_PIEZA, REBOB_LARGO_JUMBO_M, REBOB_PIEZAS_POR_CAJA, REBOB_PIEZAS_POR_VUELTA, REBOB_CAJAS_POR_CAMA, calcularPiezasTeoricas } from '../lib/constants';
import { confirmar } from '../lib/confirm';
import { IcoCheck } from './Icons';

const Ico = ({ icon: I, size = 13 }) => <span style={{ display: "inline-flex", fontSize: size, verticalAlign: -2 }}><I /></span>;

// anchoTocado/largoPiezaTocado: Ancho y Largo de pieza siempre traen un
// default (el primero de la lista) -- se marcan pendiente hasta que se
// tocan de verdad, igual que en Cotizador/CalculadoraProduccion, para no
// dejar la primera opcion puesta sin querer.
const corteInicial = () => ({
  id: uid(), ancho: REBOB_ANCHOS[0], largoPieza: REBOB_LARGOS_PIEZA[0], cajasCompletas: "", piezasSueltas: "", merma: "", anchoTocado: false, largoPiezaTocado: false,
  // "Cajas completas" ya no se escribe a mano -- se cuenta por camas (capas
  // apiladas de 12) para no salir de la app a usar la calculadora del celular.
  camasCompletas: "", cajasUltimaCama: "",
});

// Metros de MP que se llevo un corte: piezas reales / piezas-por-vuelta =
// vueltas usadas; vueltas x largo de pieza = metros.
const metrosDeCorte = (c) => {
  const piezasPorCaja = REBOB_PIEZAS_POR_CAJA[c.ancho] || 1;
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
    const piezasPorCaja = REBOB_PIEZAS_POR_CAJA[c.ancho] || 0;
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
  const cargarPlanParaCortar = (grupo) => {
    setForm(f => ({ ...f, adhesivo: grupo[0].color, material: grupo[0].tipo }));
    setMaterialTocado(true);
    setAdhesivoTocado(true);
    setCortes(grupo.map(p => {
      const { ancho, largoPieza } = parseMedidaRebob(p.medida);
      return { id: p.id, ancho, largoPieza, cajasCompletas: "", piezasSueltas: "", merma: "", anchoTocado: true, largoPiezaTocado: true, camasCompletas: "", cajasUltimaCama: "" };
    }));
    setGrupoActivo(grupo);
    showToast(`📋 Cargado folio #${grupo[0].folio_rebobinado} — captura lo real y guarda`);
  };
  const cancelarCargaPlan = () => {
    setGrupoActivo(null);
    setCortes([corteInicial()]);
    setForm(formInicial);
    setMaterialTocado(false);
    setAdhesivoTocado(false);
  };

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

      <h3 className="sub-title">Jumbos planeados <span style={{ color: "#666", fontWeight: 400, fontSize: 12 }}>({gruposPlaneados.length})</span></h3>
      {gruposPlaneados.length === 0 ? (
        <p className="empty" style={{ marginBottom: 12 }}>Sin jumbos planeados todavía — planea uno abajo o registra libre como siempre.</p>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {gruposPlaneados.map((g, i) => (
            <div key={g[0].folio_rebobinado ?? g[0].id} style={{ background: "#1a1d26", borderRadius: 10, padding: 12, marginBottom: 8, display: "flex", gap: 10, alignItems: "stretch", border: g[0].status === "proceso" ? "1px solid var(--teal)" : "1px solid #2a2e3a" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                <div style={{ color: "var(--teal)", fontWeight: 800, fontSize: 15 }}>{i + 1}</div>
                <button onClick={() => moverPlan(g[0].folio_rebobinado, -1)} disabled={i === 0} style={{ background: "#0d0f14", border: "1px solid #2a2e3a", borderRadius: 6, color: i === 0 ? "#333" : "#ccc", width: 24, height: 24, cursor: i === 0 ? "default" : "pointer", fontSize: 11 }}>▲</button>
                <button onClick={() => moverPlan(g[0].folio_rebobinado, 1)} disabled={i === gruposPlaneados.length - 1} style={{ background: "#0d0f14", border: "1px solid #2a2e3a", borderRadius: 6, color: i === gruposPlaneados.length - 1 ? "#333" : "#ccc", width: 24, height: 24, cursor: i === gruposPlaneados.length - 1 ? "default" : "pointer", fontSize: 11 }}>▼</button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 14 }}>Folio #{g[0].folio_rebobinado} · {g[0].tipo} · {g[0].color}</strong>
                  {(() => { const t = tarimas.find(x => x.id === g[0].tarima_jumbo_id); return t ? <span style={{ fontSize: 11, color: "#888" }}>Tarima #{t.numero ?? "?"}{t.lote ? ` · ${t.lote}` : ""}</span> : null; })()}
                </div>
                <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                  {g.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#0d0f14", borderRadius: 8, padding: "5px 10px" }}>
                      <span className="badge b-accent" style={{ fontSize: 12 }}>{p.medida}</span>
                      <span style={{ fontSize: 12, color: "var(--teal)", fontWeight: 700 }}>{vueltasDe(p)} vueltas</span>
                      <span style={{ fontSize: 12, color: "#9aa0bc" }}>{fmt(p.cajas)} cajas · {fmt(p.piezas_prod)} pzas</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => cargarPlanParaCortar(g)}>✂️ Cortar este jumbo</button>
                  <button onClick={() => cancelarPlan(g)} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 12 }}>✕ Cancelar plan</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-ghost btn-block" style={{ marginBottom: 20 }} onClick={() => planeandoMaterialId ? cerrarPlaneacion() : abrirPlaneacion(tiposJumboDisponibles[0]?.material_id || "elegir")}>
        {planeandoMaterialId ? "✕ Cerrar planeación" : "+ Planear un jumbo"}
      </button>

      {planeandoMaterialId && (
        <div style={{ background: "#1a1d26", border: "1px solid var(--teal)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <h3 className="sub-title" style={{ marginTop: 0 }}>Planear jumbo</h3>
          {tiposJumboDisponibles.length === 0 ? (
            <p className="empty">No hay jumbos disponibles en Inventario (categoría "Jumbo") sin planear todavía. Da uno de alta ahí primero.</p>
          ) : (
            <>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>¿Qué tipo de jumbo?</label>
                <select className="campo-listo" value={planeandoMaterialId === "elegir" ? "" : planeandoMaterialId} onChange={e => abrirPlaneacion(e.target.value)}>
                  <option value="" disabled>Elige un tipo…</option>
                  {tiposJumboDisponibles.map(g => (
                    <option key={g.material_id} value={g.material_id}>{g.material?.nombre || "Jumbo"} ({g.disponibles} disponible{g.disponibles === 1 ? "" : "s"})</option>
                  ))}
                </select>
              </div>
              {planeandoMaterialId !== "elegir" && (
                <>
                  <div className="form-grid" style={{ marginBottom: 10 }}>
                    <div className="field"><label>Rollo (material)</label><input readOnly value={planMaterial} style={{ background: "#1a2744", color: "#c9922a" }} /></div>
                    <div className="field"><label>Adhesivo</label><input readOnly value={planAdhesivo} style={{ background: "#1a2744", color: "#c9922a" }} /></div>
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: -6, marginBottom: 10 }}>Automático, según el tipo de jumbo elegido — para corregirlo, ajusta el material/adhesivo de este jumbo en Inventario.</div>
                  <label style={{ fontSize: 12, color: "#888" }}>¿A qué medida(s) lo vas a cortar?</label>
                  {(() => {
                    const mixtoPlan = planCortes.length > 1;
                    return (
                      <>
                        {planCortes.map((c, i) => {
                          const calc = calcPlanCorte(c, mixtoPlan);
                          return (
                            <div key={c.id} style={{ background: "#0d0f14", borderRadius: 8, padding: 10, marginTop: 8 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                <div className="field" style={{ flex: 1 }}><label>Ancho</label>
                                  <select className={c.anchoTocado ? 'campo-listo' : 'campo-pendiente'} value={c.ancho} onChange={e => { updPlanCorte(c.id, "ancho", e.target.value); updPlanCorte(c.id, "anchoTocado", true); }} onClick={() => updPlanCorte(c.id, "anchoTocado", true)}>{REBOB_ANCHOS.map(a => <option key={a} value={a}>{a}</option>)}</select>
                                </div>
                                <div className="field" style={{ flex: 1 }}><label>Largo pieza (m)</label>
                                  <select className={c.largoPiezaTocado ? 'campo-listo' : 'campo-pendiente'} value={c.largoPieza} onChange={e => { updPlanCorte(c.id, "largoPieza", e.target.value); updPlanCorte(c.id, "largoPiezaTocado", true); }} onClick={() => updPlanCorte(c.id, "largoPiezaTocado", true)}>{REBOB_LARGOS_PIEZA.map(l => <option key={l} value={l}>{l}m</option>)}</select>
                                </div>
                                {mixtoPlan && (
                                  <div className="field" style={{ flex: 1 }}><label>Cajas que quiero</label>
                                    <input className={c.cajasDeseadas !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" min="0" value={c.cajasDeseadas} onChange={e => updPlanCorte(c.id, "cajasDeseadas", e.target.value)} placeholder="Ej: 50" />
                                  </div>
                                )}
                                {planCortes.length > 1 && <button onClick={() => quitarPlanCorte(c.id)} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 12, paddingBottom: 8 }}>✕</button>}
                              </div>
                              <div style={{ fontSize: 11, color: "#9aa0bc", marginTop: 6 }}>
                                {mixtoPlan
                                  ? (c.cajasDeseadas !== '' && c.cajasDeseadas !== '0'
                                      ? <>Vueltas necesarias: <strong style={{ color: "var(--teal)" }}>{calc.vueltas}</strong> · {calc.piezas} pzas ({calc.metros}m del jumbo)</>
                                      : "Pon cuántas cajas quieres de esta medida para calcular las vueltas")
                                  : <>Jumbo completo a esta medida: <strong style={{ color: "var(--teal)" }}>{calc.vueltas} vueltas</strong> · {calc.piezas} pzas teóricas · {calc.cajas} cajas teóricas</>}
                              </div>
                            </div>
                          );
                        })}
                        {mixtoPlan && (() => {
                          const metrosTotales = planCortes.reduce((s, c) => s + calcPlanCorte(c, true).metros, 0);
                          const sobra = metrosTotales > REBOB_LARGO_JUMBO_M;
                          return (
                            <div style={{ fontSize: 12, marginTop: 10, textAlign: "right", color: sobra ? "var(--red)" : "#9aa0bc" }}>
                              Metros del jumbo usados: <strong>{metrosTotales}</strong> / {REBOB_LARGO_JUMBO_M}m{sobra ? " ⚠ te pasas del jumbo" : ""}
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={agregarPlanCorte}>+ Agregar otra medida (rollo mixto)</button>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="btn btn-primary" onClick={guardarPlan} disabled={guardandoPlan}>{guardandoPlan ? "Guardando…" : "✓ Guardar plan"}</button>
                    <button className="btn btn-ghost" onClick={cerrarPlaneacion}>Cancelar</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {grupoActivo && (
        <div style={{ background: "rgba(62,207,192,0.12)", border: "1px solid var(--teal)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--teal)" }}>📋 Capturando el corte real del folio #{grupoActivo[0].folio_rebobinado} planeado</span>
          <button onClick={cancelarCargaPlan} style={{ background: "transparent", border: "none", color: "#ff4d4d", cursor: "pointer", fontSize: 12 }}>✕ Salir sin guardar</button>
        </div>
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
                <select disabled={!!grupoActivo} className={c.largoPiezaTocado ? 'campo-listo' : 'campo-pendiente'} value={c.largoPieza} onChange={e => { updCorte(c.id, "largoPieza", e.target.value); updCorte(c.id, "largoPiezaTocado", true); }} onClick={() => updCorte(c.id, "largoPiezaTocado", true)}>{REBOB_LARGOS_PIEZA.map(l => <option key={l} value={l}>{l}m</option>)}</select>
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
