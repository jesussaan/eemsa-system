import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { IcoScan } from './Icons';

// El QR de una tarima trae un link completo (/tarima/<id>, ver urlTarima en
// Inventario.js) -- aqui se saca el id tanto si viene la URL completa como
// si viene solo el id suelto (pistola lectora vieja o texto pegado a mano).
// Mismo criterio que idDeCodigo en Inventario.js.
const idDeCodigo = (val) => {
  const m = val.match(/\/tarima\/([^/?#]+)/);
  return m ? m[1] : val;
};

// Modal de escaneo de tarima (camara o pistola/texto manual) -- mismo
// mecanismo que ya usa Inventario.js para contar/dar salida, empaquetado
// aparte para poder reusarlo en Modo Operador (elegir la tarima de una
// corrida sin tener que buscarla a mano en la lista). Llama a onId(id) por
// cada codigo nuevo detectado; quien lo use decide que hacer con ese id
// (validarlo contra el pedido, cerrar el modal, etc.) -- este componente
// solo escanea.
export default function EscanerTarima({ onId, onCerrar }) {
  const [codigoManual, setCodigoManual] = useState('');
  const [errorCamara, setErrorCamara] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const ultimoRef = useRef({ val: null, at: 0 });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelado) { stream.getTracks().forEach(tr => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const tick = () => {
          const video = videoRef.current, canvas = canvasRef.current;
          if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) {
              const ahora = Date.now();
              // Mientras el QR sigue frente a la camara no se repite el
              // mismo aviso una y otra vez -- solo cuando cambia el codigo
              // o pasan 2s (mismo criterio que Inventario.js).
              if (!(ultimoRef.current.val === code.data && ahora - ultimoRef.current.at < 2000)) {
                ultimoRef.current = { val: code.data, at: ahora };
                onId(idDeCodigo(code.data.trim()));
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setErrorCamara('No se pudo acceder a la cámara' + (e?.message ? `: ${e.message}` : '') + '. Escribe el código manualmente abajo.');
      }
    })();
    return () => {
      cancelado = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(tr => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enviarManual = () => {
    if (!codigoManual.trim()) return;
    onId(idDeCodigo(codigoManual.trim()));
    setCodigoManual('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
        <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex' }}><IcoScan /></span> Escanear tarima
        </div>
        <button onClick={onCerrar} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 200 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ padding: 16 }}>
        {errorCamara && <div style={{ color: 'var(--orange)', fontSize: 12, marginBottom: 10 }}>{errorCamara}</div>}
        <label style={{ color: '#aaa', fontSize: 11 }}>O escribe/pega el código (pistola lectora)</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input autoFocus value={codigoManual} onChange={e => setCodigoManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviarManual(); }}
            style={{ flex: 1, background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 8, padding: '8px 12px', color: '#e0e0e0', fontSize: 13 }} placeholder="Código de la tarima" />
          <button className="btn btn-primary btn-sm" onClick={enviarManual}>Buscar</button>
        </div>
      </div>
    </div>
  );
}
