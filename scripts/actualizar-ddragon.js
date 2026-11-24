// Baja los datos oficiales de Riot (Data Dragon) y actualiza:
//  - builds.json: nombres en español de ítems y runas (a partir de sus IDs)
//  - ddragon.json: versión del parche e ID de imagen de cada campeón
// Uso: npm run ddragon   (correrlo cuando salga un parche nuevo)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LANG = "es_MX"; // español latino
const CDN = "https://ddragon.leagueoflegends.com";

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} al bajar ${url}`);
  return res.json();
};

(async () => {
  const [version] = await get(`${CDN}/api/versions.json`);
  const base = `${CDN}/cdn/${version}/data`;
  const [items, runes, champsEs, champsEn] = await Promise.all([
    get(`${base}/${LANG}/item.json`),
    get(`${base}/${LANG}/runesReforged.json`),
    get(`${base}/${LANG}/champion.json`),
    get(`${base}/en_US/champion.json`),
  ]);

  // runas: id -> { name, icon }, incluyendo los árboles
  const runeById = {};
  for (const t of runes) {
    runeById[t.id] = { name: t.name, icon: t.icon };
    for (const slot of t.slots) for (const r of slot.runes) runeById[r.id] = { name: r.name, icon: r.icon };
  }

  const problems = [];
  const buildsPath = path.join(ROOT, "builds.json");
  const builds = JSON.parse(fs.readFileSync(buildsPath, "utf8"));
  for (const [key, b] of Object.entries(builds)) {
    for (const it of b.items) {
      const d = items.data[it.id];
      if (!d) problems.push(`${key}: el ítem ${it.id} no existe en el parche ${version}`);
      else {
        it.name = d.name;
        if (!d.gold.purchasable || !d.maps["11"]) problems.push(`${key}: "${d.name}" (${it.id}) ya no se compra en la Grieta`);
      }
    }
    const { keystone, primary, secondary } = b.runes;
    for (const id of [keystone, primary, secondary]) if (!runeById[id]) problems.push(`${key}: la runa ${id} no existe`);
    if (runeById[keystone]) {
      b.runes.name = runeById[keystone].name;
      b.runes.icon = runeById[keystone].icon;
      b.runes.text = `${runeById[keystone].name} (${runeById[primary]?.name}) + ${runeById[secondary]?.name}`;
    }
  }
  fs.writeFileSync(buildsPath, JSON.stringify(builds, null, 2) + "\n");

  // campeones: nombre usado en champions.json -> id de imagen (acepta nombre en español o inglés)
  const byName = {};
  for (const c of Object.values(champsEn.data)) byName[c.name] = c.id;
  for (const c of Object.values(champsEs.data)) byName[c.name] = c.id;
  const mine = Object.keys(require(path.join(ROOT, "champions.json")));
  const champs = {};
  for (const n of mine) {
    if (byName[n]) champs[n] = byName[n];
    else problems.push(`campeón "${n}" no encontrado (se muestra sin ícono)`);
  }
  fs.writeFileSync(path.join(ROOT, "ddragon.json"), JSON.stringify({ version, champs }, null, 2) + "\n");

  console.log(`Listo: parche ${version}, ${Object.keys(champs).length}/${mine.length} campeones con ícono.`);
  if (problems.length) console.log("Revisar:\n - " + problems.join("\n - "));
})().catch((e) => { console.error(e.message); process.exit(1); });
