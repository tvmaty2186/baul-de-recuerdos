# Baúl de recuerdos

Guardá chats de WhatsApp en tu Google Drive, **ordenados y sin encriptar**, para no perder nunca esas conversaciones importantes.

La idea nació para guardar las últimas conversaciones con personas que ya no están: sus audios, sus fotos y sus mensajes, en un lugar seguro y fácil de abrir.

## Cómo funciona

1. En WhatsApp: **Exportar chat → Incluir archivos**.
2. En Android, compartís el chat directo a la app. En iPhone o en la PC, elegís el `.zip` desde la página.
3. Elegís qué guardar (conversación, audios, fotos, videos, documentos, stickers), de quién (enviados o recibidos) y el rango de fechas.
4. La app crea esto en tu Drive:

```
Baúl de recuerdos/
└── Chat con Mamá/
    ├── 01 - Conversación/
    │   ├── Conversación.html        ← se ve como WhatsApp: fotos, videos, audios y documentos
    │   ├── Conversación.txt
    │   └── _datos-conversacion.json ← la app lo usa para no duplicar mensajes
    ├── 02 - Audios recibidos/    03 - Audios enviados/
    ├── 04 - Fotos recibidas/     05 - Fotos enviadas/
    ├── 06 - Videos recibidos/    07 - Videos enviados/
    ├── 08 - Documentos recibidos/ 09 - Documentos enviados/
    ├── 10 - Stickers recibidos/  11 - Stickers enviados/
    └── 12 - Otros archivos/      ← solo si elegís guardar archivos sin mensaje asociado
```

Las carpetas van numeradas porque Drive siempre muestra las carpetas primero y las ordena por nombre: así la conversación queda arriba de todo. Los chats guardados con versiones anteriores se reacomodan solos la próxima vez que se guardan.

**Archivos sin mensaje asociado:** archivos que vinieron en la exportación pero que ningún mensaje del chat nombra. Normalmente no hay ninguno; si aparecen, no se sabe quién los mandó, por eso van aparte.

Los archivos se renombran con la fecha adelante (`2025-03-15 09.10 - PTT-20250315-WA0003.opus`) para que queden ordenados.

**Sin duplicados:** cada archivo guardado lleva su huella SHA-256. Si exportás el mismo chat otra vez, solo se sube lo nuevo y la conversación se completa con los mensajes que faltaban.

**Privacidad:** todo se procesa en el navegador y va directo a tu Drive. No hay servidor. La app usa el permiso `drive.file`, que solo le da acceso a lo que ella misma crea.

## Cómo funciona (animación)

`como-funciona.html` muestra un celular que recorre todo el proceso paso a paso: instalar la app, exportar un chat de WhatsApp y compartirlo a Baúl, y guardarlo y verlo. Se muestra sola la primera vez que alguien abre la app (con un botón para saltarla), después se abre desde "¿Cómo funciona?" en el inicio. El botón **Compartir** del inicio y del final de la animación manda el link de la app por WhatsApp u otra app (o lo copia, si el navegador no permite compartir).

## Mis chats guardados

Desde **Mis chats guardados** se ven todos los chats que guardaste y se abre la conversación dentro de la app, con los audios que se escuchan ahí mismo (se descargan de tu Drive al tocarlos). En iPhone, los audios .opus que el navegador no puede reproducir se abren en Drive.

## Configurar Google (una sola vez)

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) y creá un proyecto (por ejemplo "Baul de recuerdos").
2. **APIs y servicios → Biblioteca**: buscá **Google Drive API** y habilitala.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** (o "Google Auth Platform"):
   - Tipo de usuario: **Externo**.
   - Nombre de la app, correo de soporte y link a la política de privacidad (`https://<tu-sitio>/privacidad.html`).
   - **Permisos (scopes):** agregá solo `.../auth/drive.file`. No agregues ningún otro permiso de Drive: con `drive.file` la app se puede publicar sin límite de 100 usuarios ni lista de usuarios de prueba.
   - **Estado de publicación:** tocá **Publicar app** para pasarla a **En producción**.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - **Orígenes de JavaScript autorizados:** la dirección donde publiques la app, por ejemplo `https://tvmaty2186.github.io`. Para probar en la compu, agregá también `http://localhost:8080`.
5. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) y pegalo en `js/config.js`:

```js
export const GOOGLE_CLIENT_ID = '1234-abcd.apps.googleusercontent.com';
```

## Publicarla gratis con GitHub Pages

1. En el repo: **Settings → Pages → Build and deployment → Deploy from a branch**, y elegí `main` / `(root)`.
2. Queda en `https://tvmaty2186.github.io/baul-de-recuerdos/`.
3. En Android, abrila en Chrome y tocá **⋮ → Instalar app** (o "Agregar a la pantalla principal"). A partir de ahí aparece en **Compartir** cuando exportás un chat.

## Probar en la compu

```sh
npm start   # sirve la página en http://localhost:8080
npm test    # pruebas del lector de chats, el plan de carpetas y la conversación
```

No hay paso de compilación: son archivos HTML, CSS y JavaScript comunes.

## Limitaciones conocidas

- WhatsApp exporta como máximo unos 10.000 mensajes recientes con archivos (unos 40.000 sin archivos). En chats muy largos, los más viejos pueden no salir.
- iPhone no permite que una página web aparezca en "Compartir": hay que guardar el `.zip` en "Archivos" y elegirlo desde la página.
- Los chats muy grandes (varios GB) se leen en la memoria del teléfono; si falla, conviene hacerlo desde una computadora.
- El permiso de Google dura una hora. En guardados muy largos puede aparecer de nuevo la ventana de Google para renovarlo.

## Estructura del código

| Archivo | Qué hace |
|---|---|
| `js/parser.js` | Lee el `.txt` exportado (Android/iPhone, español/inglés/portugués, 24 h y AM/PM). |
| `js/plan.js` | Decide qué archivo va a qué carpeta y con qué nombre. |
| `js/conversacion.js` | Une mensajes sin duplicar y genera `Conversación.txt` y `.html`. |
| `js/drive.js` | Inicio de sesión con Google y llamadas a la API de Drive. |
| `js/guardar.js` | Sube todo, saltando lo que ya estaba guardado. |
| `js/miniaturas.js` | Genera las miniaturas de fotos y videos que se ven en `Conversación.html`. |
| `js/app.js` | Las pantallas: inicio, qué guardar, guardando, listo, mis chats y visor. |
| `js/lector.js` | Abre el .zip o el .txt exportado y encuentra la conversación. |
| `js/tutorial.js`, `css/tutorial.css` | La animación de "Cómo funciona". |
| `js/visor.js` | Lista los chats guardados y los muestra, reproduciendo los audios. |
| `sw.js`, `js/compartidos.js` | Reciben el chat desde "Compartir" en Android. |
