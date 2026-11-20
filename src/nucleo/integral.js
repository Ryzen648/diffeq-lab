// Núcleo de una integral de una variable, sin DOM: el valor numérico y las
// comprobaciones de lo que se muestra. Lo usan la página (src/ui/paginas/
// integrales.js) y el banco de pruebas (scripts/banco.mjs), así que el banco
// mide exactamente el estado que vería el usuario.

import { simpsonAdaptativo } from "./cuadratura/adaptativa.js";
import { analizarImpropia } from "./cuadratura/impropias.js";
import { prepararExpresion } from "./expresion.js";
import { aPython } from "./python.js";
import { analizarFuncion } from "../../comun/js/entrada/analizar.js";
import { comprobacion, errores } from "./verificacion.js";

const PUNTOS_VERIFICACION = Object.freeze([-2.3, -0.7, 0.35, 0.9, 1.6, 2.7, 4.1]);
const cientifica = (v) => (v === 0 ? "0" : v.toExponential(2));

/** Texto de un límite para SymPy: "oo", "-oo" o la expresión en Python. */
export function limiteSympy(texto, valor) {
  if (valor === Infinity) return "oo";
  if (valor === -Infinity) return "-oo";
  return aPython(analizarFuncion(texto));
}

/**
 * Valor numérico de ∫_a^b f, el mismo que muestra la página:
 * impropia -> doble exponencial (con su análisis de convergencia);
 * propia   -> Simpson adaptativo con tolerancia 10⁻¹³.
 * Devuelve { impropia (análisis o null), valorNumerico, metodoNumerico, errorEstimado, adaptativa }.
 */
export function valorNumericoIntegral(f, a, b) {
  const analisis = analizarImpropia(f, a, b);
  if (analisis.impropia) {
    return {
      impropia: analisis, adaptativa: null, metodoNumerico: "dobleExponencial",
      valorNumerico: analisis.numerico?.valor ?? null, errorEstimado: analisis.numerico?.errorEstimado ?? null,
    };
  }
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const adaptativa = simpsonAdaptativo(f, lo, hi, { tol: 1e-13 });
  return {
    impropia: null, adaptativa, metodoNumerico: "simpsonAdaptativo",
    valorNumerico: (a < b ? 1 : -1) * adaptativa.valor, errorEstimado: adaptativa.errorEstimado,
  };
}

/**
 * Comprobación independiente de SymPy: deriva numéricamente (diferencia
 * centrada) la primitiva evaluada en JS y la compara con f. Devuelve el mayor
 * error relativo, o null si no hay puntos válidos.
 */
export function derivadaNumericaFrenteAf(F, f) {
  let peor = null;
  for (const x of PUNTOS_VERIFICACION) {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    const d = (F(x + h) - F(x - h)) / (2 * h);
    const y = f(x);
    if (!Number.isFinite(d) || !Number.isFinite(y)) continue;
    const e = Math.abs(d - y) / Math.max(1, Math.abs(y));
    peor = Math.max(peor ?? 0, e);
  }
  return peor;
}

/** ¿El valor exacto de SymPy y el numérico de JavaScript no coinciden? */
export function discrepanciaIntegral({ definida, simbolico, valorNumerico }) {
  const exacto = simbolico?.definida?.numero;
  if (!definida || exacto === null || exacto === undefined || valorNumerico === null || valorNumerico === undefined) return false;
  return Math.abs(Number(exacto) - valorNumerico) > 1e-7 * Math.max(1, Math.abs(valorNumerico));
}

/**
 * Comprobaciones de lo que se muestra.
 * e: { simbolico, f, definida, valorNumerico, errorEstimado, metodoNumerico, impropia, pendiente, errorSimbolico }
 * formato: { nombreMetodo(id) -> texto, mensaje(error) -> texto } (la página traduce; el banco no lo necesita).
 */
export function comprobacionesIntegral(e, { nombreMetodo = (id) => id, mensaje = (err) => String(err?.message ?? err) } = {}) {
  const lista = [];
  const s = e.simbolico;
  const hayNumero = e.valorNumerico !== null && e.valorNumerico !== undefined;
  const metodoNum = hayNumero ? nombreMetodo(e.metodoNumerico) : "";
  if (e.pendiente) lista.push(comprobacion({ componente: "primitiva", metodo: "simbolica", resultado: "pendiente", clave: "verif.pendiente" }));
  // 1. Primitiva: SymPy (F' − f = 0 sobre el MISMO integrando: lo garantiza consistencia.js) …
  if (s?.verificacion) {
    const v = s.verificacion;
    if (v.simbolica) lista.push(comprobacion({ componente: "primitiva", metodo: "simbolica", resultado: "ok", clave: "verif.residuoCero" }));
    else if (v.numerica) lista.push(comprobacion({ componente: "primitiva", resultado: "ok", clave: "verif.residuoNumerico", datos: { residuo: v.residuo } }));
    else lista.push(comprobacion({ componente: "primitiva", metodo: "simbolica", resultado: "falla", clave: "verif.residuoFalla", datos: { residuo: v.residuo } }));
  }
  // … y en JavaScript, sin SymPy, derivando numéricamente la primitiva que se muestra.
  if (s?.primitivaMathjs) {
    let fn = null;
    try { fn = prepararExpresion(s.primitivaMathjs, ["x"], { parametrosPermitidos: false }).fn; } catch { /* funciones especiales */ }
    const peor = fn ? derivadaNumericaFrenteAf(fn, e.f) : null;
    if (!fn) lista.push(comprobacion({ componente: "primitiva", resultado: "inconclusa", clave: "verif.jsNoEvaluable", requerida: false }));
    else if (peor === null) lista.push(comprobacion({ componente: "primitiva", resultado: "inconclusa", clave: "verif.jsSinPuntos", requerida: false }));
    else {
      lista.push(comprobacion({ componente: "primitiva", resultado: peor < 1e-6 ? "ok" : "falla", clave: peor < 1e-6 ? "verif.jsDerivada" : "verif.jsDerivadaFalla",
        datos: { error: cientifica(peor) }, errorRel: peor }));
    }
  } else if (s?.primitiva) {
    lista.push(comprobacion({ componente: "primitiva", resultado: "inconclusa", clave: "verif.jsNoEvaluable", requerida: false }));
  }
  if (e.definida) {
    // 2. Valor definido: el exacto de SymPy frente al numérico de JavaScript (dos caminos distintos).
    const exacto = s?.definida?.numero;
    if (exacto !== null && exacto !== undefined && hayNumero) {
      const err = errores(e.valorNumerico, Number(exacto));
      const falla = discrepanciaIntegral(e);
      lista.push(comprobacion({ componente: "valorDefinido", resultado: falla ? "falla" : "ok", clave: falla ? "verif.definidaFalla" : "verif.definida",
        datos: { metodo: metodoNum, diferencia: cientifica(err.errorAbs) }, ...err }));
    } else if (hayNumero) {
      // Solo numérico: vale como verificación numérica si su error estimado es pequeño.
      const relativo = (e.errorEstimado ?? Infinity) / Math.max(1, Math.abs(e.valorNumerico));
      lista.push(comprobacion({ componente: "valorDefinido", resultado: relativo < 1e-6 ? "ok" : "inconclusa", clave: "verif.soloNumerica",
        datos: { metodo: metodoNum, error: cientifica(e.errorEstimado ?? 0) }, errorAbs: e.errorEstimado ?? null }));
    }
    if (s?.definida?.barrow?.coincide === false) lista.push(comprobacion({ componente: "barrow", resultado: "informativa", clave: "verif.barrow" }));
    // 3. Convergencia de las impropias: el límite de SymPy frente al criterio numérico.
    if (e.impropia && s?.definida?.encontrada) {
      const sympyDiverge = Boolean(s.definida.diverge);
      const numDiverge = e.impropia.veredicto === "diverge";
      if (e.impropia.veredicto === "dudoso") {
        lista.push(comprobacion({ componente: "convergencia", resultado: "informativa", clave: "verif.impropiaDudosa" }));
      } else {
        lista.push(comprobacion({ componente: "convergencia", metodo: "simbolica", resultado: sympyDiverge === numDiverge ? "ok" : "falla",
          clave: sympyDiverge === numDiverge ? "verif.impropiaCoincide" : "verif.impropiaDiscrepa" }));
      }
    }
  }
  if (e.errorSimbolico) lista.push(comprobacion({ componente: "primitiva", resultado: "informativa", clave: "verif.sinSimbolico", datos: { detalle: mensaje(e.errorSimbolico) } }));
  return lista;
}
