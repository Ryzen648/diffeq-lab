// Página de EDO de orden 2 y sistemas 2×2 (Fase 2).
//
// Las dos entradas se llevan a la misma forma, x' = f(t, x, y), y' = g(t, x, y)
// (src/nucleo/edo/plano.js); una EDO de orden 2 pasa a (posición, velocidad).
// Flujo de un cálculo:
//   1. Lo numérico, al momento: referencia fina (Dormand–Prince, tol. 10⁻¹²),
//      cada método elegido, el campo vectorial, las nulclinas y los
//      equilibrios con su jacobiano (si el sistema es autónomo).
//   2. El estudio de convergencia, en el Worker numérico.
//   3. Lo simbólico, en el Worker de Pyodide, SOLO si la clasificación en vivo
//      dice que es lineal (autónomo, en sistemas): con las no lineales dsolve
//      puede colgarse minutos, así que no se le llama.
//   Cada cálculo lleva un número y se descartan las respuestas de cálculos viejos.

import { math, mathDisponible } from "../../../comun/js/mathjs.js";
import { analizarFuncion, variablesDe } from "../../../comun/js/entrada/analizar.js";
import { latexACodigo } from "../../../comun/js/entrada/latex-a-codigo.js";
import { expresionTex } from "../../../comun/js/entrada/impresion.js";
import { llevarAlResultado } from "../../../comun/js/teclado-virtual.js";
import { aJS, compilarFuente, prepararExpresion } from "../../nucleo/expresion.js";
import { leerNumero } from "../../nucleo/numeros.js";
import { aPython } from "../../nucleo/python.js";
import { ErrorCalculo } from "../../nucleo/errores.js";
import { leerEcuacion, ecuacionTex, latexEcuacionACodigo } from "../../nucleo/edo/notacion.js";
import { clasificarLinealidad } from "../../nucleo/edo/clasificar.js";
import { leerOrden2, leerSistema, clasificarPlano, tipoCoeficientes, leerProblemaPlano, comprobarCondicionInicial } from "../../nucleo/edo/plano.js";
import { integrarSistemaConPaso, dormandPrinceSistema, interpolarHermiteSistema, evaluarSistemaEn } from "../../nucleo/edo/sistemas.js";
import { FRACCION_CORTE } from "../../nucleo/edo/singularidad.js";
import { jacobianoSimbolico, jacobianoNumerico, buscarEquilibrios } from "../../nucleo/edo/equilibrios.js";
import { campoVectorial, rejilla } from "../../nucleo/edo/campo.js";
import { codigoPlano } from "../../nucleo/codigo/edo2.js";
import { enlaceJacobiano } from "../../nucleo/edo/enlace-jacobianos.js";
import { separatrices } from "../../nucleo/edo/separatrices.js";
import { integrarImplicitoSistema, rigidezSistema } from "../../nucleo/edo/implicitos-sistema.js";
import { leerFragmento, escribirFragmento } from "../../nucleo/estado-url.js";
import { EJEMPLOS, ejemplo as buscarEjemplo } from "../../ejemplos.js";
import { resolverOrden2Simbolico, resolverSistemaSimbolico, alEstadoSimbolico } from "../../simbolico/cliente.js";
import { crearTrabajador } from "../../workers/rpc.js";
import { t, mensajeDeError } from "../../i18n/index.js";
import { $, crear, pintarTex, iniciarPagina } from "../pagina.js";
import { crearCampoFormula, conectarSelectorModo } from "../campo-formula.js";
import { conectarPestanas } from "../pestanas.js";
import { pintarDeslizadores } from "../deslizadores.js";
import { pintarPasos, textoConFormulas } from "../pasos.js";
import { dibujar, disenoBase, colorSerie, coloresTema, SIMBOLOS, rangoRobusto, reajustar, descargarPNG } from "../graficas.js";
import { descargarTexto, aCSV, copiar } from "../exportar.js";

const ESPERA_VIVO_MS = 300;
const METODOS = ["euler", "heun", "rk4", "dopri"];
const COLOR_METODO = { euler: 1, heun: 2, rk4: 3, dopri: 0 };
const MAX_DETALLES = 8; // equilibrios con ficha detallada (los demás, solo en la tabla)
const TOL_REFERENCIA = { rtol: 1e-12, atol: 1e-14 };

let campoEc;
let campoF;
let campoG;
let tipo = "orden2";
const valoresParametros = {};
let parametrosActuales = null;
let temporizadorVivo = null;
let numeroCalculo = 0;
let r = null;
let trayectorias = []; // añadidas con clic: [{ x, y, xs, ys }]

const trabajadorNumerico = crearTrabajador(new URL("../../workers/numerico.worker.js", import.meta.url), { tiempoPorDefecto: 30000 });

// --- Utilidades ----------------------------------------------------------------------

const cifras = (v, n = 10) => (Number.isFinite(v) ? String(Number(v.toPrecision(n))) : String(v));
const cientifica = (v) => (v === 0 ? "0" : v.toExponential(2));
const normaMax = (v) => Math.max(...v.map(Math.abs));

function leerEntrada() {
  const valor = (id) => $(id).value.trim();
  return {
    tipo, ecuacion: campoEc.codigo(), f: campoF.codigo(), g: campoG.codigo(),
    t0: valor("t0"), x0: valor("x0"), y0: valor("y0"), tf: valor("tf"),
    h: valor("paso"), tol: valor("tolerancia"),
    xmin: valor("xmin"), xmax: valor("xmax"), ymin: valor("ymin"), ymax: valor("ymax"),
    H: valor("conservada"),
    metodos: [...document.querySelectorAll('input[name="metodo"]:checked')].map((c) => c.value),
  };
}

/** Nombre de la velocidad al escribir el sistema equivalente de una EDO de orden 2. */
const nombreVelocidad = (dependiente) => (dependiente === "v" ? "w" : "v");

/** Nombres de los campos de condición inicial, según el tipo y las letras del usuario. */
function nombresCampos(nombres) {
  return { t0: `${nombres.t}₀`, x0: `${nombres.x}(${nombres.t}₀)`, y0: `${nombres.y}(${nombres.t}₀)`, tf: t("edo2.final", { var: nombres.t }) };
}

function sustituirParametros(nodo) {
  return nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in valoresParametros
    ? new math.ConstantNode(valoresParametros[n.name]) : n));
}

/** Lee y compila el problema del plano con los valores actuales de los parámetros. */
function leerPlano(entrada) {
  const campos = entrada.tipo === "orden2" ? [campoEc] : [campoF, campoG];
  for (const c of campos) if (c.errorVisual()) throw c.errorVisual();
  const p = entrada.tipo === "orden2" ? leerOrden2(entrada.ecuacion) : leerSistema(entrada.f, entrada.g);
  const args = ["t", "x", "y", ...p.parametros];
  const valores = p.parametros.map((q) => valoresParametros[q] ?? 1);
  const [fn, gn] = [p.f, p.g].map((n) => compilarFuente(aJS(n), args));
  const F = (t, Y) => [fn(t, Y[0], Y[1], ...valores), gn(t, Y[0], Y[1], ...valores)];
  const usaT = [p.f, p.g].some((n) => variablesDe(n).has("t"));
  return { ...p, args, valores, F, usaT };
}

/** Clasificación (en vivo y al calcular). Decide también si se llama a SymPy. */
function clasificar(p) {
  const c = clasificarPlano(p.F, { usaT: p.usaT });
  if (p.modo === "orden2") {
    const fn = compilarFuente(aJS(p.ec.F), ["x", "y", "D1y", "D2y", ...p.parametros]);
    const Fc = (x, [y, v, a]) => fn(x, y, v, a, ...p.valores);
    const l = clasificarLinealidad(Fc);
    const coeficientes = l.lineal ? tipoCoeficientes(Fc) : null;
    // Python clasifica de nuevo y no llama a dsolve con coeficientes variables.
    return { ...c, lineal: l.lineal, homogeneo: l.homogenea, coeficientes, simbolico: l.lineal === true ? null : "noLineal" };
  }
  const simbolico = c.lineal === false ? "noLineal" : !c.autonomo ? "noAutonomo" : null;
  return { ...c, simbolico };
}

/** Cantidad conservada H escrita por el usuario -> H(x, y) en las variables del plano, o null. */
function leerConservada(texto, p) {
  if (!texto) return null;
  let nodo = analizarFuncion(texto, "H");
  let permitidas = ["x", "y"];
  if (p.modo === "orden2") {
    const vel = nombreVelocidad(p.ec.dependiente);
    nodo = nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && (n.name === p.ec.dependiente || n.name === vel)
      ? new math.SymbolNode(n.name === vel ? "y" : "x") : n));
    permitidas = [p.ec.dependiente, vel];
  }
  for (const s of variablesDe(nodo)) {
    if (!["x", "y", ...p.parametros].includes(s)) {
      throw new ErrorCalculo("variableNoPermitida", { indice: "H", nombre: s, permitidas: [...permitidas, ...p.parametros].join(", ") });
    }
  }
  const fn = compilarFuente(aJS(nodo), ["x", "y", ...p.parametros]);
  return (x, y) => fn(x, y, ...p.valores);
}

// --- En vivo: vista previa, clasificación y parámetros ------------------------------------

function sincronizarParametros(lista) {
  if (parametrosActuales !== null && lista.join() === parametrosActuales.join()) return;
  parametrosActuales = [...lista];
  pintarDeslizadores($("parametros"), parametrosActuales, valoresParametros, {
    t,
    alMover: () => { if (r) calcular({ soloNumerico: true }); },
    alSoltar: () => { if (r) calcular({}); },
  });
}

/** LaTeX del problema: la ecuación (o el sistema) con sus condiciones iniciales. */
function problemaTex(p, { t0, x0, y0 }) {
  const n = p.nombres;
  const inicio = t0 || `${n.t}_0`;
  if (p.modo === "orden2") {
    return `${ecuacionTex(p.ec)}, \\quad ${n.x}(${inicio}) = ${x0 || `${n.x}_0`}, \\quad ${n.x}'(${inicio}) = ${y0 || `v_0`}`;
  }
  return `\\begin{cases} x' = ${expresionTex(p.f)} \\\\ y' = ${expresionTex(p.g)} \\end{cases} \\quad (x, y)(${inicio}) = (${x0 || "x_0"}, ${y0 || "y_0"})`;
}

/** Sistema de primer orden equivalente a una EDO de orden 2, con la velocidad v = y'. */
function sistemaEquivalenteTex(p) {
  const dep = p.ec.dependiente;
  const v = nombreVelocidad(dep);
  const g = p.g.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && ["t", "x", "y"].includes(n.name)
    ? new math.SymbolNode({ t: p.nombres.t, x: dep, y: v }[n.name]) : n));
  return `\\begin{cases} ${dep}' = ${v} \\\\ ${v}' = ${expresionTex(g)} \\end{cases}`;
}

function pintarEtiquetas(nombres) {
  const campos = nombresCampos(nombres);
  $("etiquetaT0").textContent = campos.t0;
  $("etiquetaX0").textContent = campos.x0;
  $("etiquetaY0").textContent = campos.y0;
  $("etiquetaTf").textContent = campos.tf;
  $("etiquetaXmin").textContent = `${nombres.x} ${t("edo2.min")}`;
  $("etiquetaXmax").textContent = `${nombres.x} ${t("edo2.max")}`;
  $("etiquetaYmin").textContent = `${nombres.y} ${t("edo2.min")}`;
  $("etiquetaYmax").textContent = `${nombres.y} ${t("edo2.max")}`;
  $("etiquetaTrayX").textContent = `${nombres.x} =`;
  $("etiquetaTrayY").textContent = `${nombres.y} =`;
}

function pintarAyudaConservada(p) {
  $("ayudaConservada").textContent = p?.modo === "orden2"
    ? t("edo2.conservada.ayuda.orden2", { x: p.ec.dependiente, v: nombreVelocidad(p.ec.dependiente) })
    : t("edo2.conservada.ayuda.sistema");
}

function refrescarVivo() {
  clearTimeout(temporizadorVivo);
  const entrada = leerEntrada();
  const errorEc = $("errorEcuacion");
  const chips = $("clasificacion");
  chips.replaceChildren();
  const chip = (texto, clase = "") => chips.append(crear("span", `etiqueta ${clase}`, texto));
  const textos = entrada.tipo === "orden2" ? [entrada.ecuacion] : [entrada.f, entrada.g];
  let p;
  try {
    p = leerPlano(entrada);
    errorEc.hidden = true;
    for (const c of [campoEc, campoF, campoG]) c.marcarError(false);
  } catch (err) {
    const vacio = textos.every((x) => x.trim() === "");
    errorEc.hidden = vacio;
    errorEc.textContent = mensajeDeError(err);
    for (const c of entrada.tipo === "orden2" ? [campoEc] : [campoF, campoG]) c.marcarError(!vacio);
    $("vistaPrevia").replaceChildren(crear("p", "hint", t("entrada.vistaPrevia.conErrores")));
    return;
  }
  pintarEtiquetas(p.nombres);
  pintarAyudaConservada(p);
  sincronizarParametros(p.parametros);
  const c = clasificar(p);
  chip(t(p.modo === "orden2" ? "tipo.orden" : "edo2.tipo.sistema2x2", { orden: 2 }));
  if (c.lineal !== null) chip(t(c.lineal ? "tipo.lineal" : "tipo.noLineal"));
  if (c.lineal) chip(p.modo === "orden2" ? t(c.homogeneo ? "tipo.homogenea" : "tipo.noHomogenea") : t(c.homogeneo ? "edo2.homogeneo" : "edo2.noHomogeneo"));
  if (c.coeficientes) chip(t(`edo2.coef.${c.coeficientes}`));
  chip(t(c.autonomo ? "edo2.autonomo" : "edo2.noAutonomo"));
  if (c.simbolico) chip(t(`edo2.chip.${c.simbolico}`), "aviso");
  else if (c.coeficientes === "coefVariables") chip(t("edo2.chip.coefVariables"), "aviso");
  if (p.parametros.length) chip(t("clase.parametros", { lista: p.parametros.join(", ") }));
  pintarTex($("vistaPrevia"), problemaTex(p, entrada));
}

function programarVivo() {
  clearTimeout(temporizadorVivo);
  temporizadorVivo = setTimeout(refrescarVivo, ESPERA_VIVO_MS);
}

// --- Cálculo -------------------------------------------------------------------------------------

/** Solución por Dormand–Prince con salida densa (Hermite) para dibujar y evaluar. */
function resolverDenso(F, t0, Y0, tf, opciones) {
  const sol = dormandPrinceSistema(F, t0, Y0, tf, opciones);
  const denso = interpolarHermiteSistema(sol, 6);
  return { sol, denso, enT: (tt) => evaluarSistemaEn(sol, tt) };
}

/** Ventana automática: el recorrido de la solución con margen (y algo de sitio si es casi un punto). */
function ventanaAuto(denso) {
  const rango = (k) => {
    const [lo, hi] = rangoRobusto(denso.Ys.map((Y) => Y[k])) ?? [-5, 5];
    const m = 0.15 * (hi - lo);
    return hi - lo < 1e-9 ? [lo - 1, hi + 1] : [lo - m, hi + m];
  };
  return { x: rango(0), y: rango(1) };
}

function calcular({ soloNumerico = false, desdeUsuario = false } = {}) {
  if (!soloNumerico) refrescarVivo();
  let p;
  let datos;
  let clase;
  let H;
  const entrada = leerEntrada();
  try {
    p = leerPlano(entrada);
    datos = leerProblemaPlano(entrada, nombresCampos(p.nombres));
    clase = clasificar(p);
    H = leerConservada(entrada.H, p);
    comprobarCondicionInicial(p.F, datos.t0, datos.Y0);
  } catch (err) {
    mostrarError(err);
    return;
  }
  const { F } = p;
  const { t0, Y0, tf } = datos;

  // Referencia fina. Si la solución deja de existir antes de tf, todo se integra
  // hasta un poco antes de la parada (como en la página de primer orden).
  let referencia = resolverDenso(F, t0, Y0, tf, TOL_REFERENCIA);
  const parada = referencia.sol.detenido;
  let tFin = tf;
  if (parada) {
    tFin = t0 + FRACCION_CORTE * (parada.x - t0);
    if (tFin === t0) { mostrarError(t("edo2.parada.inmediata")); return; }
    referencia = resolverDenso(F, t0, Y0, tFin, TOL_REFERENCIA);
  }

  $("error").hidden = true;
  const id = ++numeroCalculo;
  r = {
    id, p, entrada, ...datos, tf: tFin, tfPedido: tf, parada, clase, H, referencia,
    simbolico: null, pendiente: !clase.simbolico && !soloNumerico, errorSimbolico: null, estudio: null, exacta: null,
  };
  r.autonomo = clase.autonomo;
  // Jacobiano J(t, Y) para la rigidez y los métodos implícitos (simbólico si math.js sabe derivar).
  const Js = jacobianoSimbolico([p.f, p.g], p.args);
  r.Jt = Js ? (tt, [x, y]) => Js.fn(tt, x, y, ...p.valores) : (tt, [x, y]) => jacobianoNumerico((a, b) => F(tt, [a, b]), x, y);
  r.rigidez = rigidezSistema(r.Jt, referencia.sol.xs, referencia.sol.Ys);
  if (!soloNumerico) {
    // El deslizador empieza en h ≈ 1,6·(límite de Euler): ahí se ve la diferencia (Euler explota,
    // los implícitos no; con pasos mucho mayores, Euler implícito ya no pasa el salto rápido de
    // Van der Pol). Sin rigidez, a media escala.
    const L = Math.abs(tFin - t0);
    const [lo, hi] = [Math.log10(L / 2000), Math.log10(L / 4)];
    const objetivo = Number.isFinite(r.rigidez.hEuler) ? Math.log10(1.6 * r.rigidez.hEuler) : (lo + hi) / 2;
    $("pasoRigidez").value = String(Math.round(100 * Math.min(1, Math.max(0, (objetivo - lo) / (hi - lo)))));
  }
  r.ventana = datos.ventana ?? ventanaAuto(referencia.denso);
  r.Fxy = (x, y) => F(t0, [x, y]);

  // Métodos elegidos (con el paso h del usuario o su tolerancia).
  r.metodos = {};
  for (const m of entrada.metodos) {
    r.metodos[m] = m === "dopri"
      ? dormandPrinceSistema(F, t0, Y0, tFin, { rtol: r.tol, atol: r.tol * 1e-3 })
      : integrarSistemaConPaso(m, F, t0, Y0, tFin, r.h);
  }

  // Campo, nulclinas y equilibrios: solo tienen sentido si el sistema es autónomo.
  if (r.autonomo) {
    const { x: wx, y: wy } = r.ventana;
    // En pantallas estrechas, menos flechas: con 21 × 17 no se distinguen.
    const estrecho = window.innerWidth < 600;
    r.campo = campoVectorial(r.Fxy, wx, wy, estrecho ? { nx: 13, ny: 15 } : { nx: 21, ny: 17 });
    r.nulclinas = [0, 1].map((k) => rejilla((x, y) => r.Fxy(x, y)[k], wx, wy));
    const J = jacobianoSimbolico([p.f, p.g], p.args);
    r.jacobianoSimbolico = J;
    const Jfn = J ? (x, y) => J.fn(t0, x, y, ...p.valores) : (x, y) => jacobianoNumerico(r.Fxy, x, y);
    r.Jfn = Jfn;
    const busqueda = buscarEquilibrios(r.Fxy, Jfn, wx, wy);
    r.equilibrios = busqueda.equilibrios;
    r.demasiados = busqueda.demasiados;
    // Separatrices de las sillas (hasta 6: con más, el dibujo se satura).
    r.separatrices = r.equilibrios.filter((e) => e.tipo === "silla").slice(0, 6)
      .map((e) => separatrices(r.Fxy, e, r.ventana)).filter(Boolean);
  } else {
    r.campo = null;
    r.nulclinas = null;
    r.equilibrios = [];
    r.demasiados = false;
    r.separatrices = [];
  }

  // Las trayectorias añadidas se recalculan con el sistema nuevo (los parámetros pueden haber cambiado).
  for (const q of trayectorias) calcularTrayectoria(q);

  guardarEnURL(p.parametros);
  pintarTodo();
  $("resultados").hidden = false;
  if (desdeUsuario) llevarAlResultado($("resultados"));
  pedirEstudio(id, null);
  if (soloNumerico || clase.simbolico) return;

  // Parte simbólica: solo lineales (ver la cabecera).
  const texto = (s) => aPython(analizarFuncion(s));
  const peticion = p.modo === "orden2"
    ? resolverOrden2Simbolico(aPython(sustituirParametros(p.ec.F)), texto(entrada.t0), texto(entrada.x0), texto(entrada.y0))
    : resolverSistemaSimbolico(aPython(sustituirParametros(p.f)), aPython(sustituirParametros(p.g)), texto(entrada.t0), texto(entrada.x0), texto(entrada.y0));
  peticion.then((res) => {
    if (id !== numeroCalculo) return;
    r.simbolico = res;
    r.pendiente = false;
    r.exacta = compilarExacta(res, p.modo);
    if (r.exacta && !r.parada) {
      const fin = r.exacta(r.tf);
      if (fin.every(Number.isFinite)) pedirEstudio(id, fin);
    }
    pintarTodo();
  }).catch((err) => {
    if (id !== numeroCalculo) return;
    r.pendiente = false;
    r.errorSimbolico = err;
    pintarTodo();
  });
}

/** Solución exacta de SymPy -> t ↦ [x(t), y(t)] (en orden 2: [y, y']), o null. */
function compilarExacta(res, modo) {
  const textos = modo === "orden2" ? [res.particularMathjs, res.derivadaMathjs] : res.particularMathjs;
  if (!textos || textos.some((s) => !s)) return null;
  try {
    const fns = textos.map((s) => prepararExpresion(s, ["x"], { parametrosPermitidos: false }).fn);
    return (tt) => fns.map((fn) => fn(tt));
  } catch {
    return null;
  }
}

/** Estudio de convergencia en el Worker. `referencia`: Y(tf) exacto o null (el Worker calcula una). */
function pedirEstudio(id, referencia) {
  trabajadorNumerico.llamar("estudioSistema", [{
    sistema: { fuentes: [aJS(r.p.f), aJS(r.p.g)], argumentos: r.p.args, valores: r.p.valores },
    t0: r.t0, Y0: r.Y0, tf: r.tf, referencia,
  }]).then((res) => {
    if (id !== numeroCalculo) return;
    r.estudio = res;
    pintarNumerico();
  }).catch(() => { /* el Worker se reinicia solo; el resto de la página no depende de él */ });
}

// --- Trayectorias añadidas -------------------------------------------------------------------------

/**
 * Trayectoria desde un punto del plano. Si el sistema es autónomo da igual
 * cuándo se empieza: se integra hacia adelante y hacia atrás la misma duración
 * que la solución principal. Si no, se empieza en t₀ y se va hasta t final.
 */
function calcularTrayectoria(q) {
  const opciones = { rtol: 1e-8, atol: 1e-10, maxPasos: 20000 };
  const duracion = r.tf - r.t0;
  const tramos = [resolverDenso(r.p.F, r.t0, [q.x, q.y], r.t0 + duracion, opciones).denso];
  if (r.autonomo) tramos.unshift(resolverDenso(r.p.F, r.t0, [q.x, q.y], r.t0 - duracion, opciones).denso);
  q.xs = [];
  q.ys = [];
  tramos.forEach((d, k) => {
    const Ys = k === 0 && tramos.length === 2 ? [...d.Ys].reverse() : d.Ys;
    for (const Y of Ys) { q.xs.push(Y[0]); q.ys.push(Y[1]); }
  });
}

function anadirTrayectoria(x, y) {
  const { x: wx, y: wy } = r?.ventana ?? {};
  if (!r || !Number.isFinite(x) || !Number.isFinite(y) || x < wx[0] || x > wx[1] || y < wy[0] || y > wy[1]) return;
  const q = { x, y };
  calcularTrayectoria(q);
  trayectorias.push(q);
  if (trayectorias.length > 10) trayectorias.shift();
  pintarFase();
}

function conectarClicFase() {
  const div = $("graficaFase");
  div.addEventListener("click", (e) => {
    const zona = div.querySelector(".nsewdrag");
    if (!r || !zona || !div._fullLayout) return;
    const rect = zona.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    anadirTrayectoria(div._fullLayout.xaxis.p2d(e.clientX - rect.left), div._fullLayout.yaxis.p2d(e.clientY - rect.top));
  });
  $("formTrayectoria").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      anadirTrayectoria(leerNumero($("trayX").value, r?.p.nombres.x ?? "x"), leerNumero($("trayY").value, r?.p.nombres.y ?? "y"));
    } catch (err) {
      mostrarError(err);
    }
  });
  $("borrarTrayectorias").addEventListener("click", () => { trayectorias = []; if (r) pintarFase(); });
}

// --- Pintar ---------------------------------------------------------------------------------------

function pintarTodo() {
  pintarParada();
  pintarConfianza();
  pintarSolucion();
  pintarPasosPanel();
  pintarGraficas();
  pintarEstabilidad();
  pintarNumerico();
  pintarVerificacion();
  pintarCodigo();
}

/** Y de referencia en t: la exacta si la hay; si no, Dormand–Prince fino. */
const referenciaEn = (tt) => (r.exacta ? r.exacta(tt) : r.referencia.enT(tt));

/** Diferencia relativa máxima entre la solución exacta y la referencia numérica (null sin exacta). */
function diferenciaExacta() {
  if (!r.exacta) return null;
  let peor = 0;
  r.referencia.denso.xs.forEach((tt, i) => {
    if (i % 5) return;
    const a = r.exacta(tt);
    const b = r.referencia.denso.Ys[i];
    const d = normaMax(a.map((v, k) => v - b[k])) / Math.max(1, normaMax(b));
    if (Number.isFinite(d)) peor = Math.max(peor, d);
  });
  return peor;
}

function pintarParada() {
  const caja = $("avisoParada");
  caja.replaceChildren();
  caja.hidden = !r.parada;
  if (!r.parada) return;
  const v = r.p.nombres.t;
  caja.append(crear("p", null, t("edo2.parada.titulo", { var: v, tf: cifras(r.tfPedido, 6) })));
  caja.append(crear("p", null, t(`edo2.parada.${r.parada.motivo === "explota" ? "explota" : "otra"}`, { var: v, t: cifras(r.parada.x, 6) })));
  caja.append(crear("p", "muted", t("edo1.parada.corte", { var: v, corte: cifras(r.tf, 6) })));
}

function pintarConfianza() {
  const s = r.simbolico;
  const d = diferenciaExacta();
  let clase = "aviso";
  let texto;
  if (d !== null && d > 1e-6) {
    clase = "bad";
    texto = t("confianza.discrepancia");
  } else if (s?.particular) {
    clase = "ok";
    texto = t("confianza.edoExacta", { metodo: t(`metodoSimb.${s.metodo}`) });
  } else {
    texto = t("confianza.edoNumerica", { tol: cientifica(1e-12) });
  }
  if (r.pendiente) texto += ` · ${t("confianza.pendiente")}`;
  $("confianza").className = `badge ${clase}`;
  $("confianza").textContent = texto;
}

/** Por qué no hay solución simbólica (o null si la hay o se está calculando). */
function motivoSinSimbolico() {
  const s = r.simbolico;
  if (r.clase.simbolico) return t(`edo2.sinSimbolico.${r.clase.simbolico}`);
  if (r.pendiente) return null;
  if (r.errorSimbolico) return mensajeDeError(r.errorSimbolico);
  if (s && !s.metodo) return t(`edo2.sinSimbolico.${s.clase}`);
  if (s?.notas?.includes("sinEquilibrio")) return t("edo2.nota.sinEquilibrio");
  if (s?.notas?.includes("eulerSoloPositivo")) return t("edo2.nota.eulerSoloPositivo");
  return null;
}

function pintarSolucion() {
  const s = r.simbolico;
  const { p } = r;
  const n = p.nombres;
  pintarTex($("solucionEcuacion"), problemaTex(p, { t0: cifras(r.t0), x0: cifras(r.Y0[0]), y0: cifras(r.Y0[1]) }));
  const sistema = $("solucionSistema");
  sistema.replaceChildren();
  if (p.modo === "orden2") {
    sistema.append(textoConFormulas(crear("p", "muted"), t("edo2.sistemaEquivalente", { v: nombreVelocidad(p.ec.dependiente), x: p.ec.dependiente })));
    const m = crear("div", "math");
    pintarTex(m, sistemaEquivalenteTex(p));
    sistema.append(m);
  }
  const tipos = $("solucionTipos");
  tipos.replaceChildren();
  if (s?.metodo) tipos.append(crear("span", "etiqueta ok", t(`edo2.clase.${s.metodo === "sistemaLineal" ? `sis.${s.caso}` : s.metodo}`)));

  const general = $("solucionGeneral");
  const particular = $("solucionParticular");
  general.replaceChildren();
  particular.replaceChildren();
  const caja = (el, titulo, tex) => {
    el.append(crear("h3", null, titulo));
    const m = crear("div", "math");
    pintarTex(m, tex);
    el.append(m);
  };
  if (r.pendiente) {
    general.append(crear("p", "muted", t("solucion.edoCalculando")));
  } else if (s?.general) {
    caja(general, t("solucion.general"), s.general);
    if (s.particular) {
      caja(particular, t("solucion.particular"), p.modo === "orden2"
        ? `y(x) = ${s.particular}`
        : `\\begin{cases} x(t) = ${s.particular[0]} \\\\ y(t) = ${s.particular[1]} \\end{cases}`);
    }
  }
  const motivo = motivoSinSimbolico();
  if (motivo) general.append(crear("p", null, motivo));
  const nota = $("solucionNota");
  nota.textContent = p.modo === "orden2" && (n.t !== "x" || n.x !== "y") && s?.general
    ? t("edo2.nombres", { ind: n.t, dep: n.x }) : "";

  const eq = $("solucionEquilibrios");
  if (!r.autonomo) eq.textContent = t("edo2.equilibrios.noAutonomo");
  else eq.textContent = t(r.equilibrios.length === 1 ? "edo2.equilibrios.uno" : "edo2.equilibrios.resumen", { n: r.equilibrios.length });
  pintarTablaFinal();
}

/** Último valor de una solución si llegó a tf; si no, null. */
function valorFinal(sol) {
  const tt = sol.xs.at(-1);
  return !sol.detenido && Math.abs(tt - r.tf) <= 1e-9 * Math.max(1, Math.abs(r.tf)) ? sol.Ys.at(-1) : null;
}

function pintarTablaFinal() {
  const tabla = $("tablaFinal");
  tabla.replaceChildren();
  const n = r.p.nombres;
  const ref = referenciaEn(r.tf);
  const cab = crear("tr");
  const columnas = [t("edo1.col.metodo"), `${n.x}(${cifras(r.tf, 6)})`, `${n.y}(${cifras(r.tf, 6)})`, t("edo2.col.error"), t("numerico.col.evaluaciones")];
  for (const texto of columnas) {
    const th = crear("th", null, texto);
    th.scope = "col";
    cab.append(th);
  }
  tabla.append(crear("thead"));
  tabla.tHead.append(cab);
  const cuerpo = crear("tbody");
  const fila = (nombre, Y, error, evaluaciones) => {
    const tr = crear("tr");
    const th = crear("th", null, nombre);
    th.scope = "row";
    tr.append(th, crear("td", "num", Y ? cifras(Y[0], 12) : "—"), crear("td", "num", Y ? cifras(Y[1], 12) : "—"),
      crear("td", "num", error === null ? "—" : cientifica(error)), crear("td", "num", evaluaciones ?? "—"));
    cuerpo.append(tr);
  };
  fila(t(r.exacta ? "edo1.exacta" : "edo1.referencia"), ref, null, r.exacta ? null : String(r.referencia.sol.evaluaciones));
  for (const m of METODOS.filter((x) => r.metodos[x])) {
    const sol = r.metodos[m];
    const Y = valorFinal(sol);
    const error = Y ? normaMax(Y.map((v, k) => v - ref[k])) / Math.max(1, normaMax(ref)) : null;
    fila(t(`metodoEDO.${m}`), Y, error, String(sol.evaluaciones));
  }
  tabla.append(cuerpo);
}

function pintarPasosPanel() {
  const s = r.simbolico;
  $("pasos").replaceChildren();
  if (s?.pasos?.length) {
    $("pasosMetodo").textContent = t("edo2.pasos.metodo", { metodo: t(`metodoSimb.${s.metodo}`) });
    pintarPasos($("pasos"), s.pasos);
  } else {
    $("pasosMetodo").textContent = r.pendiente ? t("solucion.edoCalculando") : motivoSinSimbolico() ?? "";
  }
}

// --- Gráficas -----------------------------------------------------------------------------------------

/** Marcador de cada tipo de equilibrio: forma y color (relleno = atractor, hueco = repulsor). */
function estiloEquilibrio(e) {
  if (e.tipo === "silla") return { symbol: "x", color: colorSerie(1) };
  if (e.tipo === "centro") return { symbol: "diamond-open", color: colorSerie(4) };
  if (e.tipo === "degenerado") return { symbol: "square-open", color: coloresTema().secundario };
  return e.estabilidad === "asintotica" ? { symbol: "circle", color: colorSerie(2) } : { symbol: "circle-open", color: colorSerie(1) };
}

function trazasEquilibrios() {
  const grupos = new Map();
  r.equilibrios.forEach((e, i) => {
    if (!grupos.has(e.tipo)) grupos.set(e.tipo, []);
    grupos.get(e.tipo).push({ ...e, i });
  });
  return [...grupos].map(([tipoE, lista]) => {
    const estilo = estiloEquilibrio(lista[0]);
    return {
      x: lista.map((e) => e.x), y: lista.map((e) => e.y), type: "scatter", mode: "markers", name: t(`equilibrio.${tipoE}`),
      text: lista.map((e) => `E${e.i + 1}`),
      marker: { size: 13, symbol: estilo.symbol, color: estilo.color, line: { width: 2.5, color: estilo.color } },
      hovertemplate: `%{text} · ${t(`equilibrio.${tipoE}`)}<br>(%{x:.6g}, %{y:.6g})<extra></extra>`,
    };
  });
}

function pintarFase() {
  const n = r.p.nombres;
  const { x: wx, y: wy } = r.ventana;
  $("textoFase").textContent = t(r.autonomo ? "edo2.fase.ayuda" : "edo2.fase.noAutonomo");
  dibujar($("graficaFase"), () => {
    const c = coloresTema();
    const datos = [];
    if (r.campo) {
      datos.push({ x: r.campo.xs, y: r.campo.ys, type: "scatter", mode: "lines", line: { color: c.secundario, width: 1 }, name: t("edo2.fase.campo"), hoverinfo: "skip" });
      r.nulclinas.forEach((z, k) => datos.push({
        type: "contour", x: z.x, y: z.y, z: z.z, contours: { start: 0, end: 0, size: 1, coloring: "none" },
        line: { color: colorSerie(k === 0 ? 5 : 4), width: 2, dash: k === 0 ? "dot" : "dash" }, showscale: false, showlegend: true,
        name: t("edo2.nulclina", { var: k === 0 ? n.x : n.y }), hoverinfo: "skip",
      }));
    }
    // Separatrices: una traza por variedad, con las ramas separadas por null. La estable va
    // discontinua y encima: cuando coinciden (órbitas heteroclínicas, como en el péndulo) se ven las dos.
    for (const [clave, color, dash] of [["inestables", colorSerie(1), "solid"], ["estables", colorSerie(2), "dash"]]) {
      const ramas = r.separatrices.flatMap((s) => s[clave]);
      if (!ramas.length) continue;
      datos.push({ x: ramas.flatMap((q) => [...q.xs, null]), y: ramas.flatMap((q) => [...q.ys, null]), type: "scatter", mode: "lines",
        line: { color, width: 1.8, dash }, name: t(`edo2.separatriz.${clave}`), hoverinfo: "skip" });
    }
    datos.push({ x: r.referencia.denso.Ys.map((Y) => Y[0]), y: r.referencia.denso.Ys.map((Y) => Y[1]), type: "scatter", mode: "lines",
      line: { color: colorSerie(0), width: 3 }, name: t("edo1.solucionNumerica") });
    trayectorias.forEach((q, i) => datos.push({ x: q.xs, y: q.ys, type: "scatter", mode: "lines", line: { color: colorSerie(3), width: 1.6 },
      name: t("edo2.trayectorias"), legendgroup: "tray", showlegend: i === 0, hoverinfo: "skip" }));
    datos.push({ x: [r.Y0[0], ...trayectorias.map((q) => q.x)], y: [r.Y0[1], ...trayectorias.map((q) => q.y)], type: "scatter", mode: "markers",
      marker: { size: 9, color: c.texto, line: { color: c.acento, width: 2 } }, name: t("edo1.condicionesIniciales") });
    datos.push(...trazasEquilibrios());
    return { datos, diseno: disenoBase({ tituloX: n.x, tituloY: n.y, dragmode: false, showlegend: true, xaxis: { range: wx }, yaxis: { range: wy } }) };
  });
}

function pintarGraficas() {
  pintarFase();
  const n = r.p.nombres;
  const { xs, Ys } = r.referencia.denso;
  // Series temporales x(t), y(t), con la exacta superpuesta si la hay.
  dibujar($("graficaSeries"), () => {
    const datos = [0, 1].map((k) => ({ x: xs, y: Ys.map((Y) => Y[k]), type: "scatter", mode: "lines", line: { color: colorSerie(k === 0 ? 0 : 2), width: 2.5 },
      name: `${k === 0 ? n.x : n.y}(${n.t})` }));
    if (r.exacta) {
      // Unos 50 marcadores: más taparían las curvas.
      const salto = Math.max(1, Math.ceil(xs.length / 50));
      const muestra = xs.filter((_, i) => i % salto === 0);
      for (const k of [0, 1]) {
        datos.push({ x: muestra, y: muestra.map((tt) => r.exacta(tt)[k]), type: "scatter", mode: "markers",
          marker: { size: 6, symbol: `${SIMBOLOS[k + 1]}-open`, color: coloresTema().texto, line: { width: 1.5 } },
          name: `${k === 0 ? n.x : n.y} ${t("edo2.exactaCorta")}` });
      }
    }
    return { datos, diseno: disenoBase({ tituloX: n.t, showlegend: true }) };
  });
  // Cada método en el plano de fase (mismos ejes que el retrato).
  dibujar($("graficaMetodos"), () => {
    const datos = [{ x: Ys.map((Y) => Y[0]), y: Ys.map((Y) => Y[1]), type: "scatter", mode: "lines", line: { color: coloresTema().texto, width: 2, dash: "dot" },
      name: t(r.exacta ? "edo1.exacta" : "edo1.referencia") }];
    for (const m of METODOS.filter((x) => r.metodos[x])) {
      const sol = r.metodos[m];
      const i = COLOR_METODO[m];
      datos.push({ x: sol.Ys.map((Y) => Y[0]), y: sol.Ys.map((Y) => Y[1]), type: "scatter", mode: sol.xs.length > 120 ? "lines" : "lines+markers", name: t(`metodoEDO.${m}`),
        line: { color: colorSerie(i), width: 2 }, marker: { symbol: SIMBOLOS[i], size: 5, color: colorSerie(i) } });
    }
    return { datos, diseno: disenoBase({ tituloX: n.x, tituloY: n.y, showlegend: true, xaxis: { range: r.ventana.x }, yaxis: { range: r.ventana.y } }) };
  });
}

// --- Estabilidad ----------------------------------------------------------------------------------------

/** Autovalores en LaTeX: «λ₁, λ₂» si son reales; «α ± βi» si son un par complejo conjugado. */
function autovaloresTex([l1, l2]) {
  if (l1.im === 0) return `${cifras(l1.re, 6)},\\; ${cifras(l2.re, 6)}`;
  const beta = `${cifras(Math.abs(l1.im), 6)}\\,i`;
  return l1.re === 0 ? `\\pm ${beta}` : `${cifras(l1.re, 6)} \\pm ${beta}`;
}
const matrizTex = (J) => `\\begin{pmatrix} ${cifras(J[0][0], 6)} & ${cifras(J[0][1], 6)} \\\\ ${cifras(J[1][0], 6)} & ${cifras(J[1][1], 6)} \\end{pmatrix}`;

function pintarEstabilidad() {
  const texto = $("textoEstabilidad");
  const tabla = $("tablaEquilibrios");
  const detalle = $("detalleEquilibrios");
  tabla.replaceChildren();
  detalle.replaceChildren();
  const n = r.p.nombres;
  const hay = r.autonomo && r.equilibrios.length > 0;
  $("bloqueTrazaDet").hidden = !hay;
  if (!r.autonomo) { texto.textContent = t("edo2.estabilidad.noAutonomo"); return; }
  if (!r.equilibrios.length) {
    texto.textContent = t("edo2.estabilidad.ninguno", { x: n.x, y: n.y });
    return;
  }
  textoConFormulas(texto, t(r.demasiados ? "edo2.estabilidad.demasiados" : "edo2.estabilidad.intro", { n: r.equilibrios.length }));

  const cab = crear("tr");
  for (const clave of ["edo2.col.equilibrio", "edo2.col.punto", "edo2.col.tipo", "edo2.col.estabilidad", "edo2.col.autovalores"]) {
    const th = crear("th", null, t(clave));
    th.scope = "col";
    cab.append(th);
  }
  tabla.append(crear("thead"));
  tabla.tHead.append(cab);
  const cuerpo = crear("tbody");
  r.equilibrios.forEach((e, i) => {
    const tr = crear("tr");
    const th = crear("th", null, `E${i + 1}`);
    th.scope = "row";
    const autovalores = crear("td", "num");
    pintarTex(autovalores, autovaloresTex(e.lambdas), false);
    tr.append(th, crear("td", "num", `(${cifras(e.x, 6)}, ${cifras(e.y, 6)})`), crear("td", null, t(`equilibrio.${e.tipo}`)),
      crear("td", null, t(`estabilidad.${e.estabilidad}`)), autovalores);
    cuerpo.append(tr);
  });
  tabla.append(cuerpo);

  // Una ficha por equilibrio: jacobiano, autovalores, autovectores y la advertencia de Hartman–Grobman.
  const lineal = r.clase.lineal === true;
  // Para el enlace a la calculadora: el sistema con números y los nombres que ve el usuario.
  const [f, g] = [r.p.f, r.p.g].map(sustituirParametros);
  const nombres = r.p.modo === "orden2" ? [r.p.ec.dependiente, nombreVelocidad(r.p.ec.dependiente)] : ["x", "y"];
  r.equilibrios.slice(0, MAX_DETALLES).forEach((e, i) => {
    const ficha = crear("details", "ficha-equilibrio");
    if (i === 0) ficha.open = true;
    ficha.append(crear("summary", null, `E${i + 1} = (${cifras(e.x, 6)}, ${cifras(e.y, 6)}) · ${t(`equilibrio.${e.tipo}`)}`));
    const formula = (tex) => { const m = crear("div", "math"); pintarTex(m, tex); ficha.append(m); };
    formula(`J(E_{${i + 1}}) = ${matrizTex(e.J)}, \\quad T = ${cifras(e.T, 6)}, \\quad D = ${cifras(e.D, 6)}, \\quad T^2 - 4D = ${cifras(e.disc, 6)}`);
    formula(`\\lambda_{1,2} = \\frac{T \\pm \\sqrt{T^2 - 4D}}{2} = ${autovaloresTex(e.lambdas)}`);
    if (e.vectores) {
      formula(e.vectores.map((v, k) => `\\vec v_${k + 1} = \\begin{pmatrix} ${cifras(v[0], 5)} \\\\ ${cifras(v[1], 5)} \\end{pmatrix}`).join(",\\quad "));
    }
    ficha.append(textoConFormulas(crear("p"), t(`edo2.explica.${e.tipo}`)));
    if (!e.hiperbolico) ficha.append(textoConFormulas(crear("p", "aviso"), t(lineal ? "edo2.hartman.lineal" : "edo2.hartman.noLineal")));
    else if (!lineal) ficha.append(textoConFormulas(crear("p", "muted"), t("edo2.hartman.hiperbolico")));
    const url = enlaceJacobiano(f, g, nombres, [e.x, e.y]);
    if (url) {
      const enlace = Object.assign(crear("a", "accion enlace-jacobiano", t("edo2.verJacobiano")), { href: url, target: "_blank", rel: "noopener" });
      const parrafo = crear("p");
      parrafo.append(enlace);
      ficha.append(parrafo);
    }
    detalle.append(ficha);
  });
  if (r.equilibrios.length > MAX_DETALLES) detalle.append(crear("p", "muted", t("edo2.estabilidad.masFichas", { n: MAX_DETALLES })));
  pintarTrazaDet();
}

function pintarTrazaDet() {
  const T = r.equilibrios.map((e) => e.T);
  const D = r.equilibrios.map((e) => e.D);
  const Tm = Math.max(2, 1.25 * Math.max(...T.map(Math.abs)));
  const Dm = Math.max((Tm * Tm) / 4, 1.25 * Math.max(0, ...D), 1);
  const Dlo = Math.min(-0.4 * Dm, 1.25 * Math.min(...D));
  // Equilibrios con el mismo (T, D) (p. ej. los centros del péndulo) comparten marcador y rótulo.
  const grupos = new Map();
  r.equilibrios.forEach((e, i) => {
    const clave = `${e.T.toPrecision(6)}|${e.D.toPrecision(6)}`;
    if (!grupos.has(clave)) grupos.set(clave, { e, nombres: [] });
    grupos.get(clave).nombres.push(`E${i + 1}`);
  });
  dibujar($("graficaTrazaDet"), () => {
    const c = coloresTema();
    const ts = Array.from({ length: 201 }, (_, i) => -Tm + (2 * Tm * i) / 200);
    const datos = [
      { x: ts, y: ts.map((v) => (v * v) / 4), type: "scatter", mode: "lines", line: { color: c.secundario, width: 2 }, name: t("edo2.trazaDet.parabola"), hoverinfo: "skip" },
      { x: [0, 0], y: [0, Dm * 1.1], type: "scatter", mode: "lines", line: { color: colorSerie(4), width: 2, dash: "dash" }, name: t("edo2.trazaDet.centros"), hoverinfo: "skip" },
      ...[...grupos.values()].map(({ e, nombres }) => {
        const estilo = estiloEquilibrio(e);
        const rotulo = nombres.join(", ");
        return { x: [e.T], y: [e.D], type: "scatter", mode: "markers+text", text: [rotulo], textposition: "top right", showlegend: false,
          textfont: { color: c.texto },
          marker: { size: 12, symbol: estilo.symbol, color: estilo.color, line: { width: 2.5, color: estilo.color } },
          hovertemplate: `${rotulo} · ${t(`equilibrio.${e.tipo}`)}<br>T = %{x:.4g}, D = %{y:.4g}<extra></extra>` };
      }),
    ];
    const rotulo = (x, y, clave) => ({ x, y, text: t(clave), showarrow: false, font: { color: c.secundario, size: 12 } });
    const diseno = disenoBase({
      tituloX: t("edo2.trazaDet.ejeT"), tituloY: t("edo2.trazaDet.ejeD"), showlegend: true,
      xaxis: { range: [-Tm, Tm] }, yaxis: { range: [Dlo, 1.1 * Dm] },
      annotations: [
        rotulo(0.55 * Tm, 0.5 * Dlo, "edo2.region.sillas"),
        rotulo(-0.45 * Tm, 0.85 * Dm, "edo2.region.focosEstables"), rotulo(0.45 * Tm, 0.85 * Dm, "edo2.region.focosInestables"),
        rotulo(-0.8 * Tm, 0.06 * Dm, "edo2.region.nodosEstables"), rotulo(0.8 * Tm, 0.06 * Dm, "edo2.region.nodosInestables"),
      ],
    });
    return { datos, diseno };
  });
}

// --- Numérico -------------------------------------------------------------------------------------------

function pintarNumerico() {
  const est = r.estudio;
  $("numericoNota").textContent = !est ? t("edo1.estudio.calculando")
    : !est.estudio ? t("edo2.estudio.sinReferencia")
      : t(est.fuenteReferencia === "exacta" ? "edo2.estudio.exacta" : "edo2.estudio.numerica",
        { var: r.p.nombres.t, t: cifras(r.tf, 6), valor: est.referencia.map((v) => cifras(v, 12)).join(", ") });
  const tabla = $("tablaOrdenes");
  tabla.replaceChildren();
  if (est?.estudio) {
    const cab = crear("tr");
    for (const clave of ["numerico.col.metodo", "edo1.col.teorico", "edo1.col.observado"]) {
      const th = crear("th", null, t(clave));
      th.scope = "col";
      cab.append(th);
    }
    tabla.append(crear("thead"));
    tabla.tHead.append(cab);
    const cuerpo = crear("tbody");
    for (const m of ["euler", "heun", "rk4"]) {
      const e = est.estudio[m];
      const tr = crear("tr");
      const th = crear("th", null, t(`metodoEDO.${m}`));
      th.scope = "row";
      tr.append(th, crear("td", "num", String(e.ordenTeorico)), crear("td", "num", e.observado ? e.observado.pendiente.toFixed(2) : "—"));
      cuerpo.append(tr);
    }
    tabla.append(cuerpo);
    const ejeLog = { type: "log", exponentformat: "power" };
    const serie = (m, puntos, xDe, extra = "") => ({
      x: puntos.map(xDe), y: puntos.map((q) => (q.error > 0 ? q.error : null)), type: "scatter", mode: "lines+markers",
      name: `${t(`metodoEDO.${m}`)}${extra}`, line: { color: colorSerie(COLOR_METODO[m]), width: 2 },
      marker: { symbol: SIMBOLOS[COLOR_METODO[m]], size: 8, color: colorSerie(COLOR_METODO[m]) },
    });
    dibujar($("graficaConvergencia"), () => ({
      datos: ["euler", "heun", "rk4"].map((m) => {
        const e = est.estudio[m];
        const extra = e.observado ? ` · ${t("edo1.pendiente", { p: e.observado.pendiente.toFixed(2), teorico: e.ordenTeorico })}` : "";
        return serie(m, e.puntos, (q) => q.h, extra);
      }),
      diseno: disenoBase({ tituloX: t("numerico.ejeH"), tituloY: t("numerico.ejeError"), xaxis: { ...ejeLog, autorange: "reversed" }, yaxis: ejeLog, showlegend: true }),
    }));
    dibujar($("graficaEvaluaciones"), () => ({
      datos: METODOS.map((m) => serie(m, est.estudio[m].puntos, (q) => q.evaluaciones)),
      diseno: disenoBase({ tituloX: t("numerico.ejeEvaluaciones"), tituloY: t("numerico.ejeError"), xaxis: ejeLog, yaxis: ejeLog, showlegend: true }),
    }));
  }
  pintarDeriva();
  pintarRigidez();
}

/** Paso del deslizador de rigidez: escala logarítmica entre L/2000 y L/4. */
function pasoRigidez() {
  const L = Math.abs(r.tf - r.t0);
  const s = Number($("pasoRigidez").value) / 100;
  const [lo, hi] = [Math.log10(L / 2000), Math.log10(L / 4)];
  return 10 ** (lo + s * (hi - lo));
}

/**
 * Euler explícito frente a Euler implícito y trapecio implícito con el paso
 * elegido, y el límite de estabilidad de Euler según los autovalores del
 * jacobiano a lo largo de la solución.
 */
function pintarRigidez() {
  const n = r.p.nombres;
  const { lambda, hEuler } = r.rigidez;
  const dp = r.metodos.dopri ?? dormandPrinceSistema(r.p.F, r.t0, r.Y0, r.tf, { rtol: r.tol, atol: r.tol * 1e-3 });
  const texto = $("textoRigidez");
  if (!lambda || !(lambda.re < 0)) {
    texto.textContent = t("edo2.rigidez.noNegativo");
  } else {
    textoConFormulas(texto, t("edo2.rigidez.texto", {
      lambda: lambda.im === 0 ? cifras(lambda.re, 4) : `${cifras(lambda.re, 4)} \\pm ${cifras(Math.abs(lambda.im), 4)}\\,i`,
      heuler: cifras(hEuler, 3), pasos: dp.pasos.length, rechazados: dp.rechazados, tol: cientifica(r.tol),
    }));
  }
  const h = pasoRigidez();
  $("pasoRigidezValor").textContent = cifras(h, 3);
  const N = Math.max(1, Math.round(Math.abs(r.tf - r.t0) / h));
  const curvas = [
    ["euler", integrarSistemaConPaso("euler", r.p.F, r.t0, r.Y0, r.tf, h), 1],
    ["eulerImplicito", integrarImplicitoSistema("eulerImplicito", r.p.F, r.Jt, r.t0, r.Y0, r.tf, N), 2],
    ["trapecioImplicito", integrarImplicitoSistema("trapecioImplicito", r.p.F, r.Jt, r.t0, r.Y0, r.tf, N), 4],
  ];
  const { xs, Ys } = r.referencia.denso;
  const rango = rangoRobusto(Ys.map((Y) => Y[0])) ?? [-5, 5];
  dibujar($("graficaRigidez"), () => ({
    datos: [
      { x: xs, y: xs.map((tt) => referenciaEn(tt)[0]), type: "scatter", mode: "lines", line: { color: coloresTema().texto, width: 2, dash: "dot" },
        name: t(r.exacta ? "edo1.exacta" : "edo1.referencia") },
      ...curvas.map(([m, sol, i]) => ({ x: sol.xs, y: sol.Ys.map((Y) => Y[0]), type: "scatter", mode: sol.xs.length > 150 ? "lines" : "lines+markers",
        name: t(`metodoEDO.${m}`), line: { color: colorSerie(i), width: 2 }, marker: { symbol: SIMBOLOS[i], size: 5, color: colorSerie(i) } })),
    ],
    // Rango fijo: si Euler explota, se sale de la gráfica en vez de aplastar las demás curvas.
    diseno: disenoBase({ tituloX: n.t, tituloY: n.x, showlegend: true, yaxis: { range: rango } }),
  }));
  const fallo = curvas.find(([m, sol]) => m !== "euler" && sol.detenido?.motivo === "newton");
  textoConFormulas($("textoRigidezH"), fallo ? t("edo2.rigidez.newton", { h: cifras(h, 3) })
    : !Number.isFinite(hEuler) ? t("edo1.rigidez.h.sinLambda", { h: cifras(h, 3) })
      : t(h > hEuler ? "edo2.rigidez.h.inestable" : "edo2.rigidez.h.estable", { h: cifras(h, 3), heuler: cifras(hEuler, 3) }));
}

/** Deriva de la cantidad conservada H en cada método: |H(Y_n) − H(Y_0)|. */
function pintarDeriva() {
  const div = $("graficaDeriva");
  const texto = $("textoDeriva");
  div.hidden = !r.H;
  if (!r.H) { texto.textContent = t("edo2.deriva.sinH"); return; }
  const H0 = r.H(...r.Y0);
  const conservacion = conservaH();
  textoConFormulas(texto, t(conservacion.conserva ? "edo2.deriva.ayuda" : "edo2.deriva.noConserva", { error: cientifica(conservacion.peor) }));
  dibujar(div, () => ({
    datos: METODOS.filter((m) => r.metodos[m]).map((m) => {
      const sol = r.metodos[m];
      const i = COLOR_METODO[m];
      return { x: sol.xs, y: sol.Ys.map((Y) => { const d = Math.abs(r.H(...Y) - H0); return d > 0 && Number.isFinite(d) ? d : null; }),
        type: "scatter", mode: "lines", name: t(`metodoEDO.${m}`), line: { color: colorSerie(i), width: 2 } };
    }),
    diseno: disenoBase({ tituloX: r.p.nombres.t, tituloY: t("edo2.deriva.ejeY"), showlegend: true, yaxis: { type: "log", exponentformat: "power" } }),
  }));
}

/** ¿H se conserva de verdad? Se mide a lo largo de la referencia fina (tol. 10⁻¹²). */
function conservaH() {
  const H0 = r.H(...r.Y0);
  let peor = 0;
  for (const Y of r.referencia.denso.Ys) {
    const d = Math.abs(r.H(...Y) - H0) / Math.max(1, Math.abs(H0));
    if (Number.isFinite(d)) peor = Math.max(peor, d);
  }
  return { conserva: peor < 1e-7, peor };
}

// --- Verificación -----------------------------------------------------------------------------------------

function itemVerificacion(estado, clave, datos = {}) {
  const li = crear("li", `verif ${estado}`);
  li.append(crear("span", "verif-icono", { ok: "✓", bad: "✗", aviso: "!", pendiente: "…" }[estado]));
  const texto = crear("span");
  textoConFormulas(texto, t(clave, datos));
  li.append(texto);
  $("verificacion").append(li);
}

function pintarVerificacion() {
  $("verificacion").replaceChildren();
  const s = r.simbolico;
  if (r.pendiente) itemVerificacion("pendiente", "verif.pendiente");
  const v = s?.verificacion;
  if (v) {
    itemVerificacion(v.simbolica ? "ok" : "bad", v.simbolica ? "verif.edo2Residuo" : "verif.edoResiduoFalla", { residuo: v.residuo });
    itemVerificacion(v.ci ? "ok" : "bad", v.ci ? "verif.edoCI" : "verif.edoCIFalla");
  }
  const d = diferenciaExacta();
  if (d !== null) itemVerificacion(d < 1e-6 ? "ok" : "bad", "verif.edoNumerica", { error: cientifica(d) });
  else if (!r.pendiente) itemVerificacion("aviso", "verif.edoSoloNumerica");

  // RK4 con muchos pasos frente a Dormand–Prince fino: dos métodos distintos deben coincidir.
  const rk4 = integrarSistemaConPaso("rk4", r.p.F, r.t0, r.Y0, r.tf, Math.abs(r.tf - r.t0) / 4000);
  const ref = r.referencia.enT(r.tf);
  if (!rk4.detenido) {
    const dif = normaMax(rk4.Ys.at(-1).map((y, k) => y - ref[k])) / Math.max(1, normaMax(ref));
    itemVerificacion(dif < 1e-6 ? "ok" : "aviso", "verif.edo2Cruzada", { diferencia: cientifica(dif), t: `${r.p.nombres.t} = ${cifras(r.tf, 6)}` });
  }
  if (r.equilibrios.length) {
    const residuo = Math.max(...r.equilibrios.map((e) => normaMax(r.Fxy(e.x, e.y))));
    itemVerificacion(residuo < 1e-8 ? "ok" : "aviso", "verif.edo2Equilibrios", { n: r.equilibrios.length, residuo: cientifica(residuo) });
    if (r.jacobianoSimbolico) {
      // Jacobiano simbólico (math.js) frente a diferencias centradas.
      const peor = Math.max(...r.equilibrios.map((e) => {
        const Jn = jacobianoNumerico(r.Fxy, e.x, e.y);
        return Math.max(...e.J.flat().map((a, k) => Math.abs(a - Jn.flat()[k]) / Math.max(1, Math.abs(a))));
      }));
      itemVerificacion(peor < 1e-5 ? "ok" : "aviso", "verif.edo2Jacobiano", { error: cientifica(peor) });
    }
  }
  if (r.H) {
    const c = conservaH();
    itemVerificacion(c.conserva ? "ok" : "aviso", c.conserva ? "verif.edo2Conservada" : "verif.edo2NoConservada", { error: cientifica(c.peor) });
  }
  if (r.errorSimbolico) itemVerificacion("aviso", "verif.sinSimbolico", { detalle: mensajeDeError(r.errorSimbolico) });
}

// --- Código y exportación ----------------------------------------------------------------------------------

function textoPython() {
  const { p } = r;
  const textoOriginal = p.modo === "orden2" ? r.entrada.ecuacion : `x' = ${r.entrada.f}, y' = ${r.entrada.g}`;
  const lineal = r.simbolico?.metodo;
  return codigoPlano({
    f: sustituirParametros(p.f), g: sustituirParametros(p.g), textoOriginal, nombres: p.nombres,
    t0: r.t0, Y0: r.Y0, tf: r.tf, equilibrios: r.equilibrios,
    simbolico: !lineal ? null : p.modo === "orden2" ? { tipo: "orden2", F: sustituirParametros(p.ec.F) } : { tipo: "sistema" },
  });
}

function pintarCodigo() {
  $("codigoPython").textContent = textoPython();
}

function latexSolucion() {
  const s = r.simbolico;
  const lineas = [problemaTex(r.p, { t0: cifras(r.t0), x0: cifras(r.Y0[0]), y0: cifras(r.Y0[1]) })];
  if (s?.general) lineas.push(s.general);
  if (s?.particular) lineas.push(Array.isArray(s.particular) ? `x(t) = ${s.particular[0]}, \\quad y(t) = ${s.particular[1]}` : `y = ${s.particular}`);
  return lineas.join("\n");
}

function csvActual() {
  const filas = [["metodo", "t", "x", "y"]];
  for (const m of METODOS.filter((x) => r.metodos[x])) r.metodos[m].xs.forEach((tt, i) => filas.push([m, tt, ...r.metodos[m].Ys[i]]));
  r.referencia.denso.xs.forEach((tt, i) => filas.push([r.exacta ? "exacta" : "referencia", tt, ...(r.exacta ? r.exacta(tt) : r.referencia.denso.Ys[i])]));
  for (const [i, e] of r.equilibrios.entries()) filas.push([`equilibrio E${i + 1} (${e.tipo})`, "", e.x, e.y]);
  return aCSV(filas);
}

function avisarCopia(boton, ok) {
  const original = boton.textContent;
  boton.textContent = t(ok ? "exportar.copiado" : "exportar.noCopiado");
  $("avisoCopia").textContent = t(ok ? "exportar.copiado" : "exportar.noCopiado");
  setTimeout(() => { boton.textContent = original; }, 1600);
}

function conectarExportar() {
  $("copiarEnlace").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(location.href)));
  $("copiarLatex").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(latexSolucion())));
  $("descargarCsv").addEventListener("click", () => descargarTexto(csvActual(), "diffeq-lab-edo2.csv", "text/csv"));
  $("descargarPy").addEventListener("click", () => descargarTexto(textoPython(), "diffeq_lab_edo2.py", "text/x-python"));
  $("copiarPy").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(textoPython())));
  $("descargarPng").addEventListener("click", () => {
    const panel = document.querySelector(".panel:not([hidden])");
    descargarPNG(panel?.querySelector(".js-plotly-plot") ?? $("graficaFase"), "diffeq-lab-edo2");
  });
}

// --- Tipo de problema, estado en la URL, ejemplos y arranque ------------------------------------------------

function ponerTipo(nuevo) {
  tipo = nuevo;
  $("tipoOrden2").setAttribute("aria-pressed", String(tipo === "orden2"));
  $("tipoSistema").setAttribute("aria-pressed", String(tipo === "sistema"));
  $("bloqueOrden2").hidden = tipo !== "orden2";
  $("bloqueSistema").hidden = tipo !== "sistema";
  if (tipo === "sistema") pintarAyudaConservada(null);
}

function guardarEnURL(parametros) {
  const e = leerEntrada();
  const comun = { tipo: e.tipo, t0: e.t0, x0: e.x0, y0: e.y0, tf: e.tf, h: e.h, tol: e.tol, xmin: e.xmin, xmax: e.xmax, ymin: e.ymin, ymax: e.ymax, H: e.H };
  history.replaceState(null, "", escribirFragmento({
    ...(e.tipo === "orden2" ? { e: e.ecuacion } : { f: e.f, g: e.g }), ...comun,
    parametros: Object.fromEntries(parametros.map((q) => [q, valoresParametros[q]])),
  }));
}

function cargarEstado({ tipo: nuevo = "orden2", ecuacion, e, f = "", g = "", t0 = "0", x0 = "1", y0 = "0", tf = "10", h = "", tol = "1e-6",
  xmin = "", xmax = "", ymin = "", ymax = "", H = "", parametros = {} }) {
  ponerTipo(nuevo === "sistema" ? "sistema" : "orden2");
  campoEc.fijar(nuevo === "sistema" ? "" : ecuacion ?? e ?? "");
  campoF.fijar(f);
  campoG.fijar(g);
  for (const [id, valor] of Object.entries({ t0, x0, y0, tf, paso: h, tolerancia: tol, xmin, xmax, ymin, ymax, conservada: H })) $(id).value = valor;
  Object.assign(valoresParametros, parametros);
  parametrosActuales = null;
  trayectorias = [];
  refrescarVivo();
}

function pintarEjemplos() {
  for (const e of EJEMPLOS.filter((x) => x.modulo === "edo2")) {
    const boton = crear("button", "chip", t(`ejemplo.${e.id}`));
    boton.type = "button";
    boton.addEventListener("click", () => { cargarEstado(e.datos); calcular({}); });
    $("ejemplos").append(boton);
  }
}

function estadoInicial() {
  const u = leerFragmento(location.hash);
  if (u.ejemplo && buscarEjemplo(u.ejemplo)?.modulo === "edo2") return buscarEjemplo(u.ejemplo).datos;
  if (u.e || u.f || u.g) return u;
  return buscarEjemplo("pendulo").datos;
}

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
  const alEnter = () => calcular({ desdeUsuario: true });
  campoEc = crearCampoFormula({
    contenedor: $("campoEcuacion"), id: "ecuacion", etiquetaAria: t("edo2.ecuacion"), ejemplo: t("edo2.ecuacion.ejemplo"),
    aCodigo: (latex) => latexEcuacionACodigo(latex, (s) => latexACodigo(s, "ecuación")),
    aLatex: (codigo) => (codigo.trim() === "" ? "" : ecuacionTex(leerEcuacion(codigo))),
    alCambiar: programarVivo, alEnter,
  });
  campoF = crearCampoFormula({ contenedor: $("campoF"), id: "sisF", etiquetaAria: "x′", ejemplo: "y", alCambiar: programarVivo, alEnter });
  campoG = crearCampoFormula({ contenedor: $("campoG"), id: "sisG", etiquetaAria: "y′", ejemplo: "-x - 0.5*y", alCambiar: programarVivo, alEnter });
  conectarSelectorModo({ botonVisual: $("modoVisual"), botonCodigo: $("modoCodigo"), aviso: $("avisoModo"), campos: () => [campoEc, campoF, campoG], t });
  conectarPestanas(document.querySelector('[role="tablist"]'), { alCambiar: (_id, panel) => reajustar(panel) });
  for (const [boton, valor] of [["tipoOrden2", "orden2"], ["tipoSistema", "sistema"]]) {
    $(boton).addEventListener("click", () => {
      if (valor === tipo) return;
      // H está escrita con las variables del otro tipo (posición y velocidad, o x e y): no sirve.
      $("conservada").value = "";
      ponerTipo(valor);
      refrescarVivo();
    });
  }
  for (const id of ["t0", "x0", "y0", "tf", "conservada"]) {
    $(id).addEventListener("input", programarVivo);
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") alEnter(); });
  }
  $("calcular").addEventListener("click", alEnter);
  $("pasoRigidez").addEventListener("input", () => { if (r) pintarRigidez(); });
  alEstadoSimbolico(({ estado, paso }) => {
    $("estadoSimbolico").textContent = estado === "cargando" ? t(`simbolico.cargando.${paso ?? "pyodide"}`) : "";
  });
  conectarClicFase();
  conectarExportar();
  pintarEjemplos();
  cargarEstado(estadoInicial());
  calcular({});
}

iniciar();
