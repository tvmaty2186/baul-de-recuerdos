// Decide qué archivo va a qué carpeta y con qué nombre. Sin dependencias del navegador.

import { fechaISO, horaTexto } from './parser.js';

export const TIPOS = {
  audio: { etiqueta: 'Audios', enviados: 'Audios enviados', recibidos: 'Audios recibidos' },
  foto: { etiqueta: 'Fotos', enviados: 'Fotos enviadas', recibidos: 'Fotos recibidas' },
  video: { etiqueta: 'Videos', enviados: 'Videos enviados', recibidos: 'Videos recibidos' },
  documento: { etiqueta: 'Documentos', enviados: 'Documentos enviados', recibidos: 'Documentos recibidos' },
  sticker: { etiqueta: 'Stickers', enviados: 'Stickers enviados', recibidos: 'Stickers recibidos' },
};

export const CARPETA_SIN_MENSAJE = 'Otros archivos';

const EXTENSIONES = {
  audio: ['opus', 'ogg', 'm4a', 'mp3', 'aac', 'amr', 'wav'],
  foto: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'gif', 'bmp'],
  video: ['mp4', '3gp', 'mov', 'mkv', 'webm', 'avi'],
  sticker: ['webp'],
};

const MIME = {
  opus: 'audio/ogg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac',
  amr: 'audio/amr', wav: 'audio/wav', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime', mkv: 'video/x-matroska',
  webm: 'video/webm', avi: 'video/x-msvideo', pdf: 'application/pdf', vcf: 'text/vcard',
  txt: 'text/plain',
};

export function extension(nombre) {
  const m = /\.([a-z0-9]+)$/i.exec(nombre);
  return m ? m[1].toLowerCase() : '';
}

export function tipoDeArchivo(nombre) {
  const ext = extension(nombre);
  for (const [tipo, lista] of Object.entries(EXTENSIONES)) {
    if (lista.includes(ext)) return tipo;
  }
  return 'documento';
}

export function mimeDeArchivo(nombre) {
  return MIME[extension(nombre)] || 'application/octet-stream';
}

// Fecha escrita en el nombre del archivo, para adjuntos que no aparecen en el texto:
//   IMG-20250314-WA0001.jpg  /  00000012-PHOTO-2025-03-14-21-05-33.jpg
export function fechaDesdeNombre(nombre) {
  let m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(nombre);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  m = /-(\d{4})(\d{2})(\d{2})-WA/i.exec(nombre);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

// Nombre con fecha adelante, para que en Drive queden ordenados solos.
export function nombreGuardado({ fecha, original, autor, esGrupo }) {
  const prefijo = fecha ? `${fechaISO(fecha)} ${horaTexto(fecha).replace(':', '.')} - ` : '';
  const quien = esGrupo && autor ? `${autor.replace(/[\\/:*?"<>|]/g, '_')} - ` : '';
  return `${prefijo}${quien}${original}`;
}

// Arma la lista de archivos a guardar.
//   archivos: [{ nombre, tamanio }] (los que vinieron en la exportación, sin el .txt)
//   mensajes: resultado de parsearChat
//   opciones: { yo, tipos: Set, enviados, recibidos, desde (Date|null), hasta (Date|null), incluirSinMensaje }
export function armarPlan({ archivos, mensajes, participantes, opciones }) {
  const porNombre = new Map(archivos.map((a) => [a.nombre, a]));
  const esGrupo = participantes.length > 2;
  const enRango = (fecha) =>
    fecha &&
    (!opciones.desde || fecha >= opciones.desde) &&
    (!opciones.hasta || fecha <= opciones.hasta);

  const items = [];
  const usados = new Set();

  for (const msj of mensajes) {
    if (!msj.adjunto) continue;
    const archivo = porNombre.get(msj.adjunto);
    if (!archivo || usados.has(archivo.nombre)) continue;
    usados.add(archivo.nombre);
    const fecha = new Date(msj.ts);
    const tipo = tipoDeArchivo(archivo.nombre);
    const enviado = msj.autor === opciones.yo;
    if (!opciones.tipos.has(tipo) || !enRango(fecha)) continue;
    if (enviado ? !opciones.enviados : !opciones.recibidos) continue;
    items.push({
      original: archivo.nombre,
      tamanio: archivo.tamanio,
      tipo,
      enviado,
      carpeta: enviado ? TIPOS[tipo].enviados : TIPOS[tipo].recibidos,
      nombre: nombreGuardado({ fecha, original: archivo.nombre, autor: msj.autor, esGrupo }),
      mime: mimeDeArchivo(archivo.nombre),
    });
  }

  // Archivos que vinieron en el zip pero ningún mensaje los nombra.
  if (opciones.incluirSinMensaje) {
    for (const archivo of archivos) {
      if (usados.has(archivo.nombre)) continue;
      const tipo = tipoDeArchivo(archivo.nombre);
      if (!opciones.tipos.has(tipo)) continue;
      const fecha = fechaDesdeNombre(archivo.nombre);
      if ((opciones.desde || opciones.hasta) && fecha && !enRango(fecha)) continue;
      items.push({
        original: archivo.nombre,
        tamanio: archivo.tamanio,
        tipo,
        enviado: null,
        carpeta: CARPETA_SIN_MENSAJE,
        nombre: nombreGuardado({ fecha, original: archivo.nombre }),
        mime: mimeDeArchivo(archivo.nombre),
      });
    }
  }

  return items;
}

// Resumen por tipo para mostrar antes de guardar.
export function resumenAdjuntos({ archivos, mensajes, yo }) {
  const porNombre = new Map(archivos.map((a) => [a.nombre, a]));
  const resumen = {};
  for (const tipo of Object.keys(TIPOS)) resumen[tipo] = { enviados: 0, recibidos: 0, bytes: 0 };
  let omitidos = 0;
  const vistos = new Set();
  for (const msj of mensajes) {
    if (msj.omitido) omitidos++;
    if (!msj.adjunto || vistos.has(msj.adjunto)) continue;
    const archivo = porNombre.get(msj.adjunto);
    if (!archivo) {
      omitidos++;
      continue;
    }
    vistos.add(msj.adjunto);
    const r = resumen[tipoDeArchivo(archivo.nombre)];
    if (msj.autor === yo) r.enviados++;
    else r.recibidos++;
    r.bytes += archivo.tamanio || 0;
  }
  const sinMensaje = archivos.filter((a) => !vistos.has(a.nombre)).length;
  return { porTipo: resumen, omitidos, sinMensaje };
}
