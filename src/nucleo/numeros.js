// Lectura de valores numéricos escritos por el usuario: límites, condiciones
// iniciales, rangos. Admiten expresiones (pi/2, sqrt(2), e^-1) y, donde tiene
// sentido, infinito: inf, ∞, oo (como en SymPy), Infinity, con signo.

import { math } from "../../comun/js/mathjs.js";
import { normalizar } from "../../comun/js/entrada/analizar.js";
import { ErrorCalculo } from "./errores.js";

const INFINITO = /^([+-]?)\s*(inf|infinity|infinito|oo|∞)$/i;

/**
 * Texto -> número. `campo` es el nombre que verá el usuario en el mensaje.
 * Con `admiteInfinito`, «inf» y «-∞» dan ±Infinity; si no, son un error.
 */
export function leerNumero(texto, campo, { admiteInfinito = false } = {}) {
  const limpio = String(texto ?? "").trim();
  const infinito = INFINITO.exec(limpio);
  if (infinito) {
    if (!admiteInfinito) throw new ErrorCalculo("limiteInfinitoNoAdmitido", { campo });
    return infinito[1] === "-" ? -Infinity : Infinity;
  }
  let valor;
  try {
    valor = limpio === "" ? NaN : math.evaluate(normalizar(limpio));
  } catch {
    valor = NaN;
  }
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new ErrorCalculo("numeroInvalido", { campo, texto: limpio });
  return valor;
}

/** Límites de integración. Si b < a se devuelven tal cual: la integral cambia de signo. */
export function leerLimites(textoA, textoB) {
  const a = leerNumero(textoA, "a", { admiteInfinito: true });
  const b = leerNumero(textoB, "b", { admiteInfinito: true });
  if (a === b) throw new ErrorCalculo("limitesIguales", {});
  return { a, b };
}
