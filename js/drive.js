// Acceso a Google Drive con el permiso drive.file: la app solo ve lo que ella misma creó.

const API = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
const CARPETA = 'application/vnd.google-apps.folder';
export const ALCANCE = 'https://www.googleapis.com/auth/drive.file';

let clienteToken = null;
let token = null;
let venceEn = 0;

export function iniciarGoogle(clientId) {
  return new Promise((resolve, reject) => {
    const listo = () => {
      clienteToken = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: ALCANCE,
        callback: () => {},
      });
      resolve();
    };
    if (window.google?.accounts?.oauth2) return listo();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = listo;
    script.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google.'));
    document.head.appendChild(script);
  });
}

// Pide (o renueva) el permiso. La primera vez tiene que llamarse desde un clic.
export function conectar({ forzarPantalla = false } = {}) {
  return new Promise((resolve, reject) => {
    clienteToken.callback = (respuesta) => {
      if (respuesta.error) return reject(new Error(respuesta.error_description || respuesta.error));
      if (!google.accounts.oauth2.hasGrantedAllScopes(respuesta, ALCANCE)) {
        return reject(new Error('Hace falta permitir el acceso a Drive para poder guardar.'));
      }
      token = respuesta.access_token;
      venceEn = Date.now() + (Number(respuesta.expires_in) - 120) * 1000;
      resolve();
    };
    clienteToken.error_callback = (e) => reject(new Error(e?.message || 'Se cerró la ventana de Google.'));
    clienteToken.requestAccessToken({ prompt: forzarPantalla ? 'consent' : '' });
  });
}

export const conectado = () => Boolean(token);

async function pedir(url, opciones = {}, intento = 0) {
  if (Date.now() > venceEn) await conectar();
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { ...opciones.headers, Authorization: `Bearer ${token}` },
  });
  if (respuesta.status === 401 && intento === 0) {
    venceEn = 0;
    return pedir(url, opciones, intento + 1);
  }
  if ((respuesta.status === 429 || respuesta.status >= 500) && intento < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** intento));
    return pedir(url, opciones, intento + 1);
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Drive respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }
  return respuesta;
}

const comillas = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function buscarOCrearCarpeta(nombre, padre = 'root') {
  const q = `name='${comillas(nombre)}' and mimeType='${CARPETA}' and '${padre}' in parents and trashed=false`;
  const r = await pedir(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const { files } = await r.json();
  if (files.length) return files[0].id;
  const creada = await pedir(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
  });
  return (await creada.json()).id;
}

// Todos los archivos que la app ya guardó para un chat (marcados con appProperties).
export async function archivosDelChat(claveChat) {
  const q = `appProperties has { key='baul_chat' and value='${claveChat}' } and trashed=false`;
  const lista = [];
  let pagina = '';
  do {
    const url = `${API}/files?q=${encodeURIComponent(q)}&pageSize=1000` +
      `&fields=nextPageToken,files(id,name,parents,appProperties,webViewLink)` +
      (pagina ? `&pageToken=${pagina}` : '');
    const datos = await (await pedir(url)).json();
    lista.push(...datos.files);
    pagina = datos.nextPageToken || '';
  } while (pagina);
  return lista;
}

export async function carpetasDentroDe(padre) {
  const q = `mimeType='${CARPETA}' and '${padre}' in parents and trashed=false`;
  const r = await pedir(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`);
  return (await r.json()).files;
}

export async function renombrar(id, nombre) {
  await pedir(`${API}/files/${id}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre }),
  });
}

export async function mover(id, desde, hacia) {
  await pedir(`${API}/files/${id}?addParents=${hacia}&removeParents=${desde}&fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export async function subirArchivo({ nombre, padre, mime, contenido, propiedades }) {
  const inicio = await pedir(`${SUBIDA}/files?uploadType=resumable&fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime },
    body: JSON.stringify({ name: nombre, parents: [padre], mimeType: mime, appProperties: propiedades }),
  });
  const destino = inicio.headers.get('Location');
  const r = await pedir(destino, { method: 'PUT', headers: { 'Content-Type': mime }, body: contenido });
  return r.json();
}

export async function reemplazarContenido(id, mime, contenido) {
  const r = await pedir(`${SUBIDA}/files/${id}?uploadType=media&fields=id,webViewLink`, {
    method: 'PATCH',
    headers: { 'Content-Type': mime },
    body: contenido,
  });
  return r.json();
}

export async function leerTexto(id) {
  return (await pedir(`${API}/files/${id}?alt=media`)).text();
}

export const enlaceCarpeta = (id) => `https://drive.google.com/drive/folders/${id}`;
export const enlaceArchivo = (id) => `https://drive.google.com/file/d/${id}/view`;
