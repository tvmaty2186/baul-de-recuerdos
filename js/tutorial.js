// Animación de "Cómo funciona": un celular que recorre instalar, exportar y guardar.
// Cada paso arma su escena desde cero, así se puede saltar a cualquiera.

import { compartirApp, marcarTutorialVisto } from './compartir.js';

const $ = (s) => document.querySelector(s);
const pantalla = $('#pantalla-cel');
const dedo = $('#dedo');

const PARTES = ['Instalar', 'Exportar', 'Guardar y ver'];

class Cancelado extends Error {}
let corrida = 0;
let pausado = false;

// Espera que respeta la pausa y se corta si el usuario cambió de paso.
async function espera(ms) {
  const mia = corrida;
  let restante = ms;
  while (restante > 0) {
    await new Promise((r) => setTimeout(r, 50));
    if (mia !== corrida) throw new Cancelado();
    if (!pausado) restante -= 50;
  }
}

function moverDedo(el) {
  const caja = pantalla.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const escala = caja.width / pantalla.offsetWidth;
  dedo.style.setProperty('--x', `${(r.left + r.width / 2 - caja.left) / escala}px`);
  dedo.style.setProperty('--y', `${(r.top + r.height / 2 - caja.top) / escala}px`);
}

async function tocar(selector) {
  const el = $(selector);
  moverDedo(el);
  await espera(650);
  dedo.classList.remove('toca');
  void dedo.offsetWidth;
  dedo.classList.add('toca');
  el.classList.add('presionado');
  await espera(260);
  el.classList.remove('presionado');
  await espera(200);
}

const mostrarCapa = (selector, visible = true) => $(selector).classList.toggle('visible', visible);

// Deja todo como al principio: capas cerradas, nada marcado.
function reiniciar() {
  for (const c of pantalla.querySelectorAll('.capa')) c.classList.remove('visible');
  $('#icono-baul').classList.remove('aparece');
  $('#a-yo').classList.remove('activo');
  $('#a-stickers').classList.add('on');
  $('#a-guardar').textContent = 'Guardar 145 archivos · 38 MB';
  $('#a-hechos').textContent = '0';
  $('#a-barra').style.width = '0';
  $('#v-play').textContent = '▶';
  $('#v-tiempo').textContent = '0:14';
  for (const b of document.querySelectorAll('#v-onda i')) b.classList.remove('oida');
  dedo.style.setProperty('--y', '600px');
}

const PASOS = [
  {
    parte: 0, escena: 'chrome',
    texto: 'Abrí la app en Chrome.',
    run: () => espera(1800),
  },
  {
    parte: 0, escena: 'chrome',
    texto: 'Tocá ⋮ y después “Instalar app”.',
    async run() {
      await tocar('#ch-menu-btn');
      mostrarCapa('#ch-menu');
      await espera(500);
      await tocar('#ch-instalar');
    },
  },
  {
    parte: 0, escena: 'chrome', preparar: () => mostrarCapa('#ch-dialogo'),
    texto: 'Confirmá con “Instalar”.',
    async run() {
      await espera(400);
      await tocar('#ch-instalar-ok');
    },
  },
  {
    parte: 0, escena: 'escritorio',
    texto: 'Listo: Baúl queda junto a tus apps.',
    async run() {
      await espera(400);
      $('#icono-baul').classList.add('aparece');
      await espera(1800);
    },
  },
  {
    parte: 1, escena: 'wsp',
    texto: 'En WhatsApp, abrí el chat y tocá ⋮.',
    async run() {
      await espera(700);
      await tocar('#w-menu-btn');
      mostrarCapa('#w-menu');
      await espera(500);
    },
  },
  {
    parte: 1, escena: 'wsp', preparar: () => mostrarCapa('#w-menu'),
    texto: 'Tocá “Más” y después “Exportar chat”.',
    async run() {
      await tocar('#w-mas');
      mostrarCapa('#w-menu', false);
      mostrarCapa('#w-sub');
      await espera(500);
      await tocar('#w-exportar');
    },
  },
  {
    parte: 1, escena: 'wsp', preparar: () => mostrarCapa('#w-dialogo'),
    texto: 'Elegí “Incluir archivos”, así se guardan los audios y las fotos.',
    async run() {
      await espera(900);
      await tocar('#w-incluir');
    },
  },
  {
    parte: 1, escena: 'wsp', preparar: () => mostrarCapa('#compartir'),
    texto: 'En “Compartir”, elegí Baúl.',
    async run() {
      await espera(800);
      await tocar('#c-baul');
    },
  },
  {
    parte: 2, escena: 'opciones',
    texto: 'Elegí quién sos vos. La app lo recuerda.',
    async run() {
      await espera(600);
      await tocar('#a-yo');
      $('#a-yo').classList.add('activo');
      await espera(600);
    },
  },
  {
    parte: 2, escena: 'opciones', preparar: () => $('#a-yo').classList.add('activo'),
    texto: 'Marcá lo que querés guardar.',
    async run() {
      await espera(400);
      await tocar('#a-stickers');
      $('#a-stickers').classList.remove('on');
      $('#a-guardar').textContent = 'Guardar 133 archivos · 37 MB';
      await espera(900);
    },
  },
  {
    parte: 2, escena: 'opciones',
    preparar() {
      $('#a-yo').classList.add('activo');
      $('#a-stickers').classList.remove('on');
      $('#a-guardar').textContent = 'Guardar 133 archivos · 37 MB';
    },
    texto: 'Tocá “Guardar”.',
    async run() {
      await espera(400);
      await tocar('#a-guardar');
    },
  },
  {
    parte: 2, escena: 'google',
    texto: 'La primera vez, elegí tu cuenta de Google y tocá “Continuar”.',
    async run() {
      await espera(500);
      await tocar('#g-cuenta');
      mostrarCapa('#g-permiso');
      await espera(1100);
      await tocar('#g-permitir');
    },
  },
  {
    parte: 2, escena: 'guardando',
    texto: 'Se guarda en tu Drive. Dejá la app abierta hasta que termine.',
    async run() {
      const total = 133;
      for (let i = 0; i <= 40; i++) {
        const n = Math.round((total * i) / 40);
        $('#a-hechos').textContent = n;
        $('#a-barra').style.width = `${(n / total) * 100}%`;
        await espera(65);
      }
      await espera(500);
    },
    preparar: () => ($('.a-contador small').textContent = ' / 133'),
  },
  {
    parte: 2, escena: 'listo',
    texto: '¡Guardado! Tocá “Ver el chat”.',
    async run() {
      await espera(1000);
      await tocar('#a-ver');
    },
  },
  {
    parte: 2, escena: 'visor',
    texto: 'Sus mensajes y sus audios, para escuchar cuando quieras.',
    async run() {
      await espera(600);
      await tocar('#v-audio b');
      $('#v-play').textContent = '❚❚';
      const barras = [...document.querySelectorAll('#v-onda i')];
      for (let i = 0; i <= barras.length; i++) {
        barras.forEach((b, j) => b.classList.toggle('oida', j < i));
        $('#v-tiempo').textContent = `0:${String(Math.round((14 * i) / barras.length)).padStart(2, '0')}`;
        await espera(90);
      }
      $('#v-play').textContent = '▶';
      await espera(400);
    },
  },
  {
    parte: 2, escena: 'fin',
    texto: 'Tus recuerdos, a salvo en tu Drive.',
    run: () => espera(2600),
  },
];

let actual = 0;

function pintarControles() {
  $('#numero').textContent = `Paso ${actual + 1} de ${PASOS.length} · ${PARTES[PASOS[actual].parte]}`;
  $('#texto').textContent = PASOS[actual].texto;
  for (const b of document.querySelectorAll('[data-parte]')) {
    b.setAttribute('aria-current', String(Number(b.dataset.parte) === PASOS[actual].parte));
  }
  $('#icono-pausa').innerHTML = pausado ? '<path d="M8 5v14l11-7z"/>' : '<path d="M9 6v12M15 6v12"/>';
  $('#pausa').setAttribute('aria-label', pausado ? 'Seguir' : 'Pausar');
}

async function irA(indice) {
  actual = (indice + PASOS.length) % PASOS.length;
  const mia = ++corrida;
  const paso = PASOS[actual];
  reiniciar();
  paso.preparar?.();
  for (const e of pantalla.querySelectorAll('.esc')) e.classList.toggle('visible', e.dataset.escena === paso.escena);
  pantalla.classList.toggle('barra-clara', paso.escena === 'wsp' || paso.escena === 'escritorio');
  pintarControles();
  try {
    await espera(350);
    await paso.run();
    await espera(700);
  } catch (e) {
    if (e instanceof Cancelado) return;
    throw e;
  }
  if (mia === corrida) irA(actual + 1);
}

// Achica el celular para que entre en pantallas chicas.
function ajustarEscala() {
  const alto = window.innerHeight - 290;
  const ancho = window.innerWidth - 32;
  const escala = Math.max(0.55, Math.min(1, alto / 580, ancho / 280));
  document.documentElement.style.setProperty('--escala', escala.toFixed(3));
}

// Barras de la onda del audio del visor.
const onda = $('#v-onda');
for (const h of [4, 7, 5, 9, 6, 8, 3, 7, 9, 5, 6, 8, 4, 7, 9, 6, 5, 8, 7, 4, 6, 9, 5, 3]) {
  const i = document.createElement('i');
  i.style.height = `${h * 10}%`;
  onda.append(i);
}

$('#pausa').addEventListener('click', () => {
  pausado = !pausado;
  pintarControles();
});
$('#anterior').addEventListener('click', () => irA(actual - 1));
$('#siguiente').addEventListener('click', () => irA(actual + 1));
for (const b of document.querySelectorAll('[data-parte]')) {
  b.addEventListener('click', () => irA(PASOS.findIndex((p) => p.parte === Number(b.dataset.parte))));
}
window.addEventListener('resize', ajustarEscala);

$('#compartir-app').addEventListener('click', compartirApp);

// Primera visita: se ofrece saltar la animación y el botón final invita a empezar.
marcarTutorialVisto();
if (new URLSearchParams(location.search).has('primera')) {
  $('#saltar').hidden = false;
  $('#ir-app').textContent = 'Empezar';
}

ajustarEscala();
irA(0);
