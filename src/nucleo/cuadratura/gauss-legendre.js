// Cuadratura de Gauss–Legendre.
//
// Newton–Cotes fija los puntos (equiespaciados) y elige los pesos. Gauss
// elige también los puntos: con n puntos bien colocados la regla
//   ∫₋₁¹ f(t) dt ≈ Σ wᵢ f(tᵢ)
// es exacta para todos los polinomios de grado ≤ 2n − 1 (el doble que
// Newton–Cotes con el mismo número de evaluaciones). Los puntos óptimos son
// las raíces del polinomio de Legendre Pₙ y los pesos son
//   wᵢ = 2 / ((1 − tᵢ²) · Pₙ'(tᵢ)²).
//
// Cálculo de las raíces: no hay fórmula cerrada, así que se usa el método de
// Newton sobre Pₙ, evaluando Pₙ con la recurrencia de Bonnet
//   (k + 1) P_{k+1}(t) = (2k + 1) t P_k(t) − k P_{k−1}(t),   P₀ = 1, P₁ = t,
// y su derivada con  Pₙ'(t) = n (t Pₙ(t) − P_{n−1}(t)) / (t² − 1).
// El punto de partida cos(π(i − 1/4)/(n + 1/2)) está tan cerca de cada raíz
// que Newton converge en 3–5 iteraciones.
//
// Convergencia: con f suave (analítica) el error de la regla de n puntos cae
// exponencialmente con n, no como una potencia; por eso se dibuja en escala
// semilogarítmica. La versión compuesta (m subintervalos con n puntos en
// cada uno) sí tiene orden algebraico: error O(h^{2n}) con h = (b − a)/m.

import { evaluarFinito } from "./riemann.js";
import { ErrorCalculo } from "../errores.js";

const cache = new Map();

/** Polinomio de Legendre Pₙ(t) y P_{n−1}(t) por la recurrencia de Bonnet. */
export function legendre(n, t) {
  let anterior = 1; // P₀
  let actual = t;   // P₁
  if (n === 0) return [1, 0];
  for (let k = 1; k < n; k++) {
    const siguiente = ((2 * k + 1) * t * actual - k * anterior) / (k + 1);
    anterior = actual;
    actual = siguiente;
  }
  return [actual, anterior];
}

/** Nodos y pesos en [−1, 1], ordenados de menor a mayor. */
export function nodosGaussLegendre(n) {
  if (!Number.isInteger(n) || n < 1 || n > 200) throw new ErrorCalculo("subintervalosInvalidos", { n, minimo: 1 });
  if (cache.has(n)) return cache.get(n);
  const nodos = new Array(n);
  const pesos = new Array(n);
  const mitad = Math.ceil(n / 2);
  for (let i = 1; i <= mitad; i++) {
    let t = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let derivada = 0;
    for (let iter = 0; iter < 100; iter++) {
      const [p, pAnterior] = legendre(n, t);
      derivada = (n * (t * p - pAnterior)) / (t * t - 1);
      const paso = p / derivada;
      t -= paso;
      if (Math.abs(paso) < 1e-16) break;
    }
    const [p, pAnterior] = legendre(n, t);
    derivada = (n * (t * p - pAnterior)) / (t * t - 1);
    const w = 2 / ((1 - t * t) * derivada * derivada);
    // Los nodos son simétricos: ±t con el mismo peso.
    nodos[i - 1] = -t; pesos[i - 1] = w;
    nodos[n - i] = t; pesos[n - i] = w;
  }
  if (n % 2 === 1) nodos[mitad - 1] = 0; // el central es exactamente 0
  const resultado = Object.freeze({ nodos: Object.freeze(nodos), pesos: Object.freeze(pesos) });
  cache.set(n, resultado);
  return resultado;
}

/**
 * Gauss–Legendre compuesta: m subintervalos con n puntos en cada uno.
 * Cada subintervalo [c − r, c + r] se lleva a [−1, 1] con x = c + r·t.
 */
export function gaussLegendre(f, a, b, n, m = 1) {
  if (!Number.isInteger(m) || m < 1) throw new ErrorCalculo("subintervalosInvalidos", { n: m, minimo: 1 });
  const { nodos, pesos } = nodosGaussLegendre(n);
  const h = (b - a) / m;
  let total = 0;
  for (let j = 0; j < m; j++) {
    const centro = a + (j + 0.5) * h;
    const radio = h / 2;
    let suma = 0;
    for (let i = 0; i < n; i++) suma += pesos[i] * evaluarFinito(f, centro + radio * nodos[i]);
    total += radio * suma;
  }
  return total;
}
