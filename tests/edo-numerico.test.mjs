import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { integrarPasoFijo, integrarConPaso } from "../src/nucleo/edo/paso-fijo.js";
import { dormandPrince, interpolarHermite, evaluarEn } from "../src/nucleo/edo/dormand-prince.js";
import { integrarImplicito } from "../src/nucleo/edo/implicitos.js";
import { campoDirecciones } from "../src/nucleo/edo/campo.js";
import { estudioEDO } from "../src/nucleo/edo/estudio.js";
import { cerca } from "./ayuda.mjs";

// Problemas con solución exacta conocida.
const crecimiento = { f: (x, y) => y, y: (x) => Math.exp(x) };                          // y' = y, y(0) = 1
const gaussiana = { f: (x, y) => -2 * x * y, y: (x) => Math.exp(-x * x) };              // y' = −2xy, y(0) = 1
const logistica = (r, K, y0) => ({                                                      // y' = r y (1 − y/K)
  f: (x, y) => r * y * (1 - y / K),
  y: (x) => K / (1 + (K / y0 - 1) * Math.exp(-r * x)),
});
// Rígida: y' = −50(y − cos x), y(0) = 0  ⇒  y = (2500 cos x + 50 sen x)/2501 − (2500/2501) e^{−50x}
const rigida = {
  f: (x, y) => -50 * (y - Math.cos(x)),
  y: (x) => (2500 * Math.cos(x) + 50 * Math.sin(x)) / 2501 - (2500 / 2501) * Math.exp(-50 * x),
};

test("la fórmula exacta del problema rígido cumple la EDO (comprobación de la propia prueba)", () => {
  for (const x of [0, 0.1, 0.7, 1.4]) {
    const d = 1e-6;
    const derivada = (rigida.y(x + d) - rigida.y(x - d)) / (2 * d);
    assert.ok(Math.abs(derivada - rigida.f(x, rigida.y(x))) < 1e-6);
  }
  assert.equal(rigida.y(0), 0);
});

test("Euler, Heun y RK4 tienen órdenes 1, 2 y 4 en y' = y y en y' = −2xy", () => {
  for (const problema of [crecimiento, gaussiana]) {
    const estudio = estudioEDO(problema.f, 0, 1, 1, problema.y(1));
    for (const [id, esperado] of [["euler", 1], ["heun", 2], ["rk4", 4]]) {
      const p = estudio[id].observado.pendiente;
      assert.ok(Math.abs(p - esperado) < 0.1, `${id}: pendiente ${p.toFixed(3)}, teórica ${esperado}`);
    }
  }
});

test("RK4 con h = 0.1 en la logística: error < 1e-6", () => {
  const p = logistica(1, 10, 1);
  const r = integrarConPaso("rk4", p.f, 0, 1, 10, 0.1);
  assert.equal(r.xs.at(-1), 10);
  cerca(r.ys.at(-1), p.y(10), 1e-6);
  assert.equal(r.evaluaciones, 400);
});

test("integrar hacia atrás (x final < x inicial) funciona", () => {
  const r = integrarPasoFijo("rk4", crecimiento.f, 1, Math.E, 0, 100);
  cerca(r.ys.at(-1), 1, 1e-8);
});

test("Dormand–Prince cumple la tolerancia y usa 6 evaluaciones por paso (FSAL)", () => {
  for (const problema of [crecimiento, gaussiana]) {
    const r = dormandPrince(problema.f, 0, 1, 2, { rtol: 1e-10, atol: 1e-12 });
    assert.equal(r.detenido, null);
    cerca(r.ys.at(-1), problema.y(2), 1e-8);
    // 1 (f0) + 1 (paso inicial) + 6 por cada intento de paso (aceptado o rechazado)
    assert.equal(r.evaluaciones, 2 + 6 * (r.pasos.length + r.rechazados));
  }
});

test("Dormand–Prince: más tolerancia → menos pasos; menos tolerancia → más precisión", () => {
  const p = logistica(1, 10, 1);
  const flojo = dormandPrince(p.f, 0, 1, 10, { rtol: 1e-3, atol: 1e-6 });
  const fino = dormandPrince(p.f, 0, 1, 10, { rtol: 1e-10, atol: 1e-13 });
  assert.ok(flojo.pasos.length < fino.pasos.length);
  assert.ok(Math.abs(fino.ys.at(-1) - p.y(10)) < Math.abs(flojo.ys.at(-1) - p.y(10)));
  cerca(fino.ys.at(-1), p.y(10), 1e-8);
});

test("rigidez y Dormand–Prince: el paso queda atado al límite de estabilidad, no a la precisión", () => {
  // Con tolerancia floja hasta x = 20, la solución ya es suave (≈ cos x), pero
  // un método explícito no puede dar pasos mayores que ≈ 3.3/|λ| sin volverse
  // inestable. Medido: 336 pasos con λ = −50 frente a 28 con λ = −1.
  const opciones = { rtol: 1e-3, atol: 1e-6 };
  const rigido = dormandPrince(rigida.f, 0, 0, 20, opciones);
  const suave = dormandPrince((x, y) => -(y - Math.cos(x)), 0, 0, 20, opciones);
  assert.ok(rigido.pasos.length > 5 * suave.pasos.length, `${rigido.pasos.length} pasos frente a ${suave.pasos.length}`);
  const hMedio = 20 / rigido.pasos.length;
  assert.ok(hMedio < 3.3 / 50 * 1.2, `paso medio ${hMedio}, límite de estabilidad ≈ ${3.3 / 50}`);
  const fino = dormandPrince(rigida.f, 0, 0, 1.5, { rtol: 1e-8, atol: 1e-11 });
  cerca(fino.ys.at(-1), rigida.y(1.5), 1e-7);
});

test("la interpolación de Hermite reproduce la solución entre pasos", () => {
  const r = dormandPrince(crecimiento.f, 0, 1, 2, { rtol: 1e-9, atol: 1e-12 });
  const denso = interpolarHermite(r, 10);
  for (let i = 0; i < denso.xs.length; i += 7) cerca(denso.ys[i], Math.exp(denso.xs[i]), 1e-6);
  cerca(evaluarEn(r, 1.2345), Math.exp(1.2345), 1e-6);
});

test("rigidez: Euler explícito explota con h > 2/50 y es estable con h < 2/50; Euler implícito, siempre", () => {
  const explosivo = integrarConPaso("euler", rigida.f, 0, 0, 1.5, 0.05);   // |1 + hλ| = 1.5
  const estable = integrarConPaso("euler", rigida.f, 0, 0, 1.5, 0.03);     // |1 + hλ| = 0.5
  const N = Math.round(1.5 / 0.05);
  const implicito = integrarImplicito("eulerImplicito", rigida.f, 0, 0, 1.5, N);
  const maximo = (r) => Math.max(...r.ys.map(Math.abs));
  assert.ok(maximo(explosivo) > 1e3, `Euler con h = 0.05 debería crecer sin control (máx ${maximo(explosivo)})`);
  // Con h = 0.03 es estable, aunque el primer paso se pasa (y₁ = 0.03·50 = 1.5) antes de asentarse.
  assert.ok(maximo(estable) <= 1.5 + 1e-12);
  assert.ok(Math.abs(estable.ys.at(-1) - rigida.y(1.5)) < 0.01);
  assert.ok(maximo(implicito) < 1.1, "el implícito no se pasa: amortigua la parte rápida");
  cerca(implicito.ys.at(-1), rigida.y(1.5), 1e-3);
});

test("Euler implícito y trapecio implícito tienen órdenes 1 y 2", () => {
  const ref = gaussiana.y(1);
  for (const [metodo, orden] of [["eulerImplicito", 1], ["trapecioImplicito", 2]]) {
    const e1 = Math.abs(integrarImplicito(metodo, gaussiana.f, 0, 1, 1, 200).ys.at(-1) - ref);
    const e2 = Math.abs(integrarImplicito(metodo, gaussiana.f, 0, 1, 1, 400).ys.at(-1) - ref);
    cerca(Math.log2(e1 / e2), orden, 0.05, metodo);
  }
});

test("trapecio implícito no explota con h grande pero la parte rápida oscila (no es L-estable)", () => {
  const r = integrarImplicito("trapecioImplicito", (x, y) => -1000 * y, 0, 1, 1, 10); // hλ = −100
  const signos = r.ys.slice(1, 6).map(Math.sign);
  assert.ok(signos.some((s, i) => i > 0 && s !== signos[i - 1]), "debe alternar de signo");
  assert.ok(Math.max(...r.ys.map(Math.abs)) <= 1);
});

test("una solución que explota en tiempo finito se detiene y lo dice", () => {
  // y' = y², y(0) = 1  ⇒  y = 1/(1 − x), explota en x = 1.
  const r = dormandPrince((x, y) => y * y, 0, 1, 2);
  assert.ok(r.detenido);
  assert.ok(r.detenido.x < 1.0001 && r.detenido.x > 0.99, `se detuvo en ${r.detenido.x}`);
  const fijo = integrarPasoFijo("rk4", (x, y) => y * y, 0, 1, 2, 2000);
  assert.ok(fijo.detenido);
});

test("campo de direcciones: segmentos de igual longitud en pantalla y con la pendiente correcta", () => {
  const f = (x, y) => x - y;
  const xr = [0, 10];
  const yr = [0, 100];
  const c = campoDirecciones(f, xr, yr, { nx: 5, ny: 4 });
  assert.equal(c.validos, 20);
  const longitudes = [];
  for (let i = 0; i < c.xs.length; i += 3) {
    const dx = (c.xs[i + 1] - c.xs[i]) / 10;
    const dy = (c.ys[i + 1] - c.ys[i]) / 100;
    longitudes.push(Math.hypot(dx, dy));
    const xm = (c.xs[i] + c.xs[i + 1]) / 2;
    const ym = (c.ys[i] + c.ys[i + 1]) / 2;
    cerca((c.ys[i + 1] - c.ys[i]) / (c.xs[i + 1] - c.xs[i]), f(xm, ym), 1e-9);
  }
  for (const l of longitudes) cerca(l, longitudes[0], 1e-12);
});

test("campo de direcciones: sin segmentos donde f no está definida", () => {
  const c = campoDirecciones((x, y) => Math.sqrt(y), [0, 1], [-1, 1], { nx: 3, ny: 3 });
  assert.equal(c.validos, 6); // la fila y = −1 queda fuera del dominio
});
