// Sumas de Riemann y reglas compuestas de Newton–Cotes.
//
// Todas parten de dividir [a, b] en n subintervalos de ancho h = (b − a)/n
// y sustituir f en cada uno por un polinomio fácil de integrar:
//
//   izquierda / derecha   f ≈ constante (valor en un extremo)   error O(h)
//   punto medio           f ≈ constante (valor en el centro)    error O(h²)
//   trapecio              f ≈ recta entre los extremos          error O(h²)
//   Simpson               f ≈ parábola por extremos y centro    error O(h⁴)
//
// «Error O(h^p)» significa que, para f suave, al dividir h entre 2 el error
// se divide aproximadamente entre 2^p. Eso es lo que mide el estudio de
// convergencia (convergencia.js) con la pendiente en escala log-log.
//
// ¿Por qué el punto medio es de orden 2 y no 1? En cada subintervalo, el
// término lineal del desarrollo de Taylor alrededor del centro se integra a
// cero por simetría; el primer término que sobrevive es el cuadrático.
// Simpson gana dos órdenes de golpe por la misma razón: integra exactamente
// los polinomios cúbicos, no solo los cuadráticos.

import { ErrorCalculo } from "../errores.js";

/** Evalúa f y exige un número finito: un integrando que vale ±∞ o NaN no se puede sumar. */
export function evaluarFinito(f, x) {
  const y = f(x);
  if (!Number.isFinite(y)) throw new ErrorCalculo("integrandoNoFinito", { x });
  return y;
}

function comprobarN(n, minimo = 1) {
  if (!Number.isInteger(n) || n < minimo) throw new ErrorCalculo("subintervalosInvalidos", { n, minimo });
}

export const REGLAS_RIEMANN = Object.freeze(["izquierda", "derecha", "medio"]);

/**
 * Suma de Riemann con n rectángulos. Devuelve también cada rectángulo, para
 * dibujarlo: { x0, x1, xm, y } con xm el punto donde se evaluó f.
 */
export function sumaRiemann(f, a, b, n, regla = "izquierda") {
  comprobarN(n);
  const h = (b - a) / n;
  const desplazamiento = { izquierda: 0, derecha: 1, medio: 0.5 }[regla];
  if (desplazamiento === undefined) throw new Error(`regla de Riemann desconocida: ${regla}`);
  const rectangulos = [];
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const x0 = a + i * h;
    const x1 = i === n - 1 ? b : a + (i + 1) * h; // el último acaba exactamente en b
    const xm = x0 + desplazamiento * (x1 - x0);
    const y = evaluarFinito(f, xm);
    suma += y;
    rectangulos.push({ x0, x1, xm, y });
  }
  return { valor: suma * h, h, n, rectangulos };
}

/** Regla compuesta del punto medio (también llamada «del rectángulo»). Orden 2. */
export function puntoMedio(f, a, b, n) {
  comprobarN(n);
  const h = (b - a) / n;
  let suma = 0;
  for (let i = 0; i < n; i++) suma += evaluarFinito(f, a + (i + 0.5) * h);
  return suma * h;
}

/** Regla compuesta del trapecio: h·[f(x₀)/2 + f(x₁) + … + f(xₙ₋₁) + f(xₙ)/2]. Orden 2. */
export function trapecio(f, a, b, n) {
  comprobarN(n);
  const h = (b - a) / n;
  let suma = (evaluarFinito(f, a) + evaluarFinito(f, b)) / 2;
  for (let i = 1; i < n; i++) suma += evaluarFinito(f, a + i * h);
  return suma * h;
}

/**
 * Regla compuesta de Simpson con n subintervalos (n par):
 *   (h/3)·[f(x₀) + 4f(x₁) + 2f(x₂) + 4f(x₃) + … + 4f(xₙ₋₁) + f(xₙ)].
 * Cada pareja de subintervalos se aproxima con la parábola que pasa por sus
 * tres puntos; por eso n tiene que ser par. Orden 4.
 */
export function simpson(f, a, b, n) {
  comprobarN(n, 2);
  if (n % 2 !== 0) throw new ErrorCalculo("simpsonImpar", { n });
  const h = (b - a) / n;
  let suma = evaluarFinito(f, a) + evaluarFinito(f, b);
  for (let i = 1; i < n; i++) suma += (i % 2 === 1 ? 4 : 2) * evaluarFinito(f, a + i * h);
  return (suma * h) / 3;
}
