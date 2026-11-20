import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { versionarTexto } from "../scripts/versionar.mjs";

const V = "abc123";

test("js: import, export, import dinámico y Workers relativos llevan ?v=; lo absoluto no", () => {
  const entrada = [
    'import { a } from "./a.js";',
    "import b from '../b/c.js';",
    'import "./efecto.js";',
    'export { d } from "../../d.js";',
    'const m = await import("./dinamico.js");',
    'const w = new URL("../../workers/numerico.worker.js", import.meta.url);',
    'const cdn = await import("https://cdn.jsdelivr.net/pyodide/v1/full/pyodide.mjs");',
    'const texto = "no es un import ./a.js";',
  ].join("\n");
  const salida = versionarTexto(entrada, ".js", V).split("\n");
  assert.equal(salida[0], 'import { a } from "./a.js?v=abc123";');
  assert.equal(salida[1], "import b from '../b/c.js?v=abc123';");
  assert.equal(salida[2], 'import "./efecto.js?v=abc123";');
  assert.equal(salida[3], 'export { d } from "../../d.js?v=abc123";');
  assert.equal(salida[4], 'const m = await import("./dinamico.js?v=abc123");');
  assert.equal(salida[5], 'const w = new URL("../../workers/numerico.worker.js?v=abc123", import.meta.url);');
  assert.equal(salida[6], 'const cdn = await import("https://cdn.jsdelivr.net/pyodide/v1/full/pyodide.mjs");');
  assert.equal(salida[7], 'const texto = "no es un import ./a.js";');
});

test("html: scripts y estilos locales llevan ?v=; los de CDN no", () => {
  const html = [
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">',
    '<link rel="stylesheet" href="comun/css/tema.css">',
    '<script defer src="https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.min.js"></script>',
    '<script type="module" src="src/ui/paginas/edo2.js"></script>',
    '<a href="edo1.html">',
  ].join("\n");
  const salida = versionarTexto(html, ".html", V).split("\n");
  assert.equal(salida[0], '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">');
  assert.equal(salida[1], '<link rel="stylesheet" href="comun/css/tema.css?v=abc123">');
  assert.equal(salida[2], '<script defer src="https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.min.js"></script>');
  assert.equal(salida[3], '<script type="module" src="src/ui/paginas/edo2.js?v=abc123"></script>');
  assert.equal(salida[4], '<a href="edo1.html">');
});

test("en el sitio real no queda ningún import relativo ni Worker sin versionar", () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const archivos = [];
  const recorrer = (carpeta) => {
    for (const n of readdirSync(carpeta)) {
      const ruta = join(carpeta, n);
      if (statSync(ruta).isDirectory()) { if (!["node_modules", ".git", "tests", "scripts", "demo"].includes(n)) recorrer(ruta); } else if ([".js", ".html"].includes(extname(ruta))) archivos.push(ruta);
    }
  };
  for (const c of ["src", "comun/js"]) recorrer(join(raiz, c));
  for (const n of readdirSync(raiz)) if (n.endsWith(".html")) archivos.push(join(raiz, n));
  let imports = 0;
  for (const ruta of archivos) {
    const salida = versionarTexto(readFileSync(ruta, "utf8"), extname(ruta), V);
    const sinVersion = [...salida.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\(\s*|\s(?:src|href)=)["'](\.{0,2}\/?[\w./-]+\.(?:js|css))["']/g)]
      .map((m) => m[1]).filter((u) => !/^https?:/.test(u) && !u.startsWith("//"));
    assert.deepEqual(sinVersion, [], ruta);
    imports += (salida.match(/\?v=abc123/g) ?? []).length;
  }
  assert.ok(imports > 150, `solo ${imports} URL versionadas`);
});
