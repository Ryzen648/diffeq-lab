import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { integrarImplicitoSistema, pasoEstableEuler, rigidezSistema } from "../src/nucleo/edo/implicitos-sistema.js";
import { integrarSistemaPasoFijo, dormandPrinceSistema } from "../src/nucleo/edo/sistemas.js";
import { ordenObservado } from "../src/nucleo/convergencia.js";

// Sistema lineal rígido: x' = −x, y' = −1000·(y − x). Autovalores −1 y −1000.
const A = [[-1, 0], [1000, -1000]];
const F = (_t, [x, y]) => [A[0][0] * x + A[0][1] * y, A[1][0] * x + A[1][1] * y];
const J = () => A;
// Solución exacta desde (1, 0): x = e^{−t}, y = (1000/999)(e^{−t} − e^{−1000t}).
const exacta = (t) => [Math.exp(-t), (1000 / 999) * (Math.exp(-t) - Math.exp(-1000 * t))];

test("Euler y trapecio implícitos: orden 1 y 2 en un problema no rígido", () => {
  const G = (_t, [x, y]) => [y, -x]; // oscilador, solución cos t, −sen t
  const JG = () => [[0, 1], [-1, 0]];
  for (const [metodo, orden] of [["eulerImplicito", 1], ["trapecioImplicito", 2]]) {
    const puntos = [32, 64, 128, 256, 512].map((n) => {
      const r = integrarImplicitoSistema(metodo, G, JG, 0, [1, 0], 2, n);
      const Y = r.Ys.at(-1);
      return { h: 2 / n, error: Math.max(Math.abs(Y[0] - Math.cos(2)), Math.abs(Y[1] + Math.sin(2))) };
    });
    assert.ok(Math.abs(ordenObservado(puntos).pendiente - orden) < 0.1, metodo);
  }
});

test("rigidez: con h = 0.01 (h·1000 = 10), Euler explícito explota y los implícitos no", () => {
  const N = 100; // de 0 a 1
  const explicito = integrarSistemaPasoFijo("euler", F, 0, [1, 0], 1, N);
  assert.ok(explicito.detenido?.motivo === "explota" || Math.abs(explicito.Ys.at(-1)[1]) > 1e6);
  for (const metodo of ["eulerImplicito", "trapecioImplicito"]) {
    const r = integrarImplicitoSistema(metodo, F, J, 0, [1, 0], 1, N);
    assert.equal(r.detenido, null, metodo);
    const [x, y] = r.Ys.at(-1);
    const [xe, ye] = exacta(1);
    assert.ok(Math.abs(x - xe) < 0.01 && Math.abs(y - ye) < 0.01, `${metodo}: ${x}, ${y}`);
  }
  // Por debajo del límite 2/1000 Euler explícito sí es estable.
  const fino = integrarSistemaPasoFijo("euler", F, 0, [1, 0], 1, 600);
  assert.equal(fino.detenido, null);
  assert.ok(Math.abs(fino.Ys.at(-1)[1] - exacta(1)[1]) < 1e-3);
});

test("el trapecio no amortigua la componente rápida: oscila (no es L-estable); Euler implícito sí la apaga", () => {
  const N = 10; // h = 0.1, hλ = −100
  const trapecio = integrarImplicitoSistema("trapecioImplicito", F, J, 0, [1, 0], 1, N);
  const euler = integrarImplicitoSistema("eulerImplicito", F, J, 0, [1, 0], 1, N);
  // Diferencia con la componente lenta (1000/999)·x: en el trapecio cambia de signo paso a paso.
  const rapida = (r) => r.Ys.map(([x, y]) => y - (1000 / 999) * x);
  const signos = rapida(trapecio).slice(1).map(Math.sign);
  assert.ok(signos.every((s, i) => i === 0 || s === -signos[i - 1]), "alterna de signo");
  assert.ok(Math.abs(rapida(euler).at(-1)) < 1e-6);
});

test("paso máximo estable de Euler: 2/|λ| para λ real, −2·Re λ/|λ|² para complejos", () => {
  assert.equal(pasoEstableEuler({ re: -1000, im: 0 }), 0.002);
  assert.ok(Math.abs(pasoEstableEuler({ re: -1, im: 2 }) - 0.4) < 1e-15);
  assert.equal(pasoEstableEuler({ re: 0, im: 1 }), Infinity);
});

test("rigidez a lo largo de la solución de Van der Pol con μ = 20", () => {
  const mu = 20;
  const G = (_t, [x, v]) => [v, mu * (1 - x * x) * v - x];
  const JG = (_t, [x, v]) => [[0, 1], [-2 * mu * x * v - 1, mu * (1 - x * x)]];
  const sol = dormandPrinceSistema(G, 0, [2, 0], 40, { rtol: 1e-8, atol: 1e-10 });
  const { lambda, hEuler } = rigidezSistema(JG, sol.xs, sol.Ys);
  // Fuera del tramo rápido, x ≈ ±2: el modo rápido es ≈ μ(1 − x²) ≈ −60.
  assert.ok(lambda.re < -50, `${lambda.re}`);
  assert.ok(hEuler < 2 / 50);
});
