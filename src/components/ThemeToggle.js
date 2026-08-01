import { useState } from "react";
import { cargarTema, alternarTema } from "../lib/theme";
import { IcoSol, IcoLuna } from "./Icons";

export default function ThemeToggle({ style }) {
  const [tema, setTema] = useState(cargarTema);
  return (
    <button
      type="button"
      onClick={() => setTema(alternarTema())}
      title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      style={{ background: "transparent", border: "1px solid var(--border-light)", borderRadius: "var(--r-sm)", color: "var(--text-2)", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer", ...style }}
    >
      {tema === "dark" ? <IcoSol /> : <IcoLuna />}
    </button>
  );
}
