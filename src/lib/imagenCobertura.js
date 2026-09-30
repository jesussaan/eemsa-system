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

// "Tono" de un pixel/color: su proporcion r:g:b, sin importar que tan
// oscuro/diluido salio -- una tinta negra pura (20,20,20) y el borde
// antialiased de ese mismo trazo (200,200,200, mucho mas claro por mezclarse
// con el fondo) dan el MISMO tono (1,1,1) porque sus 3 canales siguen
// parejos entre si. Comparar por distancia RGB cruda en vez de esto hacia
// que esos bordes grisaceos del negro (que en brillo quedan a medio camino
// entre blanco y negro) terminaran mas cerca de un cafe/marron -- tambien
// oscuro -- que del negro real, inflando la cobertura del color equivocado.
const tonoDe = (r, g, b) => {
  const l = (r + g + b) / 3;
  return l < 1 ? [0, 0, 0] : [r / l, g / l, b / l];
};
const distTono2 = (t, u) => (t[0] - u[0]) ** 2 + (t[1] - u[1]) ** 2 + (t[2] - u[2]) ** 2;

// Para un pedido de 2 tintas donde el diseno de ambas viene en la MISMA foto
// (no hay una imagen aparte por color) -- ver CalculadoraProduccion.js,
// "una sola foto para las 2 tintas". Pedirle al operador que toque un punto
// EXACTO de cada tinta en la foto resulto impractico (foto chica, colores
// parecidos a simple vista -- ej. negro vs cafe oscuro) -- en vez de eso,
// aqui se detectan solos los 2 colores agrupando todos los pixeles de tinta
// en 2 grupos por tono (k-means con k=2, ver tonoDe/distTono2 arriba); el
// operador solo confirma cual de los 2 colores encontrados es cual tinta
// tocando un circulo grande, sin tener que apuntarle a nada en la foto.
export function detectarDosColores(imageData) {
  const { data } = imageData;
  const puntos = [];
  let totalTodos = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 10) continue;
    totalTodos++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brillo = (r + g + b) / 3;
    if (brillo >= UMBRAL_BRILLO) continue; // fondo -- no es tinta
    puntos.push({ r, g, b, t: tonoDe(r, g, b) });
  }
  if (totalTodos === 0 || puntos.length < 2) return null; // no hay suficiente tinta para separar 2 colores

  // Semillas: el pixel mas oscuro y el de tono mas distinto a ese -- evita
  // que las 2 semillas arranquen parecidas y kmeans no separe nada.
  let semillaA = puntos[0];
  for (const p of puntos) if ((p.r + p.g + p.b) < (semillaA.r + semillaA.g + semillaA.b)) semillaA = p;
  let semillaB = puntos[0], mejorDist = -1;
  for (const p of puntos) {
    const d = distTono2(p.t, semillaA.t);
    if (d > mejorDist) { mejorDist = d; semillaB = p; }
  }

  let centroA = semillaA.t, centroB = semillaB.t;
  const asign = new Array(puntos.length).fill(0);
  for (let iter = 0; iter < 6; iter++) {
    const sumA = [0, 0, 0], sumB = [0, 0, 0];
    let nA = 0, nB = 0;
    for (let i = 0; i < puntos.length; i++) {
      const t = puntos[i].t;
      const grupo = distTono2(t, centroA) <= distTono2(t, centroB) ? 0 : 1;
      asign[i] = grupo;
      const s = grupo === 0 ? sumA : sumB;
      s[0] += t[0]; s[1] += t[1]; s[2] += t[2];
      if (grupo === 0) nA++; else nB++;
    }
    if (nA > 0) centroA = [sumA[0] / nA, sumA[1] / nA, sumA[2] / nA];
    if (nB > 0) centroB = [sumB[0] / nB, sumB[1] / nB, sumB[2] / nB];
  }

  const idxsA = [], idxsB = [];
  for (let i = 0; i < asign.length; i++) (asign[i] === 0 ? idxsA : idxsB).push(i);
  if (idxsA.length === 0 || idxsB.length === 0) return null; // el diseno resulto de un solo color

  // Color representativo de cada grupo para el circulo que ve el operador --
  // promedio del RGB real (no del tono) de sus pixeles.
  const promedioRGB = (idxs) => {
    const s = [0, 0, 0];
    idxs.forEach(i => { s[0] += puntos[i].r; s[1] += puntos[i].g; s[2] += puntos[i].b; });
    return { r: Math.round(s[0] / idxs.length), g: Math.round(s[1] / idxs.length), b: Math.round(s[2] / idxs.length) };
  };

  return {
    colorA: promedioRGB(idxsA),
    colorB: promedioRGB(idxsB),
    cobertura1: idxsA.length / totalTodos,
    cobertura2: idxsB.length / totalTodos,
  };
}

export { cargarMuestraImagen };
