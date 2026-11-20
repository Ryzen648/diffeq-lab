import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mathjs from "mathjs";

import { aPython } from "../src/nucleo/python.js";
import { analizarFuncion } from "../comun/js/entrada/analizar.js";
import { FUNCIONES } from "../comun/js/entrada/lenguaje.js";

const py = (texto, estilo) => aPython(analizarFuncion(texto), estilo);

test("operadores y precedencia como en Python", () => {
  assert.equal(py("x^2*y + sin(x*y)"), "x**2*y + sin(x*y)");
  assert.equal(py("x - (y - z)"), "x - (y - z)");
  assert.equal(py("x / (y*z)"), "x/(y*z)");
  assert.equal(py("(x^2)^3"), "(x**2)**3");
  assert.equal(py("x^(2^3)"), "x**2**3");
  assert.equal(py("-x^2"), "-x**2");
  assert.equal(py("(-x)^2"), "(-x)**2");
  assert.equal(py("2*pi*e"), "2*pi*E");
  assert.equal(py("0.3*x"), "0.3*x");
});

test("cada función admitida tiene traducción en ambos estilos", () => {
  for (const nombre of FUNCIONES) {
    const texto = nombre === "nthRoot" ? "nthRoot(x, 3)" : `${nombre}(x)`;
    assert.doesNotThrow(() => py(texto, "sympy"), nombre);
    assert.doesNotThrow(() => py(texto, "numpy"), nombre);
  }
  assert.equal(py("ln(x) + log10(x)", "sympy"), "log(x) + log(x, 10)");
  assert.equal(py("abs(x)", "sympy"), "Abs(x)");
  assert.equal(py("sec(x)", "numpy"), "1/np.cos(x)");
});

test("el estilo numpy da el mismo valor que math.js (evaluado con una traducción mínima)", () => {
  // Evalúa el texto de NumPy en JS sustituyendo np.* por Math.*: comprueba paréntesis y precedencia.
  // (JS no admite `-x**2` sin paréntesis, aunque Python sí: ese caso está en la prueba de texto exacto.)
  const np = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, sqrt: Math.sqrt,
    arctan: Math.atan, abs: Math.abs, cbrt: Math.cbrt, sign: Math.sign, pi: Math.PI, e: Math.E, cosh: Math.cosh };
  const casos = ["x^2*y - (y - x)/(x*y)", "sec(x)^2 - tan(x)^2", "x^2 + 2^-1", "exp(-x/2)*cos(3*x)", "acot(x)", "nthRoot(x - 3, 3)"];
  for (const texto of casos) {
    const codigo = py(texto, "numpy");
    const fn = new Function("np", "x", "y", `return ${codigo};`);
    for (const [x, y] of [[0.7, 1.3], [2.1, -0.4]]) {
      const esperado = mathjs.evaluate(texto.replace("nthRoot(x - 3, 3)", "cbrt(x - 3)"), { x, y });
      assert.ok(Math.abs(fn(np, x, y) - esperado) < 1e-12, `${texto} → ${codigo}`);
    }
  }
});

test("paréntesis anidados (los que escribe el editor visual) no cambian la expresión", () => {
  // Caso real: el editor visual guardaba x/(x^2+1)^(5/2) como ((x)/((x^(2)+1)^(((5)/(2))))) y
  // SymPy recibía x/(x**2 + 1)**5/2, es decir x/(2(x²+1)⁵): otra integral.
  assert.equal(py("((x)/((x^(2)+1)^(((5)/(2)))))"), "x/(x**2 + 1)**(5/2)");
  assert.equal(py("x/(x^2+1)^((5/2))"), "x/(x**2 + 1)**(5/2)");
  assert.equal(py("((x - 1))/(((x + 1)))"), "(x - 1)/(x + 1)");
  assert.equal(py("2^(((x + 1)))"), "2**(x + 1)");
  assert.equal(py("-(((x + 1)))^2"), "-(x + 1)**2");
});

test("con uno, dos o tres pares de paréntesis en cada operación, Python da el mismo valor que math.js", () => {
  const np = { exp: Math.exp, sqrt: Math.sqrt };
  const casos = ["x/(x^2+1)^(5/2)", "(x - y)/(x*y) - y^(x/2)", "2^(x+1)/3", "x^2/(x + y)^(1/3)", "(x+y)^2/(x - 2*y)", "exp(-x/2)*(x - y)/(y + 1)"];
  for (const texto of casos) {
    const base = analizarFuncion(texto);
    const todos = base.toString({ parenthesis: "all" }); // cada operación entre paréntesis
    for (const k of [1, 2, 3]) {
      const nodo = mathjs.parse(todos.replaceAll("(", "(".repeat(k)).replaceAll(")", ")".repeat(k)));
      const codigo = aPython(nodo, "numpy");
      const fn = new Function("np", "x", "y", `return ${codigo};`);
      for (const [x, y] of [[0.7, 1.3], [2.1, 0.4]]) {
        const esperado = base.evaluate({ x, y });
        assert.ok(Math.abs(fn(np, x, y) - esperado) <= 1e-12 * Math.max(1, Math.abs(esperado)), `${texto} (×${k}) → ${codigo}`);
      }
    }
  }
});
