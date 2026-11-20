// Contraste independiente de la referencia numérica de una EDO: RK4 de paso
// fijo frente a Dormand–Prince con tolerancia fina.
//
// Dos métodos distintos que coinciden dan confianza; pero que NO coincidan
// solo prueba algo si el que contrasta es fiable. En un problema rígido o con
// saltos rápidos (Van der Pol con μ grande), RK4 con unos miles de pasos puede
// no haber convergido: la diferencia es error de RK4, no de la referencia.
// Por eso RK4 se ejecuta con N y 2N pasos:
//   |RK4(2N) − RK4(N)| ≈ 15·error(RK4(2N))  (orden 4: el error baja 16 veces)
// y el veredicto es:
//   "ok"         RK4(2N) y la referencia coinciden (relativo < tol)
//   "inconclusa" RK4 no convergió (su error estimado no es pequeño frente a la
//                diferencia) o no llegó al final: no sirve para juzgar
//   "falla"      RK4 convergió y aun así no coincide: algo va mal de verdad

import { integrarSistemaPasoFijo } from "./sistemas.js";

const normaMax = (v) => Math.max(...v.map(Math.abs));

/**
 * F(t, Y) -> Y'. ref: Y(tf) de la referencia. Devuelve
 * { resultado, errorAbs, errorRel, errorRK4 } (errores relativos a max(1, |ref|)).
 */
export function contrasteRK4(F, t0, Y0, tf, ref, { n = 4000, tol = 1e-6 } = {}) {
  const grueso = integrarSistemaPasoFijo("rk4", F, t0, Y0, tf, n);
  const fino = integrarSistemaPasoFijo("rk4", F, t0, Y0, tf, 2 * n);
  if (grueso.detenido || fino.detenido || !ref.every(Number.isFinite)) {
    return { resultado: "inconclusa", errorAbs: null, errorRel: null, errorRK4: null };
  }
  const escala = Math.max(1, normaMax(ref));
  const Yf = fino.Ys.at(-1);
  const errorAbs = normaMax(Yf.map((y, k) => y - ref[k]));
  const errorRel = errorAbs / escala;
  const errorRK4 = normaMax(Yf.map((y, k) => y - grueso.Ys.at(-1)[k])) / 15 / escala;
  let resultado;
  if (errorRel < tol) resultado = "ok";
  else if (errorRK4 > errorRel / 10) resultado = "inconclusa"; // RK4 aún lejos de converger
  else resultado = "falla";
  return { resultado, errorAbs, errorRel, errorRK4 };
}
