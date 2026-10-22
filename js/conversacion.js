// Une mensajes de distintas exportaciones y genera la conversación en .txt y .html.

import { claveMensaje, fechaISO, horaTexto, normalizarMensaje } from './parser.js';
import { tipoDeArchivo } from './plan.js';

// Junta los mensajes ya guardados con los nuevos, sin repetir, ordenados por fecha.
export function unirMensajes(anteriores, nuevos) {
  const previos = anteriores.map(normalizarMensaje).filter(Boolean);
  const porClave = new Map();
  for (const msj of [...previos, ...nuevos]) porClave.set(claveMensaje(msj), msj);
  const unidos = [...porClave.values()].sort((a, b) => a.ts - b.ts);
  return { mensajes: unidos, agregados: unidos.length - new Set(previos.map(claveMensaje)).size };
}

function fechaLarga(fecha) {
  return fecha.toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fechaCorta(fecha) {
  const [a, m, d] = fechaISO(fecha).split('-');
  return `${d}/${m}/${a}`;
}

export function conversacionTexto(mensajes) {
  return mensajes
    .map((msj) => {
      const fecha = new Date(msj.ts);
      const cabeza = `${fechaCorta(fecha)} ${horaTexto(fecha)} - `;
      const adjunto = msj.adjunto ? `[archivo: ${msj.adjunto}]${msj.texto ? '\n' : ''}` : '';
      const cuerpo = adjunto + msj.texto + (msj.editado ? ' (editado)' : '');
      return msj.autor ? `${cabeza}${msj.autor}: ${cuerpo}` : `${cabeza}${cuerpo}`;
    })
    .join('\n') + '\n';
}

const escapar = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Texto escapado con los links convertidos en enlaces que se pueden tocar.
function conEnlaces(texto) {
  return texto
    .split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)'\]])/)
    .map((parte, i) =>
      i % 2 ? `<a href="${escapar(parte)}" target="_blank" rel="noopener">${escapar(parte)}</a>` : escapar(parte),
    )
    .join('');
}

const ICONO = { audio: '🎤', foto: '📷', video: '🎬', sticker: '🙂', documento: '📄' };

const duracionTexto = (seg) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

// Forma de onda inventada (pero siempre igual para el mismo archivo) cuando no se pudo analizar el audio.
function ondaInventada(nombre) {
  let semilla = [...nombre].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: 40 }, () => {
    semilla = (semilla * 1103515245 + 12345) >>> 0;
    return String(2 + (semilla % 8));
  }).join('');
}

// Burbuja de audio al estilo WhatsApp: play, forma de onda y duración. Abre el audio en Drive.
function burbujaAudio(nombre, enlace, audio) {
  const barras = [...(audio?.onda || ondaInventada(nombre))]
    .map((n) => `<i style="height:${10 + Number(n) * 10}%"></i>`)
    .join('');
  const duracion = audio ? duracionTexto(audio.duracion) : '';
  const cuerpo =
    `<span class="boton-play"></span>` +
    `<span class="onda"><b class="punto"></b>${barras}<span class="duracion">${duracion}</span></span>`;
  return enlace
    ? `<a class="audio" href="${escapar(enlace.url)}" target="_blank" rel="noopener" title="Escuchar ${escapar(nombre)}">${cuerpo}</a>`
    : `<span class="audio sin-enlace" title="Este audio no se guardó">${cuerpo}</span>`;
}

// Tarjeta de documento (PDF, Word, etc.) con un botón para abrirlo en Drive.
function tarjetaDocumento(nombre, enlace) {
  const extension = (/\.([a-z0-9]+)$/i.exec(nombre)?.[1] || 'archivo').toUpperCase();
  const cuerpo =
    `<span class="doc-icono">${escapar(extension.slice(0, 4))}</span>` +
    `<span class="doc-nombre">${escapar(nombre)}</span>` +
    `<span class="doc-boton">${enlace ? 'Abrir archivo' : 'Archivo no guardado'}</span>`;
  return enlace
    ? `<a class="documento" href="${escapar(enlace.url)}" target="_blank" rel="noopener">${cuerpo}</a>`
    : `<span class="documento sin-enlace">${cuerpo}</span>`;
}

// enlaces: Map nombre original -> { url, tipo }
// miniaturas: Map nombre original -> data: URL de una imagen chiquita
// audios: Map nombre original -> { duracion, onda }
export function conversacionHtml({ titulo, mensajes, yo, enlaces, miniaturas = new Map(), audios = new Map() }) {
  const partes = [];
  let diaAnterior = '';
  for (const msj of mensajes) {
    const fecha = new Date(msj.ts);
    const dia = fechaISO(fecha);
    if (dia !== diaAnterior) {
      partes.push(`<div class="dia"><span>${escapar(fechaLarga(fecha))}</span></div>`);
      diaAnterior = dia;
    }
    if (!msj.autor) {
      partes.push(`<div class="aviso">${escapar(msj.texto)}</div>`);
      continue;
    }
    const mio = msj.autor === yo;
    let adjunto = '';
    const tipo = msj.adjunto && tipoDeArchivo(msj.adjunto);
    if (tipo === 'audio') {
      adjunto = burbujaAudio(msj.adjunto, enlaces.get(msj.adjunto), audios.get(msj.adjunto));
    } else if (tipo === 'documento') {
      adjunto = tarjetaDocumento(msj.adjunto, enlaces.get(msj.adjunto));
    } else if (msj.adjunto) {
      const enlace = enlaces.get(msj.adjunto);
      const icono = ICONO[tipo] || '📎';
      const miniatura = miniaturas.get(msj.adjunto);
      const imagen = miniatura &&
        `<img src="${escapar(miniatura)}" alt="${escapar(msj.adjunto)}" loading="lazy">` +
        (tipo === 'video' ? '<span class="play">▶</span>' : '');
      adjunto = imagen
        ? enlace
          ? `<a class="miniatura" href="${escapar(enlace.url)}" target="_blank" rel="noopener">${imagen}</a>`
          : `<span class="miniatura">${imagen}</span>`
        : enlace
        ? `<a class="adjunto" href="${escapar(enlace.url)}" target="_blank" rel="noopener">${icono} ${escapar(msj.adjunto)}</a>`
        : `<span class="adjunto">📎 ${escapar(msj.adjunto)}</span>`;
    }
    const texto = msj.texto ? `<div class="texto">${conEnlaces(msj.texto)}</div>` : '';
    partes.push(
      `<div class="msj ${mio ? 'mio' : 'otro'}">` +
        (mio ? '' : `<div class="autor">${escapar(msj.autor)}</div>`) +
        adjunto + texto +
        `<div class="hora">${msj.editado ? 'editado · ' : ''}${horaTexto(fecha)}</div></div>`,
    );
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
  :root { --fondo: #efeae2; --mio: #d9fdd3; --otro: #ffffff; --texto: #111b21; --suave: #667781; --enlace: #027eb5;
          --barra: rgba(17,27,33,.28); --punto: #00a5f4; --capa: rgba(0,0,0,.06); --enlace-texto: #fff; }
  @media (prefers-color-scheme: dark) {
    :root { --fondo: #0b141a; --mio: #005c4b; --otro: #202c33; --texto: #e9edef; --suave: #8696a0; --enlace: #53bdeb;
            --barra: rgba(233,237,239,.35); --punto: #53bdeb; --capa: rgba(0,0,0,.2); --enlace-texto: #0b141a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fondo); color: var(--texto); font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position: sticky; top: 0; background: #008069; color: #fff; padding: 14px 16px; font-weight: 600; }
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 40px; display: flex; flex-direction: column; gap: 4px; }
  .dia { text-align: center; margin: 14px 0 6px; }
  .dia span { background: var(--otro); color: var(--suave); font-size: 12.5px; padding: 5px 12px; border-radius: 8px; }
  .aviso { align-self: center; text-align: center; color: var(--suave); font-size: 12.5px; max-width: 90%; margin: 4px 0; }
  .msj { max-width: 82%; padding: 6px 9px 4px; border-radius: 8px; box-shadow: 0 1px 0.5px rgba(0,0,0,.13); overflow-wrap: anywhere; }
  .mio { align-self: flex-end; background: var(--mio); }
  .otro { align-self: flex-start; background: var(--otro); }
  .autor { font-size: 12.5px; font-weight: 600; color: #06cf9c; }
  .texto { white-space: pre-wrap; }
  .texto a { color: var(--enlace); }
  .adjunto { display: block; color: var(--enlace); margin: 2px 0; }
  .miniatura { position: relative; display: block; margin: 2px 0 4px; }
  .miniatura img { display: block; max-width: 100%; width: 260px; height: auto; border-radius: 6px; }
  .miniatura .play { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 40px; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
  .audio { display: flex; align-items: center; gap: 10px; width: 270px; max-width: 100%; padding: 6px 2px 16px; color: inherit; text-decoration: none; }
  .boton-play { flex: none; width: 0; height: 0; margin-left: 6px; border-left: 18px solid var(--suave); border-top: 11px solid transparent; border-bottom: 11px solid transparent; }
  .onda { position: relative; flex: 1; height: 30px; display: flex; align-items: center; gap: 2px; padding-left: 16px; }
  .onda i { flex: 1; min-height: 3px; background: var(--barra); border-radius: 2px; }
  .punto { position: absolute; left: 0; top: 50%; width: 13px; height: 13px; margin-top: -6.5px; border-radius: 50%; background: var(--punto); }
  .duracion { position: absolute; left: 0; bottom: -17px; font-size: 11px; color: var(--suave); }
  .documento { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; width: 270px; max-width: 100%; margin: 2px 0 4px; padding: 10px; border-radius: 8px; background: var(--capa); color: inherit; text-decoration: none; }
  .doc-icono { flex: none; display: grid; place-items: center; width: 34px; height: 40px; border-radius: 4px; background: #e5534b; color: #fff; font-size: 10px; font-weight: 700; }
  .doc-nombre { flex: 1; min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
  .doc-boton { flex-basis: 100%; text-align: center; padding: 6px; border-radius: 16px; background: var(--enlace); color: var(--enlace-texto); font-size: 13px; font-weight: 600; }
  .sin-enlace { opacity: .55; }
  .sin-enlace .doc-boton { background: var(--suave); }
  .hora { text-align: right; font-size: 11px; color: var(--suave); }
</style>
</head>
<body>
<header>${escapar(titulo)}</header>
<main>
${partes.join('\n')}
</main>
</body>
</html>
`;
}
