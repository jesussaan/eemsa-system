// Puente entre cualquier componente y el <ConfirmModal /> montado una sola
// vez en App.js -- así se puede llamar `await confirmar(...)` desde
// cualquier lado sin tener que pasar props ni montar un modal por
// componente. Si por algo el modal no se ha montado todavía, cae de vuelta
// al window.confirm() nativo para no dejar la acción sin poder confirmarse.
let mostrarConfirm = null;

export const registrarConfirmador = (fn) => { mostrarConfirm = fn; };

export const confirmar = (mensaje, opciones) => {
  if (!mostrarConfirm) return Promise.resolve(window.confirm(mensaje));
  return mostrarConfirm(mensaje, opciones);
};
