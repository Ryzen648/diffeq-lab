import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { integrarPasoFijo, integrarConPaso } from "../src/nucleo/edo/paso-fijo.js";
import { dormandPrince, evaluarEn } from "../src/nucleo/edo/dormand-prince.js";
import { integrarImplicito } from "../src/nucleo/edo/implicitos.js";
import { estudioEDO, referenciaNumerica } from "../src/nucleo/edo/estudio.js";
import { explorarTramo, diagnosticarParada, FRACCION_CORTE } from "../src/nucleo/edo/singularidad.js";
import { leerEcuacion, formaNormal } from "../src/nucleo/edo/notacion.js";
import { compilarFuente, aJS } from "../src/nucleo/expresion.js";
import { lanza, cerca } from "./ayuda.mjs";

const crecimiento = (x, y) => y; // y' = y, y(0) = 1  ⇒  y = eˣ

/** f, M, N compilados de una ecuación escrita como texto. */
function funcionesDe(texto) {
  const { f, M, N } = formaNormal(leerEcuacion(texto).F);
  const c = (nodo) => compilarFuente(aJS(nodo), ["x", "y"]);
  return { f: c(f), M: c(M), N: c(N) };
}

// --- Integración hacia atrás -----------------------------------------------------

test("hacia atrás: y' = y, y(0) = 1 hasta x = −1 da e⁻¹ con todos los métodos", () => {
  for (const m of ["euler", "heun", "rk4"]) {
    const r = integrarPasoFijo(m, crecimiento, 0, 1, -1, 4000);
    assert.equal(r.xs.at(-1), -1);
    assert.ok(r.h < 0, "el paso es negativo");
    cerca(r.ys.at(-1), Math.exp(-1), m === "euler" ? 1e-4 : 1e-7, m);
  }
  const dp = dormandPrince(crecimiento, 0, 1, -1, { rtol: 1e-12, atol: 1e-14 });
  cerca(dp.ys.at(-1), Math.exp(-1), 1e-11, "Dormand–Prince");
  cerca(evaluarEn(dp, -0.37), Math.exp(-0.37), 1e-9, "interpolación hacia atrás");
  cerca(integrarImplicito("eulerImplicito", crecimiento, 0, 1, -1, 4000).ys.at(-1), Math.exp(-1), 1e-4);
  cerca(integrarConPaso("rk4", crecimiento, 0, 1, -1, 0.01).ys.at(-1), Math.exp(-1), 1e-9);
});

test("hacia atrás: los órdenes de convergencia siguen siendo 1, 2 y 4", () => {
  const ref = referenciaNumerica(crecimiento, 0, 1, -1);
  cerca(ref, Math.exp(-1), 1e-12);
  const est = estudioEDO(crecimiento, 0, 1, -1, Math.exp(-1));
  for (const [m, orden] of [["euler", 1], ["heun", 2], ["rk4", 4]]) {
    assert.ok(est[m].puntos.every((p) => p.h > 0), "h del estudio en valor absoluto");
    const p = est[m].observado.pendiente;
    assert.ok(Math.abs(p - orden) < 0.1, `${m}: pendiente ${p}`);
  }
  assert.ok(est.dopri.puntos.length > 5);
});

test("hacia atrás con solución exacta no trivial: y' + 2y = eˣ, y(1) = 2 hasta x = −0.5", () => {
  // y = eˣ/3 + C e^{−2x} con C = (2 − e/3)·e²
  const C = (2 - Math.E / 3) * Math.E ** 2;
  const exacta = (x) => Math.exp(x) / 3 + C * Math.exp(-2 * x);
  const { f } = funcionesDe("y' + 2*y = exp(x)");
  const dp = dormandPrince(f, 1, 2, -0.5, { rtol: 1e-12, atol: 1e-14 });
  cerca(dp.ys.at(-1), exacta(-0.5), 1e-10);
  cerca(integrarPasoFijo("rk4", f, 1, 2, -0.5, 3000).ys.at(-1), exacta(-0.5), 1e-9);
});

// --- Singularidades ------------------------------------------------------------------

test("(2xy + 3x²) + (x² + 4y)·y' = 0 desde y(1) = 1: se para donde x² + 4y = 0", () => {
  // En la rama que pasa por (1, 1): 2y² + x²y + x³ = 4, y x² + 4y = 0 donde x⁴ − 8x³ + 32 = 0.
  let lo = 1;
  let hi = 2;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (m ** 4 - 8 * m ** 3 + 32 > 0) lo = m; else hi = m; }
  const funciones = funcionesDe("2*x*y + 3*x^2 + y'*(x^2 + 4*y) = 0");
  const e = explorarTramo(funciones, 1, 1, 3);
  assert.equal(e.parada.motivo, "coeficienteNulo");
  cerca(e.parada.x, lo, 1e-9, "x de la singularidad");
  cerca(e.extremo, 1 + FRACCION_CORTE * (e.parada.x - 1), 1e-12);
  // Hacia atrás no hay singularidad en [−3, 1].
  assert.equal(explorarTramo(funciones, 1, 1, -3).parada, null);
});

test("sin el corte, un método de paso fijo cruzaría la singularidad sin enterarse", () => {
  const { f } = funcionesDe("2*x*y + 3*x^2 + y'*(x^2 + 4*y) = 0");
  const rk4 = integrarConPaso("rk4", f, 1, 1, 3, 0.05);
  assert.equal(rk4.detenido, null, "RK4 llega a x = 3 con un valor sin sentido");
  assert.equal(rk4.xs.at(-1), 3);
});

test("explota: y' = y² desde y(0) = 1 se detiene cerca de x = 1", () => {
  const e = explorarTramo({ f: (x, y) => y * y }, 0, 1, 2);
  assert.equal(e.parada.motivo, "explota");
  assert.ok(Math.abs(e.parada.x - 1) < 1e-3, `x = ${e.parada.x}`);
  // Hacia atrás, y = 1/(1 − x) existe en todo (−∞, 1).
  assert.equal(explorarTramo({ f: (x, y) => y * y }, 0, 1, -5).parada, null);
  // y' = y³ desde y(0) = 0.5 ⇒ y = 1/√(4 − 2x), explota en x = 2.
  const cubo = explorarTramo({ f: (x, y) => y ** 3 }, 0, 0.5, 5);
  assert.equal(cubo.parada.motivo, "explota");
  assert.ok(Math.abs(cubo.parada.x - 2) < 1e-3);
});

test("pendiente infinita con y' = f escrita directamente (N = 1)", () => {
  // y' = −1/(2√(1 − x)) ⇒ y = √(1 − x): la pendiente se hace infinita en x = 1.
  const funciones = funcionesDe("y' = -1/(2*sqrt(1 - x))");
  const e = explorarTramo(funciones, 0, 1, 2);
  assert.ok(["pendienteInfinita", "fueraDeDominio"].includes(e.parada.motivo), e.parada.motivo);
  assert.ok(Math.abs(e.parada.x - 1) < 1e-3, `x = ${e.parada.x}`);
});

test("fuera de dominio: un poco más allá f deja de ser real", () => {
  // f = √(1 − x) es finita hasta x = 1 y NaN después.
  const f = (x) => Math.sqrt(1 - x);
  assert.equal(diagnosticarParada({ f }, 1, 0.5, 1), "fueraDeDominio");
});

test("la ecuación no definida en la propia condición inicial es un error claro", () => {
  const funciones = funcionesDe("2*x*y + 3*x^2 + y'*(x^2 + 4*y) = 0");
  lanza(() => explorarTramo(funciones, 2, -1, 3), "singularEnCondicionInicial", { x0: 2, y0: -1 }); // x² + 4y = 0 en (2, −1)
});
