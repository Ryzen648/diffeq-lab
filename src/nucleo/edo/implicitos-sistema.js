// Euler implícito y trapecio implícito para sistemas 2×2, y la medida de la
// rigidez a lo largo de una solución.
//
// Es lo mismo que implicitos.js (allí está la explicación) con vectores: en
// cada paso hay que resolver
//   G(Y) = Y − B − c·F(t₊, Y) = 0
// (Euler implícito: B = Yₙ, c = h; trapecio: B = Yₙ + (h/2)·F(tₙ, Yₙ), c = h/2)
// con Newton, que necesita la matriz G'(Y) = I − c·J(t₊, Y), con J el
// jacobiano de F. Cada iteración resuelve un sistema 2×2 (regla de Cramer).
//
// Rigidez en sistemas: cerca de la solución, Y' ≈ J·Y, y los modos del
// sistema decaen como e^{λt} con λ los autovalores de J. Euler explícito
// multiplica cada modo por (1 + hλ) en cada paso, así que es estable solo si
// |1 + hλ| < 1 para todos los λ (un disco de radio 1 centrado en −1/h…), es
// decir, h < −2·Re λ / |λ|². Un modo muy negativo (Van der Pol con μ grande,
// fuera del ciclo lento) obliga a pasos diminutos aunque la solución cambie
// despacio. Los implícitos no tienen ese límite.

import { LIMITE_EXPLOSION } from "./sistemas.js";
import { autovalores } from "./equilibrios.js";

const ITERACIONES_NEWTON = 50;

/**
 * Resuelve Y = B + c·F(t, Y) con Newton desde `inicial`. J(t, Y) -> [[a, b], [c, d]].
 * Newton amortiguado: si el paso completo no reduce |G|, se parte a la mitad
 * (hasta 1/1024). Sin eso, con pasos grandes en la parte no lineal (el salto
 * rápido de Van der Pol) Newton se sale y no vuelve.
 */
function resolver(F, J, t, B, c, inicial) {
  const G = (Y) => { const FY = F(t, Y); return [Y[0] - B[0] - c * FY[0], Y[1] - B[1] - c * FY[1]]; };
  const norma = (g) => Math.hypot(g[0], g[1]);
  let Y = inicial;
  let g = G(Y);
  let evaluaciones = 1;
  for (let i = 0; i < ITERACIONES_NEWTON; i++) {
    const [[a, b], [cc, d]] = J(t, Y);
    // G' = I − c·J
    const m11 = 1 - c * a;
    const m12 = -c * b;
    const m21 = -c * cc;
    const m22 = 1 - c * d;
    const det = m11 * m22 - m12 * m21;
    if (![...g, det].every(Number.isFinite) || det === 0) return { Y, evaluaciones, convergio: false };
    const dx = (m22 * g[0] - m12 * g[1]) / det;
    const dy = (-m21 * g[0] + m11 * g[1]) / det;
    let factor = 1;
    let nuevo;
    let gNuevo;
    for (;;) {
      nuevo = [Y[0] - factor * dx, Y[1] - factor * dy];
      gNuevo = G(nuevo);
      evaluaciones++;
      if ((gNuevo.every(Number.isFinite) && norma(gNuevo) < norma(g)) || factor < 1 / 1024) break;
      factor /= 2;
    }
    Y = nuevo;
    g = gNuevo;
    if (factor * (Math.abs(dx) + Math.abs(dy)) <= 1e-13 * (1 + Math.abs(Y[0]) + Math.abs(Y[1]))) {
      return { Y, evaluaciones, convergio: norma(g) <= 1e-9 * (1 + Math.abs(Y[0]) + Math.abs(Y[1])) };
    }
  }
  return { Y, evaluaciones, convergio: false };
}

/**
 * metodo: "eulerImplicito" | "trapecioImplicito". N pasos iguales de t0 a tf.
 * Devuelve { xs, Ys, evaluaciones, detenido, h } como integrarSistemaPasoFijo.
 */
export function integrarImplicitoSistema(metodo, F, J, t0, Y0, tf, N) {
  const h = (tf - t0) / N;
  const xs = [t0];
  const Ys = [Y0];
  let Y = Y0;
  let evaluaciones = 0;
  let detenido = null;
  for (let n = 0; n < N; n++) {
    const t = t0 + n * h;
    const tSig = n === N - 1 ? tf : t0 + (n + 1) * h;
    const FY = F(t, Y);
    evaluaciones++;
    // Newton empieza en Yₙ: en un problema rígido, el predictor de Euler explícito cae lejísimos.
    const predictor = Y;
    const r = metodo === "eulerImplicito"
      ? resolver(F, J, tSig, Y, h, predictor)
      : resolver(F, J, tSig, [Y[0] + (h / 2) * FY[0], Y[1] + (h / 2) * FY[1]], h / 2, predictor);
    evaluaciones += r.evaluaciones;
    Y = r.Y;
    if (!r.convergio || !Y.every(Number.isFinite)) { detenido = { x: tSig, motivo: "newton" }; break; }
    xs.push(tSig);
    Ys.push(Y);
    if (Math.max(Math.abs(Y[0]), Math.abs(Y[1])) > LIMITE_EXPLOSION) { detenido = { x: tSig, motivo: "explota" }; break; }
  }
  return { xs, Ys, evaluaciones, detenido, h };
}

/** Mayor h con |1 + hλ| ≤ 1 para un autovalor λ (Infinity si Re λ ≥ 0: ahí Euler no decide nada). */
export function pasoEstableEuler({ re, im }) {
  if (re >= 0) return Infinity;
  return (-2 * re) / (re * re + im * im);
}

/**
 * Rigidez a lo largo de una solución (muestras de t y Y). J(t, Y) -> matriz.
 * Devuelve { lambda: el autovalor de parte real más negativa, hEuler: el
 * paso máximo con el que Euler explícito es estable para ese modo }.
 * Se mide el modo más rápido y no el mínimo de todos los límites: un
 * autovalor casi imaginario (Re λ ≈ 0⁻) daría un límite diminuto que no es
 * rigidez sino un modo casi neutro, y a lo largo de una solución no lineal
 * la linealización cambia en cada punto, así que es una estimación.
 */
export function rigidezSistema(J, ts, Ys) {
  let lambda = null;
  const salto = Math.max(1, Math.floor(ts.length / 300));
  for (let i = 0; i < ts.length; i += salto) {
    let M;
    try { M = J(ts[i], Ys[i]); } catch { continue; }
    if (!M.flat().every(Number.isFinite)) continue;
    for (const l of autovalores(M)) {
      if (lambda === null || l.re < lambda.re) lambda = l;
    }
  }
  return { lambda, hEuler: lambda ? pasoEstableEuler(lambda) : Infinity };
}
