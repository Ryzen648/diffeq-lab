import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { separatrices } from "../src/nucleo/edo/separatrices.js";
import { buscarEquilibrios, jacobianoNumerico, clasificarEquilibrio } from "../src/nucleo/edo/equilibrios.js";

const ventana = (x, y) => ({ x, y });

test("silla lineal: las separatrices son las rectas de los autovectores", () => {
  // x' = x + y, y' = 4x + y: λ = 3 con (1, 2) e λ = −1 con (1, −2).
  const F = (x, y) => [x + y, 4 * x + y];
  const silla = { x: 0, y: 0, ...clasificarEquilibrio([[1, 1], [4, 1]]) };
  const s = separatrices(F, silla, ventana([-3, 3], [-3, 3]));
  const comprobar = (ramas, pendiente) => {
    for (const { xs, ys } of ramas) {
      assert.ok(xs.length > 20);
      for (let i = 0; i < xs.length; i++) assert.ok(Math.abs(ys[i] - pendiente * xs[i]) < 1e-6, `${xs[i]}, ${ys[i]}`);
      // Llega hasta el borde de la ventana ampliada (no se queda en la silla).
      assert.ok(Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) > 2.5);
    }
  };
  comprobar(s.inestables, 2);
  comprobar(s.estables, -2);
  // Las dos ramas de cada variedad salen en sentidos opuestos.
  assert.ok(Math.sign(s.inestables[0].xs.at(-1)) !== Math.sign(s.inestables[1].xs.at(-1)));
});

test("péndulo: las separatrices de la silla en π están en el nivel de energía H = 1", () => {
  const F = (x, y) => [y, -Math.sin(x)];
  const v = ventana([-7, 7], [-3, 3]);
  const { equilibrios } = buscarEquilibrios(F, (x, y) => jacobianoNumerico(F, x, y), v.x, v.y);
  const silla = equilibrios.find((e) => e.tipo === "silla" && e.x > 0);
  assert.ok(Math.abs(silla.x - Math.PI) < 1e-12);
  const s = separatrices(F, silla, v);
  const H = (x, y) => (y * y) / 2 - Math.cos(x);
  let peor = 0;
  for (const { xs, ys } of [...s.estables, ...s.inestables]) {
    assert.ok(xs.length > 20);
    for (let i = 0; i < xs.length; i++) peor = Math.max(peor, Math.abs(H(xs[i], ys[i]) - 1));
  }
  // Se miden también los puntos interpolados entre pasos (Hermite cúbico): es la exactitud de la
  // curva dibujada (≈10⁻⁶, muy por debajo de un píxel), no solo la de la integración.
  assert.ok(peor < 1e-5, `desviación de energía ${peor}`);
  // La rama inestable que sale hacia arriba llega a la otra silla, en 3π (fuera) o cruza la ventana entera.
  const arriba = s.inestables.find((r) => r.ys[5] > 0);
  assert.ok(arriba.xs.at(-1) > 6.5);
});

test("sin separatrices si no es una silla", () => {
  const F = (x, y) => [y, -x - y];
  const foco = { x: 0, y: 0, ...clasificarEquilibrio([[0, 1], [-1, -1]]) };
  assert.equal(separatrices(F, foco, ventana([-1, 1], [-1, 1])), null);
});
