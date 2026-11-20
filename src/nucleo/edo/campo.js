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
