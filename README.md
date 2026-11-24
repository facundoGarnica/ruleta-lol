# Ruleta de campeones (LoL, Facu, Jordy y Rexx en tiempo real)

Servidor Node.js + Socket.IO. Todo vive en memoria: no hay base de datos y cada sala se borra cuando se van todos.
El servidor es quien sortea los campeones, así que nadie puede hacer trampa desde el navegador.

## Probar en tu PC

```bash
npm install
npm start
```

Abrí http://localhost:3000 (para probar, abrí dos pestañas).

## Subirlo gratis a Render

1. Creá un repositorio en GitHub y subí esta carpeta (sin `node_modules`).
2. Entrá a https://render.com → **New → Web Service** → conectá el repo.
3. Configuración:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
4. Deploy. Te da una URL tipo `https://ruleta-xxxx.onrender.com`.

El plan gratis de Render "duerme" el servidor tras ~15 min sin uso: la primera visita tarda unos 30–60 s en despertar. Después anda normal.

### Alternativas
- **Railway** (railway.app): conectás el repo y detecta Node solo.
- **Fly.io**: `fly launch` desde esta carpeta.
- Un VPS propio: `npm install && npm start` (con `PORT=80` o detrás de nginx).

Nota: no sirve hosting estático (GitHub Pages, Netlify, Vercel estático) porque hace falta un servidor que mantenga las conexiones WebSocket.

## Cómo se usa

1. Uno abre la página y toca **Copiar link** (el link incluye el código de sala).
2. Cada uno abre el link y toca **Soy Facu / Soy Jordy / Soy Rexx**. La página lo recuerda al recargar.
3. Tiran por turno: Facu → Jordy → Rexx → Facu…
4. El que tiene el turno toca **Pedir tirar la ruleta**; los otros jugadores conectados tienen que **Confirmar**. Si alguno rechaza, el turno sigue siendo del mismo.
5. Cada tiro da 3 campeones a cada uno de los tres (9 distintos). Cada uno toca con cuál va a jugar.

Para cambiar los nombres, editá `PLAYERS` en `server.js` y `NAMES` en `public/index.html`.
La lista de campeones está en `champions.json`.

## Archivos
- `server.js` — salas, turnos, confirmaciones, sorteo y sincronización.
- `champions.json` — lista de campeones.
- `public/index.html` — la página (estilos y lógica del cliente).
