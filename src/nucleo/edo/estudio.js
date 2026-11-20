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

// Sistemas: el error es el de la componente que más se equivoca, relativo al
// tamaño de la solución (norma del máximo). Con una sola componente es
// exactamente |y − y_ref| / max(1, |y_ref|), el error de la Fase 1b.

import { METODOS_SISTEMA, integrarSistemaPasoFijo, dormandPrinceSistema } from "./sistemas.js";
import { comoSistema } from "./paso-fijo.js";
import { ordenObservado } from "../convergencia.js";

export const NS_EDO = Object.freeze([4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]);
export const TOLERANCIAS = Object.freeze([1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11]);

/** max|Y − ref| / max(1, max|ref|). */
export function errorRelativoSistema(Y, ref) {
  let num = 0;
  let escala = 1;
  for (let i = 0; i < ref.length; i++) {
    num = Math.max(num, Math.abs(Y[i] - ref[i]));
    escala = Math.max(escala, Math.abs(ref[i]));
  }
  return num / escala;
}

/** Referencia numérica muy precisa de Y(xf) (cuando no hay solución exacta), o null. */
export function referenciaSistema(F, x0, Y0, xf) {
  const r = dormandPrinceSistema(F, x0, Y0, xf, { rtol: 1e-13, atol: 1e-15 });
  return r.detenido ? null : r.Ys.at(-1);
}

/**
 * `referencia`: Y(xf) (exacto o numérico). Devuelve, por método,
 * { ordenTeorico, puntos: [{ n, h, error, evaluaciones }], observado }.
 * Los puntos donde el método explota o se sale del dominio se omiten.
 */
export function estudioSistema(F, x0, Y0, xf, referencia, { ns = NS_EDO, tolerancias = TOLERANCIAS } = {}) {
  const resultado = {};
  for (const [id, metodo] of Object.entries(METODOS_SISTEMA)) {
    const puntos = [];
    for (const n of ns) {
      const r = integrarSistemaPasoFijo(id, F, x0, Y0, xf, n);
      if (r.detenido) continue;
      puntos.push({ n, h: Math.abs(xf - x0) / n, error: errorRelativoSistema(r.Ys.at(-1), referencia), evaluaciones: r.evaluaciones });
    }
    resultado[id] = { ordenTeorico: metodo.orden, puntos, observado: ordenObservado(puntos) };
  }
  const puntosDP = [];
  for (const tol of tolerancias) {
    const r = dormandPrinceSistema(F, x0, Y0, xf, { rtol: tol, atol: tol * 1e-3 });
    if (r.detenido) continue;
    puntosDP.push({ tol, error: errorRelativoSistema(r.Ys.at(-1), referencia), evaluaciones: r.evaluaciones, pasos: r.pasos.length });
  }
  resultado.dopri = { ordenTeorico: 5, puntos: puntosDP, observado: null };
  return resultado;
}

// --- Fase 1b (escalar): envoltorios -------------------------------------------------

export function referenciaNumerica(f, x0, y0, xf) {
  const r = referenciaSistema(comoSistema(f), x0, [y0], xf);
  return r === null ? null : r[0];
}

export function estudioEDO(f, x0, y0, xf, referencia, opciones = {}) {
  return estudioSistema(comoSistema(f), x0, [y0], xf, [referencia], opciones);
}
