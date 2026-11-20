// Capa de verificación compartida por las tres secciones (integrales, EDO, EDP).
//
// Cada página reúne una lista de COMPROBACIONES sobre lo que muestra y esta
// capa decide un único ESTADO global. La etiqueta de confianza de la página
// se deriva solo de ese estado: así es imposible rotular como verificado un
// resultado cuya comprobación falló o no se hizo.
//
// Una comprobación:
//   { componente, metodo, resultado, clave, datos, errorAbs?, errorRel?, requerida? }
//   componente  qué se comprueba: "primitiva", "valorDefinido", "ecuacion",
//               "condicionInicial", "solucionNumerica", "convergencia"…
//   metodo      "simbolica" (SymPy simplifica a 0 exactamente) o "numerica"
//               (en puntos o contra una referencia de alta precisión)
//   resultado   "ok" | "falla" | "inconclusa" | "pendiente" | "informativa"
//               ("informativa": un aviso que no decide nada, p. ej. Barrow)
//   requerida   si es false, no cuenta para el estado (por defecto, true)
//
// Estados globales, del mejor al peor:
//   "simbolica"  todas las requeridas pasan y al menos una es simbólica
//   "numerica"   todas las requeridas pasan, solo numéricamente
//   "parcial"    alguna pasa y otra quedó inconclusa
//   "pendiente"  aún falta alguna por calcular y ninguna ha fallado
//   "inconclusa" ninguna pasa (no se pudo comprobar nada)
//   "fallida"    alguna requerida falla: el resultado NO se da por bueno

export const ESTADOS = Object.freeze(["simbolica", "numerica", "parcial", "pendiente", "inconclusa", "fallida"]);
export const RESULTADOS = Object.freeze(["ok", "falla", "inconclusa", "pendiente", "informativa"]);

/** Crea una comprobación validando sus campos (un error de programación salta en las pruebas). */
export function comprobacion({ componente, metodo = "numerica", resultado, clave, datos = {}, errorAbs = null, errorRel = null, requerida = true }) {
  if (!RESULTADOS.includes(resultado)) throw new Error(`resultado no válido: ${resultado}`);
  if (!["simbolica", "numerica"].includes(metodo)) throw new Error(`método no válido: ${metodo}`);
  if (!componente || !clave) throw new Error("falta el componente o la clave");
  return Object.freeze({ componente, metodo, resultado, clave, datos, errorAbs, errorRel, requerida: requerida && resultado !== "informativa" });
}

/** Estado global de una lista de comprobaciones. */
export function estadoGlobal(lista) {
  const req = lista.filter((c) => c.requerida);
  if (req.some((c) => c.resultado === "falla")) return "fallida";
  const ok = req.filter((c) => c.resultado === "ok");
  if (req.some((c) => c.resultado === "pendiente")) return "pendiente";
  if (!ok.length) return "inconclusa";
  if (req.some((c) => c.resultado === "inconclusa")) return "parcial";
  return ok.some((c) => c.metodo === "simbolica") ? "simbolica" : "numerica";
}

/** Componentes que fallan (para decir QUÉ falla, no solo que algo falla). */
export function componentesFallidos(lista) {
  return [...new Set(lista.filter((c) => c.requerida && c.resultado === "falla").map((c) => c.componente))];
}

/** ¿Se puede presentar el resultado como verificado? Solo con estado simbólico o numérico. */
export const estaVerificado = (estado) => estado === "simbolica" || estado === "numerica";

/**
 * Error absoluto y relativo de un valor frente a una referencia (escala
 * max(1, |ref|) para que valores cercanos a 0 no den errores relativos enormes).
 */
export function errores(valor, referencia) {
  const abs = Math.abs(valor - referencia);
  return { errorAbs: abs, errorRel: abs / Math.max(1, Math.abs(referencia)) };
}
