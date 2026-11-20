// Problema de valor inicial completo: y' = f(x, y), y(x0) = y0, en [xmin, xmax].
// Valida los datos numéricos y que la ecuación sea de primer orden (las de
// orden 2 y las EDP se reconocen, pero se resuelven en fases posteriores).

import { leerNumero } from "../numeros.js";
import { ErrorCalculo } from "../errores.js";

/** Lanza un error claro si la ecuación no es de esta fase. */
export function exigirPrimerOrden(ec) {
  if (ec.tipo === "edp") throw new ErrorCalculo("edpFase3", {});
  if (ec.orden > 1) throw new ErrorCalculo("orden2Fase2", { orden: ec.orden });
}

/**
 * Textos del formulario -> números validados.
 * `nombres`: cómo se llaman x0 e y0 en la ecuación del usuario (t₀, x₀…).
 * h vacío: (xmax − xmin)/40.
 */
export function leerProblema({ x0, y0, xmin, xmax, h, tol }, nombres = { x0: "x₀", y0: "y₀", xmin: "x mín", xmax: "x máx" }) {
  const datos = {
    x0: leerNumero(x0, nombres.x0),
    y0: leerNumero(y0, nombres.y0),
    xmin: leerNumero(xmin, nombres.xmin),
    xmax: leerNumero(xmax, nombres.xmax),
  };
  if (!(datos.xmax > datos.xmin)) throw new ErrorCalculo("rangoInvalido", {});
  if (datos.x0 < datos.xmin || datos.x0 > datos.xmax) {
    throw new ErrorCalculo("condicionFueraDeRango", { x0: datos.x0, xmin: datos.xmin, xmax: datos.xmax });
  }
  datos.h = String(h ?? "").trim() === "" ? (datos.xmax - datos.xmin) / 40 : leerNumero(h, "h");
  if (!(datos.h > 0)) throw new ErrorCalculo("pasoInvalido", {});
  if (datos.h > datos.xmax - datos.xmin) throw new ErrorCalculo("pasoInvalido", {});
  datos.tol = leerNumero(tol, "tol");
  if (!(datos.tol > 0 && datos.tol < 1)) throw new ErrorCalculo("toleranciaInvalida", {});
  return datos;
}
