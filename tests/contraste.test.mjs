import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { contrasteRK4 } from "../src/nucleo/edo/contraste.js";
import { dormandPrinceSistema } from "../src/nucleo/edo/sistemas.js";

const oscilador = (_t, [x, v]) => [v, -x];

test("problema tranquilo: RK4 y la referencia coinciden", () => {
  const ref = dormandPrinceSistema(oscilador, 0, [1, 0], 10, { rtol: 1e-12, atol: 1e-14 }).Ys.at(-1);
  const c = contrasteRK4(oscilador, 0, [1, 0], 10, ref);
  assert.equal(c.resultado, "ok");
  assert.ok(Math.abs(ref[0] - Math.cos(10)) < 1e-10);
});

test("una referencia equivocada se detecta como fallo (RK4 sí convergió)", () => {
  const malo = [Math.cos(10) + 1e-3, -Math.sin(10)];
  assert.equal(contrasteRK4(oscilador, 0, [1, 0], 10, malo).resultado, "falla");
});

test("Van der Pol rígido (μ = 20, t = 40): RK4 no ha convergido, así que es inconclusa y no un fallo", () => {
  const mu = 20;
  const G = (_t, [x, v]) => [v, mu * (1 - x * x) * v - x];
  const ref = dormandPrinceSistema(G, 0, [2, 0], 40, { rtol: 1e-12, atol: 1e-14 }).Ys.at(-1);
  const c = contrasteRK4(G, 0, [2, 0], 40, ref);
  assert.equal(c.resultado, "inconclusa", JSON.stringify(c));
  // Con muchos más pasos RK4 sí converge y coincide con la referencia: la referencia era buena.
  assert.equal(contrasteRK4(G, 0, [2, 0], 40, ref, { n: 64000 }).resultado, "ok");
});

test("si RK4 explota o no llega, es inconclusa", () => {
  const explota = (_t, [y]) => [y * y];
  assert.equal(contrasteRK4(explota, 0, [1], 2, [NaN]).resultado, "inconclusa");
});
