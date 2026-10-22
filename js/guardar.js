// Sube a Drive lo que el usuario eligió, sin repetir lo que ya estaba guardado.

import * as drive from './drive.js';
import { unirMensajes, conversacionTexto, conversacionHtml } from './conversacion.js';
import { tipoDeArchivo, todasLasCarpetas, nombreAnterior, CARPETA_CONVERSACION } from './plan.js';
import { crearMiniatura, analizarAudio } from './miniaturas.js';

const CON_MINIATURA = new Set(['foto', 'sticker', 'video']);

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
  const resultado = { subidos: 0, repetidos: 0, errores: [], mensajesNuevos: 0, carpeta: null, conversacion: null };

  avisar({ etapa: 'Preparando carpetas en Drive…' });
  const raiz = await drive.buscarOCrearCarpeta(CARPETA_RAIZ);
  const titulo = `Chat con ${nombreChat}`;
  const carpetaChat = await drive.buscarOCrearCarpeta(titulo, raiz);
  resultado.carpeta = drive.enlaceCarpeta(carpetaChat);
  const claveChat = await claveDeChat(nombreChat);

  // Carpetas del chat. Las de versiones anteriores ("Audios recibidos") se renombran
  // a la forma numerada ("02 - Audios recibidos") en vez de crear otras nuevas.
  const carpetas = new Map();
  for (const c of await drive.carpetasDentroDe(carpetaChat)) carpetas.set(c.name, c.id);
  for (const nombre of todasLasCarpetas()) {
    const vieja = carpetas.get(nombreAnterior(nombre));
    if (vieja && !carpetas.has(nombre)) {
      await drive.renombrar(vieja, nombre);
      carpetas.set(nombre, vieja);
    }
  }
  const pendientes = new Map();
  const carpetaPara = async (nombre) => {
    if (carpetas.has(nombre)) return carpetas.get(nombre);
    if (!pendientes.has(nombre)) pendientes.set(nombre, drive.buscarOCrearCarpeta(nombre, carpetaChat));
    return pendientes.get(nombre);
  };

  avisar({ etapa: 'Revisando lo que ya está guardado…' });
  const existentes = await drive.archivosDelChat(claveChat);
  const hashes = new Set();
  const enlaces = new Map();
  const especiales = {};
  for (const f of existentes) {
    const p = f.appProperties || {};
    if (p.sha256) hashes.add(p.sha256);
    if (p.original) enlaces.set(p.original, { url: drive.enlaceArchivo(f.id), tipo: tipoDeArchivo(p.original) });
    if (p.baul_rol) especiales[p.baul_rol] = f;
  }

  // Lo que ya tenía la conversación guardada: mensajes y miniaturas de exportaciones anteriores.
  let anteriores = [];
  const miniaturas = new Map();
  const audios = new Map();
  if (mensajes && especiales.datos) {
    try {
      const datos = JSON.parse(await drive.leerTexto(especiales.datos.id));
      anteriores = datos.mensajes || [];
      for (const [original, url] of Object.entries(datos.miniaturas || {})) miniaturas.set(original, url);
      for (const [original, audio] of Object.entries(datos.audios || {})) audios.set(original, audio);
    } catch {
      anteriores = [];
    }
  }

  let hechos = 0;
  const procesar = async (item) => {
    try {
      const contenido = await fuentes.get(item.original).leer();
      const hash = await sha256(contenido);
      if (mensajes && CON_MINIATURA.has(item.tipo) && !miniaturas.has(item.original)) {
        const miniatura = await crearMiniatura(contenido, item.tipo, item.mime);
        if (miniatura) miniaturas.set(item.original, miniatura);
      }
      if (mensajes && item.tipo === 'audio' && !audios.has(item.original)) {
        const audio = await analizarAudio(contenido);
        if (audio) audios.set(item.original, audio);
      }
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
    const { mensajes: todos, agregados } = unirMensajes(anteriores, mensajes);
    resultado.mensajesNuevos = agregados;

    const archivos = [
      { rol: 'txt', nombre: 'Conversación.txt', mime: 'text/plain', texto: conversacionTexto(todos) },
      { rol: 'html', nombre: 'Conversación.html', mime: 'text/html', texto: conversacionHtml({ titulo, mensajes: todos, yo, enlaces, miniaturas, audios }) },
      { rol: 'datos', nombre: '_datos-conversacion.json', mime: 'application/json', texto: JSON.stringify({
        version: 1, chat: nombreChat, yo, mensajes: todos, miniaturas: Object.fromEntries(miniaturas), audios: Object.fromEntries(audios),
      }) },
    ];
    const carpetaConversacion = await carpetaPara(CARPETA_CONVERSACION);
    for (const a of archivos) {
      const contenido = new Blob([a.texto], { type: `${a.mime};charset=utf-8` });
      const existente = especiales[a.rol];
      if (existente) {
        await drive.reemplazarContenido(existente.id, a.mime, contenido);
        // Las versiones anteriores dejaban la conversación suelta en la carpeta del chat.
        const padre = existente.parents?.[0];
        if (padre && padre !== carpetaConversacion) await drive.mover(existente.id, padre, carpetaConversacion);
        if (a.rol === 'html') resultado.conversacion = existente.id;
      } else {
        const subido = await drive.subirArchivo({
          nombre: a.nombre, padre: carpetaConversacion, mime: a.mime, contenido,
          propiedades: { baul_chat: claveChat, baul_rol: a.rol },
        });
        if (a.rol === 'html') resultado.conversacion = subido.id;
      }
    }
  }

  return resultado;
}
