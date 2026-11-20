// Equilibrios de un sistema autónomo x' = f(x, y), y' = g(x, y) y su estabilidad.
//
// 1. Equilibrios: puntos con f = g = 0. Se buscan con el método de Newton en 2D
//    empezando desde una rejilla de puntos de la ventana visible:
//      (x, y) ← (x, y) − J⁻¹·(f, g),   J = jacobiano en (x, y)
//    y se juntan los que caen en el mismo sitio. Hace falta buscar
//    numéricamente porque SymPy `solve` no siempre devuelve todos: con el
//    péndulo, sen x = 0, devuelve solo 0 y π (medido), y en la ventana [−7, 7]
//    hay cinco (−2π, −π, 0, π, 2π).
//
// 2. Linealización: cerca de un equilibrio, el sistema se parece a u' = J·u
//    con J el jacobiano allí. Sus autovalores salen de la traza T y el
//    determinante D:  λ = (T ± √(T² − 4D)) / 2.
//
// 3. Clasificación (plano traza–determinante):
//      D < 0                 silla (autovalores reales de signo opuesto)
//      D > 0, T² − 4D > 0    nodo (estable si T < 0, inestable si T > 0)
//      D > 0, T² − 4D < 0    foco o espiral (estable si T < 0, inestable si T > 0)
//      D > 0, T² = 4D        nodo degenerado (o estrella si J = λI)
//      D > 0, T = 0          centro… pero SOLO para el sistema lineal
//      D = 0                 autovalor nulo: degenerado
//    Teorema de Hartman–Grobman: la linealización decide el tipo del sistema
//    no lineal solo si el equilibrio es hiperbólico (ningún autovalor con
//    parte real 0). Un «centro» lineal no dice nada del sistema no lineal: en
//    Lotka–Volterra hay órbitas cerradas de verdad, pero en
//    x' = −y + x(x² + y²), y' = x + y(x² + y²) la linealización también es un
//    centro y en polares r' = r³ > 0: es un foco inestable (lo comprueba una prueba).
//
// Los «ceros» se comparan con una tolerancia relativa al tamaño de J, para
// que el redondeo de coma flotante no cambie el tipo.

import { math } from "../../../comun/js/mathjs.js";
import { aJS, compilarFuente } from "../expresion.js";

const TOL = 1e-9;

// --- Jacobiano --------------------------------------------------------------------

/**
 * Jacobiano simbólico 2×2 de (f, g) respecto de (x, y), con math.js.
 * `nodos`: [f, g] (árboles de math.js); `argumentos`: los de la función
 * compilada (["x", "y", …parámetros]). Devuelve { nodos: [[fx, fy], [gx, gy]], fn }
 * con fn(x, y, …) -> [[a, b], [c, d]], o null si math.js no sabe derivar.
 */
export function jacobianoSimbolico(nodos, argumentos) {
  try {
    const filas = nodos.map((n) => ["x", "y"].map((v) => math.simplify(math.derivative(n, v))));
    const fns = filas.map((fila) => fila.map((d) => compilarFuente(aJS(d), argumentos)));
    return {
      nodos: filas,
      fn: (...args) => fns.map((fila) => fila.map((fn) => fn(...args))),
    };
  } catch {
    return null;
  }
}

/** Jacobiano por diferencias centradas: respaldo cuando no hay simbólico. */
export function jacobianoNumerico(F, x, y) {
  const hx = 1e-6 * Math.max(1, Math.abs(x));
  const hy = 1e-6 * Math.max(1, Math.abs(y));
  const [fxp, gxp] = F(x + hx, y);
  const [fxm, gxm] = F(x - hx, y);
  const [fyp, gyp] = F(x, y + hy);
  const [fym, gym] = F(x, y - hy);
  return [
    [(fxp - fxm) / (2 * hx), (fyp - fym) / (2 * hy)],
    [(gxp - gxm) / (2 * hx), (gyp - gym) / (2 * hy)],
  ];
}

// --- Autovalores y clasificación ------------------------------------------------------

/** Autovalores de una matriz 2×2: [{ re, im }, { re, im }] (el de mayor parte real primero). */
export function autovalores([[a, b], [c, d]]) {
  const T = a + d;
  const D = a * d - b * c;
  const disc = T * T - 4 * D;
  if (disc >= 0) {
    // Fórmula sin cancelación: q = −(T + signo(T)·√disc)/2, λ₁ = −q, λ₂ = D/(−q).
    const s = Math.sqrt(disc);
    const q = T >= 0 ? (T + s) / 2 : (T - s) / 2;
    const l1 = q;
    const l2 = q !== 0 ? D / q : T - q;
    const [mayor, menor] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return [{ re: mayor, im: 0 }, { re: menor, im: 0 }];
  }
  const im = Math.sqrt(-disc) / 2;
  return [{ re: T / 2, im }, { re: T / 2, im: -im }];
}

/** Autovector (normalizado) de J para un autovalor real λ. */
export function autovectorReal([[a, b], [c, d]], lambda) {
  // (J − λI)v = 0: se usa la fila de mayor tamaño para no dividir entre ~0.
  // El vector perpendicular a esa fila, (−q, p), la anula.
  const f1 = [a - lambda, b];
  const f2 = [c, d - lambda];
  const fila = Math.hypot(...f1) >= Math.hypot(...f2) ? f1 : f2;
  const v = Math.hypot(...fila) < 1e-14 ? [1, 0] : [-fila[1], fila[0]]; // J = λI: cualquier vector sirve
  const n = Math.hypot(...v);
  return v.map((componente) => componente / n);
}

/**
 * Tipo de equilibrio según J. Devuelve
 *   { tipo, estabilidad, hiperbolico, T, D, disc, lambdas, vectores }
 * tipo: silla | nodoEstable | nodoInestable | focoEstable | focoInestable |
 *       nodoDegeneradoEstable | nodoDegeneradoInestable | estrellaEstable |
 *       estrellaInestable | centro | degenerado
 * estabilidad: "asintotica" | "inestable" | "indeterminada" (no hiperbólico)
 */
export function clasificarEquilibrio(J) {
  const [[a, b], [c, d]] = J;
  const escala = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const T = a + d;
  const D = a * d - b * c;
  const disc = T * T - 4 * D;
  const cero = (v, potencia) => Math.abs(v) <= TOL * escala ** potencia;
  const lambdas = autovalores(J);
  const hiperbolico = !cero(lambdas[0].re, 1) && !cero(lambdas[1].re, 1);

  let tipo;
  if (cero(D, 2)) tipo = "degenerado";
  else if (D < 0) tipo = "silla";
  else if (cero(T, 1)) tipo = "centro";
  else if (cero(disc, 2)) {
    const escalar = cero(b, 1) && cero(c, 1) && cero(a - d, 1); // J = λI
    tipo = `${escalar ? "estrella" : "nodoDegenerado"}${T < 0 ? "Estable" : "Inestable"}`;
  } else if (disc > 0) tipo = T < 0 ? "nodoEstable" : "nodoInestable";
  else tipo = T < 0 ? "focoEstable" : "focoInestable";

  const estabilidad = !hiperbolico ? "indeterminada" : lambdas.every((l) => l.re < 0) ? "asintotica" : "inestable";
  const vectores = lambdas[0].im === 0 ? lambdas.map((l) => autovectorReal(J, l.re)) : null;
  return { tipo, estabilidad, hiperbolico, T, D, disc, lambdas, vectores };
}

// --- Búsqueda de equilibrios ------------------------------------------------------------

/**
 * Busca los equilibrios de F(x, y) = [f, g] en la ventana [xmin, xmax] × [ymin, ymax].
 * `Jfn(x, y)`: jacobiano (simbólico compilado si lo hay; si no, numérico).
 * Devuelve { equilibrios: [{ x, y, J, ...clasificación }], demasiados }.
 * `demasiados`: se encontraron más de `maximo` (p. ej. una recta de equilibrios).
 */
export function buscarEquilibrios(F, Jfn, [xmin, xmax], [ymin, ymax], { semillas = 14, maximo = 30 } = {}) {
  const ancho = xmax - xmin;
  const alto = ymax - ymin;
  // Se busca un poco más allá de la ventana para no perder los del borde.
  const dentro = (x, y) => x >= xmin - 0.02 * ancho && x <= xmax + 0.02 * ancho && y >= ymin - 0.02 * alto && y <= ymax + 0.02 * alto;
  const escalaF = (x, y) => Math.max(1, ...F(x, y).map(Math.abs));
  const encontrados = [];
  let demasiados = false;

  for (let i = 0; i < semillas && !demasiados; i++) {
    for (let j = 0; j < semillas && !demasiados; j++) {
      let x = xmin + (ancho * (i + 0.5)) / semillas;
      let y = ymin + (alto * (j + 0.5)) / semillas;
      let convergio = false;
      for (let iter = 0; iter < 60; iter++) {
        const [f, g] = F(x, y);
        if (!Number.isFinite(f) || !Number.isFinite(g)) break;
        if (Math.hypot(f, g) <= 1e-13 * escalaF(x, y)) { convergio = true; break; }
        const [[a, b], [c, d]] = Jfn(x, y);
        const det = a * d - b * c;
        if (![a, b, c, d].every(Number.isFinite)) break;
        let dx;
        let dy;
        const tamanoJ = Math.max(1e-300, a * a + b * b + c * c + d * d);
        if (Math.abs(det) > 1e-10 * tamanoJ) {
          // Newton: δ = J⁻¹·F.
          dx = (d * f - b * g) / det;
          dy = (-c * f + a * g) / det;
        } else {
          // J (casi) singular, p. ej. en una curva de equilibrios: paso de
          // Levenberg–Marquardt, (JᵀJ + μI)·δ = Jᵀ·F, que sigue bajando |F|.
          const mu = 1e-8 * tamanoJ + 1e-300;
          const p = a * a + c * c + mu;
          const q = a * b + c * d;
          const s = b * b + d * d + mu;
          const r1 = a * f + c * g;
          const r2 = b * f + d * g;
          const detN = p * s - q * q;
          if (!(Math.abs(detN) > 0)) break;
          dx = (s * r1 - q * r2) / detN;
          dy = (-q * r1 + p * r2) / detN;
        }
        // Paso amortiguado: si empeora mucho, se reduce (evita saltos lejos de la ventana).
        let t = 1;
        const norma = Math.hypot(f, g);
        while (t > 1 / 64) {
          const [f2, g2] = F(x - t * dx, y - t * dy);
          if (Number.isFinite(f2) && Number.isFinite(g2) && Math.hypot(f2, g2) < norma * (1 - 1e-4 * t)) break;
          t /= 2;
        }
        x -= t * dx;
        y -= t * dy;
        if (Math.abs(dx) + Math.abs(dy) <= 1e-15 * (1 + Math.abs(x) + Math.abs(y))) {
          const [f3, g3] = F(x, y);
          convergio = Math.hypot(f3, g3) <= 1e-9 * escalaF(x, y);
          break;
        }
      }
      if (!convergio || !dentro(x, y)) continue;
      const repetido = encontrados.some((e) => Math.abs(e.x - x) <= 1e-6 * Math.max(1, ancho) && Math.abs(e.y - y) <= 1e-6 * Math.max(1, alto));
      if (repetido) continue;
      // Limpia el ruido de redondeo: −3e−17 se muestra como 0.
      const limpio = (v, escala) => (Math.abs(v) < 1e-12 * Math.max(1, escala) ? 0 : v);
      x = limpio(x, ancho);
      y = limpio(y, alto);
      const J = Jfn(x, y);
      encontrados.push({ x, y, J, ...clasificarEquilibrio(J) });
      if (encontrados.length > maximo) demasiados = true;
    }
  }
  encontrados.sort((p, q) => p.x - q.x || p.y - q.y);
  return { equilibrios: encontrados, demasiados };
}
