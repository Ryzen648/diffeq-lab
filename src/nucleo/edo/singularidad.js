// Dónde y por qué deja de existir la solución dentro del intervalo pedido.
//
// Dormand–Prince, con tolerancia muy fina, se detiene solo cerca de un punto
// donde la solución no se puede continuar: su control de paso reduce h sin
// fin o |y| se desborda. Los métodos de paso fijo, en cambio, NO se detienen:
// con (2xy + 3x²) + (x² + 4y)·y' = 0 desde y(1) = 1, RK4 con h = 0.05 cruza
// la singularidad (x* ≈ 1.7209, donde x² + 4y = 0) y devuelve y(3) = −3.84,
// un número sin sentido (medido). Por eso se usa la referencia para localizar
// la parada y se recorta el intervalo de TODOS los métodos antes de ella.
//
// El motivo se diagnostica en el último punto aceptado (x, y):
//   explota            |y| → ∞ (asíntota vertical, p. ej. y' = y²)
//   coeficienteNulo    N(x, y) → 0 en M + N·y' = 0: y' → ∞, tangente vertical
//   pendienteInfinita  f(x, y) → ∞ con N lejos de 0 (un denominador dentro de f)
//   fueraDeDominio     un poco más allá, f deja de ser real (√ de negativo, ln…)
//   pasoMinimo         ninguna de las anteriores: el paso se hizo diminuto

import { dormandPrince } from "./dormand-prince.js";
import { LIMITE_EXPLOSION } from "./paso-fijo.js";
import { ErrorCalculo } from "../errores.js";

/**
 * Fracción del tramo hasta la parada que se integra con todos los métodos:
 * justo en la singularidad f es enorme y un método de paso fijo daría saltos
 * absurdos. 0.99 deja un 1 % de margen (decisión de diseño, ver README).
 */
export const FRACCION_CORTE = 0.99;

const finito = Number.isFinite;

/**
 * Con tolerancia fina, Dormand–Prince se para por paso mínimo ANTES de que |y|
 * llegue a desbordarse, así que «explota» se reconoce porque |y| ya creció
 * mucho respecto de y0. Medido en la parada: y' = y² desde 1 → |y| ≈ 9·10¹¹;
 * y' = y³ desde 0.5 → 6·10⁵; en cambio, en la tangente vertical de
 * (2xy + 3x²) + (x² + 4y)·y' = 0, y ≈ −0.74.
 */
const CRECIMIENTO_EXPLOSION = 1e4;

/** `funciones`: { f, M, N } evaluables en (x, y). `y0`: el valor inicial, para medir cuánto creció y. */
export function diagnosticarParada({ f, M, N }, x, y, direccion, motivoSolver = null, y0 = null) {
  if (motivoSolver === "explota" || !finito(y) || Math.abs(y) > LIMITE_EXPLOSION) return "explota";
  if (y0 !== null && Math.abs(y) >= CRECIMIENTO_EXPLOSION * Math.max(1, Math.abs(y0))) return "explota";
  const fy = f(x, y);
  if (!finito(fy) || Math.abs(fy) > 1e6 * Math.max(1, Math.abs(y))) {
    const n = N ? N(x, y) : NaN;
    const m = M ? M(x, y) : NaN;
    if (finito(n) && Math.abs(n) <= 1e-3 * Math.max(1, Math.abs(m))) return "coeficienteNulo";
    return "pendienteInfinita";
  }
  const escala = Math.max(1, Math.abs(x));
  for (const d of [1e-10, 1e-8, 1e-6, 1e-4]) {
    if (!finito(f(x + direccion * d * escala, y))) return "fueraDeDominio";
  }
  return "pasoMinimo";
}

/**
 * Integra con Dormand–Prince fino de x0 hacia `extremo` y, si se detiene antes,
 * devuelve dónde y por qué, y hasta dónde integrar con los demás métodos.
 *   { extremo: x hasta el que integrar, parada: null | { x, y, motivo } }
 * Lanza un error si la ecuación no está definida en la propia condición inicial.
 */
export function explorarTramo(funciones, x0, y0, extremo, opciones = { rtol: 1e-12, atol: 1e-14 }) {
  const f0 = funciones.f(x0, y0);
  if (!finito(f0)) {
    throw new ErrorCalculo("singularEnCondicionInicial", { x0, y0, motivo: diagnosticarParada(funciones, x0, y0, Math.sign(extremo - x0)) });
  }
  const r = dormandPrince(funciones.f, x0, y0, extremo, opciones);
  if (!r.detenido) return { extremo, parada: null, solucion: r };
  const x = r.detenido.motivo === "explota" ? r.detenido.x : r.xs.at(-1);
  const y = r.ys.at(-1);
  const direccion = Math.sign(extremo - x0);
  const motivo = diagnosticarParada(funciones, x, y, direccion, r.detenido.motivo, y0);
  // Parada pegada a x0: no queda nada que integrar en ese sentido.
  if (Math.abs(x - x0) <= 1e-9 * Math.max(1, Math.abs(x0))) {
    throw new ErrorCalculo("singularEnCondicionInicial", { x0, y0, motivo });
  }
  return { extremo: x0 + FRACCION_CORTE * (x - x0), parada: { x, y, motivo }, solucion: r };
}
