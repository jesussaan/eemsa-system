import 'react-app-polyfill/ie11';
import 'react-app-polyfill/stable';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // skipWaiting()+clients.claim() en sw.js hacen que "controllerchange"
    // tambien dispare en la primera instalacion (sin controller previo),
    // no solo cuando un SW nuevo reemplaza a uno activo -- por eso se
    // guarda si ya habia un controller antes de registrar, para no avisar
    // "hay una actualizacion" a alguien que apenas abrio la app por primera vez.
    const habiaControllerPrevio = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('/sw.js').then(reg => {
      // La app se queda abierta horas en algunos dispositivos (piso,
      // notificaciones push) y ahi el navegador no siempre revisa solo
      // si hay una version nueva -- se checa cada 5 minutos a mano.
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
    }).catch(() => {});

    // Cuando el nuevo Service Worker toma control (despues de un deploy),
    // se avisa a la app en vez de recargar solo -- para no perder algo
    // que alguien este llenando a la mitad.
    let yaAvisado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (yaAvisado || !habiaControllerPrevio) return;
      yaAvisado = true;
      window.dispatchEvent(new CustomEvent('eemsa:actualizacion-disponible'));
    });
  });
}
