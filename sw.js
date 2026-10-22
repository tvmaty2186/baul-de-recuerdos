// Service worker: recibe lo que se comparte desde WhatsApp (Android) y lo pasa a la página.

const BASE = 'baul-compartidos';
const ALMACEN = 'archivos';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function guardar(archivos) {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN, { autoIncrement: true });
    pedido.onerror = () => reject(pedido.error);
    pedido.onsuccess = () => {
      const tx = pedido.result.transaction(ALMACEN, 'readwrite');
      const almacen = tx.objectStore(ALMACEN);
      almacen.clear();
      for (const f of archivos) almacen.add({ nombre: f.name, tipo: f.type, datos: f });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  // Archivos de la app: siempre preguntar al servidor si hay una versión nueva,
  // para que el teléfono no siga usando una copia vieja guardada.
  if (evento.request.method === 'GET' && url.origin === self.location.origin) {
    evento.respondWith(fetch(evento.request, { cache: 'no-cache' }));
    return;
  }
  if (evento.request.method !== 'POST' || !url.pathname.endsWith('/compartir')) return;
  evento.respondWith(
    (async () => {
      const datos = await evento.request.formData();
      const archivos = datos.getAll('archivos').filter((f) => f instanceof File);
      await guardar(archivos);
      return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
    })(),
  );
});
