// Lee lo que exporta WhatsApp: un .zip, o el .txt suelto con sus archivos.

import { parsearChat, nombreDesdeArchivo } from './parser.js';

const nombreBase = (ruta) => ruta.split('/').pop();

export const formatoBytes = (b) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

// Android a veces entrega los archivos sin extensión (por ejemplo desde "Descargas"),
// así que el zip se reconoce por su contenido: empieza con "PK".
async function esZip(archivo) {
  if (/\.zip$/i.test(archivo.name) || /zip/i.test(archivo.type)) return true;
  const inicio = new Uint8Array(await archivo.slice(0, 4).arrayBuffer());
  return inicio[0] === 0x50 && inicio[1] === 0x4b && inicio[2] === 0x03 && inicio[3] === 0x04;
}

// Un archivo suelto puede ser el chat aunque no termine en .txt.
const puedeSerChat = (nombre, tipo = '', tamanio = 0) =>
  /\.txt$/i.test(nombre) || (!/\.[a-z0-9]{2,5}$/i.test(nombre) && (!tipo || /^text\//.test(tipo)) && tamanio < 50e6);

// Devuelve { fuentes, chat, nombreChat } o lanza un Error con .detalle para diagnosticar.
//   fuentes: Map nombre -> { tamanio, leer() } con los archivos adjuntos (sin el .txt del chat)
export async function leerExportacion(lista) {
  const fuentes = new Map();
  const textos = [];
  const diagnostico = [];
  let nombreZip = null;

  for (const archivo of lista) {
    if (await esZip(archivo)) {
      nombreZip ??= archivo.name;
      let zip;
      try {
        zip = await JSZip.loadAsync(archivo);
      } catch (e) {
        throw Object.assign(new Error('No pude abrir el archivo. ¿Se descargó completo?'), { detalle: e.message });
      }
      diagnostico.push(`zip con ${Object.keys(zip.files).length} archivos`);
      zip.forEach((ruta, entrada) => {
        if (entrada.dir || nombreBase(ruta).startsWith('.') || ruta.startsWith('__MACOSX')) return;
        const nombre = nombreBase(ruta);
        const tamanio = entrada._data?.uncompressedSize ?? 0;
        fuentes.set(nombre, { tamanio, leer: () => entrada.async('arraybuffer') });
        if (puedeSerChat(nombre, '', tamanio)) textos.push({ nombre, leer: () => entrada.async('string') });
      });
    } else {
      fuentes.set(archivo.name, { tamanio: archivo.size, leer: () => archivo.arrayBuffer() });
      if (puedeSerChat(archivo.name, archivo.type, archivo.size)) {
        textos.push({ nombre: archivo.name, leer: () => archivo.text() });
      }
    }
  }

  // El chat es el .txt con más mensajes (puede haber .txt adjuntos dentro del chat).
  let mejor = null;
  for (const t of textos) {
    try {
      const contenido = await t.leer();
      const chat = parsearChat(contenido);
      diagnostico.push(`"${t.nombre}": ${chat.mensajes.length} mensajes, empieza con «${contenido.slice(0, 60)}»`);
      if (!mejor || chat.mensajes.length > mejor.chat.mensajes.length) mejor = { ...t, chat };
    } catch (e) {
      diagnostico.push(`"${t.nombre}": error ${e.message}`);
    }
  }
  if (!mejor || !mejor.chat.mensajes.length) {
    if (!textos.length) diagnostico.push('ningún archivo de texto');
    const recibidos = lista.map((a) => `${a.name || 'sin nombre'} (${a.type || 'sin tipo'}, ${formatoBytes(a.size)})`);
    throw Object.assign(new Error('Ese archivo no parece un chat exportado de WhatsApp.'), {
      detalle: `Recibí: ${recibidos.join(', ')}. ${diagnostico.join('; ')}.`,
    });
  }

  fuentes.delete(mejor.nombre);
  const { participantes } = mejor.chat;
  const nombreChat =
    nombreDesdeArchivo(mejor.nombre) || (nombreZip && nombreDesdeArchivo(nombreZip)) || participantes[0] || 'Sin nombre';
  return { fuentes, chat: mejor.chat, nombreChat };
}
