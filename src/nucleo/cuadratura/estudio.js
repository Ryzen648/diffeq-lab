// Estudio de convergencia de las reglas de cuadratura.
//
// Para cada método se calcula la integral con h = (b − a)/n, n = 2, 4, 8…,
// se mide el error frente a un valor de referencia y se estima el orden con
// la pendiente log-log (../convergencia.js). También se cuenta cuántas veces
// se evaluó f: con eso se comparan métodos de distinto coste de forma justa
// (error frente a evaluaciones).
//
// El orden teórico solo se cumple si f es suficientemente suave en [a, b].
// Con √x en [0, 1] (derivada infinita en 0) todos los métodos bajan de
// orden; con una función periódica integrada en un periodo completo, el
// trapecio converge mucho más rápido de lo que dice su orden. La interfaz
// muestra la pendiente observada junto a la teórica precisamente para que
// esas diferencias se vean y se expliquen, no para esconderlas.

import { sumaRiemann, puntoMedio, trapecio, simpson } from "./riemann.js";
import { gaussLegendre } from "./gauss-legendre.js";
import { ordenObservado } from "../convergencia.js";

/** Métodos del estudio: orden teórico y evaluaciones de f para n subintervalos. */
export const METODOS_CUADRATURA = Object.freeze({
  izquierda: { orden: 1, calcular: (f, a, b, n) => sumaRiemann(f, a, b, n, "izquierda").valor, evaluaciones: (n) => n },
  puntoMedio: { orden: 2, calcular: puntoMedio, evaluaciones: (n) => n },
  trapecio: { orden: 2, calcular: trapecio, evaluaciones: (n) => n + 1 },
  simpson: { orden: 4, calcular: simpson, evaluaciones: (n) => n + 1 },
  // Gauss–Legendre compuesta: n subintervalos con 2 o 3 puntos cada uno.
  gauss2: { orden: 4, calcular: (f, a, b, n) => gaussLegendre(f, a, b, 2, n), evaluaciones: (n) => 2 * n },
  gauss3: { orden: 6, calcular: (f, a, b, n) => gaussLegendre(f, a, b, 3, n), evaluaciones: (n) => 3 * n },
});

export const NS_ESTUDIO = Object.freeze([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]);

/**
 * Error relativo si la referencia no es pequeña; absoluto si |referencia| < 1.
 * Así el piso de redondeo (~1e-13) significa lo mismo para integrales grandes y pequeñas.
 */
export function errorDe(valor, referencia) {
  return Math.abs(valor - referencia) / Math.max(1, Math.abs(referencia));
}

export function estudioConvergencia(f, a, b, referencia, { metodos = Object.keys(METODOS_CUADRATURA), ns = NS_ESTUDIO } = {}) {
  const resultado = {};
  for (const id of metodos) {
    const metodo = METODOS_CUADRATURA[id];
    const puntos = ns.map((n) => {
      const valor = metodo.calcular(f, a, b, n);
      return { n, h: (b - a) / n, valor, error: errorDe(valor, referencia), evaluaciones: metodo.evaluaciones(n) };
    });
    resultado[id] = { ordenTeorico: metodo.orden, puntos, observado: ordenObservado(puntos) };
  }
  return resultado;
}

/**
 * Gauss–Legendre de un solo intervalo con n = 1…nMax puntos. Con f analítica
 * el error cae exponencialmente: en escala semilog (log error frente a n) se
 * ve casi una recta, y en log-log no tendría una pendiente fija.
 */
export function estudioGaussPuntos(f, a, b, referencia, nMax = 20) {
  const puntos = [];
  for (let n = 1; n <= nMax; n++) {
    const valor = gaussLegendre(f, a, b, n, 1);
    puntos.push({ n, valor, error: errorDe(valor, referencia), evaluaciones: n });
  }
  return puntos;
}
