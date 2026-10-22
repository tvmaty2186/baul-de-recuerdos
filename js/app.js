import { GOOGLE_CLIENT_ID } from './config.js';
import { fechaISO } from './parser.js';
import { TIPOS, armarPlan, resumenAdjuntos } from './plan.js';
import { guardarEnDrive } from './guardar.js';
import { leerExportacion, formatoBytes } from './lector.js';
import { listarChats, abrirChat, cerrarChat } from './visor.js';
import * as drive from './drive.js';
import { tomarCompartidos } from './compartidos.js';
import { VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const numero = (n) => n.toLocaleString('es');

const estado = {
  fuentes: new Map(), // nombre -> { tamanio, leer() }
  chat: null, // { mensajes, participantes }
  yo: '',
  elegidos: new Set(), // 'conversacion', 'audio', 'foto', … , 'otros'
  quien: 'todos',
  plan: [],
  mensajesElegidos: null,
  conversacionGuardada: null,
};

// ---------- Navegación ----------

let pantallaActual = 'inicio';

function mostrar(nombre, { historial = 'push' } = {}) {
  for (const p of document.querySelectorAll('.pantalla')) p.hidden = p.dataset.pantalla !== nombre;
  if (pantallaActual === 'visor' && nombre !== 'visor') cerrarChat();
  pantallaActual = nombre;
  window.scrollTo(0, 0);
  if (historial === 'push') history.pushState({ pantalla: nombre }, '');
  if (historial === 'reemplazar') history.replaceState({ pantalla: nombre }, '');
}

window.addEventListener('popstate', (e) => {
  // Mientras se guarda no se puede volver atrás.
  if (pantallaActual === 'guardando') return history.pushState({ pantalla: 'guardando' }, '');
  const destino = e.state?.pantalla || 'inicio';
  mostrar(destino === 'guardando' ? 'opciones' : destino, { historial: 'nada' });
  if (destino === 'guardados') cargarGuardados();
});

for (const boton of document.querySelectorAll('[data-volver]')) {
  boton.addEventListener('click', () => {
    const destino = boton.dataset.volver;
    mostrar(destino, { historial: 'reemplazar' });
    if (destino === 'guardados') cargarGuardados();
  });
}

// ---------- Google ----------

let googleListo = null;

// Tiene que llamarse desde un toque del usuario: puede abrir la ventana de Google.
async function asegurarGoogle() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Falta configurar Google en js/config.js.');
  await googleListo;
  if (!drive.conectado()) await drive.conectar();
}

// ---------- Inicio: abrir el chat exportado ----------

function errorInicio(error) {
  $('cargando').hidden = true;
  $('error-carga').hidden = !error;
  if (!error) return;
  $('error-texto').textContent = error.message;
  $('error-detalle').textContent = `v${VERSION}. ${error.detalle || ''}`;
  $('error-carga').querySelector('details').hidden = !error.detalle;
}

async function cargarArchivos(lista) {
  if (!lista.length) return;
  errorInicio(null);
  $('cargando').hidden = false;
  try {
    const { fuentes, chat, nombreChat } = await leerExportacion(lista);
    estado.fuentes = fuentes;
    estado.chat = chat;
    $('cargando').hidden = true;
    prepararOpciones(nombreChat);
    mostrar('opciones');
  } catch (e) {
    errorInicio(e);
  } finally {
    $('entrada-archivo').value = '';
  }
}

// ---------- Qué guardar ----------

const ICONOS = { conversacion: 'charla', audio: 'audio', foto: 'foto', video: 'video', documento: 'documento', sticker: 'sticker', otros: 'otros' };
const NOMBRES = { conversacion: 'Conversación', ...Object.fromEntries(Object.entries(TIPOS).map(([t, i]) => [t, i.etiqueta])), otros: 'Sin mensaje' };

function recordarYo(nombre) {
  try {
    localStorage.setItem('baul-yo', nombre);
  } catch {}
}

function yoRecordado() {
  try {
    return localStorage.getItem('baul-yo') || '';
  } catch {
    return '';
  }
}

function prepararOpciones(nombreChat) {
  const { mensajes, participantes } = estado.chat;
  $('nombre-chat').value = nombreChat;

  // Quién es "yo": el nombre que eligió la última vez, o el otro participante si el chat
  // se llama como uno de los dos.
  const recordado = yoRecordado();
  estado.yo = participantes.includes(recordado)
    ? recordado
    : participantes.length === 2 && participantes.includes(nombreChat)
      ? participantes.find((p) => p !== nombreChat)
      : '';
  const chips = $('quien-soy');
  chips.innerHTML = '';
  for (const p of participantes) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.setAttribute('role', 'radio');
    chip.textContent = p;
    chip.addEventListener('click', () => {
      estado.yo = p;
      recordarYo(p);
      actualizar();
    });
    chips.append(chip);
  }

  const primera = new Date(mensajes[0].ts);
  const ultima = new Date(mensajes[mensajes.length - 1].ts);
  for (const id of ['desde', 'hasta']) {
    $(id).min = fechaISO(primera);
    $(id).max = fechaISO(ultima);
  }
  $('desde').value = fechaISO(primera);
  $('hasta').value = fechaISO(ultima);
  $('fechas').open = false;

  // Una baldosa por cada cosa que trae el chat. Todo elegido salvo los archivos sin mensaje.
  const total = resumenAdjuntos({ archivos: archivosDisponibles(), mensajes, yo: estado.yo });
  const disponibles = ['conversacion', ...Object.keys(TIPOS).filter((t) => total.porTipo[t].enviados + total.porTipo[t].recibidos)];
  if (total.sinMensaje) disponibles.push('otros');
  estado.elegidos = new Set(disponibles.filter((d) => d !== 'otros'));
  estado.quien = 'todos';

  const baldosas = $('baldosas');
  baldosas.innerHTML = '';
  for (const clave of disponibles) {
    const b = document.createElement('button');
    b.className = 'baldosa';
    b.dataset.baldosa = clave;
    b.innerHTML =
      `<svg aria-hidden="true"><use href="#i-${ICONOS[clave]}"/></svg>` +
      `<span class="marca" aria-hidden="true"><svg><use href="#i-check"/></svg></span>` +
      `<span class="cantidad">0</span>` +
      `<span class="detalle"><span class="nombre">${NOMBRES[clave]}</span><span class="peso"></span></span>`;
    b.addEventListener('click', () => {
      if (estado.elegidos.has(clave)) estado.elegidos.delete(clave);
      else estado.elegidos.add(clave);
      actualizar();
    });
    baldosas.append(b);
  }

  $('error-guardar').hidden = true;
  actualizar();
}

function archivosDisponibles() {
  return [...estado.fuentes.entries()].map(([nombre, f]) => ({ nombre, tamanio: f.tamanio }));
}

function rangoElegido() {
  const desde = $('desde').value ? new Date(`${$('desde').value}T00:00:00`) : null;
  const hasta = $('hasta').value ? new Date(`${$('hasta').value}T23:59:59.999`) : null;
  return { desde, hasta };
}

function textoFecha(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function actualizar() {
  if (!estado.chat) return;
  const { desde, hasta } = rangoElegido();
  const enRango = estado.chat.mensajes.filter(
    (m) => (!desde || m.ts >= desde.getTime()) && (!hasta || m.ts <= hasta.getTime()),
  );
  const archivos = archivosDisponibles();
  const enviados = estado.quien !== 'recibidos';
  const recibidos = estado.quien !== 'enviados';

  for (const chip of $('quien-soy').children) chip.setAttribute('aria-checked', String(chip.textContent === estado.yo));
  for (const s of document.querySelectorAll('[data-quien]')) s.setAttribute('aria-checked', String(s.dataset.quien === estado.quien));

  const todoElChat = $('desde').value === $('desde').min && $('hasta').value === $('hasta').max;
  $('resumen-fechas').textContent = todoElChat ? 'Todo el chat' : `${textoFecha($('desde').value)} – ${textoFecha($('hasta').value)}`;

  // Cantidades de cada baldosa según quién sos, de quién y las fechas.
  const resumen = resumenAdjuntos({ archivos, mensajes: enRango, yo: estado.yo });
  for (const b of $('baldosas').children) {
    const clave = b.dataset.baldosa;
    b.setAttribute('aria-pressed', String(estado.elegidos.has(clave)));
    let cantidad = 0;
    let bytes = 0;
    if (clave === 'conversacion') {
      cantidad = enRango.length;
    } else if (clave === 'otros') {
      cantidad = resumen.sinMensaje;
    } else {
      const r = resumen.porTipo[clave];
      cantidad = (enviados ? r.enviados : 0) + (recibidos ? r.recibidos : 0);
      bytes = cantidad ? r.bytes * (cantidad / (r.enviados + r.recibidos || 1)) : 0;
    }
    b.querySelector('.cantidad').textContent = numero(cantidad);
    b.querySelector('.peso').textContent = bytes ? formatoBytes(bytes) : '';
  }

  const aviso = $('aviso-omitidos');
  aviso.hidden = archivos.length > 0 && !resumen.omitidos;
  aviso.textContent = !archivos.length
    ? 'Se exportó sin archivos: solo se guarda el texto.'
    : resumen.omitidos === 1
      ? '1 archivo no vino en la exportación.'
      : `${numero(resumen.omitidos)} archivos no vinieron en la exportación.`;

  const tipos = new Set([...estado.elegidos].filter((e) => TIPOS[e]));
  estado.plan = armarPlan({
    archivos,
    mensajes: enRango,
    participantes: estado.chat.participantes,
    opciones: { yo: estado.yo, tipos, enviados, recibidos, desde, hasta, incluirSinMensaje: estado.elegidos.has('otros') },
  });
  estado.mensajesElegidos = estado.elegidos.has('conversacion') ? enRango : null;

  const boton = $('boton-guardar');
  const bytes = estado.plan.reduce((s, i) => s + (i.tamanio || 0), 0);
  const nombre = $('nombre-chat').value.trim();
  if (!estado.yo) boton.textContent = 'Elegí quién sos vos';
  else if (!nombre) boton.textContent = 'Poné un nombre al chat';
  else if (!estado.plan.length && !estado.mensajesElegidos) boton.textContent = 'Elegí qué guardar';
  else if (!estado.plan.length) boton.textContent = 'Guardar la conversación';
  else boton.textContent = `Guardar ${numero(estado.plan.length)} archivos · ${formatoBytes(bytes)}`;
  boton.disabled = !estado.yo || !nombre || (!estado.plan.length && !estado.mensajesElegidos);
}

for (const s of document.querySelectorAll('[data-quien]')) {
  s.addEventListener('click', () => {
    estado.quien = s.dataset.quien;
    actualizar();
  });
}
for (const id of ['desde', 'hasta', 'nombre-chat']) $(id).addEventListener('input', actualizar);

// ---------- Guardar ----------

async function guardar() {
  const nombreChat = $('nombre-chat').value.trim();
  $('error-guardar').hidden = true;
  try {
    await asegurarGoogle();
  } catch (e) {
    $('error-guardar').textContent = `No se pudo conectar con Google. ${e.message}`;
    $('error-guardar').hidden = false;
    return;
  }

  mostrar('guardando', { historial: 'reemplazar' });
  $('guardando-titulo').textContent = `Guardando el chat con ${nombreChat}`;
  $('hechos').textContent = '0';
  $('total').textContent = numero(estado.plan.length);
  $('progreso').style.width = '0';
  $('progreso').parentElement.classList.add('indeterminada');

  try {
    const r = await guardarEnDrive({
      nombreChat,
      items: estado.plan,
      fuentes: estado.fuentes,
      mensajes: estado.mensajesElegidos,
      yo: estado.yo,
      avisar: ({ etapa, hechos, total }) => {
        $('etapa').textContent = etapa;
        if (total) {
          $('progreso').parentElement.classList.remove('indeterminada');
          $('hechos').textContent = numero(hechos);
          $('progreso').style.width = `${(hechos / total) * 100}%`;
        }
      },
    });
    mostrarListo(nombreChat, r);
  } catch (e) {
    mostrar('opciones', { historial: 'reemplazar' });
    $('error-guardar').textContent = `Se cortó: ${e.message}. Probá de nuevo; lo que ya se subió no se repite.`;
    $('error-guardar').hidden = false;
  }
}

function mostrarListo(nombreChat, r) {
  const cifras = [
    [r.subidos, r.subidos === 1 ? 'archivo nuevo' : 'archivos nuevos'],
    [r.repetidos, 'ya estaban guardados'],
  ];
  if (estado.mensajesElegidos) cifras.push([r.mensajesNuevos, r.mensajesNuevos === 1 ? 'mensaje nuevo' : 'mensajes nuevos']);
  $('listo-titulo').textContent = 'Guardado';
  $('cifras').innerHTML = cifras
    .filter(([n], i) => n || i === 0)
    .map(([n, texto]) => `<li><b>${numero(n)}</b> ${texto}</li>`)
    .join('');
  $('listo-errores').innerHTML = r.errores.length
    ? `<details><summary>${r.errores.length} archivos no se pudieron guardar</summary><ul>${r.errores
        .map((e) => `<li>${escapar(e)}</li>`)
        .join('')}</ul></details>`
    : '';
  $('abrir-drive').href = r.carpeta;
  estado.conversacionGuardada = r.conversacion ? { id: r.conversacion, nombre: nombreChat } : null;
  $('ver-guardado').hidden = !estado.conversacionGuardada;
  mostrar('listo', { historial: 'reemplazar' });
}

// ---------- Mis chats y visor ----------

async function cargarGuardados() {
  const lista = $('lista-chats');
  const aviso = $('guardados-estado');
  lista.innerHTML = '';
  aviso.textContent = 'Buscando tus chats…';
  try {
    const chats = await listarChats();
    aviso.textContent = chats.length ? '' : 'Todavía no guardaste ningún chat.';
    for (const chat of chats) {
      const li = document.createElement('li');
      li.innerHTML =
        `<button><span class="inicial">${escapar(chat.nombre.trim()[0]?.toUpperCase() || '·')}</span>` +
        `<span><span class="nombre">${escapar(chat.nombre)}</span>` +
        `<span class="fecha">Guardado el ${chat.fecha.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span></span></button>`;
      li.querySelector('button').addEventListener('click', () => verChat(chat));
      lista.append(li);
    }
  } catch (e) {
    aviso.textContent = `No pude traer tus chats: ${e.message}`;
  }
}

async function verChat({ id, nombre }) {
  $('visor-titulo').textContent = nombre;
  mostrar('visor');
  try {
    await abrirChat(id, $('visor-marco'));
  } catch (e) {
    $('visor-marco').srcdoc = `<p style="font-family:sans-serif;padding:20px">No pude abrir el chat: ${escapar(e.message)}</p>`;
  }
}

$('ir-guardados').addEventListener('click', async () => {
  errorInicio(null);
  try {
    await asegurarGoogle();
  } catch (e) {
    errorInicio(new Error(`No se pudo conectar con Google. ${e.message}`));
    return;
  }
  mostrar('guardados');
  cargarGuardados();
});

$('ver-guardado').addEventListener('click', async () => {
  history.replaceState({ pantalla: 'guardados' }, '');
  await verChat(estado.conversacionGuardada);
});

// ---------- Inicio ----------

$('version').textContent = `v${VERSION}`;
$('entrada-archivo').addEventListener('change', (e) => cargarArchivos([...e.target.files]));
$('boton-guardar').addEventListener('click', guardar);
$('abrir-ayuda').addEventListener('click', () => $('ayuda').showModal());
$('ayuda').addEventListener('click', (e) => {
  if (e.target === $('ayuda')) $('ayuda').close();
});

// En la compu se puede soltar el zip en cualquier parte de la pantalla de inicio.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (pantallaActual === 'inicio') cargarArchivos([...e.dataTransfer.files]);
});

if (GOOGLE_CLIENT_ID) {
  googleListo = drive.iniciarGoogle(GOOGLE_CLIENT_ID);
  googleListo.catch(() => {});
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}

history.replaceState({ pantalla: 'inicio' }, '');

// Archivos que llegaron desde "Compartir" de Android.
if (new URLSearchParams(location.search).has('compartido')) {
  history.replaceState({ pantalla: 'inicio' }, '', location.pathname);
  tomarCompartidos()
    .then((archivos) => {
      if (archivos.length) cargarArchivos(archivos);
      else errorInicio(new Error('No llegó ningún archivo desde WhatsApp. Probá elegirlo a mano.'));
    })
    .catch(() => errorInicio(new Error('No pude leer lo que se compartió. Probá elegirlo a mano.')));
}
