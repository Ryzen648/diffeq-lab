// Campo de direcciones de y' = f(x, y).
//
// En cada punto de una rejilla se dibuja un segmento corto con pendiente
// f(x, y): una solución que pase por ahí es tangente a él. Todos los segmentos
// tienen la misma longitud EN PANTALLA: si los ejes tienen escalas distintas
// (x en [0, 10], y en [0, 100]), un segmento de pendiente m en unidades de
// datos se vería deformado. Por eso la dirección (1, m) se normaliza en
// coordenadas relativas a cada eje: (1/Δx, m/Δy).

/**
 * Devuelve { xs, ys } listos para Plotly (segmentos separados por null) y
 * las pendientes, para colorear o para el texto alternativo.
 */
export function campoDirecciones(f, [xmin, xmax], [ymin, ymax], { nx = 21, ny = 15, fraccion = 0.7 } = {}) {
  const Dx = xmax - xmin;
  const Dy = ymax - ymin;
  // Medio segmento ocupa una fracción de la celda más pequeña (en unidades relativas).
  const medio = (fraccion / 2) * Math.min(1 / (nx - 1), 1 / (ny - 1));
  const xs = [];
  const ys = [];
  let validos = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = xmin + (Dx * i) / (nx - 1);
      const y = ymin + (Dy * j) / (ny - 1);
      let m;
      try { m = f(x, y); } catch { m = NaN; }
      if (!Number.isFinite(m)) continue; // fuera del dominio: sin segmento
      // Dirección en coordenadas relativas (fracción de cada eje) y normalizada.
      const u = 1 / Dx;
      const v = m / Dy;
      const norma = Math.hypot(u, v);
      const ax = ((u / norma) * medio) * Dx;
      const ay = ((v / norma) * medio) * Dy;
      xs.push(x - ax, x + ax, null);
      ys.push(y - ay, y + ay, null);
      validos++;
    }
  }
  return { xs, ys, validos };
}

/**
 * Campo vectorial (f, g) de un sistema autónomo, con flechas de la misma
 * longitud en pantalla (solo se ve la dirección; la rapidez va aparte, en
 * `rapidez`, por si se quiere colorear). Cada flecha: un tallo centrado en el
 * punto de la rejilla y dos trazos cortos de punta. Los puntos donde el campo
 * es nulo (equilibrios) o no finito se omiten.
 * Devuelve { xs, ys, rapidez, validos } listos para Plotly (separados por null).
 */
export function campoVectorial(F, [xmin, xmax], [ymin, ymax], { nx = 21, ny = 17, fraccion = 0.75, punta = 0.3 } = {}) {
  const Dx = xmax - xmin;
  const Dy = ymax - ymin;
  const medio = (fraccion / 2) * Math.min(1 / (nx - 1), 1 / (ny - 1));
  const xs = [];
  const ys = [];
  const rapidez = [];
  let validos = 0;
  // Con ángulo de ±25° respecto al tallo, hacia atrás.
  const [c, s] = [Math.cos((155 * Math.PI) / 180), Math.sin((155 * Math.PI) / 180)];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = xmin + (Dx * i) / (nx - 1);
      const y = ymin + (Dy * j) / (ny - 1);
      let f;
      let g;
      try { [f, g] = F(x, y); } catch { continue; }
      if (!Number.isFinite(f) || !Number.isFinite(g)) continue;
      // Dirección en fracciones de cada eje, normalizada.
      const u = f / Dx;
      const v = g / Dy;
      const norma = Math.hypot(u, v);
      if (!(norma > 0)) continue;
      const [du, dv] = [(u / norma) * medio, (v / norma) * medio];
      const aDatos = (a, b) => [a * Dx, b * Dy];
      const [ax, ay] = aDatos(du, dv);
      const [px, py] = [x + ax, y + ay];
      const largo = punta * 2 * medio;
      const ala = (signo) => aDatos(((du * c - dv * s * signo) / medio) * largo, ((du * s * signo + dv * c) / medio) * largo);
      const [i1x, i1y] = ala(1);
      const [i2x, i2y] = ala(-1);
      xs.push(x - ax, px, null, px + i1x, px, px + i2x, null);
      ys.push(y - ay, py, null, py + i1y, py, py + i2y, null);
      rapidez.push(Math.hypot(f, g));
      validos++;
    }
  }
  return { xs, ys, rapidez, validos };
}

/** Valores de h(x, y) en una rejilla, para curvas de nivel (nulclinas): { x, y, z } con z[j][i] (null si no es finito). */
export function rejilla(h, [xmin, xmax], [ymin, ymax], { nx = 120, ny = 100 } = {}) {
  const x = Array.from({ length: nx }, (_, i) => xmin + ((xmax - xmin) * i) / (nx - 1));
  const y = Array.from({ length: ny }, (_, j) => ymin + ((ymax - ymin) * j) / (ny - 1));
  const z = y.map((yj) => x.map((xi) => {
    let v;
    try { v = h(xi, yj); } catch { v = NaN; }
    return Number.isFinite(v) ? v : null;
  }));
  return { x, y, z };
}
