import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { sumaRiemann, puntoMedio, trapecio, simpson } from "../src/nucleo/cuadratura/riemann.js";
import { nodosGaussLegendre, gaussLegendre } from "../src/nucleo/cuadratura/gauss-legendre.js";
import { simpsonAdaptativo } from "../src/nucleo/cuadratura/adaptativa.js";
import { estudioConvergencia, estudioGaussPuntos } from "../src/nucleo/cuadratura/estudio.js";
import { ordenObservado } from "../src/nucleo/convergencia.js";
import { lanza, cerca } from "./ayuda.mjs";

// Integrales con valor exacto conocido.
const E_MENOS_1 = Math.E - 1;                   // ∫₀¹ eˣ dx

// --- Reglas básicas -------------------------------------------------------------

test("Riemann: rectángulos, extremos y desigualdad para f creciente", () => {
  const izq = sumaRiemann(Math.exp, 0, 1, 10, "izquierda");
  const der = sumaRiemann(Math.exp, 0, 1, 10, "derecha");
  assert.equal(izq.rectangulos.length, 10);
  assert.equal(izq.rectangulos[0].x0, 0);
  assert.equal(izq.rectangulos.at(-1).x1, 1);
  assert.ok(izq.valor < E_MENOS_1 && E_MENOS_1 < der.valor, "con f creciente, izquierda < integral < derecha");
  // La media de izquierda y derecha es exactamente el trapecio.
  cerca((izq.valor + der.valor) / 2, trapecio(Math.exp, 0, 1, 10), 1e-14);
});

test("punto medio y trapecio son exactos para rectas; Simpson para cúbicas", () => {
  const recta = (x) => 3 * x - 1;            // ∫₀² = 4
  cerca(puntoMedio(recta, 0, 2, 1), 4, 1e-15);
  cerca(trapecio(recta, 0, 2, 1), 4, 1e-15);
  const cubica = (x) => x ** 3 - 2 * x ** 2;  // ∫₀³ = 81/4 − 18 = 2.25
  cerca(simpson(cubica, 0, 3, 2), 2.25, 1e-14);
});

test("errores de uso: Simpson con n impar, n no válido, integrando no finito", () => {
  lanza(() => simpson(Math.exp, 0, 1, 3), "simpsonImpar", { n: 3 });
  lanza(() => trapecio(Math.exp, 0, 1, 0), "subintervalosInvalidos");
  lanza(() => sumaRiemann((x) => 1 / x, 0, 1, 4, "izquierda"), "integrandoNoFinito", { x: 0 });
});

// --- Gauss–Legendre --------------------------------------------------------------

test("nodos y pesos de Gauss–Legendre conocidos", () => {
  const dos = nodosGaussLegendre(2);
  cerca(dos.nodos[1], 1 / Math.sqrt(3), 1e-15);
  cerca(dos.pesos[0], 1, 1e-15);
  const tres = nodosGaussLegendre(3);
  assert.equal(tres.nodos[1], 0);
  cerca(tres.nodos[2], Math.sqrt(3 / 5), 1e-15);
  cerca(tres.pesos[1], 8 / 9, 1e-15);
  cerca(tres.pesos[0], 5 / 9, 1e-15);
});

const factorial = (k) => (k <= 1 ? 1 : k * factorial(k - 1));

test("los pesos suman 2 y la regla de n puntos es exacta hasta grado 2n − 1 (y no más)", () => {
  for (let n = 1; n <= 30; n++) {
    const { nodos, pesos } = nodosGaussLegendre(n);
    cerca(pesos.reduce((s, w) => s + w, 0), 2, 1e-13, `n = ${n}`);
    const momento = (k) => nodos.reduce((s, t, i) => s + pesos[i] * t ** k, 0);
    // ∫₋₁¹ t^k dt = 2/(k + 1) si k es par.
    cerca(momento(2 * n - 2), 2 / (2 * n - 1), 1e-12, `grado ${2 * n - 2}, n = ${n}`);
    if (n <= 8) {
      // Con t^{2n} ya no es exacta, y el error tiene fórmula cerrada (la derivada 2n-ésima es (2n)!):
      //   E = 2^{2n+1} (n!)⁴ / ((2n + 1) ((2n)!)²).
      const esperado = (2 ** (2 * n + 1) * factorial(n) ** 4) / ((2 * n + 1) * factorial(2 * n) ** 2);
      const error = 2 / (2 * n + 1) - momento(2 * n);
      assert.ok(Math.abs(error - esperado) < 1e-9 * esperado + 1e-15, `n = ${n}: error ${error}, fórmula ${esperado}`);
    }
  }
});

test("Gauss–Legendre con pocos puntos ya da casi la precisión de la máquina para eˣ", () => {
  cerca(gaussLegendre(Math.exp, 0, 1, 6), E_MENOS_1, 1e-13);
  cerca(gaussLegendre(Math.sin, 0, Math.PI, 10), 2, 1e-13);
});

// --- Órdenes de convergencia ------------------------------------------------------

test("el orden observado coincide con el teórico para f suave (eˣ en [0, 1])", () => {
  const estudio = estudioConvergencia(Math.exp, 0, 1, E_MENOS_1);
  for (const [id, r] of Object.entries(estudio)) {
    assert.ok(r.observado, `${id}: sin puntos útiles`);
    assert.ok(Math.abs(r.observado.pendiente - r.ordenTeorico) < 0.15,
      `${id}: pendiente ${r.observado.pendiente.toFixed(3)}, teórica ${r.ordenTeorico}`);
  }
});

test("con √x en [0, 1] el orden baja: no se le atribuye a Simpson un orden 4 que no tiene", () => {
  const estudio = estudioConvergencia(Math.sqrt, 0, 1, 2 / 3, { metodos: ["trapecio", "simpson"] });
  // El error del trapecio y de Simpson para √x es O(h^1.5): la derivada no está acotada en 0.
  for (const id of ["trapecio", "simpson"]) {
    const p = estudio[id].observado.pendiente;
    assert.ok(Math.abs(p - 1.5) < 0.1, `${id}: pendiente ${p.toFixed(3)}, se esperaba ≈ 1.5`);
  }
});

test("Gauss–Legendre de n puntos converge exponencialmente para eˣ", () => {
  const puntos = estudioGaussPuntos(Math.exp, 0, 1, E_MENOS_1, 8);
  for (let i = 1; i < 5; i++) assert.ok(puntos[i].error < puntos[i - 1].error / 50, `n = ${i + 1}`);
});

test("ordenObservado descarta el piso de redondeo y los puntos que dejan de bajar", () => {
  const puntos = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125].map((h) => ({ h, error: 3 * h ** 2 }));
  puntos.push({ h: 0.015625, error: 1e-15 }, { h: 0.0078125, error: 4e-15 });
  const r = ordenObservado(puntos);
  assert.ok(Math.abs(r.pendiente - 2) < 1e-12);
  assert.ok(r.usados.every((p) => p.error > 1e-13));
  assert.equal(ordenObservado([{ h: 1, error: 1 }, { h: 0.5, error: 0.5 }]), null);
});

// --- Adaptativa ----------------------------------------------------------------------

test("Simpson adaptativo cumple la tolerancia y refina donde f cambia bruscamente", () => {
  // Pico estrecho en x = 0.5: ∫₀¹ 1/(1 + (100(x − 0.5))²) dx = atan(50)/50.
  const pico = (x) => 1 / (1 + (100 * (x - 0.5)) ** 2);
  const r = simpsonAdaptativo(pico, 0, 1, { tol: 1e-10 });
  assert.equal(r.agotado, false);
  cerca(r.valor, Math.atan(50) / 50, 1e-9);
  const ancho = ([p, q]) => q - p;
  const cerca05 = r.intervalos.filter(([p, q]) => p <= 0.5 && 0.5 <= q).map(ancho);
  const borde = r.intervalos.filter(([p]) => p === 0).map(ancho);
  assert.ok(Math.min(...cerca05) < borde[0] / 20, "los trozos junto al pico son mucho más pequeños que en el borde");
  // Los trozos cubren [0, 1] sin huecos.
  assert.equal(r.intervalos[0][0], 0);
  assert.equal(r.intervalos.at(-1)[1], 1);
  for (let i = 1; i < r.intervalos.length; i++) assert.equal(r.intervalos[i][0], r.intervalos[i - 1][1]);
});

test("Simpson adaptativo con √x refina junto a 0 y llega al valor exacto", () => {
  const r = simpsonAdaptativo(Math.sqrt, 0, 1, { tol: 1e-10 });
  cerca(r.valor, 2 / 3, 1e-9);
  assert.ok(r.intervalos[0][1] < 1e-6, "el primer trozo es diminuto: ahí está la dificultad");
});

test("si se agota el presupuesto lo dice en vez de presentar el valor como fiable", () => {
  const r = simpsonAdaptativo((x) => Math.sin(1 / x), 1e-6, 1, { tol: 1e-14, maxEvaluaciones: 2000 });
  assert.equal(r.agotado, true);
});
