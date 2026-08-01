// Modo claro/oscuro -- se guarda en localStorage y se aplica como
// data-theme en <html>, que es lo que lee App.css para cambiar las
// variables de color. Arranca en "dark" si nunca se ha elegido nada,
// para no cambiarle la app a nadie que ya la usa sin avisar.
const CLAVE = "eemsa_tema";

export const cargarTema = () => localStorage.getItem(CLAVE) || "dark";

export const aplicarTema = (tema) => {
  document.documentElement.setAttribute("data-theme", tema);
  localStorage.setItem(CLAVE, tema);
};

export const alternarTema = () => {
  const actual = cargarTema();
  const nuevo = actual === "dark" ? "light" : "dark";
  aplicarTema(nuevo);
  return nuevo;
};
