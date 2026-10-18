// Carta de colores de tinta -- antes vivia repetida dentro de ModoOperador.js
// y PizarraOperador.js. El nombre de la tinta es texto libre ("Rojo PMS 485",
// "NEGRO"), asi que se busca la palabra del color adentro.
export const COLOR_MAP = {
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
// Color que no esta en la carta (ej. un PMS sin nombre de color).
export const COLOR_DESCONOCIDO = "#c9922a";

export const chipColor = (color) => {
  if (!color) return null;
  const key = color.toLowerCase().trim().replace(/\s+/g, "_");
  for (const [k, v] of Object.entries(COLOR_MAP)) { if (key.includes(k)) return v; }
  return COLOR_DESCONOCIDO;
};

// Que tan clara es una tinta, de 0 (negro) a 255 (blanco), con la misma
// formula de brillo que ya se usa para elegir texto claro/oscuro. Sin tinta
// o transparente cuenta como lo mas claro (no ensucia la maquina).
export const claridadDeColor = (color) => {
  const hex = chipColor(color);
  if (!hex) return 255;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
