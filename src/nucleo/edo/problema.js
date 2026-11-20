// Problema de valor inicial: y' = f(x, y), y(x0) = y0, integrado de x0 a xf.
//
// xf puede ser menor que x0: entonces se integra hacia atrás (paso negativo).
// «desde» es opcional (opciones avanzadas): amplía la ventana al otro lado de
// x0 para ver también la solución allí y el campo de direcciones; por defecto
// vale x0 y la ventana es exactamente el intervalo integrado.
//
// Valida los datos numéricos y que la ecuación sea de primer orden (las de
// orden 2 y las EDP se reconocen, pero se resuelven en fases posteriores).

import { leerNumero } from "../numeros.js";
import { ErrorCalculo } from "../errores.js";

/** Lanza un error claro si la ecuación no es de esta fase. */
export function exigirPrimerOrden(ec) {
  if (ec.tipo === "edp") throw new ErrorCalculo("edpFase3", {});
  if (ec.orden > 1) throw new ErrorCalculo("orden2Fase2", { orden: ec.orden });
}

const vacio = (texto) => String(texto ?? "").trim() === "";

/**
 * Textos del formulario -> números validados:
 *   { x0, y0, xf, desde, direccion (+1 | −1), ventana: [lo, hi], h, tol }
 * `nombres`: cómo se llaman los campos en la ecuación del usuario (t₀, x₀…).
 * h vacío: |xf − x0|/40. desde vacío: x0.
 */
export function leerProblema({ x0, y0, xf, desde = "", h, tol }, nombres = { x0: "x₀", y0: "y₀", xf: "x final", desde: "desde" }) {
  const datos = {
    x0: leerNumero(x0, nombres.x0),
    y0: leerNumero(y0, nombres.y0),
    xf: leerNumero(xf, nombres.xf),
  };
  if (datos.xf === datos.x0) throw new ErrorCalculo("hastaIgualX0", { x0: datos.x0 });
  datos.direccion = datos.xf > datos.x0 ? 1 : -1;
  datos.desde = vacio(desde) ? datos.x0 : leerNumero(desde, nombres.desde);
  // «desde» y «hasta» delimitan la ventana, que tiene que contener a x0: si no,
  // la solución no se podría trazar desde la condición inicial.
  const lo = Math.min(datos.desde, datos.xf);
  const hi = Math.max(datos.desde, datos.xf);
  if (datos.x0 < lo || datos.x0 > hi) {
    throw new ErrorCalculo("desdeNoContieneX0", { x0: datos.x0, desde: datos.desde, xf: datos.xf });
  }
  datos.ventana = [lo, hi];
  const longitud = Math.abs(datos.xf - datos.x0);
  datos.h = vacio(h) ? longitud / 40 : leerNumero(h, "h");
  if (!(datos.h > 0) || datos.h > longitud) throw new ErrorCalculo("pasoInvalido", {});
  datos.tol = leerNumero(tol, "tol");
  if (!(datos.tol > 0 && datos.tol < 1)) throw new ErrorCalculo("toleranciaInvalida", {});
  return datos;
}

/**
 * Compatibilidad con enlaces antiguos, que guardaban una ventana [xmin, xmax]
 * alrededor de x0 y no un x final. Se traduce así:
 *   xf    = xmax si xmax ≠ x0 (se integraba hacia la derecha); si no, xmin;
 *   desde = el otro extremo, si es distinto de x0 (antes se veían los dos lados).
 * Si el estado ya trae xf, no se toca.
 */
export function migrarEstadoAntiguo(estado) {
  if (!vacio(estado.xf) || (vacio(estado.xmin) && vacio(estado.xmax))) return estado;
  const { xmin, xmax, ...resto } = estado;
  const numero = (t) => { try { return leerNumero(t, ""); } catch { return NaN; } };
  const x0 = numero(estado.x0 ?? "0");
  const derecha = !vacio(xmax) && numero(xmax) !== x0;
  const xf = derecha ? xmax : xmin;
  const otro = derecha ? xmin : xmax;
  const desde = !vacio(otro) && numero(otro) !== x0 ? otro : "";
  return { ...resto, xf, desde };
}
