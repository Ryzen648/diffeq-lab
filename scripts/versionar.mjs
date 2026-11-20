// Versiona las URL del sitio publicado para que un despliegue nuevo no se
// mezcle con archivos viejos de la caché del navegador.
//
// Por qué: GitHub Pages sirve todo con «Cache-Control: max-age=600». Quien
// visitó el sitio antes de un despliegue conserva hasta 10 minutos las copias
// viejas de los módulos (p. ej. src/i18n/es.js) y el navegador las combina con
// las nuevas: la página nueva sale con claves de texto en vez de textos y
// ejemplos de la versión anterior. Pasó al publicar la Fase 2.
//
// Qué hace, sobre la copia que se publica (_site), no sobre el repositorio:
//   - en cada .js, añade ?v=<versión> a los especificadores relativos de
//     import/export y a new URL("./…", import.meta.url) (Workers);
//   - en cada .html, a los <script src> y <link href> locales.
// Con URL nuevas en cada despliegue, nunca se mezclan versiones. El
// desarrollo sigue sin paso de build: el repositorio no cambia.
//
//   node scripts/versionar.mjs _site <versión>

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELATIVO = String.raw`\.{1,2}/[^"'\x60?#\s]+`;

/** Añade ?v=<versión> a las URL relativas de un archivo .js o .html. */
export function versionarTexto(texto, tipo, version) {
  const v = `?v=${encodeURIComponent(version)}`;
  if (tipo === ".js") {
    return texto
      // import … from "./x.js" · export … from "./x.js" · import "./x.js" · import("./x.js")
      .replace(new RegExp(String.raw`(\bfrom\s*|\bimport\s*\(?\s*)(["'])(${RELATIVO}\.js)\2`, "g"), `$1$2$3${v}$2`)
      // new URL("./x.js", import.meta.url): Workers
      .replace(new RegExp(String.raw`(new URL\(\s*)(["'])(${RELATIVO})\2(\s*,\s*import\.meta\.url)`, "g"), `$1$2$3${v}$2$4`);
  }
  if (tipo === ".html") {
    return texto.replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=)"((?!https?:|\/\/|data:|#)[^"?#]+\.(?:js|css))"/g, `$1"$2${v}"`);
  }
  return texto;
}

function recorrer(carpeta, fn) {
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta, fn);
    else fn(ruta);
  }
}

/** Versiona todos los .js y .html de `carpeta`. Devuelve cuántos archivos cambió. */
export function versionarCarpeta(carpeta, version) {
  let cambiados = 0;
  recorrer(carpeta, (ruta) => {
    const tipo = extname(ruta);
    if (tipo !== ".js" && tipo !== ".html") return;
    const original = readFileSync(ruta, "utf8");
    const nuevo = versionarTexto(original, tipo, version);
    if (nuevo !== original) { writeFileSync(ruta, nuevo); cambiados++; }
  });
  return cambiados;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [carpeta, version] = process.argv.slice(2);
  if (!carpeta || !version) {
    console.error("Uso: node scripts/versionar.mjs <carpeta> <versión>");
    process.exit(1);
  }
  console.log(`${versionarCarpeta(carpeta, version)} archivos versionados (v=${version})`);
}
