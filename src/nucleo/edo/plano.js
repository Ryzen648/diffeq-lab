// Problemas del plano de fase (Fase 2): una EDO de orden 2 o un sistema 2×2,
// llevados siempre a la misma forma
//   x' = f(t, x, y),   y' = g(t, x, y)
// con nombres internos fijos: t (independiente) y x, y (las dos componentes).
//
// EDO de orden 2. leerEcuacion la deja en F(x, y, y', y'') = 0 con nombres
// canónicos (x independiente, y dependiente, D1y, D2y). Si F es afín en y''
// (y'' aparece «linealmente»), se despeja
//   y'' = −F(y'' = 0) / (F(y'' = 1) − F(y'' = 0))
// y se reescribe como sistema con la velocidad como segunda componente:
//   (posición, velocidad) = (y, y')  ->  x' = y,   y' = y''(t, x, y).
// En pantalla se usan los nombres del usuario (θ, θ' o y, y'…).
//
// Clasificación en vivo (comprobación numérica en puntos de prueba): sirve
// para decidir si merece la pena pedir la solución simbólica. SymPy solo se
// llama con sistemas lineales autónomos y con EDO lineales de orden 2: con
// las no lineales, dsolve puede colgarse minutos (el péndulo), así que no
// llegan a él.

import { math } from "../../../comun/js/mathjs.js";
import { analizarFuncion, variablesDe } from "../../../comun/js/entrada/analizar.js";
import { ErrorCalculo } from "../errores.js";
import { leerEcuacion } from "./notacion.js";
import { leerProblema } from "./problema.js";
import { leerNumero } from "../numeros.js";

const RESERVADOS = ["t", "x", "y"];
const ordenAlfabetico = (a, b) => a.localeCompare(b, "es", { numeric: true });

function renombrar(nodo, cambios) {
  return nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in cambios ? new math.SymbolNode(cambios[n.name]) : n));
}

function sustituir(nodo, nombre, valor) {
  return nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name === nombre ? new math.ConstantNode(valor) : n));
}

/** ¿F es afín en `simbolo`? Se comprueba en puntos de prueba: F(2) − 2F(1) + F(0) = 0. */
function afinEn(F, simbolo, otros) {
  const [c0, c1, c2] = [0, 1, 2].map((v) => sustituir(F, simbolo, v).compile());
  const puntos = [[0.37, 0.61, -0.4], [1.3, -0.8, 0.9], [-0.7, 1.9, 1.6], [2.2, 0.45, -1.1], [0.9, 2.7, 0.3]];
  for (const [a, b, c] of puntos) {
    const ambito = { x: a, y: b, D1y: c, pi: Math.PI, e: Math.E };
    for (const p of otros) ambito[p] = 1.1;
    const vals = [c0, c1, c2].map((k) => { try { return k.evaluate(ambito); } catch { return NaN; } });
    if (!vals.every((v) => typeof v === "number" && Number.isFinite(v))) continue;
    if (Math.abs(vals[2] - 2 * vals[1] + vals[0]) > 1e-9 * Math.max(1, ...vals.map(Math.abs))) return false;
  }
  return true;
}

/**
 * Texto de una EDO de orden 2 -> problema del plano.
 * Devuelve { modo: "orden2", ec, f, g, parametros, nombres }, con f, g en t, x, y.
 * `nombres`: { t, x, y } como los escribió el usuario (p. ej. t, θ, θ').
 */
export function leerOrden2(texto) {
  const ec = leerEcuacion(texto);
  if (ec.tipo === "edp") throw new ErrorCalculo("edpFase3", {});
  if (ec.orden !== 2) throw new ErrorCalculo("noOrden2", { orden: ec.orden });
  for (const p of ec.parametros) if (RESERVADOS.includes(p)) throw new ErrorCalculo("nombreReservado", { nombre: p });
  if (!afinEn(ec.F, "D2y", ec.parametros)) throw new ErrorCalculo("noFormaNormal2", {});
  const F0 = sustituir(ec.F, "D2y", 0);
  const N = math.simplify(new math.OperatorNode("-", "subtract", [sustituir(ec.F, "D2y", 1), F0]));
  if (N.isConstantNode && N.value === 0) throw new ErrorCalculo("noOrden2", { orden: 1 });
  const aceleracion = math.simplify(new math.OperatorNode("-", "unaryMinus", [new math.OperatorNode("/", "divide", [F0, N])]));
  // x (independiente) -> t, y -> x, y' -> y, a la vez.
  const g = renombrar(aceleracion, { x: "t", y: "x", D1y: "y" });
  return {
    modo: "orden2", ec, f: new math.SymbolNode("y"), g, parametros: ec.parametros,
    nombres: { t: ec.independiente, x: ec.dependiente, y: `${ec.dependiente}'` },
    // F en las variables de SymPy (x, y, D1y, D2y), para la parte simbólica.
    F: ec.F,
  };
}

/** x' = f(t, x, y), y' = g(t, x, y) a partir de los dos textos. */
export function leerSistema(textoF, textoG) {
  const f = analizarFuncion(textoF, "f");
  const g = analizarFuncion(textoG, "g");
  const parametros = [...new Set([...variablesDe(f), ...variablesDe(g)])].filter((s) => !RESERVADOS.includes(s)).sort(ordenAlfabetico);
  return { modo: "sistema", f, g, parametros, nombres: { t: "t", x: "x", y: "y" } };
}

// --- Clasificación en vivo ---------------------------------------------------------

const PUNTOS = [[0.31, 0.47, -0.62], [1.7, -1.1, 0.83], [-0.9, 2.3, 1.4], [2.6, -0.35, -1.9], [0.05, 1.2, 0.6], [3.3, 0.9, -0.4]];
const fin = (...v) => v.every(Number.isFinite);
const iguales = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * F(t, [x, y]) -> [f, g] compilado. Devuelve
 *   { autonomo, lineal, homogeneo, constante }   (null si no se pudo evaluar)
 * lineal: afín en (x, y); constante: además, con coeficientes que no dependen de t.
 */
export function clasificarPlano(F, { usaT }) {
  let validos = 0;
  let lineal = true;
  let constante = true;
  let homogeneo = true;
  let referencia = null;
  for (const [t, a, b] of PUNTOS) {
    const p = [a, b];
    const q = [b * 0.7 - 0.3, a * -0.4 + 0.8];
    let v;
    try { v = [F(t, p), F(t, q), F(t, [p[0] + q[0], p[1] + q[1]]), F(t, [0, 0]), F(t, [1, 0]), F(t, [0, 1])]; } catch { continue; }
    if (!fin(...v.flat())) continue;
    validos++;
    for (let k = 0; k < 2; k++) {
      if (!iguales(v[0][k] + v[1][k], v[2][k] + v[3][k])) lineal = false;
      if (Math.abs(v[3][k]) > 1e-12) homogeneo = false;
    }
    // Coeficientes: columnas de A = F(e_i) − F(0) y el término b = F(0).
    const coef = [v[4][0] - v[3][0], v[5][0] - v[3][0], v[4][1] - v[3][1], v[5][1] - v[3][1], v[3][0], v[3][1]];
    if (referencia === null) referencia = coef;
    else if (!coef.every((c, i) => iguales(c, referencia[i]))) constante = false;
  }
  if (validos < 3) return { autonomo: !usaT, lineal: null, homogeneo: null, constante: null };
  return { autonomo: !usaT, lineal, homogeneo: lineal && homogeneo, constante: lineal && constante };
}

/**
 * Orden 2 lineal a·y'' + b·y' + c·y = r(x): ¿coeficientes constantes o de
 * Cauchy–Euler (a = k₂x², b = k₁x, c = k₀)? Fc(x, [y, y', y'']) compilada.
 * Devuelve "coefConstantes" | "cauchyEuler" | "coefVariables" | null.
 */
export function tipoCoeficientes(Fc) {
  const coefs = [];
  for (const x of [0.6, 1.3, 2.1, 3.7]) {
    let c;
    try {
      const cero = Fc(x, [0, 0, 0]);
      c = [Fc(x, [0, 0, 1]) - cero, Fc(x, [0, 1, 0]) - cero, Fc(x, [1, 0, 0]) - cero];
    } catch { continue; }
    if (fin(...c)) coefs.push({ x, c });
  }
  if (coefs.length < 3) return null;
  const todos = (transformar) => {
    const ref = transformar(coefs[0]);
    return coefs.every((k) => transformar(k).every((v, i) => iguales(v, ref[i])));
  };
  // Se normaliza por a para que λ·(ecuación) cuente igual.
  if (todos(({ c }) => c.map((v) => v / c[0]))) return "coefConstantes";
  if (todos(({ x, c }) => [1, c[1] * x / c[0], c[2] * x * x / c[0]])) return "cauchyEuler";
  return "coefVariables";
}

// --- Datos numéricos del problema --------------------------------------------------

const vacio = (texto) => String(texto ?? "").trim() === "";

/**
 * Textos del formulario -> números validados:
 *   { t0, Y0: [x0, y0], tf, h, tol, ventana: { x: [lo, hi], y: [lo, hi] } | null }
 * `nombres`: cómo se llaman los campos en pantalla. La ventana del plano de
 * fase es opcional: o los cuatro valores o ninguno (vacía: automática).
 */
export function leerProblemaPlano({ t0, x0, y0, tf, h, tol, xmin, xmax, ymin, ymax }, nombres) {
  const base = leerProblema({ x0: t0, y0: x0, xf: tf, h, tol }, { x0: nombres.t0, y0: nombres.x0, xf: nombres.tf, desde: "" });
  const datos = { t0: base.x0, Y0: [base.y0, leerNumero(y0, nombres.y0)], tf: base.xf, h: base.h, tol: base.tol, ventana: null };
  const textos = [xmin, xmax, ymin, ymax];
  if (textos.every(vacio)) return datos;
  if (textos.some(vacio)) throw new ErrorCalculo("ventanaIncompleta", {});
  const [a, b, c, d] = textos.map((v, i) => leerNumero(v, ["x mín", "x máx", "y mín", "y máx"][i]));
  if (!(a < b && c < d)) throw new ErrorCalculo("ventanaInvalida", {});
  datos.ventana = { x: [a, b], y: [c, d] };
  return datos;
}

/** El sistema tiene que dar números finitos en la condición inicial: si no, no hay por dónde empezar. */
export function comprobarCondicionInicial(F, t0, Y0) {
  let v;
  try { v = F(t0, Y0); } catch { v = [NaN, NaN]; }
  if (!v.every(Number.isFinite)) throw new ErrorCalculo("planoNoDefinido", { t0, x0: Y0[0], y0: Y0[1] });
}
