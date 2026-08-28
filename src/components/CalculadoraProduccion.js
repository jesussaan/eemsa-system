import { useState } from 'react';
import { ENGOMADO_JUMBO_LARGO_M, ENGOMADO_MP_ROLLO_PRECIO } from '../lib/constants';
import { calcularProduccion, MP_ANCHO, MP_LARGO, PORTALICHES, DISENOS, rollosPorCaja, anchoDePedido, largoDePedido, disenoEsImagen } from '../lib/produccion';
import { coberturaDeImagen } from '../lib/imagenCobertura';
import { horasEfectivas, JORNADA_HORAS } from '../lib/horario';

export default function CalculadoraProduccion({ pedidos, onClose, pedidoInicial, onConfirmar, inline, sugerido, clicheActivoInfo }) {
  // Ancho/largo se sacan de Medida cuando el pedido no los trae aparte (ej.
  // pedidos anotados desde Ventas, que solo guardan Medida) -- antes se
  // usaba pedidoInicial.ancho/largo crudos y se caia en el default fijo
  // ("2"/"100") sin avisar, aunque el pedido si tuviera la medida real.
  const [ancho,      setAncho]      = useState(String(anchoDePedido(pedidoInicial) || 2));
  const [largo,      setLargo]      = useState(String(largoDePedido(pedidoInicial) || 100));
  const [cajas,      setCajas]      = useState(pedidoInicial?.cajas       ? String(pedidoInicial.cajas)       : '');
  const [merma,      setMerma]      = useState('');
  // Portacliche/diseno: si viene "sugerido" (ultimo pedido igual ya
  // finalizado, ver ModoOperador.js), se prellenan con eso en vez del
  // default fijo -- el operador los puede seguir cambiando si el cliche
  // de esta corrida es distinto.
  const [portaliche, setPortaliche] = useState(String(sugerido?.portaliche || '30.9'));
  const [diseno,     setDiseno]     = useState(sugerido?.diseno || 'normal');
  const [clicheNA,   setClicheNA]   = useState(false);
  // Nuevo/Usado: para trackear cuantas cajas/pedidos aguanta un mismo
  // cliche fisico (ver api/cliches.js). Se preselecciona solo con la misma
  // deteccion que ya se le muestra al operador como aviso (clicheActivoInfo):
  // si hay un cliche activo para este cliente+medida+color, lo mas probable
  // es que sea el mismo (Usado); si no hay ninguno, lo mas probable es que
  // sea nuevo. clicheEstadoTocado obliga a que el operador de verdad lo
  // confirme con un tap (naranja -> verde) antes de poder continuar, para
  // que la adivinada no se cuele sin que la revise -- el aviso en pantalla
  // le da el contexto para corregirla si el sistema se equivoco.
  const [clicheEstado, setClicheEstado] = useState(() => clicheActivoInfo ? 'usado' : 'nuevo'); // 'nuevo' | 'usado'
  const [clicheEstadoTocado, setClicheEstadoTocado] = useState(false);
  // Portacliche/diseno siempre traen un valor (sugerido o default) -- para
  // que la marca de color sirva de algo, se cuenta como "pendiente" hasta
  // que el operador de verdad los toca (los revisa/confirma), no solo
  // porque ya traigan algo prellenado.
  const [portalicheTocado, setPortalicheTocado] = useState(false);
  const [disenoTocado,     setDisenoTocado]     = useState(false);

  // Engomado: rollo de MP fijo (136mm x 685m, $900/rollo, corte real 6.8cm
  // aunque se venda como "3\""), en vez de la formula normal de la SIAT L36.
  const esEngomado = pedidoInicial?.tipo === 'Engomado';

  // Rollos/caja ya no se escribe a mano -- se calcula solo segun ancho/tipo,
  // para no volver a repetir el error de dejar el numero que no es.
  const rollosCaja = String(rollosPorCaja(ancho, esEngomado));

  // 2do color: el pedido ya lo declaro (Pedidos.js), mismas piezas de la
  // corrida pero su propio portacliche y diseno/cobertura.
  const tieneColor2   = !!pedidoInicial?.color2;
  const [portaliche2, setPortaliche2] = useState(String(sugerido?.portaliche2 || '30.9'));
  const [diseno2,     setDiseno2]     = useState(sugerido?.diseno2 || 'normal');
  const [portaliche2Tocado, setPortaliche2Tocado] = useState(false);
  const [diseno2Tocado,     setDiseno2Tocado]     = useState(false);

  // Cobertura de tinta calculada de una imagen del diseno en vez de elegir
  // entre los 4 botones fijos -- todo pasa en el navegador (canvas), la
  // imagen no se sube ni se guarda en ningun lado (ver lib/imagenCobertura.js).
  const [analizandoImg,  setAnalizandoImg]  = useState(false);
  const [analizandoImg2, setAnalizandoImg2] = useState(false);
  const [errorImg,  setErrorImg]  = useState('');
  const [errorImg2, setErrorImg2] = useState('');
  const analizarImagenDiseno = async (file, esColor2) => {
    (esColor2 ? setAnalizandoImg2 : setAnalizandoImg)(true);
    (esColor2 ? setErrorImg2 : setErrorImg)('');
    try {
      const cob = await coberturaDeImagen(file);
      const valor = `img:${(cob * 100).toFixed(1)}`;
      if (esColor2) { setDiseno2(valor); setDiseno2Tocado(true); }
      else { setDiseno(valor); setDisenoTocado(true); }
    } catch (e) {
      (esColor2 ? setErrorImg2 : setErrorImg)(e.message || 'No se pudo analizar la imagen');
    } finally {
      (esColor2 ? setAnalizandoImg2 : setAnalizandoImg)(false);
    }
  };

  // Datos reales (flujo finalizar) -- se captura "cajas producidas" y las
  // piezas se calculan solas (cajas x rollos/caja), en vez de escribirlas
  // a mano; es mas facil contar cajas que llevar la cuenta de piezas.
  const [cajasProd,  setCajasProd]  = useState('');
  const [piezasProd, setPiezasProd] = useState('');
  const [mermaReal,  setMermaReal]  = useState('');
  // Stickybacks: 1 si el pedido lleva una tinta, 2 si lleva dos -- se
  // preselecciona solo (tieneColor2 ya dice cuantas tintas trae el pedido),
  // pero se deja tocar por si la realidad de la corrida es distinta.
  const [stickyback, setStickyback] = useState(() => tieneColor2 ? 2 : 1);
  const [verDesglose, setVerDesglose] = useState(false);

  // Pantalla de revision antes de guardar -- se llama al mismo endpoint de
  // costo que usa ModoOperador.finalizarPedido, pero solo para previsualizar
  // (no guarda nada), asi se puede detectar un error de captura antes de
  // mandarlo a Emilio en vez de despues.
  const [revisando, setRevisando] = useState(false);
  const [costoPreview, setCostoPreview] = useState(null);
  const [costoPreviewLoading, setCostoPreviewLoading] = useState(false);
  const [costoPreviewError, setCostoPreviewError] = useState(false);

  // Cálculos producción (formula compartida con Cotizador.js)
  const {
    anchoN, largoN, rollosCajaN, mermaN,
    largoReal, pistas, rollosPista, rendimiento, piezasBuenas, piezasTotal,
    rollosExacto, rollosMP, tintaKg, tintaKg2, tintaKgTotal, solventeKg, listo,
  } = calcularProduccion({
    ancho, largo, cajas, rollosCaja, merma,
    portaliche, diseno, portaliche2, diseno2, tieneColor2,
    esEngomado, sinTinta: clicheNA,
  });

  const mermaPct = piezasProd && mermaReal && Number(piezasProd) > 0
    ? ((Number(mermaReal) / Number(piezasProd)) * 100).toFixed(2) : null;

  // Mismos parametros que ModoOperador.finalizarPedido le manda a
  // /api/costos al guardar -- se llama aqui primero, sin guardar, solo para
  // mostrar el numero antes de confirmar.
  const handleAbrirRevision = async () => {
    setRevisando(true);
    setCostoPreview(null);
    setCostoPreviewError(false);
    if (!(Number(piezasProd) > 0)) return;
    setCostoPreviewLoading(true);
    try {
      // Mismo criterio que ModoOperador.finalizarPedido: dias de costo fijo
      // basados en horas EFECTIVAS de trabajo, no dias de calendario.
      const diasProd = pedidoInicial?.inicio_ts
        ? Math.max(0.5, horasEfectivas(new Date(pedidoInicial.inicio_ts), new Date()) / JORNADA_HORAS)
        : 1;
      const res = await fetch('/api/costos?action=calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollosMP: rollosExacto, tintaKg, solventeKg,
          cajas: Number(cajas) || 0, piezasBuenas: Number(piezasProd),
          sticky: stickyback || 0, diasProd,
          colorKey: pedidoInicial?.color || pedidoInicial?.tinta_tipo || '',
          tintaKg2: tieneColor2 ? tintaKg2 : 0,
          colorKey2: pedidoInicial?.color2 || '',
          esEngomado,
          tipoCentro: anchoDePedido(pedidoInicial) === 3 ? '3' : '2',
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCostoPreview(data.costo_pieza);
    } catch (_) {
      setCostoPreviewError(true);
    }
    setCostoPreviewLoading(false);
  };

  // Portacliche/diseno se prellenan con "sugerido" (ultima corrida igual)
  // y es facil no notar que hay que cambiarlos si esta vez el cliche es
  // distinto -- se avisa mientras el valor siga igual al sugerido, para
  // que salte a la vista antes de confirmar en vez de pasar desapercibido.
  const AvisoSugerido = ({ visible }) => !visible ? null : (
    <div style={{ fontSize: 10, color: '#ff9900', fontWeight: 700, marginTop: 4 }}>⚠ Igual que la última corrida — revisa si cambió</div>
  );
  const portacliheIgualSugerido = sugerido?.portaliche != null && String(portaliche) === String(sugerido.portaliche);
  const disenoIgualSugerido     = sugerido?.diseno != null && diseno === sugerido.diseno;
  const portaliche2IgualSugerido = sugerido?.portaliche2 != null && String(portaliche2) === String(sugerido.portaliche2);
  const diseno2IgualSugerido     = sugerido?.diseno2 != null && diseno2 === sugerido.diseno2;

  const content = (
    <div
      style={{ background: '#181b24', borderRadius: inline ? 0 : 18, padding: inline ? '0 0 24px' : 24, width: '100%', maxWidth: inline ? '100%' : 460, border: inline ? 'none' : '1px solid #2d3249', boxShadow: inline ? 'none' : '0 8px 40px rgba(0,0,0,0.6)', ...(inline ? {} : { maxHeight: '94vh', overflowY: 'auto' }) }}
      onClick={inline ? undefined : e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 20, color: onConfirmar ? '#4be87a' : '#e8b84b' }}>
            {onConfirmar ? '✅ Finalizar pedido' : '🧮 Calculadora de Producción'}
          </div>
          {pedidoInicial && <div style={{ fontSize: 13, color: '#c9922a', fontWeight: 700, marginTop: 2 }}>{pedidoInicial.cliente} · {pedidoInicial.medida}</div>}
          {esEngomado ? (
            <div style={{ fontSize: 11, color: '#ff9900', marginTop: 3, fontWeight: 700 }}>ENGOMADO · rollo 136mm × {ENGOMADO_JUMBO_LARGO_M}m (corte real 6.8cm) · ${ENGOMADO_MP_ROLLO_PRECIO}/rollo</div>
          ) : (
            <div style={{ fontSize: 11, color: '#545a78', marginTop: 3 }}>MP {MP_ANCHO}" × {MP_LARGO}m · Anilox 250 LPI / 4.5 BCM · −4m por rollo</div>
          )}
        </div>
        {!inline && onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#545a78', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>}
      </div>

      {!revisando && <>
      {/* Formulario */}
      <div className="form-grid">
        <div className="field"><label>Ancho (")</label><input className={ancho ? 'campo-listo' : 'campo-pendiente'} type="number" step="0.5" min="0.5" value={ancho} onChange={e => setAncho(e.target.value)} placeholder="2" /></div>
        <div className="field"><label>Largo (m)</label><input className={largo ? 'campo-listo' : 'campo-pendiente'} type="number" value={largo} onChange={e => setLargo(e.target.value)} placeholder="100" /></div>
        <div className="field"><label>Cajas</label><input className={cajas ? 'campo-listo' : 'campo-pendiente'} type="number" value={cajas} onChange={e => setCajas(e.target.value)} placeholder="50" /></div>
        <div className="field"><label>Rollos / caja (automático)</label><input type="number" readOnly value={rollosCaja} style={{ background: "#1a2744", color: "#c9922a" }} /></div>

        {/* Portacliché con botón N/A */}
        <div className="field">
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Portacliché
            <button type="button" onClick={() => setClicheNA(v => !v)}
              style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, border: `1px solid ${clicheNA ? '#ff9900' : '#2a2d3a'}`, background: clicheNA ? '#ff990022' : 'transparent', color: clicheNA ? '#ff9900' : '#555', cursor: 'pointer' }}>
              N/A
            </button>
          </label>
          <select className={clicheNA ? '' : (portalicheTocado ? 'campo-listo' : 'campo-pendiente')} value={portaliche} onChange={e => { setPortaliche(e.target.value); setPortalicheTocado(true); }} onClick={() => setPortalicheTocado(true)} disabled={clicheNA} style={{ opacity: clicheNA ? 0.35 : 1 }}>
            {PORTALICHES.map(p => <option key={p.largo} value={p.largo}>{p.label}</option>)}
          </select>
          <AvisoSugerido visible={!clicheNA && portacliheIgualSugerido} />
        </div>

        {!clicheNA && (
          <div className="field">
            <label>Diseño</label>
            {disenoEsImagen(diseno) ? (
              <div className={disenoTocado ? 'campo-listo' : 'campo-pendiente'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>📷 {diseno.slice(4)}% (de imagen)</span>
                <button type="button" onClick={() => { setDiseno('normal'); setDisenoTocado(true); }} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: 12 }}>✕ Quitar</button>
              </div>
            ) : (
              <select className={disenoTocado ? 'campo-listo' : 'campo-pendiente'} value={diseno} onChange={e => { setDiseno(e.target.value); setDisenoTocado(true); }} onClick={() => setDisenoTocado(true)}>
                {DISENOS.map(d => <option key={d.key} value={d.key}>{d.label} ({Math.round(d.cob * 100)}%)</option>)}
              </select>
            )}
            <AvisoSugerido visible={disenoIgualSugerido} />
            {!disenoEsImagen(diseno) && (
              <label style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: 'var(--accent, #c9922a)', cursor: analizandoImg ? 'default' : 'pointer' }}>
                <input type="file" accept="image/*" disabled={analizandoImg} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) analizarImagenDiseno(f, false); e.target.value = ''; }} />
                {analizandoImg ? '⏳ Calculando…' : '📷 O sube el diseño y calculo el % exacto'}
              </label>
            )}
            {errorImg && <div style={{ fontSize: 11, color: '#ff4d4d', marginTop: 4 }}>{errorImg}</div>}
          </div>
        )}

        {!clicheNA && (
          <div className="field full">
            <label>Cliché</label>
            <div className={clicheEstadoTocado ? 'campo-listo' : 'campo-pendiente'} style={{ display: 'flex', gap: 8, borderRadius: 8, padding: 4 }}>
              <button type="button" onClick={() => { setClicheEstado('nuevo'); setClicheEstadoTocado(true); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: clicheEstado === 'nuevo' ? 'var(--green)' : 'transparent', color: clicheEstado === 'nuevo' ? '#0b0d11' : 'var(--text-2, #9aa0bc)' }}>
                Nuevo
              </button>
              <button type="button" onClick={() => { setClicheEstado('usado'); setClicheEstadoTocado(true); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, background: clicheEstado === 'usado' ? 'var(--green)' : 'transparent', color: clicheEstado === 'usado' ? '#0b0d11' : 'var(--text-2, #9aa0bc)' }}>
                Usado
              </button>
            </div>
            {clicheActivoInfo && (
              <div style={{ fontSize: 10, color: '#9aa0bc', marginTop: 4 }}>
                Cliché activo detectado: {Math.round(Number(clicheActivoInfo.cajas_acumuladas || 0)).toLocaleString()} cajas en {clicheActivoInfo.pedidos_acumulados || 0} pedido{clicheActivoInfo.pedidos_acumulados === 1 ? '' : 's'} — si es el mismo, marca "Usado".
              </div>
            )}
          </div>
        )}

        {tieneColor2 && !clicheNA && (
          <div className="field full" style={{ background: '#0d0f14', borderRadius: 10, padding: 12, border: '1px solid #2a2d3a' }}>
            <div style={{ fontSize: 11, color: '#c9922a', fontWeight: 700, marginBottom: 8 }}>2do color: {pedidoInicial.color2}</div>
            <div className="form-grid">
              <div className="field"><label>Portacliché</label>
                <select className={portaliche2Tocado ? 'campo-listo' : 'campo-pendiente'} value={portaliche2} onChange={e => { setPortaliche2(e.target.value); setPortaliche2Tocado(true); }} onClick={() => setPortaliche2Tocado(true)}>
                  {PORTALICHES.map(p => <option key={p.largo} value={p.largo}>{p.label}</option>)}
                </select>
                <AvisoSugerido visible={portaliche2IgualSugerido} />
              </div>
              <div className="field"><label>Diseño</label>
                {disenoEsImagen(diseno2) ? (
                  <div className={diseno2Tocado ? 'campo-listo' : 'campo-pendiente'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>📷 {diseno2.slice(4)}% (de imagen)</span>
                    <button type="button" onClick={() => { setDiseno2('normal'); setDiseno2Tocado(true); }} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: 12 }}>✕ Quitar</button>
                  </div>
                ) : (
                  <select className={diseno2Tocado ? 'campo-listo' : 'campo-pendiente'} value={diseno2} onChange={e => { setDiseno2(e.target.value); setDiseno2Tocado(true); }} onClick={() => setDiseno2Tocado(true)}>
                    {DISENOS.map(d => <option key={d.key} value={d.key}>{d.label} ({Math.round(d.cob * 100)}%)</option>)}
                  </select>
                )}
                <AvisoSugerido visible={diseno2IgualSugerido} />
                {!disenoEsImagen(diseno2) && (
                  <label style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: 'var(--accent, #c9922a)', cursor: analizandoImg2 ? 'default' : 'pointer' }}>
                    <input type="file" accept="image/*" disabled={analizandoImg2} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) analizarImagenDiseno(f, true); e.target.value = ''; }} />
                    {analizandoImg2 ? '⏳ Calculando…' : '📷 O sube el diseño y calculo el % exacto'}
                  </label>
                )}
                {errorImg2 && <div style={{ fontSize: 11, color: '#ff4d4d', marginTop: 4 }}>{errorImg2}</div>}
              </div>
            </div>
          </div>
        )}

        <div className="field full"><label>Merma esperada (piezas)</label><input className={merma !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" value={merma} onChange={e => setMerma(e.target.value)} placeholder="0" /></div>

        {onConfirmar && (<>
          <div className="field full" style={{ borderTop: '1px solid #1e2132', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: '#4be87a', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>DATOS REALES DE LA CORRIDA</div>
          </div>
          <div className="field"><label>Cajas producidas</label><input className={cajasProd !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" placeholder="50" value={cajasProd} onChange={e => {
            const v = e.target.value;
            setCajasProd(v);
            setPiezasProd(v !== '' ? String(Number(v) * rollosCajaN) : '');
            // Rollos MP / Tinta / Solvente se calculan del campo "Cajas" de
            // arriba, que arranca con lo que Ventas anoto al crear el pedido
            // -- si ahi hubo un error de captura, se quedaba ese numero
            // equivocado aunque aqui ya se corrigiera. Se sincroniza para
            // que el calculo de materiales siempre use el dato real.
            if (v !== '') setCajas(v);
          }} /></div>
          <div className="field"><label>Piezas producidas *</label><input className={piezasProd !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" placeholder="1800" value={piezasProd} onChange={e => {
            const v = e.target.value;
            setPiezasProd(v);
            setCajasProd('');
            if (v !== '' && rollosCajaN > 0) setCajas(String(Number(v) / rollosCajaN));
          }} /></div>
          <div className="field"><label>Merma real (piezas)</label><input className={mermaReal !== '' ? 'campo-listo' : 'campo-pendiente'} type="number" placeholder="0" value={mermaReal} onChange={e => {
            const v = e.target.value;
            setMermaReal(v);
            // Misma razon que "Cajas producidas": la merma real tambien debe
            // reemplazar la merma esperada en el calculo de materiales.
            setMerma(v);
          }} /></div>
          {/* Un typo al capturar cajas/piezas reales no se puede detectar solo
              -- pero si lo capturado se aleja mucho de lo que el pedido traia
              anotado desde Ventas, vale la pena que salte a la vista antes de
              confirmar, en vez de pasar desapercibido. */}
          {(() => {
            const cajasOriginal = Number(pedidoInicial?.cajas) || 0;
            const cajasRealesNum = cajasProd !== '' ? Number(cajasProd)
              : (piezasProd !== '' && rollosCajaN > 0 ? Number(piezasProd) / rollosCajaN : null);
            if (!cajasOriginal || cajasRealesNum == null) return null;
            const difierePct = Math.abs(cajasRealesNum - cajasOriginal) / cajasOriginal;
            if (difierePct <= 0.15) return null;
            return (
              <div className="field full" style={{ fontSize: 11, color: '#ff9900', fontWeight: 700, marginTop: -4 }}>
                ⚠ El pedido se anotó con {cajasOriginal} cajas y aquí llevas ~{Math.round(cajasRealesNum)} — revisa que no sea un error de captura antes de confirmar.
              </div>
            );
          })()}
          {mermaPct !== null && (
            <div className="field"><label>% Merma real</label><input readOnly value={mermaPct + "%"} style={{ background: "#1a2744", color: Number(mermaPct) > 3 ? "#ff4d4d" : "#4be87a" }} /></div>
          )}
          <div className="field">
            <label>Stickybacks</label>
            <div style={{ display: "flex", gap: 6, marginTop: 4, padding: 3, borderRadius: 8, border: `1.5px solid ${stickyback == null ? 'var(--orange)' : 'var(--green)'}`, background: stickyback == null ? 'var(--orange-dim)' : 'var(--green-dim)' }}>
              {[1, 2].map(n => (
                <button key={n} type="button" onClick={() => setStickyback(stickyback === n ? null : n)}
                  style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "2px solid", borderColor: stickyback === n ? "#c9922a" : "#2a2d3a", background: stickyback === n ? "#c9922a22" : "transparent", color: stickyback === n ? "#c9922a" : "#555", fontWeight: 900, fontSize: 16, cursor: "pointer", transition: "all .15s" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>)}
      </div>

      {/* Resultados */}
      {listo ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'rgba(75,142,232,0.12)', border: '1px solid rgba(75,142,232,0.3)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4b8fe8', fontWeight: 700, letterSpacing: '.05em', marginBottom: 4 }}>ROLLOS MP</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#4b8fe8', lineHeight: 1 }}>{rollosExacto.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 3 }}>enteros: {rollosMP}</div>
            </div>
            <div style={{ background: clicheNA ? 'rgba(42,45,58,0.4)' : 'rgba(201,146,42,0.1)', border: `1px solid ${clicheNA ? '#2a2d3a' : 'rgba(201,146,42,0.25)'}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: clicheNA ? '#3a3f5a' : '#c9922a', fontWeight: 700, letterSpacing: '.05em', marginBottom: 4 }}>TINTA{tieneColor2 ? ' (2)' : ''}</div>
              {tieneColor2 ? (
                // Dos colores distintos -- se muestra cada kg por separado,
                // no la suma (sumar tintas de colores distintos no le sirve
                // a nadie para saber cuanto pedir de cada una).
                <>
                  <div style={{ fontSize: 17, fontWeight: 900, color: clicheNA ? '#3a3f5a' : '#c9922a', lineHeight: 1.25 }}>{clicheNA ? '0' : tintaKg.toFixed(2)} kg</div>
                  <div style={{ fontSize: 9, color: '#3a3f5a' }}>{pedidoInicial?.color || pedidoInicial?.tinta_tipo || 'Color 1'}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: clicheNA ? '#3a3f5a' : '#c9922a', lineHeight: 1.25, marginTop: 4 }}>{clicheNA ? '0' : tintaKg2.toFixed(2)} kg</div>
                  <div style={{ fontSize: 9, color: '#3a3f5a' }}>{pedidoInicial?.color2 || 'Color 2'}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, fontWeight: 900, color: clicheNA ? '#3a3f5a' : '#c9922a', lineHeight: 1 }}>{clicheNA ? '0' : tintaKgTotal.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 3 }}>kg{clicheNA ? ' · N/A' : ''}</div>
                </>
              )}
            </div>
            <div style={{ background: clicheNA ? 'rgba(42,45,58,0.4)' : 'rgba(75,143,232,0.07)', border: `1px solid ${clicheNA ? '#2a2d3a' : 'rgba(75,143,232,0.18)'}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: clicheNA ? '#3a3f5a' : '#4b8fe8', fontWeight: 700, letterSpacing: '.05em', marginBottom: 4 }}>SOLVENTE</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: clicheNA ? '#3a3f5a' : '#4b8fe8', lineHeight: 1 }}>{clicheNA ? '0' : solventeKg.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: '#3a3f5a', marginTop: 3 }}>kg{clicheNA ? ' · N/A' : ''}</div>
            </div>
          </div>

          {!clicheNA && (
            <>
              <button type="button" onClick={() => setVerDesglose(v => !v)}
                style={{ width: '100%', background: 'transparent', border: '1px solid #1e2132', borderRadius: 8, color: '#545a78', fontSize: 12, padding: '7px 0', cursor: 'pointer', marginBottom: verDesglose ? 8 : 12 }}>
                {verDesglose ? '▲ Ocultar desglose' : '▼ Ver desglose de fórmulas'}
              </button>

              {verDesglose && (
                <div style={{ background: '#0e1018', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e2132', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#545a78', lineHeight: 2.1, marginBottom: 10 }}>
                    <span style={{ color: '#3a3f5a' }}>Largo real: </span><span style={{ color: '#9aa0bc' }}>{largoN}m − 4m = <strong style={{ color: '#c9c9c9' }}>{largoReal}m</strong></span><br />
                    <span style={{ color: '#3a3f5a' }}>Pistas: </span><span style={{ color: '#9aa0bc' }}>{MP_ANCHO}" ÷ {anchoN}" = <strong style={{ color: '#c9c9c9' }}>{pistas}</strong></span><br />
                    <span style={{ color: '#3a3f5a' }}>Rollos/pista: </span><span style={{ color: '#9aa0bc' }}>{MP_LARGO}m ÷ {largoReal}m = <strong style={{ color: '#c9c9c9' }}>{rollosPista}</strong></span><br />
                    <span style={{ color: '#3a3f5a' }}>Rend./rollo MP: </span><span style={{ color: '#9aa0bc' }}>{pistas} × {rollosPista} = <strong style={{ color: '#c9c9c9' }}>{rendimiento} pzas</strong></span>
                  </div>
                  <div style={{ borderTop: '1px solid #1e2132', paddingTop: 8, fontSize: 12 }}>
                    {[[`Piezas buenas`, piezasBuenas.toLocaleString(), '#e0e0e0'], mermaN > 0 ? [`+ Merma esperada`, `+${mermaN}`, '#ff9900'] : null, [`Total a producir`, `${piezasTotal.toLocaleString()} pzas`, '#e8b84b']].filter(Boolean).map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #13161e' }}>
                        <span style={{ color: '#545a78' }}>{l}</span><span style={{ color: c, fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#3a3f5a', fontSize: 13, marginTop: 20, padding: 16 }}>
          Llena ancho, largo, cajas y rollos/caja para ver el cálculo
        </div>
      )}

      {/* Botón confirmar -- abre la pantalla de revision, todavia no guarda nada */}
      {onConfirmar && (() => {
        const faltaPiezas = !piezasProd || Number(piezasProd) <= 0;
        const faltaCliche = !clicheNA && !clicheEstadoTocado;
        return (
          <button
            className="btn btn-primary btn-block"
            disabled={!listo || faltaPiezas || faltaCliche}
            style={{ padding: '14px 0', fontSize: 15, marginTop: 16, opacity: (listo && !faltaPiezas && !faltaCliche) ? 1 : 0.4 }}
            onClick={handleAbrirRevision}
          >
            Revisar y confirmar
          </button>
        );
      })()}
      {onConfirmar && !piezasProd && listo && (
        <div style={{ textAlign: 'center', color: '#ff9900', fontSize: 12, marginTop: 8 }}>
          Falta "Piezas producidas" para poder enviar a Emilio
        </div>
      )}
      {onConfirmar && piezasProd && listo && !clicheNA && !clicheEstadoTocado && (
        <div style={{ textAlign: 'center', color: '#ff9900', fontSize: 12, marginTop: 8 }}>
          Confirma si el cliché es Nuevo o Usado para poder enviar a Emilio
        </div>
      )}
      </>}

      {/* Pantalla de revision -- ultimo paso antes de guardar de verdad */}
      {revisando && (() => {
        const cajasOriginal = Number(pedidoInicial?.cajas) || 0;
        const cajasRealesNum = Number(cajas) || 0;
        const difiereMucho = cajasOriginal > 0 && cajasRealesNum > 0 && Math.abs(cajasRealesNum - cajasOriginal) / cajasOriginal > 0.15;
        const filas = [
          ['Cajas producidas', cajasProd !== '' ? cajasProd : (cajasRealesNum ? cajasRealesNum.toFixed(1) : '—')],
          ['Piezas producidas', piezasProd || '—'],
          ['Merma real', mermaReal !== '' ? `${mermaReal} pzas${mermaPct != null ? ` (${mermaPct}%)` : ''}` : '—'],
          ['Rollos MP', `${rollosExacto.toFixed(2)} (enteros: ${rollosMP})`],
          // Con 2do color se desglosa cada tinta por separado (no la suma) --
          // son colores distintos, sumarlos no le sirve a nadie para saber
          // cuanto pedir de cada uno.
          ...(tieneColor2
            ? [
                [`Tinta ${pedidoInicial?.color || pedidoInicial?.tinta_tipo || '1'}`, clicheNA ? 'N/A' : `${tintaKg.toFixed(2)} kg`],
                [`Tinta ${pedidoInicial?.color2 || '2'}`, clicheNA ? 'N/A' : `${tintaKg2.toFixed(2)} kg`],
              ]
            : [['Tinta', clicheNA ? 'N/A' : `${tintaKgTotal.toFixed(2)} kg`]]),
          ['Solvente', clicheNA ? 'N/A' : `${solventeKg.toFixed(2)} kg`],
          ['Stickybacks', stickyback ?? '—'],
        ];
        return (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: '#4be87a', fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>REVISA ANTES DE ENVIAR</div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {filas.map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: '#0e1018', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: '#9aa0bc' }}>{lbl}</span>
                  <span style={{ color: '#e0e0e0', fontWeight: 700 }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 12px', background: 'rgba(75,232,122,0.08)', border: '1px solid rgba(75,232,122,0.25)', borderRadius: 8, fontSize: 14 }}>
                <span style={{ color: '#4be87a', fontWeight: 700 }}>Costo por pieza</span>
                <span style={{ color: '#4be87a', fontWeight: 900 }}>
                  {costoPreviewLoading ? 'Calculando…' : costoPreviewError ? 'No se pudo calcular' : costoPreview != null ? `$${costoPreview.toFixed(3)}` : '—'}
                </span>
              </div>
            </div>

            {difiereMucho && (
              <div style={{ fontSize: 12, color: '#ff9900', fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>
                ⚠ El pedido se anotó con {cajasOriginal} cajas y aquí llevas ~{Math.round(cajasRealesNum)} — revisa que no sea un error de captura.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: '13px 0' }} onClick={() => setRevisando(false)}>
                ← Corregir datos
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, padding: '13px 0', fontSize: 15 }}
                onClick={() => onConfirmar({
                  rollosMP, rollosExacto, tintaKg, tintaKg2: tieneColor2 ? tintaKg2 : null, solventeKg,
                  rollosCaja:  rollosCajaN,
                  piezasProd:  piezasProd !== "" ? Number(piezasProd) : null,
                  mermaReal:   mermaReal  !== "" ? Number(mermaReal)  : null,
                  mermaPct, stickyback,
                  diseno:      clicheNA ? null : diseno,
                  portaliche:  clicheNA ? null : (Number(portaliche) || null),
                  diseno2:     (tieneColor2 && !clicheNA) ? diseno2 : null,
                  portaliche2: (tieneColor2 && !clicheNA) ? (Number(portaliche2) || null) : null,
                  clicheEstado: clicheNA ? null : clicheEstado,
                })}
              >
                ✅ Confirmar y enviar a Emilio
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  if (inline) return content;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      {content}
    </div>
  );
}
