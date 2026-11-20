// Métodos implícitos: Euler implícito y trapecio implícito (Crank–Nicolson).
//
// Rigidez en una frase: hay componentes de la solución que se apagan muy
// deprisa (como e^{−50x}) y un método explícito necesita pasos diminutos solo
// para no volverse inestable, aunque esa componente ya no importe.
//
// Ejemplo de prueba y' = λy con λ < 0. Euler explícito hace
//   y₊ = (1 + hλ)·y,
// que solo decae si |1 + hλ| < 1, es decir h < 2/|λ|. Con λ = −50, h < 0.04.
// Euler implícito evalúa la pendiente al FINAL del paso:
//   y₊ = y + h·f(x₊, y₊)   ⇒ para y' = λy:  y₊ = y / (1 − hλ),
// que decae para todo h > 0 (A-estable). El precio: y₊ aparece en los dos
// lados, así que en cada paso hay que resolver una ecuación. Se usa Newton:
//   g(Y) = Y − y − h·f(x₊, Y) = 0,   Y ← Y − g(Y)/g'(Y),   g'(Y) = 1 − h·∂f/∂y.
// ∂f/∂y se aproxima con una diferencia centrada (o se pasa exacta si se tiene).
//
// Trapecio implícito: y₊ = y + h·(f(x, y) + f(x₊, y₊))/2. Orden 2 y también
// A-estable, pero con λh muy negativo el factor (1 + hλ/2)/(1 − hλ/2) → −1:
// no explota, pero la componente rápida oscila en vez de apagarse. Se
// incluye para que se vea esa diferencia (Euler implícito es L-estable).

import { LIMITE_EXPLOSION } from "./paso-fijo.js";

const ITERACIONES_NEWTON = 30;

function derivadaY(f, x, y) {
  const d = 1e-6 * Math.max(1, Math.abs(y));
  return (f(x, y + d) - f(x, y - d)) / (2 * d);
}

/**
 * Resuelve Y = base + c·f(x₊, Y) con Newton, empezando en `inicial`.
 * Devuelve { Y, evaluaciones, convergio }.
 */
function resolverImplicito(f, xSig, base, c, inicial, dfdy) {
  let Y = inicial;
  let evaluaciones = 0;
  for (let i = 0; i < ITERACIONES_NEWTON; i++) {
    const g = Y - base - c * f(xSig, Y);
    const dg = 1 - c * (dfdy ? dfdy(xSig, Y) : derivadaY(f, xSig, Y));
    evaluaciones += dfdy ? 1 : 3;
    if (!Number.isFinite(g) || !Number.isFinite(dg) || dg === 0) return { Y, evaluaciones, convergio: false };
    const paso = g / dg;
    Y -= paso;
    if (Math.abs(paso) <= 1e-13 * Math.max(1, Math.abs(Y))) return { Y, evaluaciones, convergio: true };
  }
  return { Y, evaluaciones, convergio: false };
}

export const METODOS_IMPLICITOS = Object.freeze({
  eulerImplicito: { orden: 1 },
  trapecioImplicito: { orden: 2 },
});

/**
 * Integra con N pasos iguales. `dfdy` opcional (∂f/∂y exacta).
 * Devuelve { xs, ys, evaluaciones, detenido } como los de paso fijo.
 */
export function integrarImplicito(metodo, f, x0, y0, xf, N, { dfdy = null } = {}) {
  const h = (xf - x0) / N;
  const xs = [x0];
  const ys = [y0];
  let y = y0;
  let evaluaciones = 0;
  let detenido = null;
  for (let n = 0; n < N; n++) {
    const x = x0 + n * h;
    const xSig = n === N - 1 ? xf : x0 + (n + 1) * h;
    const fx = f(x, y);
    evaluaciones++;
    const predictor = y + h * fx; // Euler explícito como punto de partida de Newton
    const r = metodo === "eulerImplicito"
      ? resolverImplicito(f, xSig, y, h, predictor, dfdy)
      : resolverImplicito(f, xSig, y + (h / 2) * fx, h / 2, predictor, dfdy);
    evaluaciones += r.evaluaciones;
    y = r.Y;
    if (!r.convergio || !Number.isFinite(y)) { detenido = { x: xSig, motivo: "newton" }; break; }
    xs.push(xSig);
    ys.push(y);
    if (Math.abs(y) > LIMITE_EXPLOSION) { detenido = { x: xSig, motivo: "explota" }; break; }
  }
  return { xs, ys, evaluaciones, detenido, h };
}
