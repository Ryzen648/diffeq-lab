// Clasifica el resultado de un caso del banco frente a su referencia.
//
// Desenlaces:
//   acierto            verificado y correcto
//   erronea_verificada verificado y NO correcto       <- tiene que ser 0
//   erronea_detectada  NO correcto, pero la verificación lo marcó (fallida)
//   rechazo_honesto    no se presenta como verificado (sin forma cerrada,
//                      inconcluso…) y no muestra nada incorrecto como bueno
//   erronea_sin_marcar NO correcto, no verificado, pero tampoco marcado como fallido
//                      (p. ej. «parcial»): no es un falso «verificado», pero se vigila
//   no_comprobable     verificado, pero el banco no puede comprobar lo que se
//                      muestra (p. ej. una primitiva que no es real en ningún
//                      punto de prueba)
//
// «Lo que se muestra» es lo que llega a la página: la primitiva de SymPy
// (primitivaMathjs), su valor definido exacto o, sin él, el numérico, y el
// veredicto de divergencia.

import { estaVerificado } from "../../src/nucleo/verificacion.js";

const PUNTOS = [-2.3, -1.7, -0.6, 0.3, 0.8, 1.4, 2.2, 3.1];

const parecidos = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** ¿Difieren F1 y F2 en una constante? null si no hay al menos 3 puntos donde ambas sean reales. */
export function mismaPrimitiva(F1, F2) {
  const difs = [];
  for (const x of PUNTOS) {
    let a;
    let b;
    try { a = F1(x); b = F2(x); } catch { continue; }
    if (Number.isFinite(a) && Number.isFinite(b)) difs.push(a - b);
  }
  if (difs.length < 3) return null;
  const escala = Math.max(1, ...difs.map(Math.abs));
  return difs.every((d) => Math.abs(d - difs[0]) <= 1e-8 * escala);
}

/**
 * caso: { esperado }; mostrado: { primitiva(fn|null), primitivaTexto, valorExacto, valorNumerico,
 * diverge, sinFormaCerrada }; estado: el de la capa de verificación; Fref: fn de la primitiva de referencia.
 */
export function clasificar(caso, mostrado, estado, Fref = null) {
  const verificado = estaVerificado(estado);
  const esp = caso.esperado;
  let correcto = null; // null: no se puede decir
  switch (esp.tipo) {
    case "definida": {
      if (mostrado.diverge) correcto = false;
      else if (mostrado.valorExacto !== null) correcto = parecidos(mostrado.valorExacto, esp.valor, 1e-9);
      else if (mostrado.valorNumerico !== null) correcto = parecidos(mostrado.valorNumerico, esp.valor, 1e-6);
      break;
    }
    case "diverge":
      // Correcto solo si dice que diverge Y no muestra a la vez un valor finito.
      if (mostrado.valorExacto !== null || mostrado.valorNumerico !== null) correcto = false;
      else if (mostrado.diverge) correcto = true;
      break;
    case "indefinida":
      if (mostrado.primitiva && Fref) correcto = mismaPrimitiva(mostrado.primitiva, Fref);
      break;
    case "especial":
      if (mostrado.primitivaTexto) correcto = mostrado.primitivaTexto.includes(esp.funcion);
      break;
    case "sinFormaCerrada":
      // Si SymPy (en otra versión) encontrara una primitiva y se verificara, también vale.
      if (mostrado.sinFormaCerrada) return "rechazo_honesto";
      correcto = verificado ? null : true;
      break;
    default:
      throw new Error(`tipo de caso desconocido: ${esp.tipo}`);
  }
  if (verificado) {
    if (correcto === true) return "acierto";
    if (correcto === false) return "erronea_verificada";
    return "no_comprobable";
  }
  if (correcto === false && estado === "fallida") return "erronea_detectada";
  if (correcto === false) return "erronea_sin_marcar"; // incorrecto, no verificado, pero tampoco marcado como fallido
  return "rechazo_honesto";
}
