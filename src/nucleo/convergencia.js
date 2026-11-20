// Orden de convergencia observado: la pendiente en escala log-log.
//
// Si el error se comporta como E(h) ≈ C·h^p, entonces
//   log E = log C + p · log h,
// una recta de pendiente p. Ajustando una recta por mínimos cuadrados a los
// puntos (log h, log E) se estima p y se compara con el orden teórico.
//
// Dos trampas que este ajuste evita a propósito:
//   - Redondeo: con h muy pequeño el error deja de bajar porque domina la
//     aritmética de coma flotante (~1e-16 relativo, acumulado en muchas sumas).
//     Esos puntos ya no siguen C·h^p; se descartan los que están por debajo
//     de un «piso» y los que dejan de decrecer.
//   - Régimen preasintótico: con h grande el término C·h^p aún no domina.
//     Por eso se ajustan solo los últimos puntos útiles (los de h más pequeño
//     antes del piso), no todos.
// Se usa el mismo módulo para la cuadratura (Fase 1a) y para las EDO (1b).

/** Recta de mínimos cuadrados y = a + b·x. Devuelve { pendiente, ordenada, r2 }. */
export function regresionLineal(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const pendiente = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { pendiente, ordenada: my - pendiente * mx, r2 };
}

/**
 * Estima el orden a partir de pares (h, error), en cualquier orden.
 *   piso: errores por debajo se consideran redondeo (por defecto 1e-13).
 *   maxPuntos: cuántos de los h más pequeños útiles se ajustan.
 * Devuelve { pendiente, r2, usados: [{h, error}] } o null si hay < 3 puntos útiles.
 */
export function ordenObservado(puntos, { piso = 1e-13, maxPuntos = 5 } = {}) {
  const ordenados = puntos
    .filter((p) => Number.isFinite(p.h) && p.h > 0 && Number.isFinite(p.error))
    .sort((p, q) => q.h - p.h); // de h grande a h pequeño
  // Recorre hacia h pequeño mientras el error siga bajando y supere el piso.
  const utiles = [];
  for (const p of ordenados) {
    if (p.error <= piso) break;
    if (utiles.length && p.error >= utiles[utiles.length - 1].error) break;
    utiles.push(p);
  }
  const usados = utiles.slice(-maxPuntos);
  if (usados.length < 3) return null;
  const { pendiente, r2 } = regresionLineal(usados.map((p) => Math.log10(p.h)), usados.map((p) => Math.log10(p.error)));
  return { pendiente, r2, usados };
}
