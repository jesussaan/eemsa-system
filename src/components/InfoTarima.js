import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmt } from "../lib/utils";

// Publica (sin login): las tablas materiales/tarimas/movimientos_inventario_mp
// ya tienen lectura abierta a la anon key (ver supabase_inventario_mp.sql),
// que es la misma key que ya trae el bundle del sitio -- no se expone nada
// que no estuviera ya accesible, solo se presenta bonito para quien escanee
// el QR con la camara normal del celular (no hace falta entrar a la app).
const CONTENEDOR = {
  rollo_mp: { label: "Tarima", icon: "🧱" },
  centro:   { label: "Caja",   icon: "📦" },
  solvente: { label: "Tambo",  icon: "🛢️" },
  tinta:    { label: "Cubeta", icon: "🪣" },
  otro:     { label: "Lote",   icon: "🏷️" },
};

export default function InfoTarima({ id }) {
  const [estado, setEstado] = useState("cargando"); // cargando | ok | invalido
  const [tarima, setTarima] = useState(null);
  const [material, setMaterial] = useState(null);
  const [movimientos, setMovimientos] = useState([]);

  useEffect(() => {
    const tituloPrevio = document.title;
    document.title = "EEMSA - Tarima";
    return () => { document.title = tituloPrevio; };
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      const { data: t, error } = await supabase.from("tarimas").select("*").eq("id", id).single();
      if (!activo) return;
      if (error || !t) { setEstado("invalido"); return; }
      setTarima(t);
      const { data: m } = await supabase.from("materiales").select("*").eq("id", t.material_id).single();
      if (activo) setMaterial(m || null);
      const { data: movs } = await supabase.from("movimientos_inventario_mp").select("*").eq("tarima_id", id).order("created", { ascending: false }).limit(8);
      if (activo) setMovimientos(movs || []);
      if (activo) setEstado("ok");
    })();
    return () => { activo = false; };
  }, [id]);

  // Si mientras tienes esta pantalla abierta se consume de esta misma
  // tarima (una corrida de produccion, o alguien escanea y registra salida
  // desde otro celular), el numero baja solo -- no hace falta recargar.
  useEffect(() => {
    const canal = supabase.channel(`rt_info_tarima_${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tarimas", filter: `id=eq.${id}` }, ({ new: nuevo }) => setTarima(nuevo))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "movimientos_inventario_mp", filter: `tarima_id=eq.${id}` }, ({ new: nuevo }) => setMovimientos(mv => [nuevo, ...mv].slice(0, 8)))
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [id]);

  if (estado === "cargando") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--muted)", fontSize: 13 }}>Cargando…</div>
  );

  if (estado === "invalido") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text, #e0e0e0)" }}>Código no válido</div>
      <div className="muted" style={{ marginTop: 6 }}>Esta tarima ya no existe, o se eliminó.</div>
    </div>
  );

  const cont = CONTENEDOR[material?.categoria] || CONTENEDOR.otro;
  const min = Number(material?.stock_min || 0);
  const bajo = min > 0 && Number(tarima.cantidad_actual) <= min;
  const pctRestante = Number(tarima.cantidad_inicial) > 0
    ? Math.max(0, Math.min(100, (Number(tarima.cantidad_actual) / Number(tarima.cantidad_inicial)) * 100))
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d11", color: "#e0e0e0", paddingBottom: 32 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "2px solid #c9922a" }}>
        <img src="/logo192.png" alt="EEMSA" style={{ height: 32, width: "auto" }} />
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: ".05em" }}>EEMSA System</div>
          <div style={{ fontSize: 10, color: "#c9922a", fontWeight: 700, letterSpacing: ".08em" }}>INVENTARIO · {cont.label.toUpperCase()}</div>
        </div>
      </header>

      <main style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "#666", letterSpacing: ".05em" }}>{cont.icon} {cont.label} #{tarima.numero ?? "?"}{!tarima.activa ? " · AGOTADA" : ""}</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, textAlign: "center", marginBottom: 20 }}>{material?.nombre || "Material eliminado"}</div>

        <div style={{ background: "#13161e", borderRadius: 16, padding: "24px 20px", textAlign: "center", border: `2px solid ${!tarima.activa ? "#3a3f5a" : bajo ? "#ff4d4d" : "#4be87a"}`, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#666", letterSpacing: ".08em", marginBottom: 6 }}>DISPONIBLE AHORA — EN VIVO</div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: !tarima.activa ? "#3a3f5a" : bajo ? "#ff4d4d" : "#4be87a" }}>{fmt(tarima.cantidad_actual)}</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>{material?.unidad || ""} de {fmt(tarima.cantidad_inicial)} recibidos</div>
          <div style={{ background: "#0d0f14", borderRadius: 6, height: 8, overflow: "hidden", marginTop: 14 }}>
            <div style={{ width: `${pctRestante}%`, height: "100%", background: !tarima.activa ? "#3a3f5a" : bajo ? "#ff4d4d" : "#4be87a", transition: "width .4s" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {tarima.lote && (
            <div style={{ background: "#13161e", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>Lote</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{tarima.lote}</div>
            </div>
          )}
          {tarima.proveedor && (
            <div style={{ background: "#13161e", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>Proveedor</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{tarima.proveedor}</div>
            </div>
          )}
          <div style={{ background: "#13161e", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>Recibida</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{tarima.fecha_recepcion}</div>
          </div>
          {material?.categoria && material.categoria !== "otro" && (
            <div style={{ background: "#13161e", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>Auto-consumo</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{material.match_valor || "—"}</div>
            </div>
          )}
        </div>

        {movimientos.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 700, letterSpacing: ".06em", marginBottom: 8, textTransform: "uppercase" }}>Últimos movimientos de esta tarima</div>
            <div style={{ display: "grid", gap: 6 }}>
              {movimientos.map(mv => (
                <div key={mv.id} style={{ display: "flex", justifyContent: "space-between", background: "#13161e", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                  <span style={{ color: mv.tipo === "salida" ? "#ff9900" : "#4be87a" }}>{mv.tipo === "salida" ? "−" : "+"}{fmt(mv.cantidad)} {mv.origen === "corrida_automatica" ? "· 🤖 auto" : ""}</span>
                  <span style={{ color: "#666" }}>{new Date(mv.created).toLocaleDateString("es-MX")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "16px", color: "#444", fontSize: 10 }}>
        ID: {id}
      </footer>
    </div>
  );
}
