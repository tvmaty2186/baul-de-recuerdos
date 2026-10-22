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
    ├── Conversación.txt
    ├── Conversación.html        ← se ve como WhatsApp, con links a cada audio y foto
    ├── _datos-conversacion.json ← la app lo usa para no duplicar mensajes
    ├── Audios enviados/
    ├── Audios recibidos/
    ├── Fotos enviadas/
    ├── Fotos recibidas/
    ├── Videos enviados/ , Videos recibidos/
    ├── Documentos enviados/ , Documentos recibidos/
    └── Stickers enviados/ , Stickers recibidos/
```

Los archivos se renombran con la fecha adelante (`2025-03-15 09.10 - PTT-20250315-WA0003.opus`) para que queden ordenados.

**Sin duplicados:** cada archivo guardado lleva su huella SHA-256. Si exportás el mismo chat otra vez, solo se sube lo nuevo y la conversación se completa con los mensajes que faltaban.

**Privacidad:** todo se procesa en el navegador y va directo a tu Drive. No hay servidor. La app usa el permiso `drive.file`, que solo le da acceso a lo que ella misma crea.

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
| `js/app.js` | La pantalla. |
| `sw.js`, `js/compartidos.js` | Reciben el chat desde "Compartir" en Android. |
