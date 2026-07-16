import { useState } from "react";
import { iniciarSesion, registrarse } from "../lib/auth";
import { notificar } from "../lib/notificaciones";

const ERRORES = {
  "Invalid login credentials": "Correo o contraseña incorrectos",
  "User already registered": "Ese correo ya está registrado — inicia sesión en vez de crear cuenta",
  "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres",
};
const traducirError = (msg) => ERRORES[msg] || msg || "Algo salió mal, intenta de nuevo";

export default function Login() {
  const [modo, setModo] = useState("entrar"); // "entrar" | "registrar"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setAviso(""); setLoading(true);
    if (modo === "entrar") {
      const { error: err } = await iniciarSesion(email.trim(), password);
      if (err) setError(traducirError(err.message));
    } else {
      const { error: err } = await registrarse(email.trim(), password);
      if (err) {
        setError(traducirError(err.message));
      } else {
        notificar("nuevo_usuario", { email: email.trim() });
        setAviso("Cuenta creada. Ya puedes entrar — un administrador tiene que darte acceso a un módulo antes de que veas algo.");
        setModo("entrar");
        setPassword("");
      }
    }
    setLoading(false);
  };

  return (
    <div className="mode-screen">
      <div className="mode-glow" aria-hidden="true" />
      <div className="mode-top">EEMSA System</div>

      <div className="mode-hero">
        <img src="/logo192.png" alt="EEMSA" className="mode-logo" />
        <div className="mode-tagline">Control SIAT L36 · Calidad · Innovación</div>

        <form onSubmit={submit} style={{ width: "100%", maxWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label>Correo</label>
            <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" required minLength={6} autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error && (
            <div style={{ background: "rgba(232,75,75,0.12)", border: "1px solid rgba(232,75,75,0.4)", color: "#ff9b9b", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
              ⚠ {error}
            </div>
          )}
          {aviso && (
            <div style={{ background: "rgba(75,232,122,0.1)", border: "1px solid rgba(75,232,122,0.35)", color: "#8ff0ac", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
              ✓ {aviso}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Un momento…" : modo === "entrar" ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setModo(m => m === "entrar" ? "registrar" : "entrar"); setError(""); setAviso(""); }}
          style={{ marginTop: 16, background: "transparent", border: "none", color: "var(--text-2)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
        >
          {modo === "entrar" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>

      <div className="mode-bottom">Asesoría · Calidad · Innovación</div>
    </div>
  );
}
