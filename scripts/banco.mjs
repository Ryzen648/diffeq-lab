// Banco de pruebas de integrales: ejecuta cada caso por el MISMO camino que la
// página (traducción a SymPy, guardia del integrando, valor numérico y capa de
// verificación del núcleo) y compara lo que se mostraría con la referencia.
//
//   node scripts/banco.mjs [--semilla N] [--n N] [--salida informe.json]
//
// Casos: los escritos a mano (tests/banco/integrales.json) y n generados con
// la semilla dada (tests/banco/generador.mjs), en sus dos variantes de entrada.
// Termina con código 1 si alguna respuesta errónea se presentaría como
// verificada (la métrica que tiene que ser 0).

import "../tests/preparar.mjs";
import { Worker } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { math } from "../comun/js/mathjs.js";
import { prepararExpresion } from "../src/nucleo/expresion.js";
import { leerNumero } from "../src/nucleo/numeros.js";
import { aPython } from "../src/nucleo/python.js";
import { comprobarMismoIntegrando } from "../src/nucleo/consistencia.js";
import { valorNumericoIntegral, comprobacionesIntegral, limiteSympy } from "../src/nucleo/integral.js";
import { estadoGlobal } from "../src/nucleo/verificacion.js";
import { generarIntegrales } from "../tests/banco/generador.mjs";
import { clasificar } from "../tests/banco/clasificar.mjs";

const { values: opciones } = parseArgs({ options: {
  semilla: { type: "string", default: "1" }, n: { type: "string", default: "60" },
  salida: { type: "string" }, tiempo: { type: "string", default: "30000" },
} });
const TIEMPO = Number(opciones.tiempo);

// --- SymPy en un hilo aparte, con tiempo máximo y reinicio (como el Worker de la página) ---
let hilo = null;
let listo = null;
let siguiente = 0;
function arrancar() {
  hilo = new Worker(new URL("./banco-sympy.worker.mjs", import.meta.url));
  listo = new Promise((ok) => hilo.once("message", ok));
}
async function llamar(funcion, args) {
  if (!hilo) arrancar();
  await listo;
  const id = ++siguiente;
  return new Promise((ok, mal) => {
    const reloj = setTimeout(() => {
      hilo.terminate();
      hilo = null; // el siguiente caso arranca uno nuevo
      mal(Object.assign(new Error("tiempo agotado"), { codigo: "tiempoAgotado" }));
    }, TIEMPO);
    const oyente = (m) => {
      if (m.id !== id) return;
      clearTimeout(reloj);
      hilo.off("message", oyente);
      if (m.error) mal(new Error(m.error)); else ok(m.ok);
    };
    hilo.on("message", oyente);
    hilo.postMessage({ id, funcion, args });
  });
}

// --- Un caso, por el camino de la página ------------------------------------------------
async function ejecutar(caso) {
  const expr = prepararExpresion(caso.f, ["x"], { indice: "f(x)" });
  const f = (x) => expr.fn(x);
  const definida = caso.a !== undefined;
  const a = definida ? leerNumero(caso.a, "a", { admiteInfinito: true }) : null;
  const b = definida ? leerNumero(caso.b, "b", { admiteInfinito: true }) : null;
  const limites = definida ? [limiteSympy(caso.a, a), limiteSympy(caso.b, b)] : [null, null];
  let simbolico = null;
  let errorSimbolico = null;
  try {
    simbolico = await llamar("integrales.integrar", [aPython(expr.nodo), ...limites]);
    comprobarMismoIntegrando(simbolico.integrandoMathjs, f);
  } catch (err) {
    simbolico = null;
    errorSimbolico = err;
  }
  const numerico = definida ? valorNumericoIntegral(f, a, b) : { valorNumerico: null, impropia: null };
  const estado = estadoGlobal(comprobacionesIntegral({ simbolico, f, definida, ...numerico, pendiente: false, errorSimbolico }));

  // Lo que se mostraría.
  let primitiva = null;
  if (simbolico?.primitivaMathjs) {
    try { primitiva = prepararExpresion(simbolico.primitivaMathjs, ["x"], { parametrosPermitidos: false }).fn; } catch { primitiva = null; }
  }
  const def = simbolico?.definida;
  const valorExacto = def?.encontrada && !def.diverge && def.numero !== null && def.numero !== undefined ? Number(def.numero) : null;
  // Misma regla que pintarSolucion: si diverge (SymPy o numérico) no se muestra ningún «≈ número».
  const diverge = valorExacto === null && (Boolean(def?.diverge) || numerico.impropia?.veredicto === "diverge");
  const mostrado = {
    primitiva, primitivaTexto: simbolico?.primitiva ?? null, valorExacto,
    valorNumerico: valorExacto === null && !diverge ? (numerico.valorNumerico ?? null) : null,
    diverge,
    sinFormaCerrada: Boolean(simbolico?.sinFormaCerrada),
  };
  const Fref = caso.esperado.primitiva ? (x) => math.evaluate(caso.esperado.primitiva, { x }) : null;
  return { estado, desenlace: clasificar(caso, mostrado, estado, Fref), mostrado, error: errorSimbolico ? String(errorSimbolico.message ?? errorSimbolico) : null };
}

// --- Banco completo ------------------------------------------------------------------------
const manuales = JSON.parse(readFileSync(new URL("../tests/banco/integrales.json", import.meta.url), "utf8")).casos
  .map((c) => ({ ...c, variante: "codigo" }));
const generados = generarIntegrales(Number(opciones.semilla), Number(opciones.n));
const casos = [...manuales, ...generados];

const resultados = [];
const inicio = Date.now();
for (const caso of casos) {
  let r;
  try {
    r = await ejecutar(caso);
  } catch (err) {
    r = { estado: "inconclusa", desenlace: "fallo_tecnico", error: String(err?.message ?? err) };
  }
  resultados.push({ id: caso.id, tema: caso.tema, nivel: caso.nivel, variante: caso.variante, f: caso.f, a: caso.a, b: caso.b, estado: r.estado, desenlace: r.desenlace, error: r.error });
  if (["erronea_verificada", "erronea_sin_marcar", "fallo_tecnico"].includes(r.desenlace)) {
    console.log(`  ✖ ${r.desenlace}: ${caso.id} · ∫ ${caso.f}${caso.a !== undefined ? ` de ${caso.a} a ${caso.b}` : ""} · estado ${r.estado}${r.error ? ` · ${r.error}` : ""}`);
  }
}
hilo?.terminate();

// --- Métricas por tema ---------------------------------------------------------------------
const DESENLACES = ["acierto", "rechazo_honesto", "erronea_detectada", "erronea_sin_marcar", "no_comprobable", "erronea_verificada", "fallo_tecnico"];
const porTema = {};
for (const r of resultados) {
  porTema[r.tema] ??= Object.fromEntries(DESENLACES.map((d) => [d, 0]));
  porTema[r.tema][r.desenlace]++;
}
const total = Object.fromEntries(DESENLACES.map((d) => [d, resultados.filter((r) => r.desenlace === d).length]));
console.log(`\nBanco de integrales: ${casos.length} casos (${manuales.length} a mano, ${generados.length} generados, semilla ${opciones.semilla}) en ${((Date.now() - inicio) / 1000).toFixed(0)} s\n`);
console.log(`${"tema".padEnd(22)}${DESENLACES.map((d) => d.slice(0, 11).padStart(12)).join("")}`);
for (const [tema, m] of Object.entries(porTema).sort()) console.log(`${tema.padEnd(22)}${DESENLACES.map((d) => String(m[d]).padStart(12)).join("")}`);
console.log(`${"TOTAL".padEnd(22)}${DESENLACES.map((d) => String(total[d]).padStart(12)).join("")}`);
if (opciones.salida) writeFileSync(opciones.salida, JSON.stringify({ seccion: "integrales", semilla: Number(opciones.semilla), total, porTema, resultados }, null, 2));

if (total.erronea_verificada > 0) {
  console.log(`\n✖ ${total.erronea_verificada} respuesta(s) errónea(s) se presentarían como verificadas.`);
  process.exitCode = 1;
} else {
  console.log("\n✔ Ninguna respuesta errónea se presenta como verificada.");
}
