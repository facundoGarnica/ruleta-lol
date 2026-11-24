// Ruleta de campeones — servidor en tiempo real (sin base de datos, todo en memoria)
// Jugadores fijos: Facu, Jordy, Rexx. Tiran por turno y cada tiro lo confirman los demás.
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const DATA = require("./champions.json");   // { nombre: { r:[roles], w:[builds raras], n?:nota } }
const BUILDS = require("./builds.json");
const CHAMPS = Object.keys(DATA);
const ROLES = ["any", "top", "jg", "mid", "adc", "sup"];

const PLAYERS = { 1: "Facu", 2: "Jordy", 3: "Rexx" };
const SEATS = [1, 2, 3];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.get("/health", (_req, res) => res.send("ok"));

// code -> { seats:{1:{id}|null}, roles:{1:"any"}, picks:{1:null}, weird:{1:null}, turn, request, result, round }
const rooms = new Map();

const cleanCode = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
const rnd = (n) => crypto.randomInt(n);
const GRACE_MS = 6000; // tiempo para volver (recargar la página) antes de perder el turno

// siguiente jugador conectado después de `s` (si no hay nadie, el siguiente en orden)
function nextSeat(r, s) {
  for (let k = 1; k <= 3; k++) {
    const n = ((s - 1 + k) % 3) + 1;
    if (r.seats[n]) return n;
  }
  return (s % 3) + 1;
}

// si al que le toca no está hace rato, el turno pasa al siguiente conectado
function fixTurn(r) {
  if (r.seats[r.turn] || r.request) return;
  if (Date.now() - r.emptySince[r.turn] < GRACE_MS) return;
  const n = nextSeat(r, r.turn);
  if (r.seats[n]) r.turn = n;
}
function scheduleFix(code) {
  setTimeout(() => { if (rooms.has(code)) broadcast(code); }, GRACE_MS + 200);
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      seats: { 1: null, 2: null, 3: null },
      roles: { 1: "any", 2: "any", 3: "any" },
      picks: { 1: null, 2: null, 3: null },
      weird: { 1: null, 2: null, 3: null },
      turn: 1, request: null, result: null, round: 0,
      emptySince: { 1: Date.now(), 2: Date.now(), 3: Date.now() },
    });
  }
  return rooms.get(code);
}

const seatOf = (r, id) => SEATS.find((s) => r.seats[s] && r.seats[s].id === id) || null;
// los demás jugadores conectados que tienen que confirmar
const approversFor = (r, seat) => SEATS.filter((s) => s !== seat && r.seats[s]);

function publicState(code) {
  const r = rooms.get(code);
  if (!r) return null;
  const sockets = io.sockets.adapter.rooms.get(code) || new Set();
  const seated = SEATS.filter((s) => r.seats[s]).length;
  return {
    players: PLAYERS,
    seats: Object.fromEntries(SEATS.map((s) => [s, r.seats[s] && { id: r.seats[s].id }])),
    roles: r.roles,
    picks: r.picks,
    weird: Object.fromEntries(SEATS.map((s) => [s, r.weird[s] && buildView(r.weird[s])])),
    turn: r.turn,
    request: r.request && {
      seat: r.request.seat,
      approvals: [...r.request.approvals],
      waiting: approversFor(r, r.request.seat).filter((s) => !r.request.approvals.has(s)),
    },
    result: r.result,
    round: r.round,
    watchers: Math.max(0, sockets.size - seated),
  };
}
function broadcast(code) {
  const r = rooms.get(code);
  if (r) fixTurn(r);
  io.to(code).emit("state", publicState(code));
}

// 3 campeones por jugador según su rol, sin repetir entre los tres
function draw(roles) {
  const used = new Set();
  const seats = {};
  for (const s of SEATS) {
    const role = roles[s];
    let cand = CHAMPS.filter((c) => !used.has(c) && (role === "any" || DATA[c].r.includes(role)));
    if (cand.length < 3) cand = CHAMPS.filter((c) => !used.has(c));
    seats[s] = [0, 1, 2].map(() => cand.splice(rnd(cand.length), 1)[0]);
    seats[s].forEach((c) => used.add(c));
  }
  return seats;
}

// build rara: { champ, idx (en la lista w del campeón), accepted }
function newWeird(champ) {
  const w = DATA[champ].w;
  return { champ, idx: rnd(w.length), accepted: false };
}
function buildView(wd) {
  const d = DATA[wd.champ];
  const key = d.w[wd.idx];
  const b = BUILDS[key];
  return {
    champ: wd.champ, key, name: b.name, items: b.items, runes: b.runes, tip: b.tip,
    note: wd.idx === 0 && d.n ? d.n : null, // la nota corresponde a la primera build rara
    options: d.w.length, accepted: wd.accepted,
  };
}

function doSpin(code, r) {
  const seat = r.request.seat;
  r.request = null;
  r.round += 1;
  r.result = { e: Date.now(), by: seat, round: r.round, seats: draw(r.roles) };
  r.turn = nextSeat(r, seat);
  for (const s of SEATS) { r.picks[s] = null; r.weird[s] = null; }
  io.to(code).emit("spun", r.result);
}

// si la solicitud ya no necesita a nadie más, se tira
function checkRequest(code, r) {
  if (!r.request) return;
  const seat = r.request.seat;
  if (!r.seats[seat]) { r.request = null; return; }
  const need = approversFor(r, seat);
  if (need.length === 0) { r.request = null; return; } // se fueron todos: hay que volver a pedir
  if (need.every((s) => r.request.approvals.has(s))) doSpin(code, r);
}

io.on("connection", (socket) => {
  let code = null;
  socket.emit("champs", CHAMPS);

  function leave() {
    if (!code) return;
    const r = rooms.get(code);
    socket.leave(code);
    if (r) {
      const s = seatOf(r, socket.id);
      if (s) {
        r.seats[s] = null;
        r.emptySince[s] = Date.now();
        scheduleFix(code);
        if (r.request) {
          if (r.request.seat === s) r.request = null;
          else { r.request.approvals.delete(s); checkRequest(code, r); }
        }
      }
      const left = io.sockets.adapter.rooms.get(code);
      if (!left || left.size === 0) rooms.delete(code);
      else broadcast(code);
    }
    code = null;
  }

  const room = () => (code && rooms.get(code)) || null;

  socket.on("join", (d = {}) => {
    const c = cleanCode(d.code);
    if (!c) return;
    leave();
    code = c;
    const isNew = !rooms.has(code);
    getRoom(code);
    socket.join(code);
    if (isNew) scheduleFix(code);
    broadcast(code);
  });

  socket.on("claim", (seat) => {
    const r = room();
    seat = Number(seat);
    if (!r || !SEATS.includes(seat)) return;
    if (r.seats[seat]) return socket.emit("notice", `${PLAYERS[seat]} ya está conectado en otra pestaña o PC.`);
    const cur = seatOf(r, socket.id);
    if (cur) { r.seats[cur] = null; r.emptySince[cur] = Date.now(); scheduleFix(code); }
    r.seats[seat] = { id: socket.id };
    broadcast(code);
  });

  socket.on("release", () => {
    const r = room();
    if (!r) return;
    const s = seatOf(r, socket.id);
    if (!s) return;
    r.seats[s] = null;
    r.emptySince[s] = Date.now();
    scheduleFix(code);
    if (r.request) {
      if (r.request.seat === s) r.request = null;
      else { r.request.approvals.delete(s); checkRequest(code, r); }
    }
    broadcast(code);
  });

  socket.on("request", () => {
    const r = room();
    if (!r) return;
    const s = seatOf(r, socket.id);
    if (!s) return;
    if (s !== r.turn) return socket.emit("notice", `No es tu turno: le toca a ${PLAYERS[r.turn]}.`);
    if (r.request) return;
    if (approversFor(r, s).length === 0) return socket.emit("notice", "Tiene que haber al menos otro jugador conectado para confirmar.");
    r.request = { seat: s, approvals: new Set() };
    broadcast(code);
  });

  socket.on("cancel", () => {
    const r = room();
    if (!r || !r.request) return;
    if (seatOf(r, socket.id) !== r.request.seat) return;
    r.request = null;
    io.to(code).emit("notice", `${PLAYERS[r.turn]} canceló el pedido.`);
    broadcast(code);
  });

  socket.on("respond", (ok) => {
    const r = room();
    if (!r || !r.request) return;
    const s = seatOf(r, socket.id);
    if (!s || s === r.request.seat) return;
    if (ok === true) {
      r.request.approvals.add(s);
      checkRequest(code, r);
    } else {
      const who = PLAYERS[r.request.seat];
      r.request = null;
      io.to(code).emit("notice", `${PLAYERS[s]} rechazó el tiro de ${who}.`);
    }
    broadcast(code);
  });

  socket.on("pick", (i) => {
    const r = room();
    if (!r || !r.result) return;
    const s = seatOf(r, socket.id);
    if (!s) return;
    i = i === null ? null : Number(i);
    if (i !== null && ![0, 1, 2].includes(i)) return;
    if (r.picks[s] === i) return;
    r.picks[s] = i;
    r.weird[s] = i === null ? null : newWeird(r.result.seats[s][i]);
    broadcast(code);
  });

  socket.on("role", (role) => {
    const r = room();
    if (!r || !ROLES.includes(role)) return;
    const s = seatOf(r, socket.id);
    if (!s) return;
    r.roles[s] = role;
    broadcast(code);
  });

  socket.on("weird-other", () => {
    const r = room();
    if (!r) return;
    const s = seatOf(r, socket.id);
    const wd = s && r.weird[s];
    if (!wd || wd.accepted) return;
    wd.idx = (wd.idx + 1) % DATA[wd.champ].w.length;
    broadcast(code);
  });

  socket.on("weird-accept", (ok) => {
    const r = room();
    if (!r) return;
    const s = seatOf(r, socket.id);
    if (!s || !r.weird[s]) return;
    r.weird[s].accepted = ok === true;
    broadcast(code);
  });

  socket.on("disconnect", leave);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ruleta lista en http://localhost:${PORT}`));
