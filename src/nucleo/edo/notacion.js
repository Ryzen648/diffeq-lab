// Lectura de ecuaciones diferenciales con notación flexible.
//
// Admite, en modo código:
//   y' = x*y          dy/dx = x*y          y' + 2*y = exp(x)
//   2*x*y + (x^2 + 3*y^2)*y' = 0          x*y        (abreviatura de y' = x*y)
//   y'' + y = 0       d^2y/dx^2 = -y       dy/dt = -k*y   (variable t)
//   u_t = k*u_xx      ∂u/∂t = k ∂²u/∂x²   (EDP: se reconocen, se resuelven en la Fase 3)
//
// Cómo: cada derivada se sustituye por un símbolo reservado (D1y, D2y) antes
// de leer la expresión con math.js; luego se escribe la ecuación como
//   F(x, y, y', y'') = lado izquierdo − lado derecho = 0
// con la variable dependiente renombrada a y y la independiente a x, para que
// el resto del núcleo trabaje siempre con los mismos nombres.

import { math } from "../../../comun/js/mathjs.js";
import { analizarFuncion, variablesDe } from "../../../comun/js/entrada/analizar.js";
import { expresionTex } from "../../../comun/js/entrada/impresion.js";
import { ErrorCalculo } from "../errores.js";

const SIMBOLO_DERIVADA = /^D([12])([A-Za-z])$/;

function normalizarTexto(texto) {
  return texto
    .replace(/[′’´`]/g, "'").replace(/″/g, "''")
    .replace(/²/g, "^2")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Es una EDP? Devuelve { orden, dependiente, independientes } o null. */
function detectarEDP(texto) {
  const subindices = [...texto.matchAll(/(?<![A-Za-z0-9_])([A-Za-z])_([a-z]{1,3})(?![A-Za-z0-9_(])/g)];
  const parciales = [...texto.matchAll(/∂(?:\^?(\d))?\s*([A-Za-z])\s*\/\s*((?:∂\s*[A-Za-z]\s*(?:\^?\d)?\s*)+)/g)];
  if (!subindices.length && !parciales.length) return null;
  let orden = 0;
  const independientes = new Set();
  let dependiente = null;
  for (const m of subindices) {
    dependiente ??= m[1];
    orden = Math.max(orden, m[2].length);
    for (const v of m[2]) independientes.add(v);
  }
  for (const m of parciales) {
    dependiente ??= m[2];
    orden = Math.max(orden, Number(m[1] ?? 1));
    for (const v of m[3].matchAll(/∂\s*([A-Za-z])/g)) independientes.add(v[1]);
  }
  return { orden, dependiente, independientes: [...independientes].sort() };
}

/**
 * Sustituye las derivadas por símbolos reservados D1y / D2y y recoge qué
 * letras se usan. No toca el resto del texto.
 */
function marcarDerivadas(texto) {
  const dependientes = new Set();
  const independientes = new Set();
  // Leibniz: dy/dx, d^2y/dx^2, d2y/dx2 (también con espacios).
  let t = texto.replace(/(?<![A-Za-z0-9_])d\s*(?:\^?\s*(2))?\s*([A-Za-z])\s*\/\s*d\s*([A-Za-z])\s*(?:\^?\s*2)?(?![A-Za-z0-9_])/g,
    (_, orden, dep, ind) => {
      dependientes.add(dep);
      independientes.add(ind);
      return `D${orden ? 2 : 1}${dep}`;
    });
  // Primas: y', y''. La letra debe ir sola (no al final de un nombre como «cos'»).
  t = t.replace(/(?<![A-Za-z0-9_])([A-Za-z])\s*('{1,2})/g, (_, dep, primas) => {
    dependientes.add(dep);
    return `D${primas.length}${dep}`;
  });
  return { texto: t, dependientes: [...dependientes], independientes: [...independientes] };
}

function renombrar(nodo, cambios) {
  return nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in cambios ? new math.SymbolNode(cambios[n.name]) : n));
}

/**
 * Texto -> descripción de la ecuación. Para EDO:
 *   { tipo: "edo", orden, dependiente, independiente, F, izquierda, derecha, parametros, abreviada }
 * F está en las variables x, y, D1y, D2y. Para EDP: { tipo: "edp", orden, … }.
 */
export function leerEcuacion(textoOriginal) {
  const texto = normalizarTexto(textoOriginal ?? "");
  if (texto === "") throw new ErrorCalculo("ecuacionVacia", {});
  const edp = detectarEDP(texto);
  if (edp) return { tipo: "edp", ...edp };

  const marcado = marcarDerivadas(texto);
  if (marcado.dependientes.length > 1) {
    throw new ErrorCalculo("variasDependientes", { lista: marcado.dependientes.join(", ") });
  }
  if (marcado.independientes.length > 1) {
    throw new ErrorCalculo("variasIndependientes", { lista: marcado.independientes.join(", ") });
  }
  const lados = marcado.texto.split("=");
  if (lados.length > 2) throw new ErrorCalculo("variosIguales", {});
  if (lados.some((l) => l.trim() === "")) throw new ErrorCalculo("ladoVacio", {});

  const izquierda = analizarFuncion(lados[0], lados.length === 2 ? "(lado izquierdo)" : "f");
  const derecha = lados.length === 2 ? analizarFuncion(lados[1], "(lado derecho)") : null;

  const simbolos = new Set([...variablesDe(izquierda), ...(derecha ? variablesDe(derecha) : [])]);
  const derivadas = [...simbolos].filter((s) => SIMBOLO_DERIVADA.test(s));
  let dependiente = marcado.dependientes[0] ?? "y";
  const ordenes = derivadas.map((s) => Number(SIMBOLO_DERIVADA.exec(s)[1]));
  const orden = ordenes.length ? Math.max(...ordenes) : 1;

  // Variable independiente: la de dy/dx si se dio; si no, x (o t si la dependiente es x
  // o si la fórmula usa t y no x).
  let independiente = marcado.independientes[0];
  if (!independiente) {
    const usa = (v) => simbolos.has(v);
    independiente = dependiente === "x" || (usa("t") && !usa("x")) ? "t" : "x";
  }
  if (independiente === dependiente) throw new ErrorCalculo("variasDependientes", { lista: dependiente });

  // Sin derivadas: es la abreviatura «f(x, y)» de y' = f(x, y). Con derivadas y sin «=»: F = 0.
  const abreviada = derivadas.length === 0;
  if (abreviada && derecha) throw new ErrorCalculo("sinDerivada", {});
  let F;
  if (abreviada) F = new math.OperatorNode("-", "subtract", [new math.SymbolNode(`D1${dependiente}`), izquierda]);
  else if (derecha) F = new math.OperatorNode("-", "subtract", [izquierda, new math.ParenthesisNode(derecha)]);
  else F = izquierda;

  // Nombres canónicos: dependiente -> y, independiente -> x, derivadas -> D1y / D2y.
  const cambios = { [dependiente]: "y", [independiente]: "x", [`D1${dependiente}`]: "D1y", [`D2${dependiente}`]: "D2y" };
  const reservados = new Set(Object.keys(cambios));
  const otros = [...simbolos].filter((s) => !reservados.has(s));
  for (const s of otros) {
    if (["x", "y", "D1y", "D2y"].includes(s)) throw new ErrorCalculo("nombreReservado", { nombre: s });
  }
  const parametros = otros.filter((s) => !SIMBOLO_DERIVADA.test(s)).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return {
    tipo: "edo", orden, dependiente, independiente, abreviada,
    F: renombrar(F, cambios),
    izquierda, derecha,
    parametros,
  };
}

/**
 * LaTeX del editor visual -> texto en modo código, para ecuaciones.
 * MathLive escribe y' como y^{\prime} (o y'), y dy/dx como \frac{dy}{dx} o
 * \frac{\mathrm{d}y}{\mathrm{d}x}. Cada derivada se cambia por un nombre
 * \mathrm{…} que latex-a-codigo lee como un solo símbolo, y al final se
 * vuelve a la notación legible (y', dy/dt).
 */
export function latexEcuacionACodigo(latex, latexACodigo) {
  const d = String.raw`(?:\\mathrm\{d\}|\\operatorname\{d\}|d)`;
  let l = latex
    .replace(new RegExp(String.raw`\\frac\{\s*${d}\s*\^\{?2\}?\s*([A-Za-z])\s*\}\{\s*${d}\s*([A-Za-z])\s*\^\{?2\}?\s*\}`, "g"), "\\mathrm{L2$1$2}")
    .replace(new RegExp(String.raw`\\frac\{\s*${d}\s*([A-Za-z])\s*\}\{\s*${d}\s*([A-Za-z])\s*\}`, "g"), "\\mathrm{L1$1$2}")
    .replace(/([A-Za-z])\s*\^\s*\{\s*\\prime\s*\\prime\s*\}/g, "\\mathrm{D2$1}")
    .replace(/([A-Za-z])\s*\^\s*\{\s*\\doubleprime\s*\}/g, "\\mathrm{D2$1}")
    .replace(/([A-Za-z])\s*\^\s*\{\s*\\prime\s*\}/g, "\\mathrm{D1$1}")
    .replace(/([A-Za-z])\s*\^\s*\\prime/g, "\\mathrm{D1$1}")
    .replace(/([A-Za-z])''/g, "\\mathrm{D2$1}")
    .replace(/([A-Za-z])'/g, "\\mathrm{D1$1}");
  const lados = l.split("=").map((lado) => (lado.trim() === "" ? "" : latexACodigo(lado)));
  return lados.join(" = ")
    .replace(/\bD1([A-Za-z])\b/g, "$1'")
    .replace(/\bD2([A-Za-z])\b/g, "$1''")
    .replace(/\bL1([A-Za-z])([A-Za-z])\b/g, "d$1/d$2")
    .replace(/\bL2([A-Za-z])([A-Za-z])\b/g, "d^2$1/d$2^2");
}

/** LaTeX de la ecuación tal como la escribió el usuario (y', dy/dx…), para la vista previa. */
export function ecuacionTex(ec) {
  const derivada = (texto) => texto
    .replace(/\\mathit\{D1([A-Za-z])\}/g, "$1'")
    .replace(/\\mathit\{D2([A-Za-z])\}/g, "$1''");
  if (ec.abreviada) return `${ec.dependiente}' = ${derivada(expresionTex(ec.izquierda))}`;
  const izq = derivada(expresionTex(ec.izquierda));
  return ec.derecha ? `${izq} = ${derivada(expresionTex(ec.derecha))}` : `${izq} = 0`;
}

/**
 * EDO de primer orden en forma M(x, y) + N(x, y)·y' = 0 y su forma normal y' = f.
 * F debe ser afín en y' (y' aparece «linealmente»); si no, no hay forma normal.
 * M = F con y' = 0;  N = F(y' = 1) − F(y' = 0);  f = −M/N.
 */
export function formaNormal(F) {
  const con = (valor) => F.transform((n) => (n.isSymbolNode && n.name === "D1y" ? new math.ConstantNode(valor) : n));
  const F0 = con(0);
  const F1 = con(1);
  const F2 = con(2);
  // Afín en y' ⇔ F(2) − 2F(1) + F(0) = 0. Se comprueba numéricamente en puntos al azar.
  const evaluar = (nodo) => nodo.compile();
  const [c0, c1, c2] = [F0, F1, F2].map(evaluar);
  let probados = 0;
  for (const [x, y] of [[0.37, 0.61], [1.3, -0.8], [-0.7, 1.9], [2.2, 0.45], [0.9, 2.7]]) {
    const ambito = { x, y, pi: Math.PI, e: Math.E };
    const vals = [c0, c1, c2].map((c) => { try { return c.evaluate(ambito); } catch { return NaN; } });
    if (!vals.every((v) => typeof v === "number" && Number.isFinite(v))) continue;
    probados++;
    const segunda = vals[2] - 2 * vals[1] + vals[0];
    if (Math.abs(segunda) > 1e-9 * Math.max(1, ...vals.map(Math.abs))) throw new ErrorCalculo("noFormaNormal", {});
  }
  const M = math.simplify(F0);
  const N = math.simplify(new math.OperatorNode("-", "subtract", [F1, F0]));
  if (N.isConstantNode && N.value === 0) throw new ErrorCalculo("sinDerivada", {});
  const f = math.simplify(new math.OperatorNode("-", "unaryMinus", [new math.OperatorNode("/", "divide", [M, N])]));
  return { M, N, f, probados };
}
