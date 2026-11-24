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
5. Antes de tirar, cada uno elige su **rol** (Top, Jungla, Mid, ADC, Support o Cualquiera): sus 3 campeones salen de ese rol.
6. Cada tiro da 3 campeones a cada uno de los tres (9 distintos). Cada uno toca con cuál va a jugar.
7. Al elegir campeón aparece una **build rara** (ítems, runas y cómo jugarla). Se puede pedir otra y cada uno marca la casilla para confirmarla; los demás lo ven.

Para cambiar los nombres, editá `PLAYERS` en `server.js` y `NAMES` en `public/index.html`.
Los campeones están en `champions.json`, con este formato:

```json
"Blitzcrank": { "r": ["sup"], "w": ["apb", "bru"], "n": "Nota opcional para la primera build rara" }
```

- `r`: roles (`top`, `jg`, `mid`, `adc`, `sup`).
- `w`: builds raras posibles (claves de `builds.json`): `apb` AP explosivo, `aph` AP on-hit, `apt` mago tanque, `let` letalidad, `cri` crítico, `onh` AD on-hit, `tan` full tanque, `bru` luchador, `enc` encantador.

Los ítems y runas de cada build están en `builds.json`, guardados por su ID de Riot. Los nombres en español (latino) y los íconos de campeones, ítems y runas salen de Data Dragon, el CDN oficial de Riot.

Cuando salga un parche nuevo, corré:

```bash
npm run ddragon
```

Eso actualiza los nombres en `builds.json` y la versión en `ddragon.json`, y avisa si algún ítem ya no se compra en la Grieta. Para cambiar un ítem, poné su `id` (se busca en https://ddragon.leagueoflegends.com/cdn/<versión>/data/es_MX/item.json) y corré el comando.

## Archivos
- `server.js` — salas, turnos, confirmaciones, sorteo y sincronización.
- `champions.json` — campeones, roles y builds raras posibles.
- `builds.json` — ítems, runas y consejo de cada tipo de build.
- `ddragon.json` — versión del parche e ID de imagen de cada campeón (generado).
- `scripts/actualizar-ddragon.js` — baja los datos de Riot (`npm run ddragon`).
- `public/index.html` — la página (estilos y lógica del cliente).
