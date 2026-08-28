// Calcula que % de una imagen esta "cubierto de tinta" contando pixeles --
// todo pasa en el navegador (canvas), la imagen nunca se sube a ningun lado
// ni se guarda: se procesa en memoria y se descarta. Pensado para subir el
// arte de un diseno/cliche (fondo claro, diseno oscuro/color) en vez de
// adivinar entre los 4 botones fijos de DISENOS (lib/produccion.js).
const ANCHO_MUESTREO = 300; // suficiente para el promedio, mas rapido que la imagen completa
const UMBRAL_BRILLO = 235;  // 0-255: por debajo de esto ya no se cuenta como "fondo blanco"

export function coberturaDeImagen(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Elige un archivo de imagen'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = ANCHO_MUESTREO;
        const h = Math.max(1, Math.round(img.height * (w / img.width)));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        let tinta = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 10) continue; // transparente -- no es parte del diseno
          total++;
          const brillo = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brillo < UMBRAL_BRILLO) tinta++;
        }
        resolve(total > 0 ? tinta / total : 0);
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}
