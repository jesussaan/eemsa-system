// Calcula que % de una imagen esta "cubierto de tinta" contando pixeles --
// todo pasa en el navegador (canvas), la imagen nunca se sube a ningun lado
// ni se guarda: se procesa en memoria y se descarta. Pensado para subir el
// arte de un diseno/cliche (fondo claro, diseno oscuro/color) en vez de
// adivinar entre los 4 botones fijos de DISENOS (lib/produccion.js).
const ANCHO_MUESTREO = 300; // suficiente para el promedio, mas rapido que la imagen completa
const UMBRAL_BRILLO = 235;  // 0-255: por debajo de esto ya no se cuenta como "fondo blanco"

// Carga el archivo en un canvas de muestreo y regresa sus pixeles (imageData)
// junto con un dataURL del mismo canvas para mostrarlo de preview -- se usa
// tanto para la cobertura de un solo color (coberturaDeImagen) como para la
// de dos colores en una misma foto (coberturaPorDosColores), asi ambas
// analizan exactamente los mismos pixeles.
function cargarMuestraImagen(file) {
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
        const imageData = ctx.getImageData(0, 0, w, h);
        resolve({ imageData, w, h, previewUrl: canvas.toDataURL('image/png') });
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

export function coberturaDeImagen(file) {
  return cargarMuestraImagen(file).then(({ imageData }) => {
    const { data } = imageData;
    let tinta = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 10) continue; // transparente -- no es parte del diseno
      total++;
      const brillo = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brillo < UMBRAL_BRILLO) tinta++;
    }
    return total > 0 ? tinta / total : 0;
  });
}

// Para un pedido de 2 tintas donde el diseno de ambas viene en la MISMA foto
// (no hay una imagen aparte por color) -- ver CalculadoraProduccion.js,
// "una sola foto para las 2 tintas". En vez de subir la misma foto dos veces
// (lo que daria identica cobertura a los dos colores, incorrecto), se sube
// una vez y el operador toca sobre la foto un punto de cada tinta; cada
// pixel de tinta se cuenta para el color muestreado mas cercano (distancia
// euclidiana en RGB). El fondo (pixeles claros, mismo umbral que arriba) no
// cuenta para ninguno de los dos, igual que en coberturaDeImagen.
export function coberturaPorDosColores(imageData, colorA, colorB) {
  const { data } = imageData;
  const dist2 = (r, g, b, c) => (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
  let a = 0, b = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) continue;
    total++;
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const brillo = (r + g + bl) / 3;
    if (brillo >= UMBRAL_BRILLO) continue; // fondo -- no es tinta de ninguno de los dos colores
    if (dist2(r, g, bl, colorA) <= dist2(r, g, bl, colorB)) a++; else b++;
  }
  return total > 0 ? { cobertura1: a / total, cobertura2: b / total } : { cobertura1: 0, cobertura2: 0 };
}

export function colorEnPixel(imageData, x, y) {
  const { data, width } = imageData;
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

export { cargarMuestraImagen };
