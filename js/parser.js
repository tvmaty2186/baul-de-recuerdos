// Lectura del .txt que genera "Exportar chat" de WhatsApp (Android e iPhone,
// en español, inglés o portugués). No depende del navegador: se testea con Node.

// Caracteres invisibles que WhatsApp mete en el texto exportado.
const INVISIBLES = /[‎‏‪-‮⁦-⁩﻿]/g;
const ESPACIOS_RAROS = /[   ]/g;

// Encabezado de cada mensaje:
//   Android: 14/3/25, 21:05 - Mamá: Hola
//   Android: 3/14/25, 9:05 p. m. - Mamá: Hola
//   iPhone:  [14/3/25, 21:05:33] Mamá: Hola
const ENCABEZADO =
  /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s+)?(.*)$/i;

// Adjuntos: "IMG-20250314-WA0001.jpg (archivo adjunto)" (Android)
// o "<adjunto: 00000012-PHOTO-2025-03-14-21-05-33.jpg>" (iPhone).
const ADJUNTO_ANDROID = /^(\S+\.[a-z0-9]{2,5})\s+\([^)]+\)\s*$/i;
const ADJUNTO_IPHONE = /^<[^:<>]+:\s*([^<>]+\.[a-z0-9]{2,5})>\s*$/i;
const MULTIMEDIA_OMITIDA =
  /^<?(multimedia omitido|media omitted|arquivo de mídia oculto|mídia omitida|imagen omitida|image omitted|audio omitido|audio omitted|video omitido|video omitted|sticker omitido|sticker omitted|documento omitido|document omitted|gif omitido|gif omitted)>?$/i;

export function limpiarLinea(linea) {
  return linea.replace(INVISIBLES, '').replace(ESPACIOS_RAROS, ' ').replace(/\r$/, '');
}

// Decide si las fechas vienen como día/mes o mes/día mirando todo el chat.
export function detectarOrdenFecha(lineas) {
  let primeroMayor = false;
  let segundoMayor = false;
  for (const linea of lineas) {
    const m = ENCABEZADO.exec(linea);
    if (!m) continue;
    if (Number(m[1]) > 12) primeroMayor = true;
    if (Number(m[2]) > 12) segundoMayor = true;
  }
  if (segundoMayor && !primeroMayor) return 'MDA';
  return 'DMA';
}

function construirFecha(m, orden) {
  let [dia, mes] = orden === 'MDA' ? [m[2], m[1]] : [m[1], m[2]];
  dia = Number(dia);
  mes = Number(mes);
  let anio = Number(m[3]);
  if (anio < 100) anio += 2000;
  let hora = Number(m[4]);
  const minuto = Number(m[5]);
  const segundo = m[6] ? Number(m[6]) : 0;
  if (m[7]) {
    const pm = /^p/i.test(m[7]);
    if (pm && hora < 12) hora += 12;
    if (!pm && hora === 12) hora = 0;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return new Date(anio, mes - 1, dia, hora, minuto, segundo);
}

const dos = (n) => String(n).padStart(2, '0');

export function fechaISO(fecha) {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

export function horaTexto(fecha) {
  return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
}

// Identificador estable de un mensaje, para no duplicarlo entre exportaciones.
export function claveMensaje(msj) {
  const segundos = dos(new Date(msj.ts).getSeconds());
  return `${fechaISO(new Date(msj.ts))} ${horaTexto(new Date(msj.ts))}:${segundos}|${msj.autor ?? ''}|${msj.texto}|${msj.adjunto ?? ''}`;
}

function separarAutor(resto) {
  const i = resto.indexOf(': ');
  if (i <= 0) return { autor: null, texto: resto };
  return { autor: resto.slice(0, i).trim(), texto: resto.slice(i + 2) };
}

function detectarAdjunto(texto) {
  const primera = texto.split('\n')[0].trim();
  let m = ADJUNTO_IPHONE.exec(primera) || ADJUNTO_ANDROID.exec(primera);
  if (m) {
    const resto = texto.split('\n').slice(1).join('\n').trim();
    return { adjunto: m[1].trim(), texto: resto };
  }
  if (MULTIMEDIA_OMITIDA.test(primera)) return { omitido: true, texto: primera };
  return { texto };
}

// Devuelve { mensajes, participantes, ordenFecha }.
// Cada mensaje: { ts (ms), autor (null si es aviso del sistema), texto, adjunto, omitido }
export function parsearChat(contenido, { ordenFecha } = {}) {
  const lineas = contenido.split('\n').map(limpiarLinea);
  const orden = ordenFecha || detectarOrdenFecha(lineas);
  const mensajes = [];
  let actual = null;

  const cerrar = () => {
    if (!actual) return;
    const extra = detectarAdjunto(actual.texto);
    mensajes.push({
      ts: actual.ts,
      autor: actual.autor,
      texto: extra.texto,
      adjunto: extra.adjunto ?? null,
      omitido: Boolean(extra.omitido),
    });
    actual = null;
  };

  for (const linea of lineas) {
    const m = ENCABEZADO.exec(linea);
    const fecha = m && construirFecha(m, orden);
    if (fecha) {
      cerrar();
      const { autor, texto } = separarAutor(m[8]);
      actual = { ts: fecha.getTime(), autor, texto };
    } else if (actual) {
      actual.texto += '\n' + linea;
    }
  }
  cerrar();

  for (const msj of mensajes) msj.texto = msj.texto.replace(/\s+$/, '');

  const conteo = new Map();
  for (const msj of mensajes) {
    if (msj.autor) conteo.set(msj.autor, (conteo.get(msj.autor) || 0) + 1);
  }
  const participantes = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([nombre]) => nombre);

  return { mensajes, participantes, ordenFecha: orden };
}

// Saca el nombre del chat del nombre del archivo exportado:
//   "Chat de WhatsApp con Mamá.txt", "WhatsApp Chat with Mamá.zip",
//   "Chat de WhatsApp - Mamá.zip", "Conversa do WhatsApp com Mamá.txt"
export function nombreDesdeArchivo(nombreArchivo) {
  const base = limpiarLinea(nombreArchivo).replace(/\.(txt|zip)$/i, '').trim();
  const m =
    /whats\s?app\b.*?\s(?:con|with|com|avec|mit)\s+(.+)$/i.exec(base) ||
    /whats\s?app.*?\s[-–]\s+(.+)$/i.exec(base);
  return m ? m[1].trim() : null;
}
