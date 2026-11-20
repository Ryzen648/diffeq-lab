// Implementación escalar ORIGINAL de la Fase 1b (copiada de git sin cambios de lógica).
// Solo para las pruebas: sirve de referencia independiente para comprobar que el
// núcleo vectorial (src/nucleo/edo/sistemas.js) reproduce los mismos resultados.

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

export const LIMITE_EXPLOSION = 1e12;

export const METODOS_PASO_FIJO = Object.freeze({
  euler: {
    orden: 1,
    etapas: 1,
    paso(f, x, y, h) {
      return y + h * f(x, y);
    },
  },
  heun: {
    orden: 2,
    etapas: 2,
    paso(f, x, y, h) {
      const k1 = f(x, y);
      const k2 = f(x + h, y + h * k1);
      return y + (h * (k1 + k2)) / 2;
    },
  },
  rk4: {
    orden: 4,
    etapas: 4,
    paso(f, x, y, h) {
      const k1 = f(x, y);
      const k2 = f(x + h / 2, y + (h * k1) / 2);
      const k3 = f(x + h / 2, y + (h * k2) / 2);
      const k4 = f(x + h, y + h * k3);
      return y + (h * (k1 + 2 * k2 + 2 * k3 + k4)) / 6;
    },
  },
});

/**
 * Integra de x0 a xf con N pasos iguales (h = (xf − x0)/N, negativo si se
 * integra hacia atrás). Devuelve { xs, ys, evaluaciones, detenido }.
 * `detenido` es null o { x, motivo: "explota" | "noFinito" }.
 */
export function integrarPasoFijo(metodo, f, x0, y0, xf, N) {
  const m = typeof metodo === "string" ? METODOS_PASO_FIJO[metodo] : metodo;
  const h = (xf - x0) / N;
  const xs = [x0];
  const ys = [y0];
  let y = y0;
  let detenido = null;
  for (let n = 0; n < N; n++) {
    const x = x0 + n * h;
    y = m.paso(f, x, y, h);
    const xSig = n === N - 1 ? xf : x0 + (n + 1) * h;
    if (!Number.isFinite(y)) { detenido = { x: xSig, motivo: "noFinito" }; break; }
    xs.push(xSig);
    ys.push(y);
    if (Math.abs(y) > LIMITE_EXPLOSION) { detenido = { x: xSig, motivo: "explota" }; break; }
  }
  return { xs, ys, evaluaciones: (xs.length - 1) * m.etapas, detenido, h };
}

/** Igual, pero con un paso h dado: N = ⌈|xf − x0|/h⌉ y el último paso se ajusta. */
export function integrarConPaso(metodo, f, x0, y0, xf, h) {
  const N = Math.max(1, Math.ceil(Math.abs(xf - x0) / Math.abs(h) - 1e-9));
  return integrarPasoFijo(metodo, f, x0, y0, xf, N);
}
