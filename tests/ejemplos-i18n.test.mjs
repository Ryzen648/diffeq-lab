import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { EJEMPLOS, PAGINAS, disponible } from "../src/ejemplos.js";
import { claves } from "../src/i18n/index.js";
import es from "../src/i18n/es.js";
import en from "../src/i18n/en.js";

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");

test("cada ejemplo tiene nombre y los disponibles tienen datos", () => {
  const existentes = new Set(claves("es"));
  const ids = new Set();
  for (const e of EJEMPLOS) {
    assert.ok(!ids.has(e.id), `ejemplo repetido: ${e.id}`);
    ids.add(e.id);
    assert.ok(existentes.has(`ejemplo.${e.id}`), `falta ejemplo.${e.id}`);
    if (disponible(e)) assert.ok(e.datos, `${e.id} está disponible pero no tiene datos`);
  }
});

test("cada código de error del núcleo tiene texto y se lanza en algún sitio", async () => {
  const { CODIGOS } = await import("../src/nucleo/errores.js");
  const existentes = new Set(claves("es"));
  const fuentes = [];
  const recorrer = (carpeta) => {
    for (const e of readdirSync(new URL(carpeta, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) recorrer(`${carpeta}${e.name}/`);
      else if (e.name.endsWith(".js") && e.name !== "errores.js") fuentes.push(leer(`${carpeta}${e.name}`));
    }
  };
  for (const carpeta of ["../src/nucleo/", "../src/workers/", "../src/simbolico/", "../comun/js/entrada/"]) recorrer(carpeta);
  const todo = fuentes.join("\n");
  for (const codigo of CODIGOS) {
    assert.ok(existentes.has(`error.${codigo}`), `falta el texto de error.${codigo}`);
    assert.ok(todo.includes(`"${codigo}"`), `el código ${codigo} no se lanza en ningún sitio`);
  }
});

test("en los pasos, cada hueco {dato} es un dato real del paso y no una llave de LaTeX", async () => {
  // Datos que manda Python (pasos_integral.py) para cada regla.
  const DATOS = {
    potencia: ["n"], reciproco: ["u"], exponencialBase: ["base"], constanteFuera: ["c", "resto"],
    sustitucion: ["u", "du", "var", "integralU"], partes: ["u", "dv", "du", "v", "var"],
    partesCiclica: ["coeficiente"], fraccionesParciales: ["reescrito"], completarCuadrado: ["reescrito"],
    identidadTrig: ["reescrito"], desarrollar: ["reescrito"], reescribir: ["reescrito"],
    sustitucionTrig: ["theta", "x", "var", "reescrito"], funcionEspecial: ["funcion"], otra: ["tipo"],
  };
  for (const [clave, texto] of Object.entries(es).filter(([k]) => /^paso\.[a-zA-Z]+$/.test(k))) {
    const regla = clave.slice("paso.".length);
    const huecos = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const datos = DATOS[regla] ?? [];
    // Cualquier {palabra} que coincida con un dato se rellenará: tiene que ser intencionado.
    for (const h of huecos) {
      if (datos.includes(h)) continue;
      assert.ok(!["n", "u", "x", "v", "c", "du", "dv"].includes(h) || !datos.length,
        `${clave}: «{${h}}» parece LaTeX pero coincide con un nombre de dato`);
    }
  }
  const { t } = await import("../src/i18n/index.js");
  assert.match(t("paso.potencia", { n: "-2" }), /w\^n\\,dw/);
  assert.match(t("paso.reciproco", { u: "x - 1" }), /\\dfrac\{dw\}\{w\}/);
});

test("el inglés solo usa claves que existen en español", () => {
  for (const clave of Object.keys(en)) assert.ok(clave in es, `en.js tiene una clave que no está en es.js: ${clave}`);
});

test("todas las claves de las páginas y de la interfaz existen en el diccionario", () => {
  const existentes = new Set(claves("es"));
  const paginas = readdirSync(new URL("../", import.meta.url)).filter((f) => f.endsWith(".html"));
  assert.ok(paginas.includes("index.html"));
  for (const pagina of paginas) {
    const html = leer(`../${pagina}`);
    for (const m of html.matchAll(/data-i18n(?:-html|-aria-label|-title)?="([^"]+)"/g)) {
      assert.ok(existentes.has(m[1]), `falta la clave ${m[1]} (${pagina})`);
    }
  }
  const ui = readdirSync(new URL("../src/ui/", import.meta.url)).filter((f) => f.endsWith(".js"));
  for (const archivo of ui) {
    const codigo = leer(`../src/ui/${archivo}`);
    for (const m of codigo.matchAll(/\bt\("([^"]+)"/g)) {
      assert.ok(existentes.has(m[1]), `falta la clave ${m[1]} (src/ui/${archivo})`);
    }
  }
});

test("cada módulo con página tiene su archivo", () => {
  const paginas = new Set(readdirSync(new URL("../", import.meta.url)));
  for (const pagina of Object.values(PAGINAS)) assert.ok(paginas.has(pagina), `falta ${pagina}`);
});
