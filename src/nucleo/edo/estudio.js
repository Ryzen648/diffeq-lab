// Estudio de convergencia de los métodos para EDO.
//
// Paso fijo: se resuelve con N = 4, 8, 16… pasos y se mide el error en el
// punto final contra la solución exacta (o una referencia muy precisa). La
// pendiente log-log del error frente a h estima el orden (convergencia.js).
//
// Dormand–Prince no tiene un h fijo: se varía la tolerancia y se mide el
// error frente al número de evaluaciones de f. Ese mismo eje (evaluaciones)
// sirve para comparar los cuatro métodos con justicia: ¿cuánta precisión
// compra cada evaluación de f?

import { integrarPasoFijo, METODOS_PASO_FIJO } from "./paso-fijo.js";
import { dormandPrince } from "./dormand-prince.js";
import { ordenObservado } from "../convergencia.js";

export const NS_EDO = Object.freeze([4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]);
export const TOLERANCIAS = Object.freeze([1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11]);

const errorRelativo = (v, ref) => Math.abs(v - ref) / Math.max(1, Math.abs(ref));

/** Referencia numérica muy precisa (cuando no hay solución exacta). */
export function referenciaNumerica(f, x0, y0, xf) {
  const r = dormandPrince(f, x0, y0, xf, { rtol: 1e-13, atol: 1e-15 });
  return r.detenido ? null : r.ys.at(-1);
}

/**
 * `referencia`: valor de y(xf) (exacto o numérico). Devuelve, por método,
 * { ordenTeorico, puntos: [{ n, h, error, evaluaciones }], observado }.
 * Los puntos donde el método explota o se sale del dominio se omiten.
 */
export function estudioEDO(f, x0, y0, xf, referencia, { ns = NS_EDO, tolerancias = TOLERANCIAS } = {}) {
  const resultado = {};
  for (const [id, metodo] of Object.entries(METODOS_PASO_FIJO)) {
    const puntos = [];
    for (const n of ns) {
      const r = integrarPasoFijo(metodo, f, x0, y0, xf, n);
      if (r.detenido) continue;
      puntos.push({ n, h: Math.abs(xf - x0) / n, error: errorRelativo(r.ys.at(-1), referencia), evaluaciones: r.evaluaciones });
    }
    resultado[id] = { ordenTeorico: metodo.orden, puntos, observado: ordenObservado(puntos) };
  }
  const puntosDP = [];
  for (const tol of tolerancias) {
    const r = dormandPrince(f, x0, y0, xf, { rtol: tol, atol: tol * 1e-3 });
    if (r.detenido) continue;
    puntosDP.push({ tol, error: errorRelativo(r.ys.at(-1), referencia), evaluaciones: r.evaluaciones, pasos: r.pasos.length });
  }
  resultado.dopri = { ordenTeorico: 5, puntos: puntosDP, observado: null };
  return resultado;
}
