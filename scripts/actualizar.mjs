// Regenera cartelera.json leyendo directamente los sitios de cada lugar.
// Lo ejecuta GitHub Actions cada mañana (ver .github/workflows/actualizar.yml).
// Sin dependencias: solo Node 20+.
//
// Fuentes:
//   Teatro Biobío ........ Ticketplus (funciones) + teatrobiobio.cl (exposiciones y actividades gratis)
//   Corcudec / Teatro UdeC  Ticketplus + programación de corcudec.cl (fechas y horas de cada concierto)
//   UCSC ................. ucsc.cl/eventos (solo cultura y extensión)
//   Casa del Arte UdeC ... pinacoteca.udec.cl (exposiciones actuales y próximas)
//   Alianza Francesa ..... afconcepcion.cl (si responde; si no, se conserva lo anterior)
//   Galería de la Historia ghconcepcion.cl (horario y muestra permanente)
//   manual.json .......... lo que quieras agregar a mano

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SALIDA = path.join(RAIZ, "cartelera.json");
const MANUAL = path.join(RAIZ, "manual.json");
const DIAS = 7;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const FIXTURES = process.env.CARTELERA_FIXTURES; // carpeta con páginas guardadas, solo para pruebas

// ---------------------------------------------------------------- utilidades

const MESES = { ene:1, enero:1, feb:2, febrero:2, mar:3, marzo:3, abr:4, abril:4, may:5, mayo:5, jun:6, junio:6,
  jul:7, julio:7, ago:8, agosto:8, sep:9, sept:9, septiembre:9, setiembre:9, oct:10, octubre:10,
  nov:11, noviembre:11, dic:12, diciembre:12 };
const MES_RE = "(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|setiembre|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)";

const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const HOY = process.env.CARTELERA_HOY || hoyChile();
const sumar = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HASTA = sumar(HOY, DIAS - 1);
const enVentana = f => f >= HOY && f <= HASTA;
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
const pad = n => String(n).padStart(2, "0");

// Año más razonable para un día/mes sin año: el que deja la fecha más cerca de hoy.
function conAnio(dia, mes) {
  const y = Number(HOY.slice(0, 4));
  const op = [y - 1, y, y + 1].map(a => `${a}-${pad(mes)}-${pad(dia)}`);
  return op.sort((a, b) => Math.abs(diasEntre(HOY, a)) - Math.abs(diasEntre(HOY, b)))[0];
}
const mesNum = s => MESES[String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "")] || MESES[String(s).toLowerCase().slice(0, 3)];

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…", iacute: "í", aacute: "á", eacute: "é", oacute: "ó", uacute: "ú",
  ntilde: "ñ", Ntilde: "Ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", uuml: "ü", deg: "°", ordm: "º" };
const decode = s => String(s ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const texto = h => decode(String(h ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div)>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/[ \t ]+/g, " ").replace(/ *\n[\s]*/g, "\n").trim();
const linea = h => texto(h).replace(/\s+/g, " ").trim();
const normal = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const peso = n => "$" + Number(n).toLocaleString("es-CL").replace(/,/g, ".");

const log = (...a) => console.log(...a);
const notas = [];

async function traer(url, { json = false, timeout = 30000, intentos = 2 } = {}) {
  if (FIXTURES) {
    const mapa = JSON.parse(fs.readFileSync(path.join(FIXTURES, "_mapa.json"), "utf8"));
    const f = mapa[url];
    if (!f) throw new Error("sin fixture: " + url);
    const t = fs.readFileSync(path.join(FIXTURES, f), "utf8");
    return json ? JSON.parse(t) : t;
  }
  let error;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-CL,es;q=0.9" }, signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return json ? await r.json() : await r.text();
    } catch (e) { error = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw new Error(`${url}: ${error.message}`);
}

function tipoDe(t) {
  const s = normal(t);
  if (/sinfonic|concierto|orquesta|recital|big band|banda|coro|musica|jazz|rock|piano|camara iv|d camara|zarzuela/.test(s)) return "Música";
  if (/opera|lirica/.test(s)) return "Ópera";
  if (/ballet|danza/.test(s)) return "Danza";
  if (/cine|pelicula|film|documental|biobiocine|lunes cinematograficos/.test(s)) return "Cine";
  if (/exposicion|muestra|acuarel|pintura|fotograf|instalacion|artes visuales/.test(s)) return "Artes visuales";
  if (/conversatorio|charla|conferencia|encuentro con|presentacion del libro|presentacion libro/.test(s)) return "Conversatorio";
  if (/visita guiada|visitas guiadas/.test(s)) return "Visita guiada";
  if (/teatro|obra|festival internacional de teatro|titeres|monologo/.test(s)) return "Teatro";
  return "";
}

// ---------------------------------------------------------------- Ticketplus

function ldEvent(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); if (j["@type"] === "Event") return j; } catch { /* JSON con errores: probar con regex */
      if (/"@type":\s*"Event"/.test(m[1])) {
        const g = k => (m[1].match(new RegExp(`"${k}":\\s*"([^"]*)"`)) || [])[1];
        return { startDate: g("startDate"), endDate: g("endDate"), name: g("name"), location: { name: (m[1].match(/"location"[\s\S]*?"name":\s*"([^"]*)"/) || [])[1] },
          offers: { lowPrice: g("lowPrice"), highPrice: g("highPrice") } };
      }
    }
  }
  return null;
}

function tarjetasTicketplus(html) {
  const out = [];
  const re = /<a href="(\/events\/[^"]+)"[\s\S]*?<p class="company[^>]*>([\s\S]*?)<\/p>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<p class="date-home -text[^>]*>([\s\S]*?)<\/p>/g;
  for (const m of html.matchAll(re)) {
    const [d, mes] = linea(m[4]).split(/\s+/);
    out.push({ url: "https://ticketplus.cl" + m[1], sala: linea(m[2]), titulo: linea(m[3]), primera: mesNum(mes) ? conAnio(Number(d), mesNum(mes)) : null });
  }
  return out;
}

function precioTicketplus(ld) {
  const o = ld?.offers || {};
  const lo = Number(o.lowPrice), hi = Number(o.highPrice);
  if (!isFinite(lo) || o.lowPrice === undefined || o.lowPrice === "") return "";
  if (lo === 0 && (!hi || hi === 0)) return "Gratis";
  if (!hi || hi === lo) return peso(lo);
  return `${peso(lo)} – ${peso(hi)}`;
}

function partirTitulo(t) {
  // "Razones para no morir: Festival Internacional de Teatro del Biobío" -> título + detalle
  const m = t.match(/^(.{1,}?):\s+(.{3,})$/);
  if (m && /festival|ciclo|temporada|hecho en biobio|biobiocine/i.test(normal(m[2]))) return { titulo: m[1], detalle: m[2] };
  return { titulo: t.replace(/\s+-\s+Teatro Biob[ií]o$/i, ""), detalle: "" };
}

// Lee una página de evento de Ticketplus y devuelve sus funciones (o una "temporada" si dura muchos días).
async function eventoTicketplus(card, lugar, salaPorDefecto) {
  const html = await traer(card.url);
  const ld = ldEvent(html);
  if (!ld?.startDate) return { funciones: [], temporada: null };
  const ini = ld.startDate.slice(0, 10), fin = (ld.endDate || ld.startDate).slice(0, 10);
  let hora = (ld.startDate.match(/T(\d{2}:\d{2})/) || [])[1] || "";
  const txt = texto(html);
  const mh = txt.match(/\d{4}?,?\s*(\d{1,2}:\d{2})\s*hrs\.\s*\(Chile\)/) || txt.match(/,\s*(\d{1,2}:\d{2})\s*hrs\./);
  if (mh) hora = mh[1].padStart(5, "0");
  const nombre = card.titulo || decode(ld.name || "");
  const { titulo, detalle } = partirTitulo(nombre);
  const sala = (card.sala || decode(ld.location?.name || "") || salaPorDefecto).replace(/,\s*Teatro Biob[ií]o$/i, "");
  const base = { lugar, sala, titulo, detalle, tipo: tipoDe(nombre + " " + detalle), precio: precioTicketplus(ld), url: card.url };
  const largo = diasEntre(ini, fin);
  if (largo > 3) {
    return { funciones: [], temporada: { lugar, titulo, detalle: [detalle, sala].filter(Boolean).join(" · "), desde: ini, hasta: fin,
      horario: hora ? `Desde las ${hora}` : "", precio: base.precio, url: card.url } };
  }
  const funciones = [];
  for (let i = 0; i <= largo; i++) funciones.push({ fecha: sumar(ini, i), hora, ...base });
  return { funciones, temporada: null };
}

// ---------------------------------------------------------------- Corcudec: programación con fechas y horas

const DIA_SEM = "(?:lun(?:es)?|mar(?:tes)?|mi[eé](?:rcoles)?|jue(?:ves)?|vie(?:rnes)?|s[aá]b(?:ado)?|dom(?:ingo)?)";

// "Octubre, Jue. 15 / Vie.16" + "19:00 horas"  |  "Abril, Vie. 10/ 19:00 horas" + "Sáb. 11 / 18:00 horas"
function sesionesDesdeTexto(html) {
  const lineas = texto(html).split("\n").map(s => s.trim()).filter(Boolean).slice(0, 6);
  let mes = null; const ses = []; let pendientes = [];
  for (const l of lineas) {
    const mm = l.match(new RegExp("^" + MES_RE + "\\b", "i"));
    if (mm) mes = mesNum(mm[1]);
    const dias = [...l.matchAll(new RegExp(DIA_SEM + "\\.?,?\\s*(\\d{1,2})\\b", "gi"))].map(x => Number(x[1]));
    const horas = [...l.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(?:horas|hrs|h)\b/gi)].map(x => `${pad(x[1])}:${x[2] || "00"}`);
    if (!dias.length && !horas.length) { if (ses.length || pendientes.length) break; else continue; }
    if (!mes) break;
    dias.forEach(d => pendientes.push(d));
    if (horas.length) { pendientes.forEach(d => ses.push({ fecha: conAnio(d, mes), hora: horas[0] })); pendientes = []; }
  }
  pendientes.forEach(d => ses.push({ fecha: conAnio(d, mes), hora: "" }));
  return ses;
}

async function corcudec() {
  const items = []; // {titulo, texto, link}
  const programas = await traer("https://drupal.corcudec.cl/api/programas", { json: true });
  for (const p of programas) for (const s of p.sections || []) for (const it of s.images_links || []) {
    if (it.title && it.link_url) items.push({ titulo: decode(it.title).trim(), html: it.text || "", link: it.link_url.trim(), programa: decode(p.title).normalize("NFC") });
  }
  try {
    for (const c of await traer("https://drupal.corcudec.cl/api/carruseles", { json: true }))
      if (c.url && !items.some(i => i.link === c.url)) items.push({ titulo: decode(c.title).trim(), html: "", link: c.url.trim(), programa: "" });
  } catch (e) { log("carruseles:", e.message); }
  return items;
}

// ---------------------------------------------------------------- Teatro Biobío: posts con "Fecha y hora"

function fechasTBB(linea) {
  // "del 8 de octubre al 10 de noviembre (martes a sábado, de 15:00 h a 22:30 h)"
  // "5 de noviembre, 19:00 h" | "5 y 6 de noviembre, 20:00 h" | "jueves 6 de noviembre, a las 19:00 h"
  // "del miércoles 4 al miércoles 11 de noviembre": se quitan los días de la semana antes de leer el rango
  const l = linea.toLowerCase().replace(new RegExp("\\b" + DIA_SEM + "\\b\\.?", "gi"), " ");
  const rango = l.match(new RegExp(`del?\\s+(\\d{1,2})(?:\\s+de\\s+${MES_RE})?\\s+al\\s+(\\d{1,2})\\s+de\\s+${MES_RE}`));
  const horario = (linea.match(/\(([^)]+)\)/) || [])[1] || "";
  if (rango) {
    const mesFin = mesNum(rango[4]), mesIni = rango[2] ? mesNum(rango[2]) : mesFin;
    return { rango: { desde: conAnio(Number(rango[1]), mesIni), hasta: conAnio(Number(rango[3]), mesFin) }, horario };
  }
  const ses = [];
  for (const m of l.matchAll(new RegExp(`((?:\\d{1,2}\\s*(?:,|y)\\s*)*\\d{1,2})\\s+de\\s+${MES_RE}([^;\\n]*)`, "g"))) {
    const mes = mesNum(m[2]);
    const h = (m[3].match(/(\d{1,2})[:.](\d{2})/) || []);
    const hora = h[1] ? `${pad(h[1])}:${h[2]}` : "";
    for (const d of m[1].split(/\s*(?:,|y)\s*/)) if (d) ses.push({ fecha: conAnio(Number(d), mes), hora });
  }
  return { sesiones: ses, horario };
}

// Lee las líneas "Etiqueta: valor". Si la etiqueta viene sola (p. ej. "Fecha y hora:" seguida de una lista),
// el valor son las líneas siguientes hasta la próxima etiqueta.
const ETIQUETA = /^(Fechas? y horas?|Fechas? y horarios?(?: de la actividad)?|Fechas? de la actividad|Fechas?|Sala|Lugar|Tickets|Entradas|Precio|Público|Categoría|Por|Dirección|Compañía)\s*:\s*(.*)$/i;
const claveEtiqueta = k => /^fechas?\s/i.test(k) ? "fecha y hora" : k.toLowerCase();
function campos(t) {
  const c = {};
  const ls = t.split("\n");
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    const m = l.match(ETIQUETA);
    if (m) {
      const k = claveEtiqueta(m[1]);
      let v = m[2].trim();
      if (!v) { const sig = []; for (let j = i + 1; j < ls.length && j <= i + 8 && !ETIQUETA.test(ls[j]); j++) if (ls[j].trim()) sig.push(ls[j].trim()); v = sig.join("\n"); }
      if (v && !c[k]) c[k] = v;
    }
    const p = l.match(/^Por\s+(.{3,80})$/);
    if (p && !c.por) c.por = p[1].trim();
  }
  return c;
}

// Fuera de Concepción (para actividades itinerantes como "TBB en tu barrio")
const FUERA_CONCE = /los [aá]ngeles|chill[aá]n|ca[nñ]ete|arauco|curanilahue|lebu|coronel|lota|tom[eé]|penco|talcahuano|hualp[eé]n|chiguayante|san pedro de la paz|santa juana|nacimiento|mulch[eé]n|tir[uú]a|contulmo|los [aá]lamos/i;

const precioTexto = s => /liberad|gratis|gratuit/i.test(s || "") ? "Gratis" :
  ((s || "").match(/\$\s?[\d.]+(?:\s*(?:\/|y|-)\s*\$\s?[\d.]+)?/) || [""])[0].replace(/\s+/g, " ");

async function postsTBB() {
  const posts = await traer("https://teatrobiobio.cl/wp-json/wp/v2/posts?per_page=50&orderby=modified&_fields=id,title,content,link,categories,modified", { json: true });
  const eventos = [], expos = [];
  for (const p of posts) {
    if (diasEntre(p.modified.slice(0, 10), HOY) > 200) continue;
    const t = texto(p.content.rendered);
    const c = campos(t);
    const fh = c["fecha y hora"] || c.fecha;
    if (!fh) continue;
    const titulo = decode(p.title.rendered).replace(/\s+/g, " ").trim();
    if (/convocatoria|postulaci|beneficio|escuela de p[uú]blicos|entrenamiento/i.test(titulo)) continue;
    const sala = (c.sala || c.lugar || "").replace(/,\s*Teatro Biob[ií]o$/i, "");
    const precio = precioTexto(c.tickets || c.entradas || c.precio);
    // Varias fechas en lista, cada una con su lugar: "Sábado 7 de noviembre: 18:00 h en Aurora de Chile, Concepción."
    const filas = fh.split("\n");
    if (filas.length > 1) {
      for (const fila of filas) {
        const lugarFila = ((fila.match(/\sen\s+([^(]+?)\.?\s*(?:\(|$)/) || [])[1] || "").trim();
        if (FUERA_CONCE.test(lugarFila)) continue;
        for (const s of fechasTBB(fila).sesiones || []) if (enVentana(s.fecha))
          eventos.push({ fecha: s.fecha, hora: s.hora, lugar: "tbb", sala: lugarFila || sala, titulo, detalle: c.por || "", tipo: tipoDe(titulo + " " + (c["categoría"] || "")), precio, url: p.link });
      }
      continue;
    }
    const f = fechasTBB(fh);
    const esExpo = (p.categories || []).includes(135) || /instalaci[oó]n|exposici[oó]n|muestra/i.test(titulo);
    if (f.rango) {
      if (f.rango.hasta < HOY || f.rango.desde > HASTA) continue;
      const tt = titulo.replace(/^(Instalación sonora y visual|Exposición|Pinturas Negras:)\s*/i, "").replace(/^[“"«]|[”"»]$/g, "");
      expos.push({ lugar: "tbb", titulo: tt, detalle: [c.por, sala].filter(Boolean).join(" · "), desde: f.rango.desde, hasta: f.rango.hasta,
        horario: f.horario.replace(/^./, c => c.toUpperCase()).replace(/ h\b/g, ""), precio, url: p.link });
    } else if (!esExpo) {
      for (const s of f.sesiones) if (enVentana(s.fecha))
        eventos.push({ fecha: s.fecha, hora: s.hora, lugar: "tbb", sala, titulo, detalle: c.por || "", tipo: tipoDe(titulo + " " + (c["categoría"] || "")), precio, url: p.link });
    }
  }
  return { eventos, expos };
}

// ---------------------------------------------------------------- UCSC

const UCSC_FUERA = /los [aá]ngeles|chill[aá]n|ca[nñ]ete|arauco|curanilahue|lebu/i;
const UCSC_CULTURAL = /concierto|teatro|cine|pel[ií]cula|exposici[oó]n|muestra|danza|ballet|actriz|actor|recital|[oó]pera|coro|orquesta|m[uú]sica|poes[ií]a|literari|libro|acuarel|pintur|fotograf|cultural|patrimoni|histori/i;

function fechasUCSC(s) {
  // "5 noviembre" | "9 Nov - 9 Dic" | "5 - 7 noviembre"
  const r = s.match(new RegExp(`(\\d{1,2})\\s*${MES_RE}?\\s*-\\s*(\\d{1,2})\\s*${MES_RE}`, "i"));
  if (r) { const m2 = mesNum(r[4]), m1 = r[2] ? mesNum(r[2]) : m2; return { desde: conAnio(Number(r[1]), m1), hasta: conAnio(Number(r[3]), m2) }; }
  const u = s.match(new RegExp(`(\\d{1,2})\\s*(?:de\\s+)?${MES_RE}`, "i"));
  if (u) { const f = conAnio(Number(u[1]), mesNum(u[2])); return { desde: f, hasta: f }; }
  return null;
}

async function ucsc() {
  const vistos = new Set(), eventos = [], expos = [];
  for (let pag = 1; pag <= 8; pag++) {
    let html;
    try { html = await traer(pag === 1 ? "https://ucsc.cl/eventos/" : `https://ucsc.cl/eventos/page/${pag}/`); }
    catch (e) { if (pag === 1) throw e; break; }
    const items = [...html.matchAll(/<li class="wp-block-post post-\d+ ucsc_event([^"]*)">([\s\S]*?)<\/article>/g)];
    if (!items.length) break;
    let pasado = true;
    for (const [, cls, b] of items) {
      const campo = k => linea((b.match(new RegExp(`<p class="ucsc-event__${k}[^>]*>([\\s\\S]*?)</p>`)) || [])[1] || "");
      const a = b.match(/<h3[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!a || vistos.has(a[1])) continue;
      vistos.add(a[1]);
      const f = fechasUCSC(campo("date-range"));
      if (!f) continue;
      if (f.desde <= HASTA) pasado = false;
      const titulo = linea(a[2]), sala = campo("location"), org = campo("organizer");
      const cats = [...cls.matchAll(/event_category-([a-z0-9-]+)/g)].map(x => x[1]);
      const cultural = cats.includes("cultura-y-extension") ||
        (!cats.some(c => /pastoral|institucional|vinculacion|servicios/.test(c)) && UCSC_CULTURAL.test(titulo));
      if (!cultural || UCSC_FUERA.test(sala)) continue;
      const hora = (campo("hour-range").match(/(\d{1,2}):(\d{2})/) || []).slice(1);
      const ev = { lugar: "ucsc", sala, titulo: limpiarTituloUCSC(titulo), detalle: org.replace(/^Dirección de Extensión Cultural UCSC$/, ""), tipo: tipoDe(titulo), precio: "", url: a[1] };
      if (diasEntre(f.desde, f.hasta) > 3) {
        if (f.hasta >= HOY && f.desde <= HASTA) expos.push({ lugar: "ucsc", titulo: ev.titulo, detalle: [ev.detalle, sala].filter(Boolean).join(" · "),
          desde: f.desde, hasta: f.hasta, horario: hora.length ? `${pad(hora[0])}:${hora[1]}` : "", precio: "", url: a[1] });
        continue;
      }
      for (let i = 0; i <= diasEntre(f.desde, f.hasta); i++) {
        const fecha = sumar(f.desde, i);
        if (enVentana(fecha)) eventos.push({ fecha, hora: hora.length ? `${pad(hora[0])}:${hora[1]}` : "", ...ev });
      }
    }
    if (pasado && pag > 1) break;
    const ultima = items.map(([, , b]) => fechasUCSC(linea((b.match(/ucsc-event__date-range[^>]*>([\s\S]*?)<\/p>/) || [])[1] || ""))).filter(Boolean).pop();
    if (ultima && ultima.desde > HASTA) break;
  }
  // Precio: mirar la página de cada evento ("entrada liberada", "gratuita", "$...")
  for (const e of eventos) {
    try { const p = precioTexto(texto(await traer(e.url)).match(/(entrada[^.\n]{0,60}|liberad[^.\n]{0,20}|gratuit[^.\n]{0,20}|\$\s?\d[\d.]+[^\n]{0,30})/i)?.[0]); if (p) e.precio = p; }
    catch { /* sin precio */ }
  }
  return { eventos, expos };
}

function limpiarTituloUCSC(t) {
  return t.replace(/^Inauguración de la exposición\s+[“"«](.+?)[”"»]\s+de\s+(?:la|el)?\s*[a-záéíóú]*\s*(.+)$/i, "Inauguración «$1» · $2")
          .replace(/^Conversatorio\s+[–-]\s+/i, "")
          .replace(/^Concierto\s+[“"«](.+?)[”"»]$/i, "$1");
}

// ---------------------------------------------------------------- Casa del Arte UdeC (Pinacoteca)

async function pinacoteca() {
  const posts = await traer("https://pinacoteca.udec.cl/wp-json/wp/v2/expos_pinacoteca?per_page=30&_fields=id,title,content,link,class_list", { json: true });
  let horario = "";
  try {
    const t = texto(await traer("https://pinacoteca.udec.cl/exposiciones/")).replace(/\n/g, " ");
    const m = t.match(/Martes a Viernes\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2}).{0,12}?S[aá]bado\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2}).{0,12}?Domingo\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})/i);
    if (m) horario = `Mar a vie ${m[1]}–${m[2]} · sáb ${m[3]}–${m[4]} · dom ${m[5]}–${m[6]}`;
  } catch { /* sin horario */ }
  const expos = [];
  for (const p of posts) {
    const cls = (p.class_list || []).join(" ");
    const actual = /categoria_expos-actuales/.test(cls), proxima = /categoria_expos-proximas/.test(cls);
    if (!actual && !proxima) continue;
    const t = texto(p.content.rendered).replace(/\n/g, " ");
    let titulo = decode(p.title.rendered).replace(/\s+/g, " ").trim();
    let detalle = "";
    const q = titulo.match(/[“"«]([^”"»]+)[”"»]/);
    if (q) { detalle = titulo.replace(q[0], "").replace(/^\s*(Exposición|Muestra)\s*/i, "").replace(/^[,\s]*(de|del)\s+/i, "").replace(/^Exposición de\s+/i, "").trim(); titulo = q[1]; }
    titulo = titulo.split(/:\s+/)[0].trim();
    detalle = detalle.replace(/^Exposición de /i, "");
    const sala = ((t.match(/\b(Sala\s+(?:\d+|David Stitchkin(?: Branover)?)|Galería Universitaria)/i) || [])[1] || "").replace(/^sala/i, "Sala");
    if (sala && !normal(detalle).includes(normal(sala))) detalle = [detalle, sala].filter(Boolean).join(" · ");
    const h = t.match(new RegExp(`hasta el\\s+(?:\\w+\\s+)?(\\d{1,2})\\s+de\\s+${MES_RE}`, "i"));
    const d = proxima ? t.match(new RegExp(`(?:desde|a partir de)l?\\s+(?:el\\s+)?(?:\\w+\\s+)?(\\d{1,2})\\s+de\\s+${MES_RE}`, "i")) : null;
    expos.push({ lugar: "pina", titulo, detalle: detalle.slice(0, 120), desde: d ? conAnio(Number(d[1]), mesNum(d[2])) : null,
      hasta: h ? conAnio(Number(h[1]), mesNum(h[2])) : null, horario, precio: precioTexto(t.match(/(entrada[^.]{0,40}liberad[^.]{0,10}|gratuit[^.]{0,20})/i)?.[0]), url: p.link });
  }
  return { eventos: [], expos };
}

// ---------------------------------------------------------------- Galería de la Historia

async function galeria() {
  const t = texto(await traer("https://www.ghconcepcion.cl/")).replace(/\n/g, " ");
  const h = t.match(/Martes a domingo:?\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})/i);
  const precio = /entrada liberada/i.test(t) ? (/aporte voluntario/i.test(t) ? "Gratis (aporte voluntario)" : "Gratis") : "";
  const expos = [{ lugar: "gh", titulo: "Historia de Concepción en dioramas", detalle: "Muestra permanente · Parque Ecuador",
    desde: null, hasta: null, horario: h ? `Mar a dom ${h[1]}–${h[2]}` : "", precio, url: "https://www.ghconcepcion.cl/" }];
  // Novedades recientes que anuncian una nueva sala o muestra
  try {
    const posts = await traer("https://www.ghconcepcion.cl/wp-json/wp/v2/posts?per_page=5&_fields=title,link,date", { json: true });
    for (const p of posts) {
      const titulo = decode(p.title.rendered);
      const m = titulo.match(/(?:inaugura|nueva?)[^«“"]*[«“"]([^»”"]+)[»”"]/i);
      if (m && diasEntre(p.date.slice(0, 10), HOY) < 120)
        expos.push({ lugar: "gh", titulo: m[1].replace(/^La\s+/i, ""), detalle: "Nuevo espacio de la Galería", desde: null, hasta: null,
          horario: expos[0].horario, precio, url: p.link });
    }
  } catch (e) { log("gh posts:", e.message); }
  return { eventos: [], expos };
}

// ---------------------------------------------------------------- Alianza Francesa

async function alianza() {
  // The Events Calendar (si el sitio lo usa) entrega JSON limpio; si no, se lee la lista de eventos.
  const eventos = [], expos = [];
  try {
    const j = await traer(`https://www.afconcepcion.cl/wp-json/tribe/events/v1/events?start_date=${HOY}&end_date=${HASTA}%2023:59&per_page=50`, { json: true, timeout: 25000, intentos: 1 });
    for (const e of j.events || []) {
      const ini = e.start_date.slice(0, 10), fin = e.end_date.slice(0, 10);
      const base = { lugar: "af", sala: decode(e.venue?.venue || ""), titulo: decode(e.title), detalle: "", tipo: tipoDe(e.title + " " + (e.categories || []).map(c => c.name).join(" ")),
        precio: e.cost ? (/^0$|gratis|liberad/i.test(e.cost) ? "Gratis" : decode(e.cost)) : "", url: e.url };
      if (diasEntre(ini, fin) > 3) expos.push({ lugar: "af", titulo: base.titulo, detalle: base.sala, desde: ini, hasta: fin, horario: "", precio: base.precio, url: e.url });
      else for (let i = 0; i <= diasEntre(ini, fin); i++) { const f = sumar(ini, i); if (enVentana(f)) eventos.push({ fecha: f, hora: e.all_day ? "" : e.start_date.slice(11, 16), ...base }); }
    }
    return { eventos, expos };
  } catch (e) {
    diagnostico["Alianza Francesa (API)"] = "no disponible: " + e.message;
    const html = await traer("https://www.afconcepcion.cl/eventos/", { timeout: 40000, intentos: 2 });
    return { eventos: eventosAF(html), expos };
  }
}

// La página de eventos de la Alianza no trae fechas estructuradas: se leen del texto de cada aviso.
const AF_NO = /curso|inscripci|resultados|delf|dalf|tcf|gael|vacaciones|taller|oferta|migra|s[uú]mate|spotify|ganadores|apoderados|puertas abiertas/i;
const WD_ES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
function eventosAF(html) {
  const out = [];
  const bloques = html.split(/<div class="event">/).slice(1);
  for (const b of bloques) {
    const titulo = linea((b.match(/<h3 class="event_title">([\s\S]*?)<\/h3>/) || [])[1] || "");
    if (!titulo || AF_NO.test(titulo)) continue;
    const etiquetas = linea((b.match(/<p class="event_type">([\s\S]*?)<\/p>/) || [])[1] || "");
    const cuerpo = texto(b.split(/<h3 class="event_title">/)[1] || "").replace(/\n/g, " ");
    const enlace = (b.match(/href="(https:\/\/www\.afconcepcion\.cl\/(?!archivos)[^"#]+)"/) || [])[1] || "https://www.afconcepcion.cl/eventos/";
    const re = new RegExp(`(?:(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\\s+)?(\\d{1,2})\\s+de\\s+${MES_RE}(?:\\s+(?:de\\s+)?(\\d{4}))?([^.!?\\n]{0,70})`, "gi");
    const vistas = new Set();
    for (const m of cuerpo.matchAll(re)) {
      const mes = mesNum(m[3]); if (!mes) continue;
      const fecha = m[4] ? `${m[4]}-${pad(mes)}-${pad(m[2])}` : conAnio(Number(m[2]), mes);
      if (m[1]) { const wd = WD_ES[new Date(fecha + "T12:00:00Z").getUTCDay()]; if (normal(m[1]) !== wd) continue; } // aviso de otro año
      if (!enVentana(fecha)) continue;
      const hm = m[5].match(/(\d{1,2})[:.](\d{2})|(\d{1,2})\s*(?:h\b|hrs|horas)/i);
      const h = hm ? [null, hm[1] || hm[3], hm[2] || "00"] : null;
      if (vistas.has(fecha)) { const prev = out.find(e => e.fecha === fecha && e.titulo === titulo); if (prev && !prev.hora && h) prev.hora = `${pad(h[1])}:${h[2] || "00"}`; continue; }
      vistas.add(fecha);
      const precio = /gratuit|gratis|liberad/i.test(etiquetas + " " + cuerpo) ? "Gratis" : "";
      const peli = (cuerpo.match(/Exhibimos\s+([^,(]{2,60})/i) || [])[1];
      const sala = /sala de teatro/i.test(cuerpo) ? "Sala de teatro" : "";
      out.push({ fecha, hora: h ? `${pad(h[1])}:${h[2] || "00"}` : "", lugar: "af", sala, titulo, detalle: peli ? peli.replace(/,?\s*dirigida.*$/i, "").trim() : "", tipo: tipoDe(titulo + " " + etiquetas), precio, url: enlace });
    }
  }
  return out;
}

// ---------------------------------------------------------------- armado

async function ticketplusYCorcudec() {
  const eventos = [], expos = [];
  const fuentes = [
    { url: "https://ticketplus.cl/companies/teatro-biobio", lugar: "tbb", sala: "Teatro Biobío" },
    { url: "https://ticketplus.cl/companies/corcudec", lugar: "udec", sala: "Teatro UdeC" },
  ];
  const tarjetas = new Map();
  for (const f of fuentes) {
    try { for (const c of tarjetasTicketplus(await traer(f.url))) tarjetas.set(c.url, { ...c, lugar: f.lugar, salaDef: f.sala }); }
    catch (e) { notas.push(`Ticketplus (${f.sala}) no respondió hoy.`); log(e.message); fallaron.add(f.lugar); }
  }
  // Programación de Corcudec: aporta fechas/horas exactas y eventos vendidos en otras boleterías
  let progs = [];
  try { progs = await corcudec(); } catch (e) { log("corcudec:", e.message); notas.push("No se pudo leer la programación de corcudec.cl hoy."); }
  for (const p of progs) {
    const url = p.link.replace("/en/events/", "/events/").replace(/\?.*$/, "");
    if (/ticketplus\.cl\/events\//.test(url) && !tarjetas.has(url)) tarjetas.set(url, { url, sala: "", titulo: "", primera: null, lugar: "udec", salaDef: "Teatro UdeC" });
    if (tarjetas.has(url)) tarjetas.get(url).prog = p;
  }
  for (const c of tarjetas.values()) {
    if (c.primera && c.primera > HASTA) continue; // aún no empieza
    if (!c.primera && c.prog) { const s = sesionesDesdeTexto(c.prog.html); if (s.length && !s.some(x => x.fecha >= HOY && x.fecha <= HASTA)) continue; }
    try {
      const r = await eventoTicketplus(c, c.lugar, c.salaDef);
      if (c.prog) {
        const s = sesionesDesdeTexto(c.prog.html);
        if (s.length && r.funciones.length) {
          const base = r.funciones[0];
          r.funciones = s.map(x => ({ ...base, fecha: x.fecha, hora: x.hora || base.hora }));
        }
        if (r.funciones.length) r.funciones.forEach(f => { f.titulo = c.prog.titulo.replace(/^Programa\s+/i, ""); f.detalle = c.prog.programa.replace(/^Temporada Sinf[oó]nica$/i, "Temporada Sinfónica UdeC"); f.tipo = f.tipo || tipoDe(c.prog.programa); f.sala = "Teatro UdeC"; });
      }
      eventos.push(...r.funciones.filter(f => enVentana(f.fecha)));
      if (r.temporada && r.temporada.hasta >= HOY && r.temporada.desde <= HASTA) expos.push(r.temporada);
    } catch (e) { log("evento", c.url, e.message); }
  }
  // Corcudec en otras boleterías (Ticketmaster): solo si su texto trae fechas
  for (const p of progs) {
    if (/ticketplus\.cl/.test(p.link)) continue;
    const s = sesionesDesdeTexto(p.html);
    let ses = s;
    if (!ses.length) {
      try { const ld = ldEvent(await traer(p.link, { intentos: 1, timeout: 20000 }));
        if (ld?.startDate) ses = [{ fecha: ld.startDate.slice(0, 10), hora: (ld.startDate.match(/T(\d{2}:\d{2})/) || [])[1] || "" }]; }
      catch (e) { diagnostico["Ticketmaster: " + p.titulo] = e.message; }
    }
    for (const x of ses) if (enVentana(x.fecha))
      eventos.push({ fecha: x.fecha, hora: x.hora, lugar: "udec", sala: "Teatro UdeC", titulo: p.titulo, detalle: p.programa, tipo: tipoDe(p.programa + " " + p.titulo), precio: "", url: p.link });
  }
  return { eventos, expos };
}

const fallaron = new Set();

const diagnostico = {};
async function seguro(nombre, clave, fn) {
  try { const r = await fn(); diagnostico[nombre] = `ok: ${r.eventos.length} funciones, ${r.expos.length} exposiciones`; log(nombre, diagnostico[nombre]); return r; }
  catch (e) { diagnostico[nombre] = `error: ${e.message}`; log(nombre, diagnostico[nombre]); fallaron.add(clave); return { eventos: [], expos: [] }; }
}

function dedupe(lista, clave) {
  const m = new Map();
  for (const e of lista) { const k = clave(e); if (!m.has(k)) m.set(k, e); else { const a = m.get(k); for (const c of Object.keys(e)) if (!a[c] && e[c]) a[c] = e[c]; } }
  return [...m.values()];
}

async function main() {
  log(`Ventana: ${HOY} a ${HASTA}`);
  let previo = {};
  try { previo = JSON.parse(fs.readFileSync(SALIDA, "utf8")); } catch { /* primera vez */ }

  const partes = [
    await seguro("Ticketplus/Corcudec", "tbb", ticketplusYCorcudec),
    await seguro("Teatro Biobío (sitio)", "tbb-sitio", postsTBB),
    await seguro("UCSC", "ucsc", ucsc),
    await seguro("Casa del Arte UdeC", "pina", pinacoteca),
    await seguro("Alianza Francesa", "af", alianza),
    await seguro("Galería de la Historia", "gh", galeria),
  ];
  let eventos = partes.flatMap(p => p.eventos);
  let expos = partes.flatMap(p => p.expos);

  // Si un sitio no respondió, conservar lo que ya teníamos de ese lugar (solo lo que sigue vigente)
  const nombres = { tbb: "Teatro Biobío", udec: "Corcudec", ucsc: "UCSC", pina: "Casa del Arte UdeC", af: "Alianza Francesa", gh: "Galería de la Historia" };
  for (const k of fallaron) {
    const lug = k.split("-")[0];
    if (k === "tbb-sitio" && !fallaron.has("tbb")) continue;
    const viejos = (previo.eventos || []).filter(e => e.lugar === lug && enVentana(e.fecha));
    const viejasX = (previo.exposiciones || []).filter(x => x.lugar === lug && (!x.hasta || x.hasta >= HOY));
    eventos.push(...viejos); expos.push(...viejasX);
    if (!notas.some(n => n.includes(nombres[lug]))) notas.push(`${nombres[lug]}: su sitio no respondió hoy; se muestra la última información disponible.`);
  }

  // Agregados a mano
  try {
    const man = JSON.parse(fs.readFileSync(MANUAL, "utf8"));
    eventos.push(...(man.eventos || []).filter(e => enVentana(e.fecha)));
    expos.push(...(man.exposiciones || []).filter(x => (!x.hasta || x.hasta >= HOY) && (!x.desde || x.desde <= HASTA)));
  } catch (e) { if (fs.existsSync(MANUAL)) notas.push("manual.json tiene un error de formato y no se usó."); }

  const sinTilde = e => normal(e.titulo).slice(0, 40);
  eventos = dedupe(eventos.filter(e => enVentana(e.fecha)), e => `${e.fecha}|${e.lugar}|${sinTilde(e)}`)
    .sort((a, b) => (a.fecha + (a.hora || "99")).localeCompare(b.fecha + (b.hora || "99")));
  expos = dedupe(expos, x => `${x.lugar}|${sinTilde(x)}`)
    .sort((a, b) => (a.hasta || "9999").localeCompare(b.hasta || "9999"));

  const salida = {
    actualizado: HOY,
    lugares: {
      tbb: { nombre: "Teatro Biobío", color: "--tbb" },
      udec: { nombre: "Corcudec · Teatro UdeC", color: "--udec" },
      ucsc: { nombre: "UCSC", color: "--ucsc" },
      pina: { nombre: "Casa del Arte UdeC", color: "--pina" },
      af: { nombre: "Alianza Francesa", color: "--af" },
      gh: { nombre: "Galería de la Historia", color: "--gh" },
    },
    eventos: eventos.map(({ fecha, hora, lugar, sala, titulo, detalle, tipo, precio, url }) => ({ fecha, hora: hora || "", lugar, sala: sala || "", titulo, detalle: detalle || "", tipo: tipo || "", precio: precio || "", url: url || "" })),
    exposiciones: expos.map(({ lugar, titulo, detalle, desde, hasta, horario, precio, url }) => ({ lugar, titulo, detalle: detalle || "", desde: desde || null, hasta: hasta || null, horario: horario || "", precio: precio || "", url: url || "" })),
    notas,
    _diagnostico: diagnostico,
    fuentes: [
      { nombre: "Ticketplus Teatro Biobío", url: "https://ticketplus.cl/companies/teatro-biobio" },
      { nombre: "Teatro Biobío", url: "https://teatrobiobio.cl/" },
      { nombre: "Corcudec", url: "https://www.corcudec.cl/" },
      { nombre: "UCSC", url: "https://ucsc.cl/eventos/" },
      { nombre: "Casa del Arte UdeC", url: "https://pinacoteca.udec.cl/exposiciones/" },
      { nombre: "Alianza Francesa", url: "https://www.afconcepcion.cl/eventos/" },
      { nombre: "Galería de la Historia", url: "https://www.ghconcepcion.cl/" },
    ],
  };
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + "\n");
  log(`Listo: ${salida.eventos.length} funciones, ${salida.exposiciones.length} exposiciones. Notas: ${notas.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
