// Dormand–Prince 5(4): Runge–Kutta adaptativo (el «RK45» de SciPy y ode45 de MATLAB).
//
// Cada paso calcula 7 etapas k₁…k₇ y con ellas DOS soluciones:
//   y₅ de orden 5 (la que se usa) e y₄ de orden 4 (solo para comparar).
// Su diferencia estima el error local del paso sin conocer la solución exacta:
//   err = |y₅ − y₄| / (atol + rtol·max(|y|, |y₅|))      (error relativo a la tolerancia)
// Si err ≤ 1 el paso se acepta; si no, se repite con un h menor. En ambos
// casos el h siguiente se elige para que el próximo err quede cerca de 1:
//   h_nuevo = h · seguridad · err^(−1/5)          (1/5 porque el error local es O(h⁵))
// con seguridad 0.9 y el factor acotado a [0.2, 5] para no dar saltos bruscos.
//
// FSAL («first same as last»): la etapa k₇ se evalúa en el punto final con
// y₅, que es exactamente k₁ del paso siguiente. Así cada paso aceptado
// cuesta 6 evaluaciones de f y no 7.
//
// Coeficientes: Dormand y Prince (1980), tabla de Butcher estándar.

import { LIMITE_EXPLOSION } from "./paso-fijo.js";

const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
// Pesos de orden 5 (= última fila de A, por eso funciona FSAL) y su
// diferencia con los de orden 4: E = b₅ − b₄.
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];

const SEGURIDAD = 0.9;
const FACTOR_MIN = 0.2;
const FACTOR_MAX = 5;

/**
 * Paso inicial automático (Hairer, Nørsett y Wanner, «Solving ODE I», II.4):
 * una primera estimación con las derivadas y un ajuste con una segunda
 * evaluación de f. Cuesta 1 evaluación extra (f0 ya se tenía).
 */
function pasoInicial(f, x0, y0, f0, direccion, rtol, atol) {
  const escala = atol + rtol * Math.abs(y0);
  const d0 = Math.abs(y0) / escala;
  const d1 = Math.abs(f0) / escala;
  const h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1);
  const y1 = y0 + direccion * h0 * f0;
  const f1 = f(x0 + direccion * h0, y1);
  const d2 = Math.abs(f1 - f0) / escala / h0;
  const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / 5);
  return Math.min(100 * h0, h1);
}

/**
 * Integra y' = f(x, y) de x0 a xf. Devuelve:
 *   xs, ys, fs: puntos aceptados y la pendiente en cada uno (para interpolar)
 *   pasos: tamaños de paso aceptados; rechazados: cuántos se repitieron
 *   evaluaciones: llamadas a f; detenido: null o { x, motivo }
 */
export function dormandPrince(f, x0, y0, xf, { rtol = 1e-6, atol = 1e-9, hMax = Infinity, maxPasos = 100000 } = {}) {
  const direccion = xf >= x0 ? 1 : -1;
  const longitud = Math.abs(xf - x0);
  let x = x0;
  let y = y0;
  let k1 = f(x, y);
  let evaluaciones = 1;
  let h = Math.min(pasoInicial(f, x0, y0, k1, direccion, rtol, atol), hMax, longitud);
  evaluaciones++;

  const xs = [x0];
  const ys = [y0];
  const fs = [k1];
  const pasos = [];
  let rechazados = 0;
  let detenido = null;
  let rechazadoAntes = false;
  const k = new Array(7);

  while (direccion * (xf - x) > 1e-14 * Math.max(1, Math.abs(xf))) {
    if (xs.length > maxPasos) { detenido = { x, motivo: "demasiadosPasos" }; break; }
    if (h < 1e-14 * Math.max(1, Math.abs(x))) { detenido = { x, motivo: "pasoMinimo" }; break; }
    const hs = direccion * Math.min(h, Math.abs(xf - x)); // no pasarse de xf

    k[0] = k1;
    for (let i = 1; i < 7; i++) {
      let s = 0;
      for (let j = 0; j < i; j++) s += A[i][j] * k[j];
      k[i] = f(x + C[i] * hs, y + hs * s);
    }
    evaluaciones += 6;
    let yNuevo = y;
    let errorAbs = 0;
    for (let i = 0; i < 7; i++) {
      yNuevo += hs * B5[i] * k[i];
      errorAbs += hs * E[i] * k[i];
    }
    const escala = atol + rtol * Math.max(Math.abs(y), Math.abs(yNuevo));
    const err = Math.abs(errorAbs) / escala;

    if (!Number.isFinite(yNuevo) || !Number.isFinite(err)) {
      // Una etapa salió del dominio (o se desbordó): se reintenta con h menor.
      rechazados++;
      rechazadoAntes = true;
      h *= FACTOR_MIN;
      continue;
    }

    let factor = err === 0 ? FACTOR_MAX : SEGURIDAD * err ** (-1 / 5);
    if (err <= 1) {
      // Paso aceptado.
      x += hs;
      y = yNuevo;
      k1 = k[6]; // FSAL
      xs.push(x);
      ys.push(y);
      fs.push(k1);
      pasos.push(Math.abs(hs));
      if (Math.abs(y) > LIMITE_EXPLOSION) { detenido = { x, motivo: "explota" }; break; }
      // Tras un rechazo no se agranda el paso enseguida (evita oscilar).
      factor = Math.min(rechazadoAntes ? 1 : FACTOR_MAX, Math.max(FACTOR_MIN, factor));
      rechazadoAntes = false;
    } else {
      rechazados++;
      rechazadoAntes = true;
      factor = Math.max(FACTOR_MIN, Math.min(1, factor));
    }
    h = Math.min(Math.abs(hs) * factor, hMax);
  }
  return { xs, ys, fs, pasos, rechazados, evaluaciones, detenido };
}

/**
 * Interpolación de Hermite cúbica entre los puntos aceptados, con los valores
 * y las pendientes en los extremos de cada paso. Sirve para dibujar curvas
 * suaves aunque los pasos sean largos (error O(h⁴), de sobra para la vista).
 */
export function interpolarHermite({ xs, ys, fs }, porTramo = 8) {
  const X = [xs[0]];
  const Y = [ys[0]];
  for (let i = 0; i + 1 < xs.length; i++) {
    const h = xs[i + 1] - xs[i];
    for (let j = 1; j <= porTramo; j++) {
      const s = j / porTramo;
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
      const h10 = s ** 3 - 2 * s ** 2 + s;
      const h01 = -2 * s ** 3 + 3 * s ** 2;
      const h11 = s ** 3 - s ** 2;
      X.push(xs[i] + s * h);
      Y.push(h00 * ys[i] + h10 * h * fs[i] + h01 * ys[i + 1] + h11 * h * fs[i + 1]);
    }
  }
  return { xs: X, ys: Y };
}

/** Valor en un x cualquiera dentro del rango integrado (Hermite en el tramo que lo contiene). */
export function evaluarEn(solucion, x) {
  const { xs, ys, fs } = solucion;
  const creciente = xs.at(-1) >= xs[0];
  let i = 0;
  while (i + 2 < xs.length && (creciente ? xs[i + 1] < x : xs[i + 1] > x)) i++;
  const h = xs[i + 1] - xs[i];
  if (!h) return ys[i];
  const s = (x - xs[i]) / h;
  return (2 * s ** 3 - 3 * s ** 2 + 1) * ys[i] + (s ** 3 - 2 * s ** 2 + s) * h * fs[i]
    + (-2 * s ** 3 + 3 * s ** 2) * ys[i + 1] + (s ** 3 - s ** 2) * h * fs[i + 1];
}
