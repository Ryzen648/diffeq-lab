// Integrales impropias: detectar por qué lo son y decidir si convergen.
//
// Decidir la convergencia en general es imposible (no hay algoritmo que lo
// haga para toda f). Aquí se combinan evidencias y se dice cuál es cuál:
//
// 1. Criterio de comparación con p-integrales. Cerca del problema f se
//    parece a una potencia:
//      en ∞:            |f(x)| ≈ C / x^p      converge si p > 1
//      en un punto c:   |f(x)| ≈ C / |x−c|^q  converge si q < 1
//    El exponente se estima con la pendiente de log|f| frente a log x (o
//    log|x − c|) en varias escalas. Si p ≈ 1 (o q ≈ 1) el criterio no
//    decide: hace falta más finura (p. ej. 1/(x·ln²x) converge y 1/x no).
//    Si f cambia de signo una y otra vez (sin x / x), comparar |f| solo
//    sirve para afirmar convergencia absoluta; si p ≤ 1 queda en duda.
// 2. Cuadratura doble exponencial: si sus niveles se estabilizan, da el
//    valor; si no, es un indicio (no una prueba) de divergencia.
// 3. La sucesión de integrales truncadas I(R) = ∫ₐᴿ f (o ∫_{a+ε}^b f), que
//    la interfaz dibuja: si se estabiliza, converge; si crece sin parar, no.
//
// La interfaz pone además el resultado de SymPy, cuando lo hay, y señala en
// la etiqueta de confianza qué evidencia decidió.

import { dobleExponencial } from "./doble-exponencial.js";
import { regresionLineal } from "../convergencia.js";

const MARGEN_CRITERIO = 0.03; // |p − 1| menor que esto: el criterio de comparación no decide

const finito = (y) => Number.isFinite(y);

function pendienteLogLog(xs, ys) {
  const pares = xs.map((x, i) => [x, Math.abs(ys[i])]).filter(([x, y]) => x > 0 && y > 0 && finito(y));
  if (pares.length < 3) return null;
  return regresionLineal(pares.map(([x]) => Math.log10(x)), pares.map(([, y]) => Math.log10(y))).pendiente;
}

/** ¿Cambia f de signo muchas veces en [x0, x1]? (oscilación) */
function oscila(f, x0, x1, muestras = 400) {
  let cambios = 0;
  let signoPrevio = 0;
  for (let i = 0; i <= muestras; i++) {
    const y = f(x0 + ((x1 - x0) * i) / muestras);
    const s = Math.sign(y);
    if (s !== 0 && signoPrevio !== 0 && s !== signoPrevio) cambios++;
    if (s !== 0) signoPrevio = s;
  }
  return cambios >= 4;
}

function veredicto(exponente, umbral, convergeSi) {
  if (exponente === null) return "dudoso";
  if (Math.abs(exponente - umbral) < MARGEN_CRITERIO) return "dudoso";
  const converge = convergeSi === "mayor" ? exponente > umbral : exponente < umbral;
  return converge ? "converge" : "diverge";
}

/** Comparación en ±∞: estima p con |f(x)| ≈ C/x^p para x = 10², …, 10⁶ (escalado con |a|). */
export function comparacionInfinito(f, extremo, signo) {
  const escala = Math.max(1, Math.abs(extremo));
  const xs = [2, 3, 4, 5, 6].map((k) => escala * 10 ** k);
  const ys = xs.map((x) => f(signo * x));
  const pendiente = pendienteLogLog(xs, ys);
  let p = pendiente === null ? null : -pendiente;
  // e^{−x²} vale exactamente 0 en coma flotante a partir de x ≈ 27: decae más
  // rápido que cualquier potencia, así que se toma p = ∞ (converge).
  if (p === null && ys.at(-1) === 0 && ys.every((y) => finito(y))) p = Infinity;
  const conOscilacion = oscila((x) => f(signo * x), escala * 1e2, escala * 1e3);
  let resultado = veredicto(p, 1, "mayor");
  if (conOscilacion && resultado === "diverge") resultado = "dudoso"; // podría converger condicionalmente
  return { tipo: "infinito", lado: signo > 0 ? "b" : "a", exponente: p, oscila: conOscilacion, criterio: resultado };
}

/** Comparación junto a un punto c, acercándose por `direccion` (+1 por la derecha, −1 por la izquierda). */
export function comparacionPunto(f, c, direccion, longitud) {
  const deltas = [3, 4, 5, 6, 7, 8].map((k) => longitud * 10 ** -k);
  const ys = deltas.map((d) => f(c + direccion * d));
  const pendiente = pendienteLogLog(deltas, ys);
  const q = pendiente === null ? null : -pendiente;
  return { exponente: q, criterio: veredicto(q, 1, "menor") };
}

/** ¿Hay una singularidad en el extremo c? (|f| crece al acercarse o f no es finita allí) */
function singularEnExtremo(f, c, direccion, longitud, escalaTipica) {
  if (!finito(f(c))) return true;
  const cerca = Math.abs(f(c + direccion * longitud * 1e-8));
  const { exponente } = comparacionPunto(f, c, direccion, longitud);
  return !finito(cerca) || (exponente !== null && exponente > 0.1 && cerca > 1e3 * Math.max(1, escalaTipica));
}

function mediana(valores) {
  const v = valores.filter(finito).map(Math.abs).sort((p, q) => p - q);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

/** Localiza una singularidad interior cerca de la muestra i y la confirma por el crecimiento de |f|. */
function localizarInterior(f, xs, i, longitud, escalaTipica) {
  let izq = xs[Math.max(0, i - 1)];
  let der = xs[Math.min(xs.length - 1, i + 1)];
  let c;
  const fi = f(xs[i]);
  if (!finito(fi)) {
    c = xs[i];
  } else if (Math.sign(f(izq)) !== Math.sign(f(der))) {
    // Polo impar (1/x): f cambia de signo; bisección sobre el signo.
    for (let k = 0; k < 80; k++) {
      const m = (izq + der) / 2;
      if (Math.sign(f(m)) === Math.sign(f(izq))) izq = m; else der = m;
    }
    c = (izq + der) / 2;
  } else {
    // Polo par (1/x²): sección áurea maximizando |f|.
    const r = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 80; k++) {
      const m1 = der - r * (der - izq);
      const m2 = izq + r * (der - izq);
      if (Math.abs(f(m1)) > Math.abs(f(m2))) der = m2; else izq = m1;
    }
    c = (izq + der) / 2;
  }
  const porIzq = comparacionPunto(f, c, -1, longitud);
  const porDer = comparacionPunto(f, c, 1, longitud);
  const crece = [porIzq, porDer].some((l) => l.exponente !== null && l.exponente > 0.1);
  const grande = [c - longitud * 1e-8, c + longitud * 1e-8].some((x) => !finito(f(x)) || Math.abs(f(x)) > 1e3 * Math.max(1, escalaTipica));
  return crece && grande ? { c, porIzq, porDer } : null;
}

/**
 * Analiza ∫ₐᵇ f. Devuelve:
 *   impropia: boolean
 *   causas: [{ tipo: "infinito" | "extremo" | "interior", lado?, x?, exponente, criterio, oscila? }]
 *   tramos: subintervalos sin singularidades interiores
 *   numerico: { valor, convergio, errorEstimado } (null si algún criterio dice «diverge»)
 *   veredicto: "converge" | "diverge" | "dudoso"
 */
export function analizarImpropia(f, a, b, { muestras = 2001 } = {}) {
  const signo = a <= b ? 1 : -1;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const causas = [];
  const finitos = finito(lo) && finito(hi);
  const longitud = finitos ? hi - lo : 1;

  // Muestra interior (para la escala típica de |f| y para buscar polos).
  const iniL = finito(lo) ? lo : (finito(hi) ? hi - 100 : -100);
  const finL = finito(hi) ? hi : iniL + 100;
  const xs = [];
  for (let i = 1; i < muestras - 1; i++) xs.push(iniL + ((finL - iniL) * i) / (muestras - 1));
  const ys = xs.map(f);
  const escalaTipica = mediana(ys);

  if (!finito(lo)) causas.push(comparacionInfinito(f, hi, -1));
  if (!finito(hi)) causas.push(comparacionInfinito(f, lo, 1));
  if (finito(lo) && singularEnExtremo(f, lo, 1, longitud, escalaTipica)) {
    causas.push({ tipo: "extremo", lado: signo > 0 ? "a" : "b", x: lo, ...comparacionPunto(f, lo, 1, longitud) });
  }
  if (finito(hi) && singularEnExtremo(f, hi, -1, longitud, escalaTipica)) {
    causas.push({ tipo: "extremo", lado: signo > 0 ? "b" : "a", x: hi, ...comparacionPunto(f, hi, -1, longitud) });
  }

  // Singularidades interiores: valores no finitos o picos de |f| muy por encima de lo típico.
  const interiores = [];
  for (let i = 0; i < xs.length; i++) {
    const y = Math.abs(ys[i]);
    const esPico = !finito(ys[i])
      || (y > 100 * Math.max(escalaTipica, 1e-300) && y >= Math.abs(ys[i - 1] ?? 0) && y >= Math.abs(ys[i + 1] ?? 0));
    if (!esPico) continue;
    const s = localizarInterior(f, xs, i, longitud, escalaTipica);
    if (s && !interiores.some((p) => Math.abs(p.c - s.c) < longitud * 1e-6)) interiores.push(s);
  }
  for (const s of interiores) {
    const criterio = [s.porIzq.criterio, s.porDer.criterio].includes("diverge") ? "diverge"
      : [s.porIzq.criterio, s.porDer.criterio].includes("dudoso") ? "dudoso" : "converge";
    const exponente = Math.max(s.porIzq.exponente ?? 0, s.porDer.exponente ?? 0);
    causas.push({ tipo: "interior", x: s.c, exponente, criterio });
  }

  // Caso límite p ≈ 1 en un extremo: el criterio de comparación no decide;
  // se mira cuánto crece la integral truncada por cada década.
  for (const causa of causas) {
    if (causa.tipo === "interior" || causa.criterio !== "dudoso" || causa.oscila) continue;
    if (causa.exponente === null || Math.abs(causa.exponente - 1) >= MARGEN_CRITERIO) continue;
    const decision = decidirPorIncrementos(sucesionTruncada(f, lo, hi, causa));
    if (decision) { causa.criterio = decision; causa.porSucesion = true; }
  }

  const cortes = interiores.map((s) => s.c).sort((p, q) => p - q);
  const bordes = [lo, ...cortes, hi];
  const tramos = bordes.slice(1).map((x, i) => [bordes[i], x]);

  let veredictoFinal = causas.some((c) => c.criterio === "diverge") ? "diverge"
    : causas.some((c) => c.criterio === "dudoso") ? "dudoso" : "converge";

  let numerico = null;
  if (veredictoFinal !== "diverge") {
    let valor = 0;
    let errorEstimado = 0;
    let convergio = true;
    for (const [p, q] of tramos) {
      const r = dobleExponencial(f, p, q);
      valor += r.valor;
      errorEstimado += r.errorEstimado;
      convergio &&= r.convergio;
    }
    numerico = { valor: signo * valor, errorEstimado, convergio };
    if (!convergio && veredictoFinal === "converge") veredictoFinal = "dudoso";
  }

  return { impropia: causas.length > 0, causas, tramos, numerico, veredicto: veredictoFinal };
}

/**
 * Con p ≈ 1, la integral truncada crece por década de forma muy distinta:
 *   1/x:          +ln 10 en cada década (incrementos constantes)  -> diverge
 *   1/x^1.5:      incrementos que se dividen entre √10 ≈ 3.2       -> converge
 *   1/(x·ln²x):   incrementos que bajan despacio (k/(k+2))          -> no se decide
 * Se usan los cocientes de los últimos incrementos.
 */
export function decidirPorIncrementos(sucesion) {
  if (sucesion.length < 5) return null;
  const incrementos = sucesion.slice(1).map((p, i) => Math.abs(p.valor - sucesion[i].valor));
  const ultimos = incrementos.slice(-3);
  if (ultimos.some((d) => !finito(d))) return "diverge";
  if (ultimos.every((d) => d === 0)) return "converge";
  const cocientes = ultimos.slice(1).map((d, i) => d / ultimos[i]);
  if (cocientes.every((c) => c > 0.9)) return "diverge";
  if (cocientes.every((c) => c < 0.5)) return "converge";
  return null;
}

/**
 * Sucesión de integrales truncadas, para ver si se estabilizan:
 *   límite infinito:   I(R) = ∫ₐᴿ f,        R = a + 10, 100, …
 *   extremo singular:  I(ε) = ∫_{a+ε}^b f,   ε = L/10, L/100, …
 * Solo para una causa en un extremo (las interiores se parten en dos tramos).
 */
export function sucesionTruncada(f, a, b, causa, pasos = 7) {
  const puntos = [];
  for (let k = 1; k <= pasos; k++) {
    let p = a;
    let q = b;
    let parametro;
    if (causa.tipo === "infinito") {
      parametro = 10 ** k;
      if (causa.lado === "b") q = (finito(a) ? a : 0) + parametro;
      else p = (finito(b) ? b : 0) - parametro;
      if (!finito(p) || !finito(q)) continue;
    } else {
      parametro = Math.abs(b - a) * 10 ** -k;
      if (causa.lado === "a") p = a + parametro; else q = b - parametro;
    }
    const r = dobleExponencial(f, p, q, { tol: 1e-11 });
    puntos.push({ parametro, valor: r.valor });
  }
  return puntos;
}
