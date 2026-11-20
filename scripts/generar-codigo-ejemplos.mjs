// Genera el código Python de cada ejemplo de la biblioteca y el valor que
// calcula la página para ese ejemplo, para comprobar que coinciden:
//   node scripts/generar-codigo-ejemplos.mjs <carpeta>
// Escribe <carpeta>/<id>.py y <carpeta>/esperados.json. Lo usan:
//   - tests/python/test_codigo_generado.py (CPython + SciPy, en CI);
//   - scripts/probar-codigo-generado.mjs (Pyodide, para probar en local).

import "../tests/preparar.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { analizarFuncion, variablesDe } from "../comun/js/entrada/analizar.js";
import { math } from "../comun/js/mathjs.js";
import { EJEMPLOS, disponible } from "../src/ejemplos.js";
import { prepararExpresion, aJS, compilarFuente } from "../src/nucleo/expresion.js";
import { leerNumero } from "../src/nucleo/numeros.js";
import { analizarImpropia } from "../src/nucleo/cuadratura/impropias.js";
import { simpsonAdaptativo } from "../src/nucleo/cuadratura/adaptativa.js";
import { codigoIntegral } from "../src/nucleo/codigo/integrales.js";
import { codigoEDO } from "../src/nucleo/codigo/edo.js";
import { leerEcuacion, formaNormal } from "../src/nucleo/edo/notacion.js";
import { dormandPrince } from "../src/nucleo/edo/dormand-prince.js";
import { codigoPlano } from "../src/nucleo/codigo/edo2.js";
import { leerOrden2, leerSistema } from "../src/nucleo/edo/plano.js";
import { dormandPrinceSistema } from "../src/nucleo/edo/sistemas.js";
import { buscarEquilibrios, jacobianoNumerico } from "../src/nucleo/edo/equilibrios.js";

const carpeta = resolve(process.argv[2] ?? "codigo-generado");

// Método simbólico que elige la página para cada ejemplo (el primero que aplica,
// comprobado en el navegador), para que también se ejecute el bloque de dsolve.
const METODO_EJEMPLO = { logistica: "separable", enfriamiento: "separable", lineal: "lineal", bernoulli: "bernoulli", exacta: "exacta", rigidez: "lineal", riccati: null };
// Plano de fase: los ejemplos lineales también ejecutan el bloque de dsolve
// (los no lineales no lo tienen: la página no llama a SymPy con ellos).
const SIMBOLICO_PLANO = { amortiguado: "orden2", resonancia: "orden2", silla: "sistema" };
mkdirSync(carpeta, { recursive: true });

const sustituir = (nodo, valores) => nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in valores
  ? new math.ConstantNode(valores[n.name]) : n));

// Casos que no están en la biblioteca pero cuyo código también debe funcionar:
// integración hacia atrás (x final < x0). y' = y, y(0) = 1 hasta x = −1 ⇒ e⁻¹.
const CASOS_EXTRA = [
  { id: "atras", modulo: "edo1", datos: { ecuacion: "y' = y", x0: "0", y0: "1", xf: "-1" } },
  { id: "atrasLineal", modulo: "edo1", datos: { ecuacion: "y' + 2*y = exp(x)", x0: "1", y0: "2", xf: "-0.5" } },
];
METODO_EJEMPLO.atras = "separable";
METODO_EJEMPLO.atrasLineal = "lineal";

const esperados = {};
for (const e of [...EJEMPLOS.filter(disponible), ...CASOS_EXTRA]) {
  let codigo;
  if (e.modulo === "integrales") {
    const { f: texto, a: ta, b: tb } = e.datos;
    const { fn, nodo } = prepararExpresion(texto, ["x"], { parametrosPermitidos: false });
    const a = leerNumero(ta, "a", { admiteInfinito: true });
    const b = leerNumero(tb, "b", { admiteInfinito: true });
    const nodoLimite = (t, v) => (Number.isFinite(v) ? analizarFuncion(t) : v);
    codigo = codigoIntegral({ nodo, textoOriginal: texto, a: nodoLimite(ta, a), b: nodoLimite(tb, b) });
    // El mismo valor que muestra la página: tanh-sinh si es impropia, Simpson adaptativo si no.
    const analisis = analizarImpropia(fn, a, b);
    const valor = analisis.impropia
      ? (analisis.veredicto === "diverge" ? null : analisis.numerico.valor)
      : simpsonAdaptativo(fn, Math.min(a, b), Math.max(a, b), { tol: 1e-13 }).valor * (a < b ? 1 : -1);
    esperados[e.id] = { tipo: "integral", valor, diverge: analisis.veredicto === "diverge" };
  } else if (e.modulo === "edo2") {
    const { tipo, ecuacion, f: textoF, g: textoG, t0, x0, y0, tf, xmin, xmax, ymin, ymax, parametros = {} } = e.datos;
    const p = tipo === "sistema" ? leerSistema(textoF, textoG) : leerOrden2(ecuacion);
    const [f, g] = [p.f, p.g].map((n) => sustituir(n, parametros));
    const [fn, gn] = [f, g].map((n) => compilarFuente(aJS(n), ["t", "x", "y"]));
    const F = (t, [x, y]) => [fn(t, x, y), gn(t, x, y)];
    const [vt0, vx0, vy0, vtf] = [t0, x0, y0, tf].map((v) => leerNumero(v, ""));
    // Los mismos equilibrios que muestra la página (sistemas autónomos con ventana).
    let equilibrios = [];
    const autonomo = ![f, g].some((n) => variablesDe(n).has("t"));
    if (autonomo && xmin !== undefined) {
      const Fxy = (x, y) => F(vt0, [x, y]);
      const ventana = [[xmin, xmax], [ymin, ymax]].map((par) => par.map((v) => leerNumero(v, "")));
      equilibrios = buscarEquilibrios(Fxy, (x, y) => jacobianoNumerico(Fxy, x, y), ...ventana).equilibrios;
    }
    const simbolico = SIMBOLICO_PLANO[e.id] === "orden2" ? { tipo: "orden2", F: sustituir(p.ec.F, parametros) }
      : SIMBOLICO_PLANO[e.id] === "sistema" ? { tipo: "sistema" } : null;
    codigo = codigoPlano({
      f, g, textoOriginal: tipo === "sistema" ? `x' = ${textoF}, y' = ${textoG}` : ecuacion, nombres: p.nombres,
      t0: vt0, Y0: [vx0, vy0], tf: vtf, equilibrios, simbolico,
    });
    const ref = dormandPrinceSistema(F, vt0, [vx0, vy0], vtf, { rtol: 1e-12, atol: 1e-14 });
    esperados[e.id] = { tipo: "plano", valor: ref.Ys.at(-1) };
  } else {
    const { ecuacion, x0, y0, xf: textoXf, parametros = {} } = e.datos;
    const ec = leerEcuacion(ecuacion);
    const { f, M, N } = formaNormal(ec.F);
    const fSust = sustituir(f, parametros);
    const fn = compilarFuente(aJS(fSust), ["x", "y"]);
    const [vx0, vy0, xf] = [x0, y0, textoXf].map(Number); // xf < x0: hacia atrás
    codigo = codigoEDO({
      f: fSust, M: sustituir(M, parametros), N: sustituir(N, parametros),
      textoOriginal: ecuacion, x0: vx0, y0: vy0, xf, metodo: METODO_EJEMPLO[e.id] ?? null,
    });
    const ref = dormandPrince(fn, vx0, vy0, xf, { rtol: 1e-12, atol: 1e-14 });
    esperados[e.id] = { tipo: "edo", valor: ref.ys.at(-1) };
  }
  writeFileSync(join(carpeta, `${e.id}.py`), codigo);
}
writeFileSync(join(carpeta, "esperados.json"), JSON.stringify(esperados, null, 2));
console.log(`${Object.keys(esperados).length} scripts en ${carpeta}`);
