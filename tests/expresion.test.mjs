import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mathjs from "mathjs";

import { prepararExpresion, compilarFuente } from "../src/nucleo/expresion.js";
import { FUNCIONES } from "../comun/js/entrada/lenguaje.js";
import { lanza } from "./ayuda.mjs";

test("la función compilada coincide con math.js en todas las funciones admitidas", () => {
  // Argumentos dentro del dominio real de cada función.
  const argumento = { acosh: "x + 1.5", asec: "x + 1.5", acsc: "x + 1.5", atanh: "x / 3", asin: "x / 3", acos: "x / 3", log: "x + 1", log10: "x + 1", sqrt: "x + 1", nthRoot: "x + 1, 3" };
  for (const nombre of FUNCIONES) {
    const texto = `${nombre}(${argumento[nombre] ?? "x"})`;
    const { fn } = prepararExpresion(texto, ["x"]);
    for (const x of [0.3, 0.7, 1.1]) {
      const esperado = mathjs.evaluate(texto, { x });
      assert.ok(Math.abs(fn(x) - esperado) < 1e-12 * Math.max(1, Math.abs(esperado)), `${texto} en x = ${x}: ${fn(x)} ≠ ${esperado}`);
    }
  }
});

test("operadores, constantes y precedencia", () => {
  const { fn } = prepararExpresion("-x^2 + 2*pi/e - (x - 1)^3", ["x"]);
  const esperado = (x) => -(x ** 2) + (2 * Math.PI) / Math.E - (x - 1) ** 3;
  for (const x of [-2, 0.5, 3]) assert.ok(Math.abs(fn(x) - esperado(x)) < 1e-12);
});

test("los símbolos que no son variables son parámetros, en orden alfabético", () => {
  const e = prepararExpresion("r*y*(1 - y/K)", ["x", "y"]);
  assert.deepEqual(e.parametros, ["K", "r"]);
  assert.deepEqual(e.argumentos, ["x", "y", "K", "r"]);
  assert.equal(e.fn(0, 2, 10, 1), 2 * (1 - 2 / 10));
});

test("sin parámetros permitidos, un símbolo extra es un error claro", () => {
  lanza(() => prepararExpresion("x*t", ["x"], { parametrosPermitidos: false }), "variableNoPermitida", { nombre: "t" });
});

test("la fuente se puede recompilar aparte (como en un Web Worker)", () => {
  const { fuente, argumentos } = prepararExpresion("sec(x) + y", ["x", "y"]);
  const fn = compilarFuente(fuente, argumentos);
  assert.ok(Math.abs(fn(0.4, 1) - (1 / Math.cos(0.4) + 1)) < 1e-15);
});

test("los errores de sintaxis llegan con el nombre del campo", () => {
  lanza(() => prepararExpresion("sin(x", ["x"], { indice: "f(x)" }), "parentesisSinCerrar", { indice: "f(x)", faltan: 1 });
  lanza(() => prepararExpresion("sinn(x)", ["x"]), "funcionDesconocidaSugerencia", { sugerencia: "sin" });
});

test("la raíz cúbica real admite radicandos negativos", () => {
  const { fn } = prepararExpresion("nthRoot(x, 3)", ["x"]);
  assert.ok(Math.abs(fn(-8) + 2) < 1e-15);
});
