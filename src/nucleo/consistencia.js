// ¿SymPy trabajó con la misma función que escribió el usuario?
//
// La expresión llega a SymPy traducida a Python (python.js) y la parte
// numérica la evalúa compilada a JavaScript (expresion.js): son dos
// traducciones distintas del mismo árbol. Si una se equivoca, SymPy resuelve
// otra integral y su verificación (F' − f = 0) sale bien igualmente, porque
// compara con SU integrando. Pasó: x/(x²+1)^(5/2) escrito en el editor visual
// llegaba como x/(2(x²+1)⁵) y la página mostraba −1/(16(x²+1)⁴).
//
// Por eso SymPy devuelve el integrando que usó (en sintaxis de math.js) y aquí
// se compara con la función del usuario en varios puntos. Si no coinciden, el
// resultado simbólico no se muestra.

import { prepararExpresion } from "./expresion.js";
import { ErrorCalculo } from "./errores.js";

const PUNTOS = Object.freeze([-2.3, -0.7, 0.37, 0.71, 1.13, 1.9, 3.4]);

/**
 * `textoMathjs`: el integrando de SymPy; `f(x)`: el del usuario (con los
 * parámetros ya con su valor). Lanza ErrorCalculo("integrandoDistinto") si
 * difieren en algún punto. Devuelve cuántos puntos se compararon (0 si no se
 * pudo: texto ausente o sin puntos dentro del dominio).
 */
export function comprobarMismoIntegrando(textoMathjs, f) {
  if (!textoMathjs) return 0;
  let g;
  try {
    g = prepararExpresion(textoMathjs, ["x"], { parametrosPermitidos: false }).fn;
  } catch {
    return 0;
  }
  let comparados = 0;
  for (const x of PUNTOS) {
    const a = f(x);
    const b = g(x);
    const finitos = [a, b].filter(Number.isFinite).length;
    if (finitos === 0) continue; // fuera del dominio de las dos
    if (finitos === 1 || Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) {
      throw new ErrorCalculo("integrandoDistinto", { x: String(x) });
    }
    comparados++;
  }
  return comparados;
}
