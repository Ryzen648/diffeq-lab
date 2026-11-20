// Métodos de paso fijo para y' = f(x, y): Euler, Heun (RK2) y RK4.
//
// Todos avanzan de (xₙ, yₙ) a (xₙ₊₁, yₙ₊₁) con xₙ₊₁ = xₙ + h, estimando la
// pendiente media en [xₙ, xₙ₊₁] de forma cada vez más precisa:
//
//   Euler:   y₊ = y + h·k₁,                    k₁ = f(x, y)
//            Usa solo la pendiente del inicio. Error local O(h²), global O(h).
//
//   Heun:    k₂ = f(x + h, y + h·k₁)          (pendiente al final, predicha con Euler)
//            y₊ = y + h·(k₁ + k₂)/2           (media de inicio y final: trapecio)
//            Error global O(h²). Es un Runge–Kutta de 2 etapas.
//
//   RK4:     k₁ = f(x, y)
//            k₂ = f(x + h/2, y + h·k₁/2)
//            k₃ = f(x + h/2, y + h·k₂/2)
//            k₄ = f(x + h,   y + h·k₃)
//            y₊ = y + h·(k₁ + 2k₂ + 2k₃ + k₄)/6
//            Las pesas 1, 2, 2, 1 son las de Simpson: si f no depende de y,
//            RK4 ES la regla de Simpson. Error global O(h⁴).
//
// «Global O(h^p)»: el error en el punto final, acumulado tras N = L/h pasos,
// se divide por ≈ 2^p al dividir h entre 2. Eso mide el estudio de convergencia.
//
// Si la solución explota (|y| > LIMITE o deja de ser un número finito) se para
// y se informa de dónde: es información (y' = y² explota en tiempo finito),
// no un fallo del método.

// La implementación está en sistemas.js (componente a componente); aquí se usa
// con vectores de una sola componente. Las pruebas comprueban que da lo mismo
// que la implementación escalar directa que hubo antes (paso a paso, 1e−13).

import { METODOS_SISTEMA, integrarSistemaPasoFijo, LIMITE_EXPLOSION } from "./sistemas.js";

export { LIMITE_EXPLOSION };

/** Orden y etapas (evaluaciones de f por paso) de cada método. */
export const METODOS_PASO_FIJO = Object.freeze(Object.fromEntries(
  Object.entries(METODOS_SISTEMA).map(([id, m]) => [id, Object.freeze({ id, orden: m.orden, etapas: m.etapas })]),
));

/** y' = f(x, y) escalar -> Y' = F(x, Y) con Y = [y]. */
export const comoSistema = (f) => (x, Y) => [f(x, Y[0])];

/**
 * Integra de x0 a xf con N pasos iguales (h = (xf − x0)/N, negativo si se
 * integra hacia atrás). Devuelve { xs, ys, evaluaciones, detenido, h }.
 * `detenido` es null o { x, motivo: "explota" | "noFinito" }.
 */
export function integrarPasoFijo(metodo, f, x0, y0, xf, N) {
  const id = typeof metodo === "string" ? metodo : metodo.id;
  const r = integrarSistemaPasoFijo(id, comoSistema(f), x0, [y0], xf, N);
  return { xs: r.xs, ys: r.Ys.map((Y) => Y[0]), evaluaciones: r.evaluaciones, detenido: r.detenido, h: r.h };
}

/** Igual, pero con un paso h dado: N = ⌈|xf − x0|/h⌉ y el último paso se ajusta. */
export function integrarConPaso(metodo, f, x0, y0, xf, h) {
  const N = Math.max(1, Math.ceil(Math.abs(xf - x0) / Math.abs(h) - 1e-9));
  return integrarPasoFijo(metodo, f, x0, y0, xf, N);
}
