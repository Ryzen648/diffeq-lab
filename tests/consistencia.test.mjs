import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { comprobarMismoIntegrando } from "../src/nucleo/consistencia.js";
import { prepararExpresion } from "../src/nucleo/expresion.js";

const f = (texto) => prepararExpresion(texto, ["x"]).fn;

test("el caso real: SymPy integró x/(2(x²+1)⁵) en vez de x/(x²+1)^(5/2) -> error", () => {
  const usuario = f("((x)/((x^(2)+1)^(((5)/(2)))))"); // lo que guarda el editor visual
  // Lo que devolvía SymPy como integrando (a_mathjs de x/(2(x²+1)⁵)):
  assert.throws(() => comprobarMismoIntegrando("x/(2*((x)^(2) + 1)^(5))", usuario), (e) => e.codigo === "integrandoDistinto");
  // Con la traducción corregida, SymPy integra la misma función:
  assert.ok(comprobarMismoIntegrando("x/(((x)^(2) + 1)^((5/2)))", usuario) >= 5);
});

test("misma función escrita de otra forma: pasa", () => {
  assert.ok(comprobarMismoIntegrando("2*x + 2", f("2*(x+1)")) > 0);
  assert.ok(comprobarMismoIntegrando("sqrt(x)", f("x^(1/2)")) > 0); // dominio x ≥ 0: los negativos se saltan
});

test("si una es finita y la otra no en un punto, no es la misma función", () => {
  assert.throws(() => comprobarMismoIntegrando("1/x", f("x")), (e) => e.codigo === "integrandoDistinto");
});

test("sin texto o sin puntos que comparar no lanza (no hay con qué comprobar)", () => {
  assert.equal(comprobarMismoIntegrando(null, f("x")), 0);
  assert.equal(comprobarMismoIntegrando("erf(x", f("x")), 0); // no evaluable en math.js
});
