// Expresiones: del texto validado a una función de JavaScript rápida.
//
// math.js lee y valida el texto (lab-comun: `analizarFuncion`), pero evaluar
// su árbol con `evaluate` es lento para lo que hace este laboratorio: un
// estudio de convergencia o un campo de direcciones piden millones de
// evaluaciones. Por eso el árbol se traduce aquí a código de JavaScript y se
// compila una sola vez con `new Function`.
//
// ¿Es seguro? El código no se copia del usuario: se genera nodo a nodo a
// partir de un árbol ya validado, y solo puede contener números, los nombres
// de variable que se pasan como argumentos (letras, dígitos y _), operadores
// aritméticos y las funciones de la tabla FUNCIONES_JS. Cualquier otro nodo
// lanza un error. La fuente generada se puede enviar a un Web Worker y
// recompilar allí, porque las funciones no se pueden transferir.
//
// Dominio real: (-8)^(1/3) da NaN, igual que en una calculadora real; quien
// llama decide qué hacer con los valores no finitos.

import { analizarFuncion, variablesDe } from "../../comun/js/entrada/analizar.js";
import { ErrorCalculo } from "./errores.js";

/** Funciones admitidas (las de lab-comun) escritas con Math.* o ayudantes de abajo. */
const FUNCIONES_JS = Object.freeze({
  sin: "Math.sin", cos: "Math.cos", tan: "Math.tan",
  sec: "_.sec", csc: "_.csc", cot: "_.cot",
  asin: "Math.asin", acos: "Math.acos", atan: "Math.atan",
  asec: "_.asec", acsc: "_.acsc", acot: "_.acot",
  sinh: "Math.sinh", cosh: "Math.cosh", tanh: "Math.tanh",
  sech: "_.sech", csch: "_.csch", coth: "_.coth",
  asinh: "Math.asinh", acosh: "Math.acosh", atanh: "Math.atanh",
  exp: "Math.exp", log: "Math.log", log10: "Math.log10",
  sqrt: "Math.sqrt", cbrt: "Math.cbrt", nthRoot: "_.raiz", abs: "Math.abs",
});

/** Ayudantes con las mismas convenciones que math.js (acot(x) = atan(1/x), etc.). */
export const AYUDANTES = Object.freeze({
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  cot: (x) => 1 / Math.tan(x),
  asec: (x) => Math.acos(1 / x),
  acsc: (x) => Math.asin(1 / x),
  acot: (x) => Math.atan(1 / x),
  sech: (x) => 1 / Math.cosh(x),
  csch: (x) => 1 / Math.sinh(x),
  coth: (x) => 1 / Math.tanh(x),
  /** Raíz n-ésima real: con n impar admite radicandos negativos (∛−8 = −2). */
  raiz: (x, n = 2) => {
    if (x < 0 && Number.isInteger(n) && n % 2 !== 0) return -Math.pow(-x, 1 / n);
    return Math.pow(x, 1 / n);
  },
});

const CONSTANTES_JS = Object.freeze({ pi: "Math.PI", e: "Math.E" });

const OPERADOR_JS = Object.freeze({ add: "+", subtract: "-", multiply: "*", divide: "/" });

/** Árbol de math.js -> expresión de JavaScript (texto). */
export function aJS(nodo) {
  if (nodo.isParenthesisNode) return aJS(nodo.content);
  if (nodo.isConstantNode) {
    if (typeof nodo.value !== "number" || !Number.isFinite(nodo.value)) throw new Error("constante no numérica");
    return `(${nodo.value})`;
  }
  if (nodo.isSymbolNode) {
    if (nodo.name in CONSTANTES_JS) return CONSTANTES_JS[nodo.name];
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(nodo.name)) throw new Error(`nombre no válido: ${nodo.name}`);
    return nodo.name;
  }
  if (nodo.isOperatorNode) {
    const [a, b] = nodo.args.map(aJS);
    if (nodo.fn === "unaryMinus") return `(-${a})`;
    if (nodo.fn === "unaryPlus") return `(+${a})`;
    if (nodo.fn === "pow") return `Math.pow(${a}, ${b})`;
    if (nodo.fn in OPERADOR_JS) return `(${a} ${OPERADOR_JS[nodo.fn]} ${b})`;
    throw new Error(`operador no admitido: ${nodo.fn}`);
  }
  if (nodo.isFunctionNode) {
    const nombre = nodo.fn.name;
    if (!(nombre in FUNCIONES_JS)) throw new Error(`función no admitida: ${nombre}`);
    return `${FUNCIONES_JS[nombre]}(${nodo.args.map(aJS).join(", ")})`;
  }
  throw new Error(`nodo no admitido: ${nodo.type}`);
}

/**
 * Compila una fuente generada por `aJS` con los argumentos dados, en orden.
 * Sirve también dentro de un Worker (recibe la fuente como texto).
 */
export function compilarFuente(fuente, argumentos) {
  // eslint-disable-next-line no-new-func
  const fabrica = new Function("_", ...argumentos, `"use strict"; return ${fuente};`);
  return (...valores) => fabrica(AYUDANTES, ...valores);
}

/**
 * Texto -> { nodo, fuente, fn, parametros }.
 * `variables` son las variables independientes, en el orden en que `fn` las
 * recibe. Cualquier otro símbolo es un parámetro (k, r, K…), que `fn` recibe
 * después de las variables, en orden alfabético: fn(x, y, k, r).
 * Con `parametrosPermitidos: false`, un símbolo desconocido es un error.
 */
export function prepararExpresion(texto, variables, { indice = "f", parametrosPermitidos = true } = {}) {
  const nodo = analizarFuncion(texto, indice);
  const simbolos = [...variablesDe(nodo)];
  const parametros = simbolos.filter((s) => !variables.includes(s)).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  if (!parametrosPermitidos && parametros.length) {
    throw new ErrorCalculo("variableNoPermitida", { indice, nombre: parametros[0], permitidas: variables.join(", ") });
  }
  const fuente = aJS(nodo);
  const argumentos = [...variables, ...parametros];
  return { nodo, fuente, argumentos, parametros, fn: compilarFuente(fuente, argumentos) };
}
