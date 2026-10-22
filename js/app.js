import { GOOGLE_CLIENT_ID } from './config.js';
import { parsearChat, nombreDesdeArchivo, fechaISO } from './parser.js';
import { TIPOS, armarPlan, resumenAdjuntos } from './plan.js';
import { guardarEnDrive, CARPETA_RAIZ } from './guardar.js';
import * as drive from './drive.js';
import { tomarCompartidos } from './compartidos.js';

const $ = (id) => document.getElementById(id);

const estado = {
  fuentes: new Map(), // nombre -> { tamanio, leer() }
  chat: null, // { mensajes, participantes }
  resumen: null,
};

const formatoBytes = (b) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

const nombreBase = (ruta) => ruta.split('/').pop();

function mostrarCarga(texto, error = false) {
  const p = $('estado-carga');
  p.hidden = !texto;
  p.textContent = texto || '';
  p.classList.toggle('error', error);
}

// ---------- Paso 1: leer lo exportado ----------

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

async function cargarArchivos(lista) {
  if (!lista.length) return;
  mostrarCarga('Leyendo el chat…');
  estado.fuentes = new Map();
  const textos = [];
  let nombreZip = null;

  try {
    for (const archivo of lista) {
      if (await esZip(archivo)) {
        nombreZip ??= archivo.name;
        const zip = await JSZip.loadAsync(archivo);
        zip.forEach((ruta, entrada) => {
          if (entrada.dir || nombreBase(ruta).startsWith('.') || ruta.startsWith('__MACOSX')) return;
          const nombre = nombreBase(ruta);
          const tamanio = entrada._data?.uncompressedSize ?? 0;
          estado.fuentes.set(nombre, { tamanio, leer: () => entrada.async('arraybuffer') });
          if (puedeSerChat(nombre, '', tamanio)) textos.push({ nombre, leer: () => entrada.async('string') });
        });
      } else {
        estado.fuentes.set(archivo.name, { tamanio: archivo.size, leer: () => archivo.arrayBuffer() });
        if (puedeSerChat(archivo.name, archivo.type, archivo.size)) {
          textos.push({ nombre: archivo.name, leer: () => archivo.text() });
        }
      }
    }
  } catch (e) {
    mostrarCarga(`No pude abrir el archivo: ${e.message}`, true);
    return;
  }

  // El chat es el .txt con más mensajes (puede haber .txt adjuntos dentro del chat).
  let mejor = null;
  for (const t of textos) {
    const chat = parsearChat(await t.leer());
    if (!mejor || chat.mensajes.length > mejor.chat.mensajes.length) mejor = { ...t, chat };
  }
  if (!mejor || !mejor.chat.mensajes.length) {
    const recibidos = lista.map((a) => `${a.name || 'sin nombre'} (${formatoBytes(a.size)})`).join(', ');
    mostrarCarga(
      'No encontré la conversación. Elegí el .zip que genera "Exportar chat" de WhatsApp (o el .txt). ' +
        `Recibí: ${recibidos}.`,
      true,
    );
    return;
  }
  estado.fuentes.delete(mejor.nombre);
  estado.chat = mejor.chat;

  const { participantes } = mejor.chat;
  const nombre =
    nombreDesdeArchivo(mejor.nombre) || (nombreZip && nombreDesdeArchivo(nombreZip)) || participantes[0] || 'Sin nombre';
  mostrarCarga(`Listo: ${mejor.chat.mensajes.length.toLocaleString('es')} mensajes y ${estado.fuentes.size} archivos.`);
  prepararOpciones(nombre);
}

// ---------- Paso 2: opciones ----------

function prepararOpciones(nombreChat) {
  const { mensajes, participantes } = estado.chat;
  $('nombre-chat').value = nombreChat;

  // Si el chat se llama como uno de los dos participantes, "yo" es el otro.
  const select = $('quien-soy');
  select.innerHTML = '';
  let yo = participantes.length === 2 && participantes.includes(nombreChat)
    ? participantes.find((p) => p !== nombreChat)
    : null;
  if (!yo) select.append(new Option('Elegí tu nombre…', ''));
  for (const p of participantes) select.append(new Option(p, p, false, p === yo));

  const primera = new Date(mensajes[0].ts);
  const ultima = new Date(mensajes[mensajes.length - 1].ts);
  for (const id of ['desde', 'hasta']) {
    $(id).min = fechaISO(primera);
    $(id).max = fechaISO(ultima);
  }
  $('desde').value = fechaISO(primera);
  $('hasta').value = fechaISO(ultima);
  const fmt = (f) => f.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  $('rango-chat').textContent = `El chat exportado va del ${fmt(primera)} al ${fmt(ultima)}.`;

  const lista = $('lista-tipos');
  lista.innerHTML = '';
  for (const [tipo, info] of Object.entries(TIPOS)) {
    const label = document.createElement('label');
    label.className = 'opcion';
    label.innerHTML = `<input type="checkbox" data-tipo="${tipo}" checked> <span>${info.etiqueta} <small data-cuenta="${tipo}"></small></span>`;
    lista.append(label);
  }

  $('paso-opciones').hidden = false;
  $('paso-guardar').hidden = false;
  $('final').hidden = true;
  actualizarResumen();
  $('paso-opciones').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function leerOpciones() {
  const desde = $('desde').value ? new Date(`${$('desde').value}T00:00:00`) : null;
  const hasta = $('hasta').value ? new Date(`${$('hasta').value}T23:59:59.999`) : null;
  const tipos = new Set(
    [...document.querySelectorAll('[data-tipo]')].filter((c) => c.checked).map((c) => c.dataset.tipo),
  );
  return {
    nombreChat: $('nombre-chat').value.trim(),
    yo: $('quien-soy').value,
    desde,
    hasta,
    tipos,
    enviados: $('incluir-enviados').checked,
    recibidos: $('incluir-recibidos').checked,
    conversacion: $('guardar-conversacion').checked,
    incluirSinMensaje: $('incluir-sin-mensaje').checked,
  };
}

function archivosDisponibles() {
  return [...estado.fuentes.entries()].map(([nombre, f]) => ({ nombre, tamanio: f.tamanio }));
}

function mensajesEnRango(opciones) {
  return estado.chat.mensajes.filter(
    (m) => (!opciones.desde || m.ts >= opciones.desde.getTime()) && (!opciones.hasta || m.ts <= opciones.hasta.getTime()),
  );
}

function actualizarResumen() {
  if (!estado.chat) return;
  const opciones = leerOpciones();
  const enRango = mensajesEnRango(opciones);
  const archivos = archivosDisponibles();

  $('vista-carpeta').textContent = `${CARPETA_RAIZ} / Chat con ${opciones.nombreChat || '…'}`;
  $('cuenta-mensajes').textContent = `(${enRango.length.toLocaleString('es')} mensajes)`;

  const resumen = resumenAdjuntos({ archivos, mensajes: enRango, yo: opciones.yo });
  for (const [tipo, r] of Object.entries(resumen.porTipo)) {
    const total = r.enviados + r.recibidos;
    $('lista-tipos').querySelector(`[data-cuenta="${tipo}"]`).textContent = total
      ? `(${r.enviados} enviados, ${r.recibidos} recibidos · ${formatoBytes(r.bytes)})`
      : '(ninguno)';
  }
  $('opcion-sin-mensaje').hidden = !resumen.sinMensaje;
  $('cuenta-sin-mensaje').textContent = `(${resumen.sinMensaje}) — van a "Otros archivos"`;

  const aviso = $('aviso-omitidos');
  aviso.hidden = !resumen.omitidos;
  aviso.textContent = archivos.length
    ? `${resumen.omitidos === 1 ? '1 archivo del chat no vino' : `${resumen.omitidos} archivos del chat no vinieron`} en la exportación (WhatsApp a veces no los incluye si ya no están en el teléfono).`
    : 'Este chat se exportó sin archivos: solo se puede guardar el texto. Para guardar audios y fotos, exportalo de nuevo eligiendo "Incluir archivos".';

  const plan = armarPlan({
    archivos, mensajes: enRango, participantes: estado.chat.participantes, opciones,
  });
  const bytes = plan.reduce((s, i) => s + (i.tamanio || 0), 0);
  estado.plan = plan;
  estado.mensajesElegidos = opciones.conversacion ? enRango : null;

  const faltaYo = !opciones.yo;
  const faltaNombre = !opciones.nombreChat;
  const nada = !plan.length && !opciones.conversacion;
  $('resumen').textContent = faltaYo
    ? 'Elegí cuál de los participantes sos vos para continuar.'
    : faltaNombre
      ? 'Escribí un nombre para el chat.'
      : nada
        ? 'No hay nada elegido para guardar.'
        : `Se van a guardar ${plan.length} archivos (${formatoBytes(bytes)})` +
          (opciones.conversacion ? ' y la conversación escrita.' : '.') +
          ' Lo que ya esté en tu Drive no se vuelve a subir.';
  $('boton-guardar').disabled = faltaYo || faltaNombre || nada;
}

// ---------- Paso 3: guardar ----------

let googleListo = null;

async function guardar() {
  if (!GOOGLE_CLIENT_ID) {
    mostrarFinal('<p class="error">Falta configurar el ID de cliente de Google en <code>js/config.js</code> (ver README).</p>');
    return;
  }
  const boton = $('boton-guardar');
  boton.disabled = true;
  try {
    await googleListo;
    if (!drive.conectado()) await drive.conectar();
  } catch (e) {
    mostrarFinal(`<p class="error">No se pudo conectar con Google: ${escapar(e.message)}</p>`);
    boton.disabled = false;
    return;
  }

  const opciones = leerOpciones();
  $('progreso').hidden = false;
  $('final').hidden = true;
  const barra = $('barra');
  barra.removeAttribute('value');

  try {
    const r = await guardarEnDrive({
      nombreChat: opciones.nombreChat,
      items: estado.plan,
      fuentes: estado.fuentes,
      mensajes: estado.mensajesElegidos,
      yo: opciones.yo,
      avisar: ({ etapa, hechos, total }) => {
        $('etapa').textContent = total ? `${etapa} ${hechos} de ${total}` : etapa;
        if (total) {
          barra.max = total;
          barra.value = hechos;
        }
      },
    });
    $('progreso').hidden = true;
    const errores = r.errores.length
      ? `<details class="error"><summary>${r.errores.length} archivos no se pudieron guardar</summary><ul>${r.errores
          .map((e) => `<li>${escapar(e)}</li>`)
          .join('')}</ul></details>`
      : '';
    mostrarFinal(`
      <p class="exito">¡Listo! Quedó guardado en tu Drive.</p>
      <ul>
        <li>${r.subidos} archivos nuevos guardados</li>
        <li>${r.repetidos} ya estaban guardados (no se duplicaron)</li>
        ${estado.mensajesElegidos ? `<li>${r.mensajesNuevos.toLocaleString('es')} mensajes nuevos en la conversación</li>` : ''}
      </ul>
      ${errores}
      <a class="boton" href="${r.carpeta}" target="_blank" rel="noopener">Abrir la carpeta en Drive</a>`);
  } catch (e) {
    $('progreso').hidden = true;
    mostrarFinal(`<p class="error">Se interrumpió el guardado: ${escapar(e.message)}. Podés volver a intentarlo: lo que ya se subió no se duplica.</p>`);
  }
  boton.disabled = false;
}

function mostrarFinal(html) {
  const final = $('final');
  final.innerHTML = html;
  final.hidden = false;
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Inicio ----------

$('entrada-archivo').addEventListener('change', (e) => cargarArchivos([...e.target.files]));

const zona = $('zona-archivo');
zona.addEventListener('dragover', (e) => {
  e.preventDefault();
  zona.classList.add('encima');
});
zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('encima');
  cargarArchivos([...e.dataTransfer.files]);
});

$('paso-opciones').addEventListener('input', actualizarResumen);
$('paso-opciones').addEventListener('change', actualizarResumen);
$('boton-guardar').addEventListener('click', guardar);

if (GOOGLE_CLIENT_ID) {
  googleListo = drive.iniciarGoogle(GOOGLE_CLIENT_ID);
  googleListo.catch(() => {});
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Archivos que llegaron desde "Compartir" de Android.
if (new URLSearchParams(location.search).has('compartido')) {
  history.replaceState(null, '', location.pathname);
  tomarCompartidos()
    .then((archivos) => {
      if (archivos.length) cargarArchivos(archivos);
      else mostrarCarga('No llegaron archivos desde WhatsApp. Probá elegirlos a mano.', true);
    })
    .catch(() => mostrarCarga('No pude leer lo que se compartió. Probá elegir el archivo a mano.', true));
}
