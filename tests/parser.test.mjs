import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearChat, nombreDesdeArchivo, detectarOrdenFecha } from '../js/parser.js';
import { armarPlan, resumenAdjuntos, tipoDeArchivo, fechaDesdeNombre } from '../js/plan.js';
import { unirMensajes, conversacionTexto, conversacionHtml } from '../js/conversacion.js';

const ANDROID_ES = `14/3/25, 21:05 - Los mensajes y las llamadas están cifrados de extremo a extremo.
14/3/25, 21:05 - Mamá: Hola hijo
¿Cómo estás?
14/3/25, 21:06 - Matías: Bien ma
15/3/25, 09:10 - Mamá: ‎PTT-20250315-WA0003.opus (archivo adjunto)
15/3/25, 09:12 - Matías: IMG-20250315-WA0004.jpg (archivo adjunto)
Mirá esta foto
15/3/25, 09:15 - Mamá: <Multimedia omitido>
`;

const ANDROID_EN_12H = `3/14/25, 9:05 PM - Mom: Hi
3/14/25, 12:30 AM - Me: Late night
3/15/25, 12:01 PM - Mom: VID-20250315-WA0001.mp4 (file attached)
`;

const IPHONE_ES = `‎[14/3/25, 21:05:33] Mamá: Hola
[14/3/25, 21:06:01] Matías: ‎<adjunto: 00000012-PHOTO-2025-03-14-21-06-01.jpg>
[20/3/25, 8:00:00] Mamá: ‎<adjunto: 00000013-AUDIO-2025-03-20-08-00-00.opus>
`;

test('Android en español: autores, multilínea, adjuntos y avisos', () => {
  const { mensajes, participantes, ordenFecha } = parsearChat(ANDROID_ES);
  assert.equal(ordenFecha, 'DMA');
  assert.deepEqual(participantes.sort(), ['Mamá', 'Matías']);
  assert.equal(mensajes.length, 6);
  assert.equal(mensajes[0].autor, null);
  assert.equal(mensajes[1].texto, 'Hola hijo\n¿Cómo estás?');
  assert.equal(mensajes[3].adjunto, 'PTT-20250315-WA0003.opus');
  assert.equal(mensajes[3].texto, '');
  assert.equal(mensajes[4].adjunto, 'IMG-20250315-WA0004.jpg');
  assert.equal(mensajes[4].texto, 'Mirá esta foto');
  assert.equal(mensajes[5].omitido, true);
  const d = new Date(mensajes[1].ts);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2025, 2, 14, 21, 5]);
});

test('Android en inglés con AM/PM y fechas mes/día', () => {
  const { mensajes, ordenFecha } = parsearChat(ANDROID_EN_12H);
  assert.equal(ordenFecha, 'MDA');
  assert.equal(new Date(mensajes[0].ts).getHours(), 21);
  assert.equal(new Date(mensajes[1].ts).getHours(), 0);
  assert.equal(new Date(mensajes[2].ts).getHours(), 12);
  assert.equal(new Date(mensajes[0].ts).getDate(), 14);
  assert.equal(mensajes[2].adjunto, 'VID-20250315-WA0001.mp4');
});

test('iPhone en español con corchetes y <adjunto:>', () => {
  const { mensajes } = parsearChat(IPHONE_ES);
  assert.equal(mensajes.length, 3);
  assert.equal(mensajes[0].autor, 'Mamá');
  assert.equal(mensajes[1].adjunto, '00000012-PHOTO-2025-03-14-21-06-01.jpg');
  assert.equal(new Date(mensajes[0].ts).getSeconds(), 33);
});

test('fechas ambiguas se toman como día/mes', () => {
  assert.equal(detectarOrdenFecha(['1/2/25, 10:00 - A: x', '3/4/25, 10:00 - A: y']), 'DMA');
});

test('nombre del chat desde el archivo', () => {
  assert.equal(nombreDesdeArchivo('Chat de WhatsApp con Mamá.txt'), 'Mamá');
  assert.equal(nombreDesdeArchivo('WhatsApp Chat with Mom.zip'), 'Mom');
  assert.equal(nombreDesdeArchivo('Chat de WhatsApp - Mamá.zip'), 'Mamá');
  assert.equal(nombreDesdeArchivo('Conversa do WhatsApp com Mãe.txt'), 'Mãe');
  assert.equal(nombreDesdeArchivo('_chat.txt'), null);
});

test('tipos y fechas en nombres de archivo', () => {
  assert.equal(tipoDeArchivo('PTT-20250315-WA0003.opus'), 'audio');
  assert.equal(tipoDeArchivo('IMG-1.JPG'), 'foto');
  assert.equal(tipoDeArchivo('STK-1.webp'), 'sticker');
  assert.equal(tipoDeArchivo('receta.pdf'), 'documento');
  assert.equal(fechaDesdeNombre('IMG-20250315-WA0004.jpg').getDate(), 15);
  assert.equal(fechaDesdeNombre('00000012-PHOTO-2025-03-14-21-06-01.jpg').getMinutes(), 6);
});

const archivos = [
  { nombre: 'PTT-20250315-WA0003.opus', tamanio: 1000 },
  { nombre: 'IMG-20250315-WA0004.jpg', tamanio: 2000 },
  { nombre: 'IMG-20250101-WA0001.jpg', tamanio: 500 },
];

function opciones(cambios = {}) {
  return {
    yo: 'Matías', tipos: new Set(['audio', 'foto', 'video', 'documento', 'sticker']),
    enviados: true, recibidos: true, desde: null, hasta: null, incluirSinMensaje: false, ...cambios,
  };
}

test('el plan separa enviados y recibidos y pone la fecha en el nombre', () => {
  const chat = parsearChat(ANDROID_ES);
  const plan = armarPlan({ archivos, ...chat, opciones: opciones() });
  assert.equal(plan.length, 2);
  const audio = plan.find((i) => i.tipo === 'audio');
  assert.equal(audio.carpeta, 'Audios recibidos');
  assert.equal(audio.nombre, '2025-03-15 09.10 - PTT-20250315-WA0003.opus');
  assert.equal(plan.find((i) => i.tipo === 'foto').carpeta, 'Fotos enviadas');
});

test('el plan respeta tipos, dirección, fechas y archivos sin mensaje', () => {
  const chat = parsearChat(ANDROID_ES);
  const plan = (o) => armarPlan({ archivos, ...chat, opciones: opciones(o) });
  assert.equal(plan({ tipos: new Set(['audio']) }).length, 1);
  assert.equal(plan({ recibidos: false }).length, 1);
  assert.equal(plan({ hasta: new Date(2025, 2, 14, 23, 59) }).length, 0);
  const conSueltos = plan({ incluirSinMensaje: true });
  assert.equal(conSueltos.length, 3);
  assert.equal(conSueltos[2].carpeta, 'Otros archivos');
});

test('resumen cuenta adjuntos y omitidos', () => {
  const chat = parsearChat(ANDROID_ES);
  const r = resumenAdjuntos({ archivos, mensajes: chat.mensajes, yo: 'Matías' });
  assert.equal(r.porTipo.audio.recibidos, 1);
  assert.equal(r.porTipo.foto.enviados, 1);
  assert.equal(r.omitidos, 1);
  assert.equal(r.sinMensaje, 1);
});

test('unir mensajes de dos exportaciones no duplica', () => {
  const a = parsearChat(ANDROID_ES).mensajes;
  const b = parsearChat(ANDROID_ES + '16/3/25, 10:00 - Mamá: Te quiero\n').mensajes;
  const primero = unirMensajes([], a.slice(0, 3));
  assert.equal(primero.agregados, 3);
  const segundo = unirMensajes(primero.mensajes, b);
  assert.equal(segundo.agregados, b.length - 3);
  assert.equal(segundo.mensajes.at(-1).texto, 'Te quiero');
});

test('la conversación se genera en texto y html', () => {
  const { mensajes } = parsearChat(ANDROID_ES);
  const txt = conversacionTexto(mensajes);
  assert.match(txt, /14\/03\/2025 21:05 - Mamá: Hola hijo\n¿Cómo estás\?/);
  assert.match(txt, /\[archivo: PTT-20250315-WA0003\.opus\]/);
  const html = conversacionHtml({
    titulo: 'Chat con Mamá <3', mensajes, yo: 'Matías',
    enlaces: new Map([['PTT-20250315-WA0003.opus', { url: 'https://drive.google.com/file/d/x/view', tipo: 'audio' }]]),
  });
  assert.match(html, /Chat con Mamá &lt;3/);
  assert.match(html, /href="https:\/\/drive.google.com\/file\/d\/x\/view"/);
  assert.match(html, /class="msj mio"/);
});
