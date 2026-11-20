// Métodos numéricos para sistemas Y' = F(x, Y), con Y un vector (array).
//
// Son los mismos métodos de paso-fijo.js y dormand-prince.js (allí están
// explicados para el caso escalar), escritos componente a componente:
//   - Euler, Heun y RK4: las mismas fórmulas, con k₁…k₄ vectores;
//   - Dormand–Prince 5(4): el error local de cada componente se divide entre
//     su propia escala atol + rtol·|yᵢ| y se toma la norma RMS (la media
//     cuadrática), como hacen SciPy y Hairer: así una componente grande no
//     esconde el error de una pequeña.
// Una EDO de orden 2, y'' = f(x, y, y'), entra aquí como el sistema
//   Y = (y, v),  Y' = (v, f(x, y, v)).
//
// Las versiones escalares (EDO de primer orden) son envoltorios de estas con
// vectores de una componente; las pruebas comprueban que dan exactamente lo
// mismo que las implementaciones escalares originales.

export const LIMITE_EXPLOSION = 1e12;

const suma = (Y, h, K) => Y.map((y, i) => y + h * K[i]);
const finitoTodo = (Y) => Y.every(Number.isFinite);
const maximoAbs = (Y) => Y.reduce((m, y) => Math.max(m, Math.abs(y)), 0);

export const METODOS_SISTEMA = Object.freeze({
  euler: {
    orden: 1,
    etapas: 1,
    paso(F, x, Y, h) {
      return suma(Y, h, F(x, Y));
    },
  },
  heun: {
    orden: 2,
    etapas: 2,
    paso(F, x, Y, h) {
      const k1 = F(x, Y);
      const k2 = F(x + h, suma(Y, h, k1));
      return Y.map((y, i) => y + (h * (k1[i] + k2[i])) / 2);
    },
  },
  rk4: {
    orden: 4,
    etapas: 4,
    paso(F, x, Y, h) {
      const k1 = F(x, Y);
      const k2 = F(x + h / 2, suma(Y, h / 2, k1));
      const k3 = F(x + h / 2, suma(Y, h / 2, k2));
      const k4 = F(x + h, suma(Y, h, k3));
      return Y.map((y, i) => y + (h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) / 6);
    },
  },
});

/**
 * N pasos iguales de x0 a xf (h < 0 si xf < x0). Devuelve
 * { xs, Ys, evaluaciones, detenido, h } con Ys[i] el vector en xs[i].
 */
export function integrarSistemaPasoFijo(metodo, F, x0, Y0, xf, N) {
  const m = typeof metodo === "string" ? METODOS_SISTEMA[metodo] : metodo;
  const h = (xf - x0) / N;
  const xs = [x0];
  const Ys = [Y0];
  let Y = Y0;
  let detenido = null;
  for (let n = 0; n < N; n++) {
    const x = x0 + n * h;
    Y = m.paso(F, x, Y, h);
    const xSig = n === N - 1 ? xf : x0 + (n + 1) * h;
    if (!finitoTodo(Y)) { detenido = { x: xSig, motivo: "noFinito" }; break; }
    xs.push(xSig);
    Ys.push(Y);
    if (maximoAbs(Y) > LIMITE_EXPLOSION) { detenido = { x: xSig, motivo: "explota" }; break; }
  }
  return { xs, Ys, evaluaciones: (xs.length - 1) * m.etapas, detenido, h };
}

/** Con un paso h dado: N = ⌈|xf − x0|/h⌉ y el último paso se ajusta. */
export function integrarSistemaConPaso(metodo, F, x0, Y0, xf, h) {
  const N = Math.max(1, Math.ceil(Math.abs(xf - x0) / Math.abs(h) - 1e-9));
  return integrarSistemaPasoFijo(metodo, F, x0, Y0, xf, N);
}

// --- Dormand–Prince 5(4) ------------------------------------------------------------

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
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
const SEGURIDAD = 0.9;
const FACTOR_MIN = 0.2;
const FACTOR_MAX = 5;

/** Norma RMS de v escalada componente a componente. */
function normaEscalada(v, Y, Ynuevo, rtol, atol) {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const escala = atol + rtol * Math.max(Math.abs(Y[i]), Math.abs(Ynuevo[i]));
    s += (v[i] / escala) ** 2;
  }
  return Math.sqrt(s / v.length);
}

/** Paso inicial de Hairer, Nørsett y Wanner (II.4), en norma RMS escalada. */
function pasoInicial(F, x0, Y0, F0, direccion, rtol, atol) {
  const d0 = normaEscalada(Y0, Y0, Y0, rtol, atol);
  const d1 = normaEscalada(F0, Y0, Y0, rtol, atol);
  const h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : 0.01 * (d0 / d1);
  const Y1 = suma(Y0, direccion * h0, F0);
  const F1 = F(x0 + direccion * h0, Y1);
  const d2 = normaEscalada(F1.map((v, i) => v - F0[i]), Y0, Y0, rtol, atol) / h0;
  const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / 5);
  return Math.min(100 * h0, h1);
}

/**
 * Integra Y' = F(x, Y) de x0 a xf con control de paso. Devuelve
 * { xs, Ys, Fs, pasos, rechazados, evaluaciones, detenido } (Fs: pendiente en
 * cada punto aceptado, para interpolar).
 */
export function dormandPrinceSistema(F, x0, Y0, xf, { rtol = 1e-6, atol = 1e-9, hMax = Infinity, maxPasos = 100000 } = {}) {
  const direccion = xf >= x0 ? 1 : -1;
  const longitud = Math.abs(xf - x0);
  const dim = Y0.length;
  let x = x0;
  let Y = Y0;
  let k1 = F(x, Y);
  let evaluaciones = 1;
  let h = Math.min(pasoInicial(F, x0, Y0, k1, direccion, rtol, atol), hMax, longitud);
  evaluaciones++;

  const xs = [x0];
  const Ys = [Y0];
  const Fs = [k1];
  const pasos = [];
  let rechazados = 0;
  let detenido = null;
  let rechazadoAntes = false;
  const k = new Array(7);

  while (direccion * (xf - x) > 1e-14 * Math.max(1, Math.abs(xf))) {
    if (xs.length > maxPasos) { detenido = { x, motivo: "demasiadosPasos" }; break; }
    if (h < 1e-14 * Math.max(1, Math.abs(x))) { detenido = { x, motivo: "pasoMinimo" }; break; }
    const hs = direccion * Math.min(h, Math.abs(xf - x));

    k[0] = k1;
    for (let i = 1; i < 7; i++) {
      const Yi = new Array(dim);
      for (let c = 0; c < dim; c++) {
        let s = 0;
        for (let j = 0; j < i; j++) s += A[i][j] * k[j][c];
        Yi[c] = Y[c] + hs * s;
      }
      k[i] = F(x + C[i] * hs, Yi);
    }
    evaluaciones += 6;
    const Ynuevo = new Array(dim);
    const errorAbs = new Array(dim);
    for (let c = 0; c < dim; c++) {
      let s5 = 0;
      let se = 0;
      for (let i = 0; i < 7; i++) { s5 += B5[i] * k[i][c]; se += E[i] * k[i][c]; }
      Ynuevo[c] = Y[c] + hs * s5;
      errorAbs[c] = hs * se;
    }
    const err = normaEscalada(errorAbs, Y, Ynuevo, rtol, atol);

    if (!finitoTodo(Ynuevo) || !Number.isFinite(err)) {
      rechazados++;
      rechazadoAntes = true;
      h *= FACTOR_MIN;
      continue;
    }

    let factor = err === 0 ? FACTOR_MAX : SEGURIDAD * err ** (-1 / 5);
    if (err <= 1) {
      x += hs;
      Y = Ynuevo;
      k1 = k[6]; // FSAL
      xs.push(x);
      Ys.push(Y);
      Fs.push(k1);
      pasos.push(Math.abs(hs));
      if (maximoAbs(Y) > LIMITE_EXPLOSION) { detenido = { x, motivo: "explota" }; break; }
      factor = Math.min(rechazadoAntes ? 1 : FACTOR_MAX, Math.max(FACTOR_MIN, factor));
      rechazadoAntes = false;
    } else {
      rechazados++;
      rechazadoAntes = true;
      factor = Math.max(FACTOR_MIN, Math.min(1, factor));
    }
    h = Math.min(Math.abs(hs) * factor, hMax);
  }
  return { xs, Ys, Fs, pasos, rechazados, evaluaciones, detenido };
}

// --- Interpolación de Hermite cúbica (para dibujar y evaluar entre pasos) ------------

function hermite(Ya, Fa, Yb, Fb, h, s) {
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;
  return Ya.map((ya, c) => h00 * ya + h10 * h * Fa[c] + h01 * Yb[c] + h11 * h * Fb[c]);
}

export function interpolarHermiteSistema({ xs, Ys, Fs }, porTramo = 8) {
  const X = [xs[0]];
  const Yd = [Ys[0]];
  for (let i = 0; i + 1 < xs.length; i++) {
    const h = xs[i + 1] - xs[i];
    for (let j = 1; j <= porTramo; j++) {
      const s = j / porTramo;
      X.push(xs[i] + s * h);
      Yd.push(hermite(Ys[i], Fs[i], Ys[i + 1], Fs[i + 1], h, s));
    }
  }
  return { xs: X, Ys: Yd };
}

export function evaluarSistemaEn({ xs, Ys, Fs }, x) {
  const creciente = xs.at(-1) >= xs[0];
  let i = 0;
  while (i + 2 < xs.length && (creciente ? xs[i + 1] < x : xs[i + 1] > x)) i++;
  const h = xs[i + 1] - xs[i];
  if (!h) return Ys[i];
  return hermite(Ys[i], Fs[i], Ys[i + 1], Fs[i + 1], h, (x - xs[i]) / h);
}
