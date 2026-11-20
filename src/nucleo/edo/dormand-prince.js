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

// La implementación (tabla de Butcher, control de paso, paso inicial de
// Hairer) está en sistemas.js; aquí se usa con vectores de una componente.
// Con una componente, la norma RMS escalada es |error|/(atol + rtol·|y|),
// exactamente el criterio escalar. Las pruebas comprueban que el número de
// pasos, rechazos y evaluaciones coincide con la implementación escalar previa.

import { dormandPrinceSistema, interpolarHermiteSistema, evaluarSistemaEn } from "./sistemas.js";
import { comoSistema } from "./paso-fijo.js";

/**
 * Integra y' = f(x, y) de x0 a xf. Devuelve:
 *   xs, ys, fs: puntos aceptados y la pendiente en cada uno (para interpolar)
 *   pasos: tamaños de paso aceptados; rechazados: cuántos se repitieron
 *   evaluaciones: llamadas a f; detenido: null o { x, motivo }
 */
export function dormandPrince(f, x0, y0, xf, opciones = {}) {
  const r = dormandPrinceSistema(comoSistema(f), x0, [y0], xf, opciones);
  return {
    xs: r.xs, ys: r.Ys.map((Y) => Y[0]), fs: r.Fs.map((F) => F[0]),
    pasos: r.pasos, rechazados: r.rechazados, evaluaciones: r.evaluaciones, detenido: r.detenido,
  };
}

const aSistema = ({ xs, ys, fs }) => ({ xs, Ys: ys.map((y) => [y]), Fs: fs.map((v) => [v]) });

/**
 * Interpolación de Hermite cúbica entre los puntos aceptados, con los valores
 * y las pendientes en los extremos de cada paso. Sirve para dibujar curvas
 * suaves aunque los pasos sean largos (error O(h⁴), de sobra para la vista).
 */
export function interpolarHermite(solucion, porTramo = 8) {
  const r = interpolarHermiteSistema(aSistema(solucion), porTramo);
  return { xs: r.xs, ys: r.Ys.map((Y) => Y[0]) };
}

/** Valor en un x cualquiera dentro del rango integrado (Hermite en el tramo que lo contiene). */
export function evaluarEn(solucion, x) {
  return evaluarSistemaEn(aSistema(solucion), x)[0];
}
