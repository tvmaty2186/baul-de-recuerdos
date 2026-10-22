// Sube a Drive lo que el usuario eligió, sin repetir lo que ya estaba guardado.

import * as drive from './drive.js';
import { unirMensajes, conversacionTexto, conversacionHtml } from './conversacion.js';
import { tipoDeArchivo } from './plan.js';

export const CARPETA_RAIZ = 'Baúl de recuerdos';

export async function sha256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// appProperties admite hasta 124 bytes entre clave y valor.
function recortar(texto, maxBytes) {
  const codificador = new TextEncoder();
  while (codificador.encode(texto).length > maxBytes) texto = texto.slice(0, -1);
  return texto;
}

async function claveDeChat(nombre) {
  const datos = new TextEncoder().encode(nombre.trim().toLowerCase());
  return (await sha256(datos)).slice(0, 24);
}

// items: resultado de armarPlan. fuentes: Map nombre -> { leer() }.
// mensajes: los mensajes del rango elegido (para la conversación), o null si no se guarda.
export async function guardarEnDrive({ nombreChat, items, fuentes, mensajes, yo, avisar }) {
  const resultado = { subidos: 0, repetidos: 0, errores: [], mensajesNuevos: 0, carpeta: null };

  avisar({ etapa: 'Preparando carpetas en Drive…' });
  const raiz = await drive.buscarOCrearCarpeta(CARPETA_RAIZ);
  const titulo = `Chat con ${nombreChat}`;
  const carpetaChat = await drive.buscarOCrearCarpeta(titulo, raiz);
  resultado.carpeta = drive.enlaceCarpeta(carpetaChat);
  const claveChat = await claveDeChat(nombreChat);

  avisar({ etapa: 'Revisando lo que ya está guardado…' });
  const existentes = await drive.archivosDelChat(claveChat);
  const hashes = new Set();
  const enlaces = new Map();
  const especiales = {};
  for (const f of existentes) {
    const p = f.appProperties || {};
    if (p.sha256) hashes.add(p.sha256);
    if (p.original) enlaces.set(p.original, { url: drive.enlaceArchivo(f.id), tipo: tipoDeArchivo(p.original) });
    if (p.baul_rol) especiales[p.baul_rol] = f.id;
  }

  const carpetas = new Map();
  const carpetaPara = async (nombre) => {
    if (!carpetas.has(nombre)) carpetas.set(nombre, drive.buscarOCrearCarpeta(nombre, carpetaChat));
    return carpetas.get(nombre);
  };

  let hechos = 0;
  const procesar = async (item) => {
    try {
      const contenido = await fuentes.get(item.original).leer();
      const hash = await sha256(contenido);
      if (hashes.has(hash)) {
        resultado.repetidos++;
      } else {
        hashes.add(hash);
        const subido = await drive.subirArchivo({
          nombre: item.nombre,
          padre: await carpetaPara(item.carpeta),
          mime: item.mime,
          contenido: new Blob([contenido], { type: item.mime }),
          propiedades: { baul_chat: claveChat, sha256: hash, original: recortar(item.original, 110) },
        });
        enlaces.set(item.original, { url: drive.enlaceArchivo(subido.id), tipo: item.tipo });
        resultado.subidos++;
      }
    } catch (e) {
      resultado.errores.push(`${item.original}: ${e.message}`);
    }
    hechos++;
    avisar({ etapa: 'Guardando archivos…', hechos, total: items.length });
  };

  // Tres subidas a la vez: más rápido sin saturar la conexión del teléfono.
  const cola = [...items];
  const trabajador = async () => {
    while (cola.length) await procesar(cola.shift());
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]);

  if (mensajes) {
    avisar({ etapa: 'Guardando la conversación…' });
    let anteriores = [];
    if (especiales.datos) {
      try {
        anteriores = JSON.parse(await drive.leerTexto(especiales.datos)).mensajes || [];
      } catch {
        anteriores = [];
      }
    }
    const { mensajes: todos, agregados } = unirMensajes(anteriores, mensajes);
    resultado.mensajesNuevos = agregados;

    const archivos = [
      { rol: 'txt', nombre: 'Conversación.txt', mime: 'text/plain', texto: conversacionTexto(todos) },
      { rol: 'html', nombre: 'Conversación.html', mime: 'text/html', texto: conversacionHtml({ titulo, mensajes: todos, yo, enlaces }) },
      { rol: 'datos', nombre: '_datos-conversacion.json', mime: 'application/json', texto: JSON.stringify({ version: 1, chat: nombreChat, yo, mensajes: todos }) },
    ];
    for (const a of archivos) {
      const contenido = new Blob([a.texto], { type: `${a.mime};charset=utf-8` });
      if (especiales[a.rol]) {
        await drive.reemplazarContenido(especiales[a.rol], a.mime, contenido);
      } else {
        await drive.subirArchivo({
          nombre: a.nombre, padre: carpetaChat, mime: a.mime, contenido,
          propiedades: { baul_chat: claveChat, baul_rol: a.rol },
        });
      }
    }
  }

  return resultado;
}
