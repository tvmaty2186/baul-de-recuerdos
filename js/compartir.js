// Compartir la app con otra persona: menú de compartir del teléfono, o copiar el link.

const DIRECCION = new URL('./', location.href).href;
const TEXTO = 'Baúl de recuerdos: guardá los chats de WhatsApp de quien quieras, con sus audios y fotos, en tu Google Drive.';

function avisar(mensaje) {
  let aviso = document.getElementById('aviso-flotante');
  if (!aviso) {
    aviso = document.createElement('p');
    aviso.id = 'aviso-flotante';
    aviso.className = 'aviso-flotante';
    aviso.setAttribute('role', 'status');
    document.body.append(aviso);
  }
  aviso.textContent = mensaje;
  aviso.classList.add('visible');
  clearTimeout(avisar.reloj);
  avisar.reloj = setTimeout(() => aviso.classList.remove('visible'), 2600);
}

export async function compartirApp() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Baúl de recuerdos', text: TEXTO, url: DIRECCION });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // La persona cerró el menú.
    }
  }
  try {
    await navigator.clipboard.writeText(`${TEXTO} ${DIRECCION}`);
    avisar('Link copiado. Pegalo donde quieras.');
  } catch {
    avisar(DIRECCION);
  }
}

// Marca que esta persona ya vio "Cómo funciona", para no mostrárselo solo otra vez.
const CLAVE_TUTORIAL = 'baul-tutorial-visto';

export function tutorialVisto() {
  try {
    return Boolean(localStorage.getItem(CLAVE_TUTORIAL));
  } catch {
    return true; // Sin almacenamiento no se puede recordar: mejor no forzar la animación cada vez.
  }
}

export function marcarTutorialVisto() {
  try {
    localStorage.setItem(CLAVE_TUTORIAL, '1');
  } catch {}
}
