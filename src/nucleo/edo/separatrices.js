// Separatrices de una silla: sus variedades estable e inestable.
//
// En una silla, el jacobiano tiene un autovalor negativo (λ_s) y uno positivo
// (λ_u), con autovectores v_s y v_u. Por el teorema de la variedad estable,
// cerca de la silla hay exactamente dos curvas que llegan a ella (tangentes a
// v_s) y dos que salen (tangentes a v_u). Separan el plano en regiones de
// comportamiento distinto: en el péndulo, las oscilaciones de las vueltas
// completas.
//
// Se trazan así: se empieza en E ± ε·v (muy cerca de la silla, sobre el
// autovector) y se integra hacia adelante para la inestable (sale sola) y
// hacia atrás para la estable (hacia atrás, la estable es la que se aleja).
// Con ε pequeño, el error de partir de la recta tangente en vez de la curva es
// O(ε²), y la integración lo amplifica poco porque es justo la dirección en
// la que la trayectoria se aleja.
//
// Se integra a tramos y se para cuando la curva sale de la ventana (con
// margen), se acerca a otro equilibrio (rapidez casi nula) o explota.

import { dormandPrinceSistema, interpolarHermiteSistema } from "./sistemas.js";

const TRAMOS = 24;

/**
 * F(x, y) -> [f, g] (autónomo). silla: { x, y, lambdas, vectores } de
 * clasificarEquilibrio. ventana: { x: [lo, hi], y: [lo, hi] }.
 * Devuelve { estables: [rama, rama], inestables: [rama, rama] } con cada
 * rama = { xs, ys } (desde la silla hacia fuera), o null si no es una silla.
 */
export function separatrices(F, silla, ventana, { epsilon = 1e-6, margen = 0.25 } = {}) {
  if (!silla.vectores || !(silla.lambdas[0].re > 0 && silla.lambdas[1].re < 0)) return null;
  const [lu, ls] = silla.lambdas.map((l) => l.re);
  const [vu, vs] = silla.vectores;
  const ancho = ventana.x[1] - ventana.x[0];
  const alto = ventana.y[1] - ventana.y[0];
  const dentro = (x, y) => x >= ventana.x[0] - margen * ancho && x <= ventana.x[1] + margen * ancho
    && y >= ventana.y[0] - margen * alto && y <= ventana.y[1] + margen * alto;
  // ε en las unidades de la ventana: el autovector está normalizado en las de los datos.
  const escala = Math.hypot(ancho, alto);
  const G = (_t, [x, y]) => F(x, y);

  function rama(v, signo, sentido, lambda) {
    const xs = [silla.x];
    const ys = [silla.y];
    let Y = [silla.x + signo * epsilon * escala * v[0], silla.y + signo * epsilon * escala * v[1]];
    // Tramos de tiempo del orden de 1/|λ|: lo que tarda en alejarse un factor e.
    const tramo = sentido * Math.min(5 / Math.abs(lambda), 1e3);
    for (let k = 0; k < TRAMOS; k++) {
      const sol = dormandPrinceSistema(G, 0, Y, tramo, { rtol: 1e-9, atol: 1e-12 * escala, maxPasos: 5000 });
      const denso = interpolarHermiteSistema(sol, 4);
      for (const [x, y] of denso.Ys) {
        if (!dentro(x, y)) return { xs, ys };
        xs.push(x);
        ys.push(y);
      }
      if (sol.detenido) break;
      Y = sol.Ys.at(-1);
      const [f, g] = F(...Y);
      if (Math.hypot(f, g) < 1e-9 * escala * Math.abs(lambda)) break; // llegó a otro equilibrio
    }
    return { xs, ys };
  }

  return {
    inestables: [rama(vu, 1, 1, lu), rama(vu, -1, 1, lu)],
    estables: [rama(vs, 1, -1, ls), rama(vs, -1, -1, ls)],
  };
}
