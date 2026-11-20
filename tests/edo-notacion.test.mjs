import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { leerEcuacion, formaNormal, ecuacionTex, latexEcuacionACodigo } from "../src/nucleo/edo/notacion.js";
import { clasificarEDO1, clasificarLinealidad } from "../src/nucleo/edo/clasificar.js";
import { compilarFuente, aJS } from "../src/nucleo/expresion.js";
import { latexACodigo } from "../comun/js/entrada/latex-a-codigo.js";
import { lanza, cerca } from "./ayuda.mjs";

/** f(x, y) de una ecuación escrita como texto (con parámetros fijados). */
function fDe(texto, valores = {}) {
  const ec = leerEcuacion(texto);
  const { f, M, N } = formaNormal(ec.F);
  const args = ["x", "y", ...ec.parametros];
  const comp = (nodo) => {
    const fn = compilarFuente(aJS(nodo), args);
    return (x, y) => fn(x, y, ...ec.parametros.map((p) => valores[p]));
  };
  return { ec, f: comp(f), M: comp(M), N: comp(N) };
}

// --- Notación ----------------------------------------------------------------------

test("todas las notaciones de primer orden dan la misma f(x, y)", () => {
  const formas = ["y' = x*y", "dy/dx = x*y", "y′ = x*y", "x*y", "y' - x*y = 0", "d y / d x = x*y"];
  for (const texto of formas) {
    const { ec, f } = fDe(texto);
    assert.equal(ec.orden, 1, texto);
    cerca(f(1.3, 0.7), 1.3 * 0.7, 1e-12, texto);
  }
});

test("la variable independiente puede ser t y la dependiente cualquier letra", () => {
  const a = leerEcuacion("dy/dt = -k*y");
  assert.equal(a.independiente, "t");
  assert.deepEqual(a.parametros, ["k"]);
  const b = leerEcuacion("x' = -2*x + t");
  assert.equal(b.dependiente, "x");
  assert.equal(b.independiente, "t");
  const { f } = fDe("x' = -2*x + t");
  cerca(f(3, 5), -10 + 3, 1e-12); // tras renombrar: f(x=t, y=x)
});

test("forma M + N·y' = 0: se obtienen M, N y f = −M/N", () => {
  const { M, N, f } = fDe("2*x*y + (x^2 + 3*y^2)*y' = 0");
  cerca(M(1.5, 2), 2 * 1.5 * 2, 1e-12);
  cerca(N(1.5, 2), 1.5 ** 2 + 3 * 4, 1e-12);
  cerca(f(1.5, 2), -(6) / (2.25 + 12), 1e-12);
});

test("orden 2 y EDP se reconocen (se resuelven en fases posteriores)", () => {
  assert.equal(leerEcuacion("y'' + y = 0").orden, 2);
  assert.equal(leerEcuacion("d^2y/dx^2 = -y").orden, 2);
  const calor = leerEcuacion("u_t = k*u_xx");
  assert.equal(calor.tipo, "edp");
  assert.equal(calor.orden, 2);
  assert.deepEqual(calor.independientes, ["t", "x"]);
  const parcial = leerEcuacion("∂u/∂t = ∂^2u/∂x^2");
  assert.equal(parcial.tipo, "edp");
  assert.equal(parcial.orden, 2);
});

test("errores de notación con su código", () => {
  lanza(() => leerEcuacion(""), "ecuacionVacia");
  lanza(() => leerEcuacion("y' = x = 2"), "variosIguales");
  lanza(() => leerEcuacion("y' = "), "ladoVacio");
  lanza(() => leerEcuacion("y' + z' = 0"), "variasDependientes");
  lanza(() => leerEcuacion("x^2 = y"), "sinDerivada");
  lanza(() => formaNormal(leerEcuacion("y'^2 = x").F), "noFormaNormal");
  lanza(() => leerEcuacion("y' = sin(x"), "parentesisSinCerrar");
});

test("la vista previa conserva la notación del usuario", () => {
  assert.match(ecuacionTex(leerEcuacion("x*y")), /^y' = x ?y$/); // KaTeX pinta igual «xy» y «x y»
  assert.match(ecuacionTex(leerEcuacion("y' + 2*y = exp(x)")), /^y' \+ 2 ?y = e\^\{x\}$/);
});

test("LaTeX del editor visual -> código, con primas, Leibniz e igual", () => {
  const a = (l) => latexEcuacionACodigo(l, (s) => latexACodigo(s, 1));
  assert.equal(a("y^{\\prime}=xy"), "y' = x*y");
  assert.equal(a("y'+2y=e^{x}"), "y'+2*y = e^(x)");
  assert.equal(a("\\frac{dy}{dt}=-ky"), "dy/dt = -k*y");
  assert.equal(a("\\frac{\\mathrm{d}y}{\\mathrm{d}x}=\\sin x"), "dy/dx = sin(x)");
  assert.equal(a("y^{\\prime\\prime}+y=0"), "y''+y = 0");
  // Y lo que sale se puede leer.
  for (const l of ["y^{\\prime}=xy", "\\frac{dy}{dt}=-ky", "y^{\\prime\\prime}+y=0"]) assert.doesNotThrow(() => leerEcuacion(a(l)));
});

// --- Clasificación en vivo ---------------------------------------------------------------

const clase = (texto, valores = {}) => {
  const { f, M, N } = fDe(texto, valores);
  return clasificarEDO1(f, { M, N });
};

test("separable, lineal, homogénea, autónoma", () => {
  const xy = clase("y' = x*y");
  assert.ok(xy.separable && xy.lineal && xy.homogenea && !xy.autonoma);
  const log = clase("y' = r*y*(1 - y/K)", { r: 1, K: 10 });
  assert.ok(log.separable && !log.lineal && log.autonoma && log.riccati);
  assert.deepEqual(log.bernoulli, { n: 2 });
  const lin = clase("y' + 2*y = exp(x)");
  assert.ok(lin.lineal && !lin.homogenea && !lin.separable);
  const sep = clase("y' = exp(x - y)");
  assert.ok(sep.separable && !sep.lineal);
});

test("Bernoulli con su n, incluso fraccionario", () => {
  assert.deepEqual(clase("y' + y/x = x*y^2").bernoulli, { n: 2 });
  assert.deepEqual(clase("y' - y = exp(x)*y^3").bernoulli, { n: 3 });
  assert.deepEqual(clase("y' = y + x*sqrt(y)").bernoulli, { n: 0.5 });
  assert.equal(clase("y' = x^2 + y^2").bernoulli, null);
});

test("exacta según la M y la N escritas", () => {
  assert.ok(clase("2*x*y + (x^2 + 3*y^2)*y' = 0").exacta);
  assert.ok(clase("y*cos(x) + 2*x*exp(y) + (sin(x) + x^2*exp(y) - 1)*y' = 0").exacta);
  assert.ok(!clase("y + 2*x*y' = 0").exacta);
});

test("Riccati y ninguna de las anteriores", () => {
  const r = clase("y' = x^2 + y^2");
  assert.ok(r.riccati && !r.separable && !r.lineal);
  const nada = clase("y' = sin(x*y)");
  assert.ok(!nada.separable && !nada.lineal && !nada.riccati && nada.bernoulli === null);
});

test("linealidad de orden 2", () => {
  const evaluarF = (texto) => {
    const ec = leerEcuacion(texto);
    const fn = compilarFuente(aJS(ec.F), ["x", "y", "D1y", "D2y"]);
    return (x, [y, p, q]) => fn(x, y, p, q);
  };
  assert.deepEqual(clasificarLinealidad(evaluarF("y'' + x*y' + y = 0")), { lineal: true, homogenea: true });
  assert.deepEqual(clasificarLinealidad(evaluarF("y'' + y = cos(x)")), { lineal: true, homogenea: false });
  assert.equal(clasificarLinealidad(evaluarF("y'' + sin(y) = 0")).lineal, false);
});
