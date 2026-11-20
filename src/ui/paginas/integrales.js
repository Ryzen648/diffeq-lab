// Página de integrales (Fase 1a).
//
// Flujo de un cálculo:
//   1. Se lee y valida f(x) y los límites (núcleo, sin DOM).
//   2. Lo numérico se calcula al momento en el hilo principal: tarda pocos
//      milisegundos (medido: el estudio de convergencia completo, < 50 ms).
//   3. Lo simbólico se pide a SymPy en un Web Worker. Mientras llega, la
//      página ya enseña el resultado numérico con su etiqueta; cuando llega,
//      se completan pasos y verificación y el estudio de convergencia pasa a
//      medir el error contra el valor exacto.
//   Cada cálculo lleva un número: si llega la respuesta de uno viejo (porque
//   el usuario cambió algo), se descarta.

import { math, mathDisponible } from "../../../comun/js/mathjs.js";
import { analizarFuncion } from "../../../comun/js/entrada/analizar.js";
import { expresionTex } from "../../../comun/js/entrada/impresion.js";
import { llevarAlResultado } from "../../../comun/js/teclado-virtual.js";
import { prepararExpresion } from "../../nucleo/expresion.js";
import { leerNumero } from "../../nucleo/numeros.js";
import { ErrorCalculo } from "../../nucleo/errores.js";
import { aPython } from "../../nucleo/python.js";
import { sumaRiemann } from "../../nucleo/cuadratura/riemann.js";
import { simpsonAdaptativo } from "../../nucleo/cuadratura/adaptativa.js";
import { estudioConvergencia, estudioGaussPuntos, METODOS_CUADRATURA, errorDe } from "../../nucleo/cuadratura/estudio.js";
import { analizarImpropia, sucesionTruncada } from "../../nucleo/cuadratura/impropias.js";
import { codigoIntegral } from "../../nucleo/codigo/integrales.js";
import { leerFragmento, escribirFragmento } from "../../nucleo/estado-url.js";
import { EJEMPLOS, ejemplo as buscarEjemplo } from "../../ejemplos.js";
import { integrarSimbolico, alEstadoSimbolico } from "../../simbolico/cliente.js";
import { t, mensajeDeError } from "../../i18n/index.js";
import { $, crear, pintarTex, iniciarPagina } from "../pagina.js";
import { crearCampoFormula, conectarSelectorModo } from "../campo-formula.js";
import { conectarPestanas } from "../pestanas.js";
import { pintarDeslizadores } from "../deslizadores.js";
import { pintarPasos, textoConFormulas } from "../pasos.js";
import { dibujar, disenoBase, colorSerie, coloresTema, SIMBOLOS, muestrear, rangoRobusto, reajustar, descargarPNG } from "../graficas.js";
import { descargarTexto, aCSV, copiar } from "../exportar.js";

const ESPERA_VIVO_MS = 300;
const PUNTOS_VERIFICACION = [-2.3, -0.7, 0.35, 0.9, 1.6, 2.7, 4.1];
const TOL_VISUAL = 1e-6;

let campoF;
const valoresParametros = {};
let parametrosActuales = [];
let temporizadorVivo = null;
let numeroCalculo = 0;
let r = null; // resultado del último cálculo (ver calcular)

// --- Utilidades ------------------------------------------------------------------

const cifras = (v, n = 12) => (Number.isFinite(v) ? String(Number(v.toPrecision(n))) : String(v));
const cientifica = (v) => (v === 0 ? "0" : v.toExponential(2));
const texNumero = (v) => {
  if (!Number.isFinite(v)) return v > 0 ? "\\infty" : v < 0 ? "-\\infty" : "\\text{NaN}";
  const s = cifras(v);
  if (!s.includes("e")) return s;
  const [m, e] = s.split("e");
  return `${m}\\times 10^{${Number(e)}}`;
};
const texLimite = (texto, valor) => {
  if (valor === Infinity) return "\\infty";
  if (valor === -Infinity) return "-\\infty";
  try { return expresionTex(analizarFuncion(texto)); } catch { return texNumero(valor); }
};

function leerEntrada() {
  return {
    codigo: campoF.codigo(),
    definida: $("definida").checked,
    a: $("a").value.trim(),
    b: $("b").value.trim(),
  };
}

/** Sustituye los parámetros por su valor numérico en el árbol (para SymPy y Python). */
function sustituirParametros(nodo) {
  return nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in valoresParametros
    ? new math.ConstantNode(valoresParametros[n.name]) : n));
}

/** Texto de un límite para SymPy: "oo", "-oo" o la expresión en Python. */
function limiteSympy(texto, valor) {
  if (valor === Infinity) return "oo";
  if (valor === -Infinity) return "-oo";
  return aPython(analizarFuncion(texto));
}

function nodoLimite(texto, valor) {
  return Number.isFinite(valor) ? analizarFuncion(texto) : valor;
}

// --- Lectura validada -------------------------------------------------------------

/** Lee todo y lanza el primer error. Devuelve lo necesario para calcular. */
function prepararCalculo() {
  const entrada = leerEntrada();
  const errorVisual = campoF.errorVisual();
  if (errorVisual) throw errorVisual;
  const expr = prepararExpresion(entrada.codigo, ["x"], { indice: "f(x)" });
  const valores = () => expr.parametros.map((p) => valoresParametros[p] ?? 1);
  const f = (x) => expr.fn(x, ...valores());
  let a = null;
  let b = null;
  if (entrada.definida) {
    a = leerNumero(entrada.a, "a", { admiteInfinito: true });
    b = leerNumero(entrada.b, "b", { admiteInfinito: true });
    if (a === b) throw new ErrorCalculo("limitesIguales", {});
  }
  return { entrada, expr, f, a, b };
}

// --- En vivo: vista previa, clasificación y parámetros -------------------------------

function refrescarVivo() {
  clearTimeout(temporizadorVivo);
  const { codigo, definida, a, b } = leerEntrada();
  $("camposLimites").hidden = !definida;
  const errorF = $("errorF");
  const etiquetas = $("clasificacion");
  etiquetas.replaceChildren();
  let expr;
  try {
    if (campoF.errorVisual()) throw campoF.errorVisual();
    expr = prepararExpresion(codigo, ["x"], { indice: "f(x)" });
    errorF.hidden = true;
    campoF.marcarError(false);
  } catch (err) {
    errorF.hidden = codigo.trim() === "";
    errorF.textContent = mensajeDeError(err);
    campoF.marcarError(codigo.trim() !== "");
    $("vistaPrevia").replaceChildren(crear("p", "hint", t("entrada.vistaPrevia.conErrores")));
    return;
  }

  // Parámetros: se repintan los deslizadores solo si cambia la lista.
  if (expr.parametros.join() !== parametrosActuales.join()) {
    parametrosActuales = expr.parametros;
    pintarDeslizadores($("parametros"), parametrosActuales, valoresParametros, {
      t,
      alMover: () => { if (r) calcular({ soloNumerico: true }); },
      alSoltar: () => { if (r) calcular({}); },
    });
  }

  let limites = "";
  const chip = (clave, datos, clase = "") => etiquetas.append(crear("span", `etiqueta ${clase}`, t(clave, datos)));
  $("errorLimites").hidden = true;
  if (definida) {
    try {
      const va = leerNumero(a, "a", { admiteInfinito: true });
      const vb = leerNumero(b, "b", { admiteInfinito: true });
      limites = `_{${texLimite(a, va)}}^{${texLimite(b, vb)}}`;
      chip("clase.definida");
      const vals = expr.parametros.map((p) => valoresParametros[p] ?? 1);
      if (va !== vb) {
        const analisis = analizarImpropia((x) => expr.fn(x, ...vals), va, vb);
        for (const c of analisis.causas) {
          if (c.tipo === "infinito") chip("clase.impropiaInfinito", {}, "aviso");
          else chip(c.tipo === "interior" ? "clase.impropiaInterior" : "clase.impropiaExtremo", { x: cifras(c.x, 6) }, "aviso");
        }
        if (!analisis.impropia) chip("clase.propia");
      }
    } catch (err) {
      $("errorLimites").hidden = false;
      $("errorLimites").textContent = mensajeDeError(err);
    }
  } else {
    chip("clase.indefinida");
  }
  if (expr.parametros.length) chip("clase.parametros", { lista: expr.parametros.join(", ") });
  pintarTex($("vistaPrevia"), `\\int${limites} ${expresionTex(expr.nodo)}\\,dx`);
}

function programarVivo() {
  clearTimeout(temporizadorVivo);
  temporizadorVivo = setTimeout(refrescarVivo, ESPERA_VIVO_MS);
}

// --- Cálculo -------------------------------------------------------------------------

/**
 * `soloNumerico`: al mover un deslizador se rehace lo numérico al instante y
 * lo simbólico se pide al soltarlo. `desdeUsuario`: cierra el teclado en
 * pantalla y lleva la vista al resultado.
 */
function calcular({ soloNumerico = false, desdeUsuario = false } = {}) {
  let datos;
  try {
    datos = prepararCalculo();
  } catch (err) {
    mostrarError(err);
    return;
  }
  $("error").hidden = true;
  const id = ++numeroCalculo;
  const { entrada, expr, f, a, b } = datos;
  const definida = a !== null;
  // Con parámetros nuevos, el resultado simbólico anterior ya no vale: se
  // marca como pendiente y se pide de nuevo al soltar el deslizador.
  r = { id, entrada, expr, f, a, b, definida, simbolico: null, pendiente: soloNumerico, errorSimbolico: null };

  try {
    calcularNumerico(r);
  } catch (err) {
    mostrarError(err);
    return;
  }
  guardarEnURL();
  pintarTodo();
  $("resultados").hidden = false;
  if (desdeUsuario) llevarAlResultado($("resultados"));
  if (soloNumerico) return;

  // Parte simbólica (asíncrona).
  r.simbolico = null;
  r.pendiente = true;
  pintarConfianza();
  const nodoSustituido = sustituirParametros(expr.nodo);
  const limites = definida ? [limiteSympy(entrada.a, a), limiteSympy(entrada.b, b)] : [null, null];
  integrarSimbolico(aPython(nodoSustituido), ...limites)
    .then((res) => {
      if (id !== numeroCalculo) return;
      r.simbolico = res;
      r.pendiente = false;
      // Con el valor exacto, el estudio de convergencia mide el error de verdad.
      const exacto = res.definida?.numero !== undefined && res.definida?.numero !== null ? Number(res.definida.numero) : null;
      if (r.estudio && exacto !== null && Number.isFinite(exacto)) {
        r.referencia = { valor: exacto, fuente: "exacta" };
        rehacerEstudio(r);
      }
      pintarTodo();
    })
    .catch((err) => {
      if (id !== numeroCalculo) return;
      r.pendiente = false;
      r.errorSimbolico = err;
      pintarTodo();
    });
}

function calcularNumerico(res) {
  const { f, a, b, definida } = res;
  res.rango = rangoGrafica(a, b);
  res.estudio = null;
  res.impropia = null;
  res.adaptativa = null;
  if (!definida) {
    res.primitivaNumerica = primitivaNumerica(f, res.rango);
    return;
  }
  const analisis = analizarImpropia(f, a, b);
  if (analisis.impropia) {
    res.impropia = analisis;
    res.valorNumerico = analisis.numerico?.valor ?? null;
    res.metodoNumerico = "dobleExponencial";
    res.errorEstimado = analisis.numerico?.errorEstimado ?? null;
    res.truncadas = analisis.causas.filter((c) => c.tipo !== "interior").map((c) => ({ causa: c, puntos: sucesionTruncada(f, a, b, c) }));
    return;
  }
  // Propia: referencia numérica con Simpson adaptativo muy fino; si después
  // llega el valor exacto de SymPy, el estudio se rehace contra él.
  const signo = a < b ? 1 : -1;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const adaptativa = simpsonAdaptativo(f, lo, hi, { tol: 1e-13 });
  res.adaptativa = adaptativa;
  res.valorNumerico = signo * adaptativa.valor;
  res.metodoNumerico = "simpsonAdaptativo";
  res.errorEstimado = adaptativa.errorEstimado;
  res.referencia = { valor: adaptativa.valor, fuente: "numerica" };
  res.lo = lo;
  res.hi = hi;
  res.signo = signo;
  // Para enseñar dónde refina se usa una tolerancia moderada: con 1e-13 casi
  // cualquier f acaba partida en trozos iguales y no se ve nada.
  res.adaptativaVisual = simpsonAdaptativo(f, lo, hi, { tol: TOL_VISUAL });
  rehacerEstudio(res);
}

function rehacerEstudio(res) {
  const ref = res.referencia.fuente === "exacta" ? res.signo * res.referencia.valor : res.referencia.valor;
  res.estudio = estudioConvergencia(res.f, res.lo, res.hi, ref);
  res.gauss = estudioGaussPuntos(res.f, res.lo, res.hi, ref, 20);
  res.referenciaEstudio = ref;
}

/** Rango de las gráficas: el de las opciones o uno razonable según los límites. */
function rangoGrafica(a, b) {
  try {
    const xmin = $("xmin").value.trim();
    const xmax = $("xmax").value.trim();
    if (xmin && xmax) {
      const p = leerNumero(xmin, "x mín");
      const q = leerNumero(xmax, "x máx");
      if (q > p) return [p, q];
    }
  } catch { /* se usa el rango automático */ }
  if (a === null) return [-5, 5];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    const margen = 0.25 * (hi - lo);
    return [lo - margen, hi + margen];
  }
  if (Number.isFinite(lo)) return [lo, lo + 20];
  if (Number.isFinite(hi)) return [hi - 20, hi];
  return [-10, 10];
}

/**
 * Primitiva numérica G(x) = ∫_{x₀}^{x} f en una malla, para dibujarla aunque
 * SymPy no la encuentre (o mientras carga). Se acumula Simpson adaptativo por
 * tramos desde x₀ (0 si está en el rango, si no el extremo izquierdo).
 * Donde f no es finita, G se corta (null) a partir de ahí.
 */
function primitivaNumerica(f, [xmin, xmax], n = 200) {
  const x0 = xmin <= 0 && 0 <= xmax ? 0 : xmin;
  const xs = Array.from({ length: n + 1 }, (_, i) => xmin + ((xmax - xmin) * i) / n);
  const ys = new Array(xs.length).fill(null);
  const i0 = xs.reduce((m, x, i) => (Math.abs(x - x0) < Math.abs(xs[m] - x0) ? i : m), 0);
  ys[i0] = 0;
  for (const paso of [1, -1]) {
    let acumulado = 0;
    for (let i = i0 + paso; i >= 0 && i < xs.length; i += paso) {
      try {
        const tramo = simpsonAdaptativo(f, Math.min(xs[i - paso], xs[i]), Math.max(xs[i - paso], xs[i]), { tol: 1e-10 });
        acumulado += paso * tramo.valor;
        ys[i] = acumulado;
      } catch {
        break;
      }
    }
  }
  return { xs, ys, x0: xs[i0] };
}

// --- Pintar resultados -----------------------------------------------------------------

function pintarTodo() {
  pintarConfianza();
  pintarSolucion();
  pintarPasosPanel();
  pintarGraficas();
  pintarNumerico();
  pintarVerificacion();
  pintarCodigo();
}

/** Etiqueta de confianza: qué es exacto, qué es numérico y con qué método. */
function pintarConfianza() {
  const el = $("confianza");
  const s = r.simbolico;
  let clase = "aviso";
  let texto;
  const discrepa = discrepancia();
  if (discrepa) {
    clase = "bad";
    texto = t("confianza.discrepancia");
  } else if (s && !s.sinFormaCerrada && (!r.definida || s.definida?.encontrada)) {
    clase = "ok";
    texto = s.conPasos
      ? t("confianza.exactoPasos", { metodo: t(`metodo.${s.metodos[0] ?? "inmediata"}`) })
      : t("confianza.exactoSinPasos");
  } else if (r.definida && r.valorNumerico !== null) {
    texto = t("confianza.numerico", { metodo: t(`metodoNumerico.${r.metodoNumerico}`), error: cientifica(r.errorEstimado ?? 0) });
  } else if (r.definida && r.impropia?.veredicto === "diverge") {
    texto = t("confianza.diverge");
  } else {
    texto = t("confianza.soloNumerica");
  }
  if (r.pendiente) texto += ` · ${t("confianza.pendiente")}`;
  el.className = `badge ${clase}`;
  el.textContent = texto;
}

/** ¿El valor exacto y el numérico no coinciden? Señal de que algo va mal. */
function discrepancia() {
  const exacto = r.simbolico?.definida?.numero;
  if (!r.definida || exacto === null || exacto === undefined || r.valorNumerico === null || r.valorNumerico === undefined) return false;
  return Math.abs(Number(exacto) - r.valorNumerico) > 1e-7 * Math.max(1, Math.abs(r.valorNumerico));
}

function pintarSolucion() {
  const s = r.simbolico;
  const fTex = expresionTex(sustituirParametros(r.expr.nodo));
  const prim = $("solucionPrimitiva");
  if (s?.primitiva) pintarTex(prim, `\\int ${fTex}\\,dx = ${s.primitiva} + C`);
  else if (s?.sinFormaCerrada) prim.replaceChildren(crear("p", null, t("solucion.sinFormaCerrada")));
  else if (r.pendiente) prim.replaceChildren(crear("p", "muted", t("solucion.calculando")));
  else if (r.errorSimbolico) prim.replaceChildren(crear("p", "muted", mensajeDeError(r.errorSimbolico)));
  else prim.replaceChildren();

  $("avisoLogaritmo").hidden = !s?.avisoLogaritmo;
  if (s?.avisoLogaritmo) textoConFormulas($("avisoLogaritmo"), t("solucion.avisoLogaritmo"));

  const def = $("solucionDefinida");
  def.replaceChildren();
  $("solucionImpropia").replaceChildren();
  $("solucionNota").textContent = "";
  if (!r.definida) return;
  const lim = `_{${texLimite(r.entrada.a, r.a)}}^{${texLimite(r.entrada.b, r.b)}}`;
  const exacta = s?.definida?.encontrada && !s.definida.diverge ? s.definida.valor : null;
  const hayNumero = r.valorNumerico !== null && r.valorNumerico !== undefined;
  let ecuacion = `\\int${lim} ${fTex}\\,dx`;
  if (exacta) ecuacion += ` = ${exacta}`;
  const exactaEsNumero = exacta && /^-?\d+(\.\d+)?$/.test(exacta.trim()); // «= 1 ≈ 1» no aporta nada
  if (hayNumero && !exactaEsNumero) ecuacion += ` \\approx ${texNumero(r.valorNumerico)}`;
  else if (s?.definida?.diverge === "+") ecuacion += " = +\\infty";
  else if (s?.definida?.diverge === "-") ecuacion += " = -\\infty";
  pintarTex(def, ecuacion);
  if (s?.definida?.barrow && s.definida.barrow.coincide === false) {
    textoConFormulas($("solucionNota"), t("solucion.barrowFalla"));
  }
  if (r.impropia) pintarImpropia();
}

function pintarImpropia() {
  const caja = $("solucionImpropia");
  const a = r.impropia;
  const sympy = r.simbolico?.definida;
  let veredicto = a.veredicto;
  let fuente = "comparacion";
  if (sympy?.encontrada) { veredicto = sympy.diverge ? "diverge" : "converge"; fuente = "sympy"; }
  const titulo = crear("p", `veredicto ${veredicto}`, t(`impropia.${veredicto}`));
  caja.append(titulo);
  const lista = crear("ul", "causas");
  for (const c of a.causas) {
    const datos = { x: cifras(c.x ?? 0, 6), p: c.exponente === Infinity ? "∞" : c.exponente === null ? "?" : cifras(c.exponente, 3) };
    const clave = c.tipo === "infinito" ? "impropia.causa.infinito" : c.tipo === "interior" ? "impropia.causa.interior" : "impropia.causa.extremo";
    const li = crear("li");
    textoConFormulas(li, `${t(clave, datos)} ${t(`impropia.criterio.${c.criterio}`)}${c.oscila ? ` ${t("impropia.oscila")}` : ""}${c.porSucesion ? ` ${t("impropia.porSucesion")}` : ""}`);
    lista.append(li);
  }
  caja.append(lista);
  const coincide = !sympy?.encontrada ? null : (sympy.diverge ? "diverge" : "converge") === a.veredicto;
  caja.append(crear("p", "muted", t(fuente === "sympy"
    ? (coincide ? "impropia.fuente.coinciden" : "impropia.fuente.sympyDecide")
    : "impropia.fuente.soloNumerica")));
}

function pintarPasosPanel() {
  const s = r.simbolico;
  const metodo = $("pasosMetodo");
  const pasos = $("pasos");
  pasos.replaceChildren();
  if (s?.pasos) {
    metodo.textContent = t("pasos.metodos", { lista: s.metodos.map((m) => t(`metodo.${m}`)).join(", ") });
    pintarPasos(pasos, s.pasos);
  } else if (s && !s.conPasos && !s.sinFormaCerrada) {
    metodo.textContent = t("pasos.sinPasos");
  } else if (s?.sinFormaCerrada) {
    metodo.textContent = t("pasos.sinFormaCerrada");
  } else {
    metodo.textContent = r.pendiente ? t("solucion.calculando") : (r.errorSimbolico ? mensajeDeError(r.errorSimbolico) : "");
  }
}

// --- Gráficas ---------------------------------------------------------------------------

function pintarGraficas() {
  const { f, rango, definida } = r;
  const [xmin, xmax] = rango;
  const muestra = muestrear(f, xmin, xmax);
  const prim = primitivaParaDibujar();

  dibujar($("graficaF"), () => {
    const c = coloresTema();
    const datos = [];
    if (definida && Number.isFinite(r.a) && Number.isFinite(r.b) && !r.impropia?.causas.some((k) => k.tipo !== "infinito")) {
      const [lo, hi] = r.a < r.b ? [r.a, r.b] : [r.b, r.a];
      const area = muestrear(f, lo, hi, 300);
      datos.push({ x: area.xs, y: area.ys, type: "scatter", mode: "lines", fill: "tozeroy", fillcolor: c.area, line: { width: 0 }, name: t("graficas.area"), hoverinfo: "skip" });
    }
    datos.push({ x: muestra.xs, y: muestra.ys, type: "scatter", mode: "lines", line: { color: colorSerie(0), width: 2 }, name: "f(x)" });
    if (prim) datos.push({ x: prim.xs, y: prim.ys, type: "scatter", mode: "lines", line: { color: colorSerie(1), width: 2, dash: prim.numerica ? "dash" : "solid" }, name: prim.nombre });
    return { datos, diseno: disenoBase({ tituloX: "x", yaxis: { range: rangoRobusto(muestra.ys, prim?.ys ?? []) }, showlegend: true }) };
  });

  const propia = definida && !r.impropia;
  $("bloqueRiemann").hidden = !propia;
  $("bloqueTruncada").hidden = !r.impropia || !r.truncadas?.length;
  if (propia) { pintarRiemann(); pintarAdaptativa(); }
  if (r.impropia && r.truncadas?.length) pintarTruncada();
}

/** Primitiva para dibujar: la de SymPy si se puede evaluar en JS; si no, la numérica. */
function primitivaParaDibujar() {
  const textoF = r.simbolico?.primitivaMathjs;
  if (textoF) {
    try {
      const { fn } = prepararExpresion(textoF, ["x"], { parametrosPermitidos: false });
      const m = muestrear(fn, r.rango[0], r.rango[1]);
      return { ...m, nombre: t("graficas.primitiva"), numerica: false };
    } catch { /* se usa la numérica */ }
  }
  if (r.primitivaNumerica) return { ...r.primitivaNumerica, nombre: t("graficas.primitivaNumerica", { x0: cifras(r.primitivaNumerica.x0, 4) }), numerica: true };
  return null;
}

function pintarRiemann() {
  const n = Number($("nRiemann").value);
  const regla = $("reglaRiemann").value;
  $("nRiemannValor").textContent = String(n);
  const { lo, hi, signo, f } = r;
  const suma = sumaRiemann(f, lo, hi, n, regla);
  const ref = r.referenciaEstudio;
  const curva = muestrear(f, lo, hi, 400);
  dibujar($("graficaRiemann"), () => {
    const c = coloresTema();
    return {
      datos: [
        { x: suma.rectangulos.map((q) => (q.x0 + q.x1) / 2), y: suma.rectangulos.map((q) => q.y), width: suma.rectangulos.map((q) => q.x1 - q.x0),
          type: "bar", marker: { color: c.area, line: { color: colorSerie(0), width: 1 } }, name: t("graficas.rectangulos"),
          hovertemplate: "x ∈ [%{customdata[0]:.4g}, %{customdata[1]:.4g}]<br>f(x*) = %{y:.6g}<extra></extra>",
          customdata: suma.rectangulos.map((q) => [q.x0, q.x1]) },
        { x: suma.rectangulos.map((q) => q.xm), y: suma.rectangulos.map((q) => q.y), type: "scatter", mode: "markers",
          marker: { color: colorSerie(1), size: 8 }, name: t("graficas.puntosEvaluados"), hoverinfo: "skip" },
        { x: curva.xs, y: curva.ys, type: "scatter", mode: "lines", line: { color: colorSerie(0), width: 2 }, name: "f(x)" },
      ],
      diseno: disenoBase({ tituloX: "x", bargap: 0, showlegend: true, yaxis: { range: rangoRobusto(curva.ys) } }),
    };
  });
  const valor = signo * suma.valor;
  const errorAbs = Math.abs(suma.valor - ref);
  textoConFormulas($("textoRiemann"), t("graficas.riemann.texto", {
    n, suma: cifras(valor, 10), integral: cifras(signo * ref, 12), error: cientifica(errorAbs),
    factor: regla === "medio" ? 4 : 2, // orden 2 (punto medio) u orden 1 (extremos)
  }));
}

function pintarAdaptativa() {
  const { adaptativaVisual: adaptativa, f } = r;
  const curva = muestrear(f, r.lo, r.hi, 400);
  const bordes = [...new Set(adaptativa.intervalos.flat())];
  const anchos = adaptativa.intervalos.map(([p, q]) => q - p);
  dibujar($("graficaAdaptativa"), () => ({
    datos: [
      { x: curva.xs, y: curva.ys, type: "scatter", mode: "lines", line: { color: colorSerie(0), width: 2 }, name: "f(x)" },
      { x: bordes, y: bordes.map(() => 0), type: "scatter", mode: "markers", marker: { symbol: "line-ns-open", size: 14, color: colorSerie(1), line: { width: 2 } },
        name: t("graficas.adaptativa.bordes"), hovertemplate: "x = %{x:.6g}<extra></extra>" },
    ],
    diseno: disenoBase({ tituloX: "x", showlegend: true, yaxis: { range: rangoRobusto(curva.ys) } }),
  }));
  $("textoAdaptativa").textContent = t("graficas.adaptativa.texto", {
    tol: cientifica(TOL_VISUAL), trozos: adaptativa.intervalos.length, evaluaciones: adaptativa.evaluaciones,
    minimo: cientifica(Math.min(...anchos)), maximo: cientifica(Math.max(...anchos)),
  });
}

function pintarTruncada() {
  dibujar($("graficaTruncada"), () => ({
    datos: r.truncadas.map(({ causa, puntos }, i) => ({
      x: puntos.map((p) => p.parametro), y: puntos.map((p) => p.valor), type: "scatter", mode: "lines+markers",
      marker: { symbol: SIMBOLOS[i], size: 9, color: colorSerie(i) }, line: { color: colorSerie(i), width: 2 },
      name: t(causa.tipo === "infinito" ? "graficas.truncada.R" : "graficas.truncada.eps"),
    })),
    diseno: disenoBase({ tituloX: t("graficas.truncada.ejeX"), tituloY: t("graficas.truncada.ejeY"), xaxis: { type: "log" }, showlegend: true }),
  }));
}

// --- Numérico ------------------------------------------------------------------------------

const ORDEN_METODOS = Object.keys(METODOS_CUADRATURA);

function pintarNumerico() {
  const nota = $("numericoNota");
  const bloque = $("bloqueConvergencia");
  if (!r.definida) {
    bloque.hidden = true;
    nota.textContent = t("numerico.indefinida");
    return;
  }
  if (r.impropia) {
    bloque.hidden = true;
    nota.textContent = r.valorNumerico !== null
      ? t("numerico.impropia", { valor: cifras(r.valorNumerico, 12), error: cientifica(r.errorEstimado ?? 0) })
      : t("numerico.impropiaDiverge");
    return;
  }
  bloque.hidden = false;
  nota.textContent = t(r.referencia.fuente === "exacta" ? "numerico.referenciaExacta" : "numerico.referenciaNumerica", {
    valor: cifras(r.signo * r.referenciaEstudio, 15),
  });

  // Tabla: cada método con n = 16 subintervalos (y su orden observado).
  const tabla = $("tablaMetodos");
  tabla.replaceChildren();
  const cabecera = crear("tr");
  for (const clave of ["numerico.col.metodo", "numerico.col.valor", "numerico.col.error", "numerico.col.evaluaciones", "numerico.col.orden"]) {
    const th = crear("th", null, t(clave, { n: 16 }));
    th.scope = "col";
    cabecera.append(th);
  }
  tabla.append(crear("thead"));
  tabla.tHead.append(cabecera);
  const cuerpo = crear("tbody");
  for (const id of ORDEN_METODOS) {
    const e = r.estudio[id];
    const p16 = e.puntos.find((p) => p.n === 16);
    const fila = crear("tr");
    const th = crear("th", null, t(`metodoNumerico.${id}`));
    th.scope = "row";
    fila.append(th,
      crear("td", "num", cifras(r.signo * p16.valor, 12)),
      crear("td", "num", cientifica(p16.error)),
      crear("td", "num", String(p16.evaluaciones)),
      crear("td", "num", e.observado ? t("numerico.ordenValor", { p: e.observado.pendiente.toFixed(2), teorico: e.ordenTeorico }) : "—"));
    cuerpo.append(fila);
  }
  tabla.append(cuerpo);

  const serie = (id, i, x) => {
    const e = r.estudio[id];
    const pts = e.puntos.filter((p) => p.error > 0);
    const etiqueta = e.observado
      ? t("numerico.leyenda", { metodo: t(`metodoNumerico.${id}`), p: e.observado.pendiente.toFixed(2), teorico: e.ordenTeorico })
      : t(`metodoNumerico.${id}`);
    return {
      x: pts.map(x), y: pts.map((p) => p.error), type: "scatter", mode: "lines+markers", name: etiqueta,
      marker: { symbol: SIMBOLOS[i], size: 8, color: colorSerie(i) }, line: { color: colorSerie(i), width: 2 },
      hovertemplate: `${t(`metodoNumerico.${id}`)}<br>n = %{customdata}<br>error = %{y:.2e}<extra></extra>`,
      customdata: pts.map((p) => p.n),
    };
  };
  const ejeLog = { type: "log", exponentformat: "power" };
  dibujar($("graficaConvergencia"), () => ({
    datos: ORDEN_METODOS.map((id, i) => serie(id, i, (p) => p.h)),
    diseno: disenoBase({ tituloX: t("numerico.ejeH"), tituloY: t("numerico.ejeError"), xaxis: { ...ejeLog, autorange: "reversed" }, yaxis: ejeLog, showlegend: true }),
  }));
  dibujar($("graficaEvaluaciones"), () => ({
    datos: ORDEN_METODOS.map((id, i) => serie(id, i, (p) => p.evaluaciones)),
    diseno: disenoBase({ tituloX: t("numerico.ejeEvaluaciones"), tituloY: t("numerico.ejeError"), xaxis: ejeLog, yaxis: ejeLog, showlegend: true }),
  }));
  const g = r.gauss.filter((p) => p.error > 0);
  dibujar($("graficaGauss"), () => ({
    datos: [{ x: g.map((p) => p.n), y: g.map((p) => p.error), type: "scatter", mode: "lines+markers",
      marker: { size: 8, color: colorSerie(0) }, line: { color: colorSerie(0), width: 2 }, name: t("numerico.gaussSerie"),
      hovertemplate: "n = %{x}<br>error = %{y:.2e}<extra></extra>" }],
    diseno: disenoBase({ tituloX: t("numerico.ejePuntos"), tituloY: t("numerico.ejeError"), yaxis: ejeLog, showlegend: false }),
  }));
}

// --- Verificación ---------------------------------------------------------------------------

function itemVerificacion(estado, clave, datos = {}) {
  const li = crear("li", `verif ${estado}`);
  const icono = { ok: "✓", bad: "✗", aviso: "!", pendiente: "…" }[estado];
  li.append(crear("span", "verif-icono", icono));
  const texto = crear("span");
  textoConFormulas(texto, t(clave, datos));
  li.append(texto);
  $("verificacion").append(li);
}

/**
 * Comprobación independiente de SymPy: deriva numéricamente (diferencia
 * centrada) la primitiva evaluada en JS y la compara con f. Devuelve el mayor
 * error relativo, o null si no hay puntos válidos.
 */
function derivadaNumericaFrenteAf(F, f) {
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

function pintarVerificacion() {
  $("verificacion").replaceChildren();
  const s = r.simbolico;
  if (r.pendiente) itemVerificacion("pendiente", "verif.pendiente");
  if (s?.verificacion) {
    const v = s.verificacion;
    if (v.simbolica) itemVerificacion("ok", "verif.residuoCero");
    else if (v.numerica) itemVerificacion("ok", "verif.residuoNumerico", { residuo: v.residuo });
    else itemVerificacion("bad", "verif.residuoFalla", { residuo: v.residuo });
  }
  if (s?.primitivaMathjs) {
    try {
      const { fn } = prepararExpresion(s.primitivaMathjs, ["x"], { parametrosPermitidos: false });
      const peor = derivadaNumericaFrenteAf(fn, r.f);
      if (peor === null) itemVerificacion("aviso", "verif.jsSinPuntos");
      else itemVerificacion(peor < 1e-6 ? "ok" : "bad", "verif.jsDerivada", { error: cientifica(peor) });
    } catch {
      itemVerificacion("aviso", "verif.jsNoEvaluable");
    }
  } else if (s?.primitiva) {
    itemVerificacion("aviso", "verif.jsNoEvaluable");
  }
  if (r.definida) {
    const exacto = s?.definida?.numero;
    if (exacto !== null && exacto !== undefined && r.valorNumerico !== null && r.valorNumerico !== undefined) {
      const dif = Math.abs(Number(exacto) - r.valorNumerico);
      itemVerificacion(discrepancia() ? "bad" : "ok", "verif.definida", {
        metodo: t(`metodoNumerico.${r.metodoNumerico}`), diferencia: cientifica(dif),
      });
    } else if (r.valorNumerico !== null && r.valorNumerico !== undefined) {
      itemVerificacion("aviso", "verif.soloNumerica", { metodo: t(`metodoNumerico.${r.metodoNumerico}`), error: cientifica(r.errorEstimado ?? 0) });
    }
    if (s?.definida?.barrow?.coincide === false) itemVerificacion("aviso", "verif.barrow");
    if (r.impropia && s?.definida?.encontrada) {
      const sympyDiverge = Boolean(s.definida.diverge);
      const numDiverge = r.impropia.veredicto === "diverge";
      const decide = r.impropia.veredicto !== "dudoso";
      itemVerificacion(!decide ? "aviso" : sympyDiverge === numDiverge ? "ok" : "bad",
        decide ? (sympyDiverge === numDiverge ? "verif.impropiaCoincide" : "verif.impropiaDiscrepa") : "verif.impropiaDudosa");
    }
  }
  if (r.errorSimbolico) itemVerificacion("aviso", "verif.sinSimbolico", { detalle: mensajeDeError(r.errorSimbolico) });
}

// --- Código Python y exportación ---------------------------------------------------------------

function textoPython() {
  return codigoIntegral({
    nodo: sustituirParametros(r.expr.nodo),
    textoOriginal: r.entrada.codigo,
    a: r.definida ? nodoLimite(r.entrada.a, r.a) : null,
    b: r.definida ? nodoLimite(r.entrada.b, r.b) : null,
  });
}

function pintarCodigo() {
  $("codigoPython").textContent = textoPython();
}

function latexSolucion() {
  const s = r.simbolico;
  const fTex = expresionTex(sustituirParametros(r.expr.nodo));
  const lineas = [];
  if (s?.primitiva) lineas.push(`\\int ${fTex}\\,dx = ${s.primitiva} + C`);
  if (r.definida) {
    const lim = `_{${texLimite(r.entrada.a, r.a)}}^{${texLimite(r.entrada.b, r.b)}}`;
    const valor = s?.definida?.valor ?? (r.valorNumerico !== null ? texNumero(r.valorNumerico) : "");
    lineas.push(`\\int${lim} ${fTex}\\,dx = ${valor}`);
  }
  return lineas.join("\n");
}

function csvActual() {
  if (r.estudio) {
    const filas = [["metodo", "n", "h", "valor", "error", "evaluaciones"]];
    for (const id of ORDEN_METODOS) for (const p of r.estudio[id].puntos) filas.push([id, p.n, p.h, r.signo * p.valor, p.error, p.evaluaciones]);
    return aCSV(filas);
  }
  const [xmin, xmax] = r.rango;
  const m = muestrear(r.f, xmin, xmax, 200);
  const prim = primitivaParaDibujar();
  return aCSV([["x", "f(x)", "F(x)"], ...m.xs.map((x, i) => [x, m.ys[i] ?? "", prim?.ys[i] ?? ""])]);
}

async function avisarCopia(boton, ok) {
  const original = boton.textContent;
  boton.textContent = t(ok ? "exportar.copiado" : "exportar.noCopiado");
  $("avisoCopia").textContent = t(ok ? "exportar.copiado" : "exportar.noCopiado");
  setTimeout(() => { boton.textContent = original; }, 1600);
}

function conectarExportar() {
  $("copiarEnlace").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(location.href)));
  $("copiarLatex").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(latexSolucion())));
  $("descargarCsv").addEventListener("click", () => descargarTexto(csvActual(), "diffeq-lab-integral.csv", "text/csv"));
  $("descargarPy").addEventListener("click", () => descargarTexto(textoPython(), "diffeq_lab_integral.py", "text/x-python"));
  $("copiarPy").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(textoPython())));
  $("descargarPng").addEventListener("click", () => {
    const panel = document.querySelector('.panel:not([hidden])');
    const grafica = panel?.querySelector(".js-plotly-plot:not([hidden])") ?? $("graficaF");
    descargarPNG(grafica, "diffeq-lab-integral");
  });
}

// --- Estado en la URL y ejemplos ------------------------------------------------------------------

function guardarEnURL() {
  const { codigo, definida, a, b } = leerEntrada();
  const fragmento = escribirFragmento({
    f: codigo, a: definida ? a : "", b: definida ? b : "",
    parametros: Object.fromEntries(parametrosActuales.map((p) => [p, valoresParametros[p]])),
  });
  history.replaceState(null, "", fragmento);
}

function cargarEstado({ f, a = "", b = "", parametros = {} }) {
  campoF.fijar(f ?? "");
  $("definida").checked = a !== "" && b !== "";
  $("a").value = a;
  $("b").value = b;
  Object.assign(valoresParametros, parametros);
  parametrosActuales = [];
  refrescarVivo();
}

function pintarEjemplos() {
  for (const e of EJEMPLOS.filter((x) => x.modulo === "integrales")) {
    const boton = crear("button", "chip", t(`ejemplo.${e.id}`));
    boton.type = "button";
    boton.addEventListener("click", () => { cargarEstado(e.datos); calcular({}); });
    $("ejemplos").append(boton);
  }
}

function estadoInicial() {
  const desdeURL = leerFragmento(location.hash);
  if (desdeURL.ejemplo && buscarEjemplo(desdeURL.ejemplo)?.modulo === "integrales") return buscarEjemplo(desdeURL.ejemplo).datos;
  if (desdeURL.f) return desdeURL;
  return buscarEjemplo("partes").datos;
}

// --- Errores y arranque -----------------------------------------------------------------------------

function mostrarError(err) {
  $("resultados").hidden = true;
  $("error").hidden = false;
  $("error").textContent = typeof err === "string" ? err : mensajeDeError(err);
}

function iniciar() {
  iniciarPagina();
  if (!mathDisponible() || !globalThis.katex || !globalThis.Plotly) {
    mostrarError(t("error.librerias"));
    return;
  }
  campoF = crearCampoFormula({
    contenedor: $("campoF"), id: "f", etiquetaAria: t("integrales.campo.aria"), ejemplo: t("integrales.campo.ejemplo"),
    alCambiar: programarVivo, alEnter: () => calcular({ desdeUsuario: true }),
  });
  conectarSelectorModo({ botonVisual: $("modoVisual"), botonCodigo: $("modoCodigo"), aviso: $("avisoModo"), campos: () => [campoF], t });
  conectarPestanas(document.querySelector('[role="tablist"]'), { alCambiar: (_id, panel) => reajustar(panel) });
  for (const id of ["definida", "a", "b"]) $(id).addEventListener("input", programarVivo);
  for (const id of ["a", "b", "xmin", "xmax"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") calcular({ desdeUsuario: true }); });
  $("calcular").addEventListener("click", () => calcular({ desdeUsuario: true }));
  $("nRiemann").addEventListener("input", () => r && !r.impropia && r.definida && pintarRiemann());
  $("reglaRiemann").addEventListener("change", () => r && !r.impropia && r.definida && pintarRiemann());
  alEstadoSimbolico(({ estado, paso }) => {
    $("estadoSimbolico").textContent = estado === "cargando" ? t(`simbolico.cargando.${paso ?? "pyodide"}`) : "";
  });
  conectarExportar();
  pintarEjemplos();
  cargarEstado(estadoInicial());
  calcular({});
}

iniciar();
