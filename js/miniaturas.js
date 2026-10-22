// Miniaturas chiquitas de fotos, stickers y videos para mostrar dentro de Conversación.html.
// Van incrustadas en el html (data:), así se ven aunque el archivo se abra sin conexión.

const LADO = 320;

function dibujar(fuente, ancho, alto, transparente) {
  const escala = Math.min(1, LADO / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(ancho * escala));
  lienzo.height = Math.max(1, Math.round(alto * escala));
  lienzo.getContext('2d').drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  return transparente ? lienzo.toDataURL('image/webp', 0.8) : lienzo.toDataURL('image/jpeg', 0.7);
}

async function deImagen(blob, transparente) {
  const imagen = await createImageBitmap(blob);
  try {
    return dibujar(imagen, imagen.width, imagen.height, transparente);
  } finally {
    imagen.close();
  }
}

function deVideo(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    const terminar = (resultado) => {
      clearTimeout(reloj);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(resultado);
    };
    const reloj = setTimeout(() => terminar(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        terminar(dibujar(video, video.videoWidth, video.videoHeight, false));
      } catch {
        terminar(null);
      }
    };
    video.onerror = () => terminar(null);
    video.src = url;
  });
}

// Devuelve un data: URL, o null si el navegador no puede abrir el archivo (por ejemplo HEIC).
export async function crearMiniatura(contenido, tipo, mime) {
  const blob = new Blob([contenido], { type: mime });
  try {
    if (tipo === 'video') return await deVideo(blob);
    if (tipo === 'foto' || tipo === 'sticker') return await deImagen(blob, tipo === 'sticker');
  } catch {
    // Formato que el navegador no sabe leer: queda el link sin miniatura.
  }
  return null;
}
