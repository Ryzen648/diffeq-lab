import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { dobleExponencial } from "../src/nucleo/cuadratura/doble-exponencial.js";
import { analizarImpropia, sucesionTruncada } from "../src/nucleo/cuadratura/impropias.js";
import { cerca } from "./ayuda.mjs";

// --- Cuadratura doble exponencial: integrales con valor exacto conocido ---------

test("tanh-sinh con singularidades en los extremos", () => {
  cerca(dobleExponencial((x) => 1 / Math.sqrt(x), 0, 1).valor, 2, 1e-10);          // ∫₀¹ x^{-1/2} = 2
  cerca(dobleExponencial(Math.log, 0, 1).valor, -1, 1e-10);                           // ∫₀¹ ln x = −1
  // arcsen: aquí la precisión baja a ~1e−8 y no es culpa de la cuadratura: con x a
  // 1e−12 de 1, calcular 1 − x·x pierde cifras por cancelación. Limitación documentada.
  cerca(dobleExponencial((x) => 1 / Math.sqrt(1 - x * x), -1, 1).valor, Math.PI, 1e-7);
  cerca(dobleExponencial((x) => x * x, 0, 1).valor, 1 / 3, 1e-13);                    // y sin singularidad
});

test("exp-sinh y sinh-sinh con límites infinitos", () => {
  cerca(dobleExponencial((x) => 1 / (x * x), 1, Infinity).valor, 1, 1e-10);
  cerca(dobleExponencial((x) => Math.exp(-x), 0, Infinity).valor, 1, 1e-10);
  cerca(dobleExponencial((x) => 1 / (1 + x * x), 0, Infinity).valor, Math.PI / 2, 1e-10);
  cerca(dobleExponencial((x) => Math.exp(-x * x), -Infinity, Infinity).valor, Math.sqrt(Math.PI), 1e-10);
  cerca(dobleExponencial((x) => Math.exp(x), -Infinity, 0).valor, 1, 1e-10);
});

// --- Análisis de convergencia ----------------------------------------------------

test("propia: no se marca como impropia", () => {
  const r = analizarImpropia((x) => x * x, 0, 1);
  assert.equal(r.impropia, false);
  assert.equal(r.veredicto, "converge");
});

test("∫₁^∞ 1/x² converge (p = 2 > 1) y vale 1", () => {
  const r = analizarImpropia((x) => 1 / (x * x), 1, Infinity);
  const [causa] = r.causas;
  assert.equal(causa.tipo, "infinito");
  cerca(causa.exponente, 2, 1e-6);
  assert.equal(r.veredicto, "converge");
  cerca(r.numerico.valor, 1, 1e-9);
});

test("∫₁^∞ 1/x diverge: p = 1 es el caso límite y lo decide el crecimiento logarítmico", () => {
  const r = analizarImpropia((x) => 1 / x, 1, Infinity);
  assert.equal(r.causas[0].criterio, "diverge");
  assert.equal(r.causas[0].porSucesion, true);
  assert.equal(r.veredicto, "diverge");
  assert.equal(r.numerico, null);
  // La sucesión truncada crece ≈ ln 10 por década: I(R) = ln R con R = 1 + 10ᵏ.
  const s = sucesionTruncada((x) => 1 / x, 1, Infinity, r.causas[0]);
  cerca(s[3].valor - s[2].valor, Math.log(10001 / 1001), 1e-9);
});

test("∫₀¹ 1/√x converge (q = 1/2 < 1); ∫₀¹ 1/x² diverge (q = 2)", () => {
  const r = analizarImpropia((x) => 1 / Math.sqrt(x), 0, 1);
  assert.equal(r.causas[0].tipo, "extremo");
  cerca(r.causas[0].exponente, 0.5, 1e-6);
  cerca(r.numerico.valor, 2, 1e-9);
  assert.equal(analizarImpropia((x) => 1 / (x * x), 0, 1).veredicto, "diverge");
});

test("∫₀¹ ln x converge aunque ln 0 = −∞ (crece más despacio que cualquier potencia)", () => {
  const r = analizarImpropia(Math.log, 0, 1);
  assert.equal(r.causas[0].tipo, "extremo");
  assert.equal(r.veredicto, "converge");
  cerca(r.numerico.valor, -1, 1e-9);
});

test("singularidad interior: se localiza y se parte el intervalo", () => {
  const r = analizarImpropia((x) => 1 / Math.sqrt(Math.abs(x - 0.3)), -1, 1);
  const interior = r.causas.find((c) => c.tipo === "interior");
  assert.ok(interior, "debe encontrar la singularidad en 0.3");
  cerca(interior.x, 0.3, 1e-9);
  assert.equal(r.tramos.length, 2);
  // ∫₋₁¹ |x − 0.3|^{-1/2} dx = 2√1.3 + 2√0.7
  cerca(r.numerico.valor, 2 * Math.sqrt(1.3) + 2 * Math.sqrt(0.7), 1e-8);
  const polo = analizarImpropia((x) => 1 / (x * x), -1, 1);
  assert.equal(polo.veredicto, "diverge", "1/x² en [−1, 1] diverge por x = 0 (Barrow a ciegas daría −2)");
});

test("oscilante con p = 1 (sin x / x): no se afirma divergencia", () => {
  const r = analizarImpropia((x) => Math.sin(x) / x, 1, Infinity);
  assert.equal(r.causas[0].oscila, true);
  assert.notEqual(r.veredicto, "diverge");
});

test("dos límites infinitos: la gaussiana converge a √π", () => {
  const r = analizarImpropia((x) => Math.exp(-x * x), -Infinity, Infinity);
  assert.equal(r.causas.length, 2);
  assert.equal(r.veredicto, "converge");
  cerca(r.numerico.valor, Math.sqrt(Math.PI), 1e-9);
});

test("límites invertidos cambian el signo", () => {
  cerca(analizarImpropia((x) => 1 / (x * x), Infinity, 1).numerico.valor, -1, 1e-9);
});
