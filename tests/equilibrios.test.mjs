import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  autovalores, autovectorReal, clasificarEquilibrio, buscarEquilibrios, jacobianoNumerico, jacobianoSimbolico,
} from "../src/nucleo/edo/equilibrios.js";
import { dormandPrinceSistema } from "../src/nucleo/edo/sistemas.js";
import { prepararExpresion } from "../src/nucleo/expresion.js";
import { cerca } from "./ayuda.mjs";

// --- Clasificación de matrices canónicas ------------------------------------------------

test("cada región del plano traza–determinante", () => {
  const casos = [
    [[[-1, 0], [0, -2]], "nodoEstable", "asintotica"],
    [[[1, 0], [0, 2]], "nodoInestable", "inestable"],
    [[[1, 0], [0, -1]], "silla", "inestable"],
    [[[-1, 2], [-2, -1]], "focoEstable", "asintotica"],
    [[[1, 2], [-2, 1]], "focoInestable", "inestable"],
    [[[0, 1], [-1, 0]], "centro", "indeterminada"],
    [[[-1, 1], [0, -1]], "nodoDegeneradoEstable", "asintotica"],
    [[[2, 1], [0, 2]], "nodoDegeneradoInestable", "inestable"],
    [[[-3, 0], [0, -3]], "estrellaEstable", "asintotica"],
    [[[0, 1], [0, 0]], "degenerado", "indeterminada"],
    [[[0, 1], [0, -1]], "degenerado", "indeterminada"],
  ];
  for (const [J, tipo, estabilidad] of casos) {
    const c = clasificarEquilibrio(J);
    assert.equal(c.tipo, tipo, JSON.stringify(J));
    assert.equal(c.estabilidad, estabilidad, JSON.stringify(J));
  }
});

test("los autovalores y autovectores cumplen J·v = λ·v", () => {
  for (const J of [[[0, 1], [-2, -3]], [[4, 1], [2, 3]], [[1, 1e-8], [0, -1]], [[-1, 2], [-2, -1]]]) {
    const ls = autovalores(J);
    // Traza y determinante se conservan.
    cerca(ls[0].re + ls[1].re, J[0][0] + J[1][1], 1e-12);
    if (ls[0].im === 0) {
      cerca(ls[0].re * ls[1].re, J[0][0] * J[1][1] - J[0][1] * J[1][0], 1e-12);
      for (const l of ls) {
        const v = autovectorReal(J, l.re);
        cerca(J[0][0] * v[0] + J[0][1] * v[1], l.re * v[0], 1e-12);
        cerca(J[1][0] * v[0] + J[1][1] * v[1], l.re * v[1], 1e-12);
      }
    } else {
      cerca(ls[0].re ** 2 + ls[0].im ** 2, J[0][0] * J[1][1] - J[0][1] * J[1][0], 1e-12);
    }
  }
  // x' = y, y' = −2x − 3y: autovalores −1 y −2 (los mismos que da SymPy).
  const [l1, l2] = autovalores([[0, 1], [-2, -3]]);
  cerca(l1.re, -1, 1e-15);
  cerca(l2.re, -2, 1e-15);
});

test("sin cancelación: autovalores muy distintos en tamaño", () => {
  // λ = −1e8 y −1e−8: la fórmula ingenua perdería el pequeño.
  const [l1, l2] = autovalores([[-1e8, 0], [0, -1e-8]]);
  cerca(l1.re, -1e-8, 1e-12);
  cerca(l2.re, -1e8, 1e-12);
});

// --- Búsqueda de equilibrios en sistemas conocidos -------------------------------------------

/** f, g y el jacobiano simbólico a partir de texto. */
function sistema(fTexto, gTexto) {
  const f = prepararExpresion(fTexto, ["x", "y"], { parametrosPermitidos: false });
  const g = prepararExpresion(gTexto, ["x", "y"], { parametrosPermitidos: false });
  const J = jacobianoSimbolico([f.nodo, g.nodo], ["x", "y"]);
  return { F: (x, y) => [f.fn(x, y), g.fn(x, y)], J: J.fn };
}

test("péndulo amortiguado: los cinco equilibrios de [−7, 7] (SymPy solve solo devuelve 0 y π)", () => {
  const { F, J } = sistema("y", "-sin(x) - 0.2*y");
  const { equilibrios } = buscarEquilibrios(F, J, [-7, 7], [-3, 3]);
  assert.deepEqual(equilibrios.map((e) => Math.round(e.x / Math.PI)), [-2, -1, 0, 1, 2]);
  for (const e of equilibrios) {
    cerca(e.x, Math.round(e.x / Math.PI) * Math.PI, 1e-10);
    assert.equal(e.y, 0);
    // Los pares (2kπ) son focos estables (abajo); los impares ((2k+1)π), sillas (arriba).
    assert.equal(e.tipo, Math.round(e.x / Math.PI) % 2 === 0 ? "focoEstable" : "silla");
  }
});

test("Lotka–Volterra: silla en el origen y centro lineal (no hiperbólico) en (1, 1)", () => {
  const { F, J } = sistema("x*(1 - y)", "0.5*y*(x - 1)");
  const { equilibrios } = buscarEquilibrios(F, J, [-0.5, 3], [-0.5, 3]);
  assert.equal(equilibrios.length, 2);
  const [origen, interior] = equilibrios;
  assert.equal(origen.tipo, "silla");
  assert.equal(interior.tipo, "centro");
  assert.equal(interior.hiperbolico, false);
  assert.equal(interior.estabilidad, "indeterminada");
});

test("competencia de especies: cuatro equilibrios, biestabilidad con una silla en (1, 1)", () => {
  const { F, J } = sistema("x*(3 - x - 2*y)", "y*(2 - x - y)");
  const { equilibrios } = buscarEquilibrios(F, J, [-0.5, 3.5], [-0.5, 2.5]);
  const tipo = (x, y) => equilibrios.find((e) => Math.abs(e.x - x) < 1e-9 && Math.abs(e.y - y) < 1e-9)?.tipo;
  assert.equal(equilibrios.length, 4);
  assert.equal(tipo(0, 0), "nodoInestable");
  assert.equal(tipo(3, 0), "nodoEstable");
  assert.equal(tipo(0, 2), "nodoEstable");
  assert.equal(tipo(1, 1), "silla");
});

test("Van der Pol (μ = 1): un único equilibrio, foco inestable (de ahí sale el ciclo límite)", () => {
  const { F, J } = sistema("y", "(1 - x^2)*y - x");
  const { equilibrios } = buscarEquilibrios(F, J, [-3, 3], [-3, 3]);
  assert.equal(equilibrios.length, 1);
  assert.equal(equilibrios[0].tipo, "focoInestable");
});

test("una recta entera de equilibrios se detecta como «demasiados»", () => {
  const { F, J } = sistema("0*x", "x - y"); // f ≡ 0: toda la recta y = x es de equilibrios
  // Ventana asimétrica a propósito: ninguna semilla cae justo sobre y = x, así
  // que hay que llegar a la recta (el jacobiano es singular en todas partes).
  const r = buscarEquilibrios(F, J, [-2, 2.3], [-1.7, 2], { maximo: 10 });
  assert.equal(r.demasiados, true);
  assert.ok(r.equilibrios.every((e) => e.tipo === "degenerado" && Math.abs(e.x - e.y) < 1e-9));
});

test("el jacobiano simbólico coincide con el numérico", () => {
  const f = prepararExpresion("x*exp(y) - sin(x*y)", ["x", "y"]);
  const g = prepararExpresion("x^2*y + cos(y)", ["x", "y"]);
  const Js = jacobianoSimbolico([f.nodo, g.nodo], ["x", "y"]).fn(0.7, -0.4);
  const Jn = jacobianoNumerico((x, y) => [f.fn(x, y), g.fn(x, y)], 0.7, -0.4);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cerca(Js[i][j], Jn[i][j], 1e-8);
});

test("Hartman–Grobman: un centro lineal puede ser un foco en el sistema no lineal", () => {
  // x' = −y + x(x² + y²), y' = x + y(x² + y²): J(0) = [[0, −1], [1, 0]] (centro), pero r' = r³.
  const { F, J } = sistema("-y + x*(x^2 + y^2)", "x + y*(x^2 + y^2)");
  const c = clasificarEquilibrio(J(0, 0));
  assert.equal(c.tipo, "centro");
  assert.equal(c.estabilidad, "indeterminada");
  // La órbita que empieza en r = 0.1 se aleja: r(t) = 1/√(100 − 2t), así que en t = 40, r = 1/√20.
  const r = dormandPrinceSistema((t, [x, y]) => F(x, y), 0, [0.1, 0], 40, { rtol: 1e-10, atol: 1e-12 });
  const [x, y] = r.Ys.at(-1);
  cerca(Math.hypot(x, y), 1 / Math.sqrt(20), 1e-7);
});
