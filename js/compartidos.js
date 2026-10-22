// Archivos recibidos desde "Compartir" (Android). El service worker los deja en
// IndexedDB y la página los toma acá. Mismo esquema que en sw.js.

const BASE = 'baul-compartidos';
const ALMACEN = 'archivos';

function abrir() {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN, { autoIncrement: true });
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

// Devuelve los archivos guardados y los borra de IndexedDB.
export async function tomarCompartidos() {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite');
    const almacen = tx.objectStore(ALMACEN);
    const pedido = almacen.getAll();
    pedido.onsuccess = () => {
      almacen.clear();
      resolve(pedido.result.map(({ nombre, tipo, datos }) => new File([datos], nombre, { type: tipo })));
    };
    pedido.onerror = () => reject(pedido.error);
  });
}
