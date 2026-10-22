// Navegador de chats guardados: lista las conversaciones que la app dejó en Drive y las
// muestra dentro de la app. Los audios se reproducen ahí mismo, sin salir a Drive.

import * as drive from './drive.js';

// [{ id, nombre, fecha }] ordenados del más reciente al más viejo.
export async function listarChats() {
  const archivos = await drive.conversacionesGuardadas();
  const carpetas = new Map();
  const nombreCarpeta = async (id) => {
    if (!carpetas.has(id)) carpetas.set(id, drive.datosDe(id).catch(() => null));
    return carpetas.get(id);
  };
  return Promise.all(
    archivos.map(async (f) => {
      // La conversación está en "Chat con X / 01 - Conversación" (o suelta en "Chat con X").
      let carpeta = f.parents?.[0] && (await nombreCarpeta(f.parents[0]));
      if (carpeta && /^\d+ - /.test(carpeta.name) && carpeta.parents?.[0]) carpeta = await nombreCarpeta(carpeta.parents[0]);
      const nombre = carpeta?.name.replace(/^Chat con /, '') || 'Chat';
      return { id: f.id, nombre, fecha: new Date(f.modifiedTime) };
    }),
  );
}

// Estilos que se suman a Conversación.html cuando se ve dentro de la app.
const ESTILO_VISOR = `
  header { display: none; }
  .audio { cursor: pointer; }
  .audio.sonando .boton-play { width: 18px; height: 20px; border: 0; border-left: 6px solid var(--suave); border-right: 6px solid var(--suave); margin-left: 7px; }
  .audio.cargando .boton-play { animation: latido 0.9s ease-in-out infinite alternate; }
  .onda i.oida { background: var(--punto); }
  .punto { transition: left 0.25s linear; }
  @keyframes latido { to { opacity: 0.3; } }
`;

const formatoTiempo = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let reproductor = null;

function detener() {
  if (!reproductor) return;
  reproductor.audio.pause();
  reproductor.boton.classList.remove('sonando', 'cargando');
  reproductor = null;
}

const urlsAudio = new Map();

async function tocarAudio(boton) {
  if (reproductor?.boton === boton) {
    if (reproductor.audio.paused) {
      reproductor.audio.play();
      boton.classList.add('sonando');
    } else {
      reproductor.audio.pause();
      boton.classList.remove('sonando');
    }
    return;
  }
  detener();
  const id = drive.idDeEnlace(boton.href || '');
  if (!id) return;

  boton.classList.add('cargando');
  try {
    if (!urlsAudio.has(id)) urlsAudio.set(id, URL.createObjectURL(await drive.leerBlob(id)));
  } catch {
    boton.classList.remove('cargando');
    window.open(boton.href, '_blank', 'noopener');
    return;
  }

  const audio = new Audio(urlsAudio.get(id));
  reproductor = { audio, boton };
  const barras = [...boton.querySelectorAll('.onda i')];
  const punto = boton.querySelector('.punto');
  const duracion = boton.querySelector('.duracion');
  const textoOriginal = duracion?.textContent;

  audio.ontimeupdate = () => {
    const p = audio.duration ? audio.currentTime / audio.duration : 0;
    barras.forEach((b, i) => b.classList.toggle('oida', i < p * barras.length));
    if (punto) punto.style.left = `calc(${p * 100}% - ${p * 13}px)`;
    if (duracion) duracion.textContent = formatoTiempo(audio.currentTime);
  };
  audio.onended = () => {
    barras.forEach((b) => b.classList.remove('oida'));
    if (punto) punto.style.left = '0';
    if (duracion) duracion.textContent = textoOriginal;
    detener();
  };
  try {
    await audio.play();
    boton.classList.replace('cargando', 'sonando');
  } catch {
    // El navegador no sabe reproducir este formato (por ejemplo .opus en iPhone): se abre en Drive.
    detener();
    window.open(boton.href, '_blank', 'noopener');
  }
}

export async function abrirChat(id, marco) {
  detener();
  const html = await drive.leerTexto(id);
  await new Promise((resolve) => {
    marco.onload = resolve;
    marco.srcdoc = html;
  });
  const doc = marco.contentDocument;
  const estilo = doc.createElement('style');
  estilo.textContent = ESTILO_VISOR;
  doc.head.append(estilo);
  doc.addEventListener('click', (e) => {
    const audio = e.target.closest('a.audio');
    if (!audio) return;
    e.preventDefault();
    tocarAudio(audio);
  });
  // Al abrir, mostrar lo último que se habló, como en WhatsApp.
  doc.scrollingElement.scrollTop = doc.scrollingElement.scrollHeight;
}

export const cerrarChat = detener;
