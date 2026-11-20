import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { math } from "../comun/js/mathjs.js";
import { analizarFuncion } from "../comun/js/entrada/analizar.js";
import { enlaceJacobiano, URL_JACOBIANOS } from "../src/nucleo/edo/enlace-jacobianos.js";
import { leerOrden2, leerSistema } from "../src/nucleo/edo/plano.js";
import { clasificarEquilibrio } from "../src/nucleo/edo/equilibrios.js";

const sustituir = (nodo, valores) => nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in valores
  ? new math.ConstantNode(valores[n.name]) : n));

/** Lee el enlace como lo leería la calculadora y deriva con math.js en el punto. */
function jacobianoDelEnlace(url) {
  assert.ok(url.startsWith(`${URL_JACOBIANOS}#`));
  const pares = new URLSearchParams(url.split("#")[1]);
  const vars = pares.get("orden").split(",").map((s) => s.trim());
  const punto = Object.fromEntries(vars.map((v) => [v, Number(pares.get(`v.${v}`))]));
  const J = pares.getAll("f").map((texto) => vars.map((v) => math.derivative(analizarFuncion(texto), v).evaluate(punto)));
  return { vars, punto, J, funciones: pares.getAll("f") };
}

test("péndulo amortiguado (orden 2): posición y velocidad con los nombres del usuario", () => {
  const p = leerOrden2("x'' = -sin(x) - k*x'");
  const [f, g] = [p.f, p.g].map((n) => sustituir(n, { k: 0.5 }));
  const url = enlaceJacobiano(f, g, ["x", "v"], [Math.PI, 0]);
  const { vars, punto, J, funciones } = jacobianoDelEnlace(url);
  assert.deepEqual(vars, ["x", "v"]);
  assert.equal(funciones[0], "v");
  assert.ok(Math.abs(punto.x - Math.PI) < 1e-14);
  // En (π, 0): J = [[0, 1], [1, −0.5]], una silla.
  assert.deepEqual(J.map((fila) => fila.map((a) => Math.round(a * 1e12) / 1e12)), [[0, 1], [1, -0.5]]);
  assert.equal(clasificarEquilibrio(J).tipo, "silla");
});

test("si la dependiente se llama y, los nombres se cambian a la vez (y -> y, velocidad -> v)", () => {
  const p = leerOrden2("y'' + 2*y' + 5*y = 0");
  const { vars, J } = jacobianoDelEnlace(enlaceJacobiano(p.f, p.g, ["y", "v"], [0, 0]));
  assert.deepEqual(vars, ["y", "v"]);
  assert.deepEqual(J, [[0, 1], [-5, -2]]);
});

test("sistema: el «+» y los decimales llegan intactos", () => {
  const p = leerSistema("x*(a - b*y)", "y*(d*x - c)");
  const [f, g] = [p.f, p.g].map((n) => sustituir(n, { a: 1, b: 1, c: 0.5, d: 0.5 }));
  const { J } = jacobianoDelEnlace(enlaceJacobiano(f, g, ["x", "y"], [1, 1]));
  assert.deepEqual(J, [[0, -1], [0.5, 0]]);
  const s = leerSistema("x + y", "4*x + y");
  assert.deepEqual(jacobianoDelEnlace(enlaceJacobiano(s.f, s.g, ["x", "y"], [0, 0])).J, [[1, 1], [4, 1]]);
});

test("sin enlace si falta una variable (la calculadora daría un jacobiano 2×1)", () => {
  const p = leerSistema("-y", "-2*y");
  assert.equal(enlaceJacobiano(p.f, p.g, ["x", "y"], [0, 0]), null);
  const q = leerSistema("y", "-x");
  assert.equal(enlaceJacobiano(q.f, q.g, ["x", "y"], [NaN, 0]), null);
});
