// Web Worker para los cálculos numéricos largos de las EDO: el estudio de
// convergencia (cientos de integraciones) y la referencia de alta precisión.
// Así la interfaz no se congela mientras tanto.
//
// Las funciones no se pueden enviar a un Worker: llega la FUENTE generada por
// src/nucleo/expresion.js (solo números, variables, operadores y Math.*) y se
// recompila aquí con los valores actuales de los parámetros.

import { compilarFuente } from "../nucleo/expresion.js";
import { estudioEDO, referenciaNumerica } from "../nucleo/edo/estudio.js";

function compilar({ fuente, argumentos, valores }) {
  const fn = compilarFuente(fuente, argumentos);
  return (x, y) => fn(x, y, ...valores);
}

const FUNCIONES = {
  /** { expresion, x0, y0, xf, referencia|null } -> estudio completo y la referencia usada. */
  estudioEDO({ expresion, x0, y0, xf, referencia }) {
    const f = compilar(expresion);
    const ref = referencia ?? referenciaNumerica(f, x0, y0, xf);
    if (ref === null) return { referencia: null, estudio: null };
    return { referencia: ref, fuenteReferencia: referencia === null ? "numerica" : "exacta", estudio: estudioEDO(f, x0, y0, xf, ref) };
  },
};

postMessage({ tipo: "estado", estado: "listo" });

self.onmessage = ({ data: { id, funcion, args } }) => {
  try {
    if (!(funcion in FUNCIONES)) throw new Error(`función no permitida: ${funcion}`);
    postMessage({ id, ok: FUNCIONES[funcion](...args) });
  } catch (err) {
    postMessage({ id, error: { codigo: err.codigo, datos: err.datos, mensaje: String(err?.message ?? err) } });
  }
};
