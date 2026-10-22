// Une mensajes de distintas exportaciones y genera la conversación en .txt y .html.

import { claveMensaje, fechaISO, horaTexto } from './parser.js';

// Junta los mensajes ya guardados con los nuevos, sin repetir, ordenados por fecha.
export function unirMensajes(anteriores, nuevos) {
  const porClave = new Map();
  for (const msj of [...anteriores, ...nuevos]) porClave.set(claveMensaje(msj), msj);
  const unidos = [...porClave.values()].sort((a, b) => a.ts - b.ts);
  return { mensajes: unidos, agregados: unidos.length - anteriores.length };
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
      const cuerpo = adjunto + msj.texto;
      return msj.autor ? `${cabeza}${msj.autor}: ${cuerpo}` : `${cabeza}${cuerpo}`;
    })
    .join('\n') + '\n';
}

const escapar = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONO = { audio: '🎤', foto: '📷', video: '🎬', sticker: '🙂', documento: '📄' };

// enlaces: Map nombre original -> { url, tipo }
export function conversacionHtml({ titulo, mensajes, yo, enlaces }) {
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
    if (msj.adjunto) {
      const enlace = enlaces.get(msj.adjunto);
      const icono = ICONO[enlace?.tipo] || '📎';
      adjunto = enlace
        ? `<a class="adjunto" href="${escapar(enlace.url)}" target="_blank" rel="noopener">${icono} ${escapar(msj.adjunto)}</a>`
        : `<span class="adjunto">📎 ${escapar(msj.adjunto)}</span>`;
    }
    const texto = msj.texto ? `<div class="texto">${escapar(msj.texto)}</div>` : '';
    partes.push(
      `<div class="msj ${mio ? 'mio' : 'otro'}">` +
        (mio ? '' : `<div class="autor">${escapar(msj.autor)}</div>`) +
        adjunto + texto +
        `<div class="hora">${horaTexto(fecha)}</div></div>`,
    );
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
  :root { --fondo: #efeae2; --mio: #d9fdd3; --otro: #ffffff; --texto: #111b21; --suave: #667781; --enlace: #027eb5; }
  @media (prefers-color-scheme: dark) {
    :root { --fondo: #0b141a; --mio: #005c4b; --otro: #202c33; --texto: #e9edef; --suave: #8696a0; --enlace: #53bdeb; }
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
  .adjunto { display: block; color: var(--enlace); margin: 2px 0; }
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
