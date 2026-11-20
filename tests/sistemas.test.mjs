import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  integrarSistemaPasoFijo, integrarSistemaConPaso, dormandPrinceSistema, interpolarHermiteSistema, evaluarSistemaEn,
} from "../src/nucleo/edo/sistemas.js";
import { integrarPasoFijo } from "./referencia/paso-fijo-escalar.mjs";
import { dormandPrince } from "./referencia/dormand-prince-escalar.mjs";
import { cerca } from "./ayuda.mjs";

// Oscilador armónico x'' = −x como sistema (x, v): x = cos t, v = −sen t.
const oscilador = (t, [x, v]) => [v, -x];
// Sistema lineal con autovalores −1 y −2: x' = y, y' = −2x − 3y.
//   Con (x, y)(0) = (1, 0):  x = 2e^{−t} − e^{−2t},  y = −2e^{−t} + 2e^{−2t}
const lineal = (t, [x, y]) => [y, -2 * x - 3 * y];
const linealExacta = (t) => [2 * Math.exp(-t) - Math.exp(-2 * t), -2 * Math.exp(-t) + 2 * Math.exp(-2 * t)];

test("la solución exacta del sistema lineal es correcta (comprobación de la prueba)", () => {
  for (const t of [0, 0.4, 1.7]) {
    const d = 1e-6;
    const [xa, ya] = linealExacta(t - d);
    const [xb, yb] = linealExacta(t + d);
    const [dx, dy] = lineal(t, linealExacta(t));
    cerca((xb - xa) / (2 * d), dx, 1e-8);
    cerca((yb - ya) / (2 * d), dy, 1e-8);
  }
  assert.deepEqual(linealExacta(0), [1, 0]);
});

test("con una sola componente coincide con la implementación escalar original de la Fase 1b", () => {
  const f = (x, y) => y * (1 - y / 10) + Math.sin(x);
  const F = (x, [y]) => [f(x, y)];
  for (const m of ["euler", "heun", "rk4"]) {
    const e = integrarPasoFijo(m, f, 0, 1, 5, 97);
    const v = integrarSistemaPasoFijo(m, F, 0, [1], 5, 97);
    assert.equal(v.evaluaciones, e.evaluaciones, m);
    e.ys.forEach((y, i) => cerca(v.Ys[i][0], y, 1e-13, `${m} paso ${i}`));
  }
  const e = dormandPrince(f, 0, 1, 5, { rtol: 1e-8, atol: 1e-10 });
  const v = dormandPrinceSistema(F, 0, [1], 5, { rtol: 1e-8, atol: 1e-10 });
  assert.equal(v.evaluaciones, e.evaluaciones);
  assert.equal(v.pasos.length, e.pasos.length);
  assert.equal(v.rechazados, e.rechazados);
  cerca(v.Ys.at(-1)[0], e.ys.at(-1), 1e-12);
});

test("oscilador armónico: Euler, Heun y RK4 de órdenes 1, 2 y 4 (norma máxima del error)", () => {
  const T = 2 * Math.PI;
  for (const [m, orden] of [["euler", 1], ["heun", 2], ["rk4", 4]]) {
    const err = (N) => {
      const [x, v] = integrarSistemaPasoFijo(m, oscilador, 0, [1, 0], T, N).Ys.at(-1);
      return Math.max(Math.abs(x - 1), Math.abs(v));
    };
    cerca(Math.log2(err(800) / err(1600)), orden, 0.05, m);
  }
});

test("Euler gana energía en el oscilador (la órbita se abre en espiral); RK4 casi no", () => {
  // E = (x² + v²)/2 se conserva en la solución exacta. Con Euler, cada paso la
  // multiplica por exactamente (1 + h²): crece sin parar.
  const N = 200;
  const h = (2 * Math.PI) / N;
  const energia = ([x, v]) => (x * x + v * v) / 2;
  const euler = integrarSistemaPasoFijo("euler", oscilador, 0, [1, 0], 2 * Math.PI, N);
  cerca(energia(euler.Ys.at(-1)), 0.5 * (1 + h * h) ** N, 1e-10);
  const rk4 = integrarSistemaPasoFijo("rk4", oscilador, 0, [1, 0], 2 * Math.PI, N);
  assert.ok(Math.abs(energia(rk4.Ys.at(-1)) - 0.5) < 1e-8);
});

test("Dormand–Prince en sistemas cumple la tolerancia; FSAL: 6 evaluaciones por intento", () => {
  const r = dormandPrinceSistema(lineal, 0, [1, 0], 3, { rtol: 1e-10, atol: 1e-12 });
  assert.equal(r.detenido, null);
  linealExacta(3).forEach((v, i) => cerca(r.Ys.at(-1)[i], v, 1e-9));
  assert.equal(r.evaluaciones, 2 + 6 * (r.pasos.length + r.rechazados));
  const o = dormandPrinceSistema(oscilador, 0, [1, 0], 10 * Math.PI, { rtol: 1e-10, atol: 1e-12 });
  cerca(o.Ys.at(-1)[0], 1, 1e-7);
});

test("hacia atrás en sistemas", () => {
  const r = dormandPrinceSistema(lineal, 2, linealExacta(2), 0, { rtol: 1e-11, atol: 1e-13 });
  cerca(r.Ys.at(-1)[0], 1, 1e-8);
  cerca(r.Ys.at(-1)[1], 0, 1e-8);
  cerca(integrarSistemaConPaso("rk4", oscilador, 0, [1, 0], -Math.PI, 0.001).Ys.at(-1)[0], -1, 1e-10);
});

test("interpolación de Hermite en sistemas", () => {
  const r = dormandPrinceSistema(oscilador, 0, [1, 0], 6, { rtol: 1e-9, atol: 1e-12 });
  const [x, v] = evaluarSistemaEn(r, 2.345);
  cerca(x, Math.cos(2.345), 1e-6);
  cerca(v, -Math.sin(2.345), 1e-6);
  const d = interpolarHermiteSistema(r, 5);
  for (let i = 0; i < d.xs.length; i += 9) cerca(d.Ys[i][0], Math.cos(d.xs[i]), 1e-6);
});

test("explosión en sistemas: x' = x², y' = 0 desde (1, 0) explota en t = 1", () => {
  const r = dormandPrinceSistema((t, [x]) => [x * x, 0], 0, [1, 0], 2);
  assert.ok(r.detenido);
  assert.ok(Math.abs(r.detenido.x - 1) < 1e-3);
});

test("estudio de convergencia de sistemas: órdenes 1, 2 y 4 en el oscilador", async () => {
  const { estudioSistema, referenciaSistema } = await import("../src/nucleo/edo/estudio.js");
  const ref = referenciaSistema(oscilador, 0, [1, 0], 3);
  cerca(ref[0], Math.cos(3), 1e-11);
  cerca(ref[1], -Math.sin(3), 1e-11);
  const est = estudioSistema(oscilador, 0, [1, 0], 3, [Math.cos(3), -Math.sin(3)]);
  for (const [m, orden] of [["euler", 1], ["heun", 2], ["rk4", 4]]) {
    const p = est[m].observado.pendiente;
    assert.ok(Math.abs(p - orden) < 0.1, `${m}: pendiente ${p}`);
  }
  assert.ok(est.dopri.puntos.length >= 8);
});
