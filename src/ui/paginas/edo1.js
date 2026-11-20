// Página de EDO de primer orden (Fase 1b).
//
// Flujo de un cálculo (igual que en integrales):
//   1. Se lee la ecuación con notación flexible y se lleva a y' = f(x, y).
//   2. Lo numérico se calcula al momento: solución de referencia (Dormand–Prince
//      con tolerancia muy fina), cada método elegido, el campo de direcciones y
//      la rigidez. Tarda milisegundos.
//   3. El estudio de convergencia (cientos de integraciones) va a un Web Worker.
//   4. Lo simbólico va al Worker de Pyodide. Si llega una solución exacta, los
//      errores se miden contra ella; si no, contra la referencia numérica.
//   Cada cálculo lleva un número y se descartan las respuestas de cálculos viejos.

import { math, mathDisponible } from "../../../comun/js/mathjs.js";
import { analizarFuncion } from "../../../comun/js/entrada/analizar.js";
import { latexACodigo } from "../../../comun/js/entrada/latex-a-codigo.js";
import { expresionTex } from "../../../comun/js/entrada/impresion.js";
import { llevarAlResultado } from "../../../comun/js/teclado-virtual.js";
import { aJS, compilarFuente, prepararExpresion } from "../../nucleo/expresion.js";
import { leerNumero } from "../../nucleo/numeros.js";
import { aPython } from "../../nucleo/python.js";
import { exigirPrimerOrden, leerProblema, migrarEstadoAntiguo } from "../../nucleo/edo/problema.js";
import { explorarTramo } from "../../nucleo/edo/singularidad.js";
import { leerEcuacion, formaNormal, ecuacionTex, latexEcuacionACodigo } from "../../nucleo/edo/notacion.js";
import { clasificarEDO1 } from "../../nucleo/edo/clasificar.js";
import { integrarConPaso, METODOS_PASO_FIJO } from "../../nucleo/edo/paso-fijo.js";
import { dormandPrince, interpolarHermite, evaluarEn } from "../../nucleo/edo/dormand-prince.js";
import { integrarImplicito } from "../../nucleo/edo/implicitos.js";
import { campoDirecciones } from "../../nucleo/edo/campo.js";
import { codigoEDO } from "../../nucleo/codigo/edo.js";
import { leerFragmento, escribirFragmento } from "../../nucleo/estado-url.js";
import { EJEMPLOS, ejemplo as buscarEjemplo } from "../../ejemplos.js";
import { resolverEDO1Simbolico, alEstadoSimbolico } from "../../simbolico/cliente.js";
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
const COLOR_METODO = { euler: 1, heun: 2, rk4: 3, dopri: 0 }; // índice de serie fijo por método
// Límite de estabilidad sobre el eje real negativo: |hλ| < valor (Euler 2,
// Heun 2, RK4 ≈ 2.785, Dormand–Prince ≈ 3.3). Son datos conocidos de sus
// regiones de estabilidad absoluta.
const LIMITE_ESTABILIDAD = { euler: 2, heun: 2, rk4: 2.785, dopri: 3.3 };

let campo;
const valoresParametros = {};
let parametrosActuales = null; // lista con deslizadores en pantalla (null: repintar)
let temporizadorVivo = null;
let numeroCalculo = 0;
let r = null;
let trayectorias = []; // condiciones iniciales extra añadidas con clic: [{ x, y }]

const trabajadorNumerico = crearTrabajador(new URL("../../workers/numerico.worker.js", import.meta.url), { tiempoPorDefecto: 30000 });

// --- Utilidades ----------------------------------------------------------------------

const cifras = (v, n = 10) => (Number.isFinite(v) ? String(Number(v.toPrecision(n))) : String(v));
const cientifica = (v) => (v === 0 ? "0" : v.toExponential(2));
const subindice0 = (letra) => `${letra}₀`;

function leerEntrada() {
  return {
    ecuacion: campo.codigo(),
    x0: $("x0").value.trim(), y0: $("y0").value.trim(),
    xf: $("xf").value.trim(), desde: $("desde").value.trim(),
    h: $("paso").value.trim(), tol: $("tolerancia").value.trim(),
    metodoSimbolico: $("metodoSimbolico").value,
    metodos: [...document.querySelectorAll('input[name="metodo"]:checked')].map((c) => c.value),
  };
}

/** Lee la ecuación y la lleva a forma normal; lanza los errores de notación. */
function leerEDO(texto) {
  if (campo.errorVisual()) throw campo.errorVisual();
  const ec = leerEcuacion(texto);
  exigirPrimerOrden(ec);
  const normal = formaNormal(ec.F);
  const args = ["x", "y", ...ec.parametros];
  const compilar = (nodo) => {
    const fn = compilarFuente(aJS(nodo), args);
    return (x, y) => fn(x, y, ...ec.parametros.map((p) => valoresParametros[p] ?? 1));
  };
  return { ec, ...normal, args, fn: compilar(normal.f), Mfn: compilar(normal.M), Nfn: compilar(normal.N) };
}

function sustituirParametros(nodo) {
  return nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in valoresParametros
    ? new math.ConstantNode(valoresParametros[n.name]) : n));
}

function prepararCalculo() {
  const entrada = leerEntrada();
  const edo = leerEDO(entrada.ecuacion);
  const { independiente: ind, dependiente: dep } = edo.ec;
  const datos = leerProblema(entrada, { x0: `${ind}₀`, y0: `${dep}₀`, xf: `«${t("edo1.hasta")}»`, desde: `«${t("edo1.desde")}»` });
  return { entrada, edo, ...datos };
}

// --- En vivo: vista previa, clasificación y parámetros ----------------------------------------

/**
 * Deja los deslizadores de acuerdo con los parámetros de la fórmula actual.
 * Se compara con lo que está PINTADO (null tras cargar un ejemplo o un enlace:
 * fuerza a repintar). Antes se comparaba con una lista vaciada a mano, y al
 * pasar a una fórmula sin parámetros ([] === []) quedaban los deslizadores viejos.
 */
function sincronizarParametros(lista) {
  if (parametrosActuales !== null && lista.join() === parametrosActuales.join()) return;
  parametrosActuales = [...lista];
  pintarDeslizadores($("parametros"), parametrosActuales, valoresParametros, {
    t,
    alMover: () => { if (r) calcular({ soloNumerico: true }); },
    alSoltar: () => { if (r) calcular({}); },
  });
}

function refrescarVivo() {
  clearTimeout(temporizadorVivo);
  const { ecuacion } = leerEntrada();
  const errorEc = $("errorEcuacion");
  const chips = $("clasificacion");
  chips.replaceChildren();
  const chip = (texto, clase = "") => chips.append(crear("span", `etiqueta ${clase}`, texto));
  let ec;
  try {
    if (campo.errorVisual()) throw campo.errorVisual();
    ec = leerEcuacion(ecuacion);
    errorEc.hidden = true;
    campo.marcarError(false);
  } catch (err) {
    errorEc.hidden = ecuacion.trim() === "";
    errorEc.textContent = mensajeDeError(err);
    campo.marcarError(ecuacion.trim() !== "");
    $("vistaPrevia").replaceChildren(crear("p", "hint", t("entrada.vistaPrevia.conErrores")));
    return;
  }
  if (ec.tipo === "edp") {
    chip(t("tipo.edp"), "aviso");
    chip(t("tipo.orden", { orden: ec.orden }));
    chip(t("tipo.proximamente", { fase: 3 }), "aviso");
    sincronizarParametros([]);
    pintarTex($("vistaPrevia"), "\\text{" + t("tipo.edp") + "}");
    return;
  }
  $("etiquetaX0").textContent = subindice0(ec.independiente);
  $("etiquetaY0").textContent = subindice0(ec.dependiente);
  $("etiquetaXf").textContent = t("edo1.hasta.var", { var: ec.independiente });
  chip(t("tipo.orden", { orden: ec.orden }));
  if (ec.orden > 1) {
    chip(t("tipo.proximamente", { fase: 2 }), "aviso");
    sincronizarParametros([]);
    pintarTex($("vistaPrevia"), ecuacionTex(ec));
    return;
  }
  sincronizarParametros(ec.parametros);
  let edo;
  try {
    edo = leerEDO(ecuacion);
  } catch (err) {
    errorEc.hidden = false;
    errorEc.textContent = mensajeDeError(err);
    return;
  }
  const c = clasificarEDO1(edo.fn, { M: edo.Mfn, N: edo.Nfn });
  chip(t(c.lineal ? "tipo.lineal" : "tipo.noLineal"));
  if (c.lineal) chip(t(c.homogenea ? "tipo.homogenea" : "tipo.noHomogenea"));
  if (c.separable) chip(t("tipo.separable"));
  if (c.bernoulli) chip(t("tipo.bernoulli", { n: c.bernoulli.n }));
  if (c.exacta) chip(t("tipo.exacta"));
  if (c.riccati) chip(t("tipo.riccati"));
  if (c.autonoma) chip(t("tipo.autonoma"));
  if (!c.separable && !c.lineal && !c.bernoulli && !c.exacta) chip(t("tipo.sinMetodo"), "aviso");
  if (ec.parametros.length) chip(t("clase.parametros", { lista: ec.parametros.join(", ") }));
  const { x0, y0, xf } = leerEntrada();
  const ind = ec.independiente;
  const inicio = x0 || `${ind}_0`;
  pintarTex($("vistaPrevia"), `${ecuacionTex(ec)}, \\quad ${ec.dependiente}(${inicio}) = ${y0 || "y_0"}, \\quad ${ind}: ${inicio} \\to ${xf || `${ind}_f`}`);
}

function programarVivo() {
  clearTimeout(temporizadorVivo);
  temporizadorVivo = setTimeout(refrescarVivo, ESPERA_VIVO_MS);
}

// --- Cálculo -------------------------------------------------------------------------------------

/** Resuelve desde x0 hacia los dos extremos y junta los tramos (de xmin a xmax). */
function resolverEnRango(resolver, x0, y0, xmin, xmax) {
  const tramos = [];
  if (xmin < x0) tramos.push({ ...resolver(x0, y0, xmin), atras: true });
  if (xmax > x0) tramos.push({ ...resolver(x0, y0, xmax), atras: false });
  const xs = [];
  const ys = [];
  let evaluaciones = 0;
  const detenidos = [];
  for (const tramo of tramos) {
    const orden = tramo.atras ? [...tramo.xs.keys()].reverse() : [...tramo.xs.keys()];
    for (const i of orden) {
      if (xs.length && xs.at(-1) === tramo.xs[i]) continue;
      xs.push(tramo.xs[i]);
      ys.push(tramo.ys[i]);
    }
    evaluaciones += tramo.evaluaciones;
    if (tramo.detenido) detenidos.push(tramo.detenido);
  }
  return { xs, ys, evaluaciones, detenidos, tramos };
}

/** Solución por Dormand–Prince en todo el rango, con interpolación para dibujar y evaluar. */
function dopriEnRango(f, x0, y0, xmin, xmax, opciones) {
  const tramos = {};
  if (xmin < x0) tramos.atras = dormandPrince(f, x0, y0, xmin, opciones);
  if (xmax > x0) tramos.adelante = dormandPrince(f, x0, y0, xmax, opciones);
  const enX = (x) => {
    const tramo = x < x0 ? tramos.atras : tramos.adelante;
    if (!tramo) return y0;
    const limite = tramo.xs.at(-1);
    if (x < x0 ? x < limite : x > limite) return NaN; // más allá de donde se detuvo
    return evaluarEn(tramo, x);
  };
  const denso = { xs: [], ys: [] };
  for (const clave of ["atras", "adelante"]) {
    if (!tramos[clave]) continue;
    const d = interpolarHermite(tramos[clave], 6);
    const xs = clave === "atras" ? [...d.xs].reverse() : d.xs;
    const ys = clave === "atras" ? [...d.ys].reverse() : d.ys;
    for (let i = 0; i < xs.length; i++) {
      if (denso.xs.length && denso.xs.at(-1) === xs[i]) continue;
      denso.xs.push(xs[i]);
      denso.ys.push(ys[i]);
    }
  }
  const lista = Object.values(tramos);
  return {
    tramos, enX, denso,
    evaluaciones: lista.reduce((s, q) => s + q.evaluaciones, 0),
    rechazados: lista.reduce((s, q) => s + q.rechazados, 0),
    detenidos: lista.map((q) => q.detenido).filter(Boolean),
    puntos: resolverEnRango((a, b, c) => dormandPrince(f, a, b, c, opciones), x0, y0, xmin, xmax),
  };
}

/** λ ≈ ∂f/∂y a lo largo de la solución (diferencia centrada): mide la rigidez. */
function estimarLambda(f, solucion) {
  let minimo = Infinity;
  let maximo = -Infinity;
  const { xs, ys } = solucion.denso;
  const salto = Math.max(1, Math.floor(xs.length / 200));
  for (let i = 0; i < xs.length; i += salto) {
    const d = 1e-6 * Math.max(1, Math.abs(ys[i]));
    const l = (f(xs[i], ys[i] + d) - f(xs[i], ys[i] - d)) / (2 * d);
    if (!Number.isFinite(l)) continue;
    minimo = Math.min(minimo, l);
    maximo = Math.max(maximo, l);
  }
  return { minimo, maximo };
}

function calcular({ soloNumerico = false, desdeUsuario = false } = {}) {
  // Sin esperar a la revisión en vivo (300 ms tras teclear): así los deslizadores
  // y la lista de parámetros corresponden a la ecuación que se va a calcular.
  // (Al mover un deslizador no hace falta: la lista no cambia.)
  if (!soloNumerico) refrescarVivo();
  let datos;
  try {
    datos = prepararCalculo();
  } catch (err) {
    mostrarError(err);
    return;
  }
  const { edo, x0, y0, xf, ventana, h, tol, entrada } = datos;
  const f = edo.fn;

  // Antes de nada, la referencia fina explora cada sentido desde x0. Si la
  // solución deja de existir (singularidad, explosión, fuera de dominio), ese
  // lado se recorta antes de la parada para TODOS los métodos: los de paso
  // fijo cruzarían la singularidad sin darse cuenta (ver singularidad.js).
  let [xmin, xmax] = ventana;
  const paradas = [];
  try {
    for (const lado of [1, -1]) {
      const extremo = lado > 0 ? xmax : xmin;
      if (extremo === x0) continue;
      const e = explorarTramo({ f, M: edo.Mfn, N: edo.Nfn }, x0, y0, extremo);
      if (!e.parada) continue;
      paradas.push({ ...e.parada, lado, pedido: extremo, corte: e.extremo });
      if (lado > 0) xmax = e.extremo; else xmin = e.extremo;
    }
  } catch (err) {
    mostrarError(err);
    return;
  }

  $("error").hidden = true;
  const id = ++numeroCalculo;
  r = { id, ...datos, xmin, xmax, paradas, f, simbolico: null, pendiente: true, errorSimbolico: null, estudio: null };
  // x final efectivo: el pedido, o el corte si la solución no llega hasta él.
  r.xfPedido = xf;
  r.xf = xf > x0 ? xmax : xmin;

  // Referencia de alta precisión y métodos elegidos, en la ventana ya recortada.
  r.referencia = dopriEnRango(f, x0, y0, xmin, xmax, { rtol: 1e-12, atol: 1e-14 });
  r.metodos = {};
  for (const m of entrada.metodos) {
    r.metodos[m] = m === "dopri"
      ? dopriEnRango(f, x0, y0, xmin, xmax, { rtol: tol, atol: tol * 1e-3 }).puntos
      : resolverEnRango((a, b, c) => integrarConPaso(m, f, a, b, c, h), x0, y0, xmin, xmax);
  }
  r.dopriUsuario = entrada.metodos.includes("dopri") ? dopriEnRango(f, x0, y0, xmin, xmax, { rtol: tol, atol: tol * 1e-3 }) : null;
  r.lambda = estimarLambda(f, r.referencia);
  r.yExacta = null;

  guardarEnURL(edo.ec.parametros);
  pintarTodo();
  $("resultados").hidden = false;
  if (desdeUsuario) llevarAlResultado($("resultados"));
  pedirEstudio(id, null);
  if (soloNumerico) return;

  // Parte simbólica.
  const M = aPython(sustituirParametros(edo.M));
  const N = aPython(sustituirParametros(edo.N));
  resolverEDO1Simbolico(M, N, aPython(analizarFuncion(entrada.x0)), aPython(analizarFuncion(entrada.y0)), entrada.metodoSimbolico || null)
    .then((res) => {
      if (id !== numeroCalculo) return;
      r.simbolico = res;
      r.pendiente = false;
      r.yExacta = compilarExacta(res.particularMathjs);
      if (r.yExacta) pedirEstudio(id, r.yExacta(r.xf));
      pintarTodo();
    })
    .catch((err) => {
      if (id !== numeroCalculo) return;
      r.pendiente = false;
      r.errorSimbolico = err;
      pintarTodo();
    });
}

function compilarExacta(texto) {
  if (!texto) return null;
  try {
    return prepararExpresion(texto, ["x"], { parametrosPermitidos: false }).fn;
  } catch {
    return null;
  }
}

/** Estudio de convergencia en el Worker. `referencia`: y(xf) exacto o null (el Worker calcula una). */
function pedirEstudio(id, referencia) {
  const valores = r.edo.ec.parametros.map((p) => valoresParametros[p] ?? 1);
  trabajadorNumerico.llamar("estudioEDO", [{
    expresion: { fuente: aJS(r.edo.f), argumentos: r.edo.args, valores },
    x0: r.x0, y0: r.y0, xf: r.xf, referencia: Number.isFinite(referencia) ? referencia : null,
  }]).then((res) => {
    if (id !== numeroCalculo) return;
    r.estudio = res;
    pintarNumerico();
  }).catch(() => { /* el Worker se reinicia solo; el resto de la página no depende de él */ });
}

// --- Pintar ---------------------------------------------------------------------------------------

function pintarTodo() {
  pintarParada();
  pintarConfianza();
  pintarSolucion();
  pintarPasosPanel();
  pintarGraficas();
  pintarNumerico();
  pintarVerificacion();
  pintarCodigo();
}

/** Valor de referencia en x: la solución exacta si la hay; si no, Dormand–Prince fino. */
const referenciaEn = (x) => (r.yExacta ? r.yExacta(x) : r.referencia.enX(x));

function discrepancia() {
  if (!r.yExacta) return false;
  const xs = r.referencia.denso.xs.filter((_, i) => i % 7 === 0);
  return xs.some((x) => {
    const a = r.yExacta(x);
    const b = r.referencia.enX(x);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(b));
  });
}

/**
 * Aviso cuando la solución no llega hasta la x final pedida (o hasta «desde»):
 * dónde se detuvo, por qué, y hasta dónde se integró con todos los métodos.
 */
function pintarParada() {
  const caja = $("avisoParada");
  caja.replaceChildren();
  caja.hidden = r.paradas.length === 0;
  const variable = r.edo.ec.independiente;
  const N = expresionTex(sustituirParametros(r.edo.N));
  for (const p of r.paradas) {
    caja.append(crear("p", null, t("edo1.parada.titulo", { xf: `${variable} = ${cifras(p.pedido, 6)}` })));
    caja.append(textoConFormulas(crear("p"), t(`edo1.parada.${p.motivo}`, { var: variable, x: cifras(p.x, 6), N })));
    caja.append(crear("p", "muted", t("edo1.parada.corte", { var: variable, corte: cifras(p.corte, 6) })));
  }
}

function pintarConfianza() {
  const s = r.simbolico;
  let clase = "aviso";
  let texto;
  if (discrepancia()) {
    clase = "bad";
    texto = t("confianza.discrepancia");
  } else if (s?.particular) {
    clase = "ok";
    texto = t("confianza.edoExacta", { metodo: t(`metodoSimb.${s.metodo}`) });
  } else if (s?.implicita) {
    clase = "ok";
    texto = t("confianza.edoImplicita", { metodo: t(`metodoSimb.${s.metodo}`) });
  } else {
    texto = t("confianza.edoNumerica", { tol: cientifica(1e-12) });
  }
  if (r.pendiente) texto += ` · ${t("confianza.pendiente")}`;
  $("confianza").className = `badge ${clase}`;
  $("confianza").textContent = texto;
}

function pintarSolucion() {
  const s = r.simbolico;
  const { ec } = r.edo;
  pintarTex($("solucionEcuacion"), `${ecuacionTex(ec)}, \\quad ${ec.dependiente}(${cifras(r.x0)}) = ${cifras(r.y0)}`);
  const tipos = $("solucionTipos");
  tipos.replaceChildren();
  if (s?.tipos) {
    const tt = s.tipos;
    const chip = (texto) => tipos.append(crear("span", "etiqueta ok", texto));
    if (tt.separable) chip(t("tipo.separable"));
    if (tt.lineal) chip(t(tt.homogenea ? "tipo.linealHomogenea" : "tipo.lineal"));
    if (tt.bernoulli) chip(t("tipo.bernoulli", { n: tt.bernoulli }));
    if (tt.exacta) chip(t(`tipo.exacta.${tt.exacta}`));
    if (tt.riccati) chip(t("tipo.riccati"));
    tipos.append(crear("span", "muted", t("tipo.confirmadoSympy")));
  }
  const general = $("solucionGeneral");
  const particular = $("solucionParticular");
  general.replaceChildren();
  particular.replaceChildren();
  $("solucionConstantes").hidden = true;
  const nota = $("solucionNota");
  nota.textContent = "";
  const caja = (el, titulo, tex) => {
    el.append(crear("h3", null, titulo));
    const m = crear("div", "math");
    pintarTex(m, tex);
    el.append(m);
  };
  if (r.pendiente) {
    general.append(crear("p", "muted", t("solucion.edoCalculando")));
  } else if (s?.general || s?.particular || s?.implicita) {
    if (s.general) caja(general, t("solucion.general"), s.general);
    if (s.particular) caja(particular, t("solucion.particular"), `${ec.dependiente}(x) = ${s.particular}`);
    else if (s.implicita) caja(particular, t("solucion.particularImplicita"), s.implicita.tex);
    if (s.constantes?.length) {
      $("solucionConstantes").hidden = false;
      textoConFormulas($("solucionConstantes"), t("solucion.constantes", { lista: s.constantes.map((c) => `$y = ${c}$`).join(", ") }));
    }
  } else if (s?.sinFormaCerrada) {
    general.append(crear("p", null, t("solucion.edoSinFormaCerrada")));
  } else if (s && !s.metodo) {
    general.append(crear("p", null, t("solucion.edoSinMetodo")));
  } else if (r.errorSimbolico) {
    general.append(crear("p", "muted", mensajeDeError(r.errorSimbolico)));
  }
  const detenido = r.referencia.detenidos[0];
  if (detenido) nota.textContent = t(detenido.motivo === "explota" ? "solucion.explota" : "solucion.detenida", { x: cifras(detenido.x, 6) });
  if (ec.independiente !== "x" || ec.dependiente !== "y") {
    nota.textContent += ` ${t("solucion.nombres", { ind: ec.independiente, dep: ec.dependiente })}`;
  }
  pintarTablaFinal();
}

function pintarTablaFinal() {
  const tabla = $("tablaFinal");
  tabla.replaceChildren();
  const ref = referenciaEn(r.xf);
  const cab = crear("tr");
  for (const clave of ["edo1.col.metodo", "edo1.col.valor", "edo1.col.error", "numerico.col.evaluaciones"]) {
    const th = crear("th", null, t(clave, { x: cifras(r.xf, 6) }));
    th.scope = "col";
    cab.append(th);
  }
  tabla.append(crear("thead"));
  tabla.tHead.append(cab);
  const cuerpo = crear("tbody");
  const fila = (nombre, valor, error, evaluaciones) => {
    const tr = crear("tr");
    const th = crear("th", null, nombre);
    th.scope = "row";
    tr.append(th, crear("td", "num", cifras(valor, 12)), crear("td", "num", error === null ? "—" : cientifica(error)), crear("td", "num", evaluaciones ?? "—"));
    cuerpo.append(tr);
  };
  if (r.yExacta) fila(t("edo1.exacta"), ref, null, null);
  for (const m of METODOS.filter((x) => r.metodos[x])) {
    const sol = r.metodos[m];
    // Punto más cercano a x final (RK45 llega a él con un redondeo de ~1e−16).
    const i = sol.xs.reduce((m, x, k) => (Math.abs(x - r.xf) < Math.abs(sol.xs[m] - r.xf) ? k : m), 0);
    const v = Math.abs(sol.xs[i] - r.xf) <= 1e-9 * Math.max(1, Math.abs(r.xf)) ? sol.ys[i] : NaN;
    fila(t(`metodoEDO.${m}`), v, Number.isFinite(v) ? Math.abs(v - ref) : null, String(sol.evaluaciones));
  }
  tabla.append(cuerpo);
}

function pintarPasosPanel() {
  const s = r.simbolico;
  $("pasos").replaceChildren();
  if (s?.pasos?.length) {
    $("pasosMetodo").textContent = t("pasos.edoMetodo", {
      metodo: t(`metodoSimb.${s.metodo}`),
      otros: s.metodos.filter((m) => m !== s.metodo).map((m) => t(`metodoSimb.${m}`)).join(", ") || "—",
    });
    pintarPasos($("pasos"), s.pasos);
  } else {
    $("pasosMetodo").textContent = r.pendiente ? t("solucion.edoCalculando")
      : s?.sinFormaCerrada ? t("solucion.edoSinFormaCerrada")
        : s && !s.metodo ? t("solucion.edoSinMetodo")
          : r.errorSimbolico ? mensajeDeError(r.errorSimbolico) : "";
  }
}

// --- Gráficas -----------------------------------------------------------------------------------------

function rangoY() {
  const valores = [...r.referencia.denso.ys, ...trayectorias.flatMap((q) => q.ys ?? [])];
  return rangoRobusto(valores) ?? [-5, 5];
}

function calcularTrayectorias() {
  for (const q of trayectorias) {
    const sol = dopriEnRango(r.f, q.x, q.y, r.ventana[0], r.ventana[1], { rtol: 1e-8, atol: 1e-10 });
    q.xs = sol.denso.xs;
    q.ys = sol.denso.ys;
  }
}

function pintarGraficas() {
  calcularTrayectorias();
  const { ec } = r.edo;
  const [ymin, ymax] = rangoY();
  dibujar($("graficaCampo"), () => {
    const c = coloresTema();
    const campoD = campoDirecciones(r.f, r.ventana, [ymin, ymax], { nx: 25, ny: 17 });
    const datos = [
      { x: campoD.xs, y: campoD.ys, type: "scatter", mode: "lines", line: { color: c.secundario, width: 1 }, name: t("edo1.campo.segmentos"), hoverinfo: "skip" },
      { x: r.referencia.denso.xs, y: r.referencia.denso.ys, type: "scatter", mode: "lines", line: { color: colorSerie(0), width: 3 }, name: t("edo1.solucionNumerica") },
      ...trayectorias.map((q, i) => ({ x: q.xs, y: q.ys, type: "scatter", mode: "lines", line: { color: colorSerie(2 + (i % 3)), width: 2 },
        name: t("edo1.trayectoria", { x: cifras(q.x, 3), y: cifras(q.y, 3) }) })),
      { x: [r.x0, ...trayectorias.map((q) => q.x)], y: [r.y0, ...trayectorias.map((q) => q.y)], type: "scatter", mode: "markers",
        marker: { size: 10, color: c.texto, line: { color: c.acento, width: 2 } }, name: t("edo1.condicionesIniciales") },
    ];
    return { datos, diseno: disenoBase({ tituloX: ec.independiente, tituloY: ec.dependiente, dragmode: false, showlegend: true,
      xaxis: { range: r.ventana }, yaxis: { range: [ymin, ymax] } }) };
  });

  // Comparador de métodos.
  const datosComp = [];
  const exactoXs = r.referencia.denso.xs;
  datosComp.push({ x: exactoXs, y: exactoXs.map(referenciaEn), type: "scatter", mode: "lines", line: { color: coloresTema().texto, width: 2, dash: "dot" },
    name: t(r.yExacta ? "edo1.exacta" : "edo1.referencia") });
  for (const m of METODOS.filter((x) => r.metodos[x])) {
    const sol = r.metodos[m];
    datosComp.push({ x: sol.xs, y: sol.ys, type: "scatter", mode: "lines+markers", name: t(`metodoEDO.${m}`),
      line: { color: colorSerie(COLOR_METODO[m]), width: 2 }, marker: { symbol: SIMBOLOS[COLOR_METODO[m]], size: sol.xs.length > 80 ? 4 : 7, color: colorSerie(COLOR_METODO[m]) } });
  }
  dibujar($("graficaComparador"), () => ({ datos: datosComp, diseno: disenoBase({ tituloX: ec.independiente, tituloY: ec.dependiente, showlegend: true, yaxis: { range: [ymin, ymax] } }) }));

  // Error frente a x.
  const datosError = [];
  for (const m of METODOS.filter((x) => r.metodos[x])) {
    const sol = r.metodos[m];
    const errores = sol.xs.map((x, i) => Math.abs(sol.ys[i] - referenciaEn(x)));
    datosError.push({ x: sol.xs, y: errores.map((e) => (e > 0 && Number.isFinite(e) ? e : null)), type: "scatter", mode: "lines+markers", name: t(`metodoEDO.${m}`),
      line: { color: colorSerie(COLOR_METODO[m]), width: 2 }, marker: { symbol: SIMBOLOS[COLOR_METODO[m]], size: 5, color: colorSerie(COLOR_METODO[m]) } });
  }
  $("textoErrorX").textContent = t(r.yExacta ? "edo1.errorX.exacta" : "edo1.errorX.referencia");
  dibujar($("graficaErrorX"), () => ({ datos: datosError, diseno: disenoBase({ tituloX: ec.independiente, tituloY: t("numerico.ejeError"), showlegend: true, yaxis: { type: "log", exponentformat: "power" } }) }));
}

function conectarClicCampo() {
  const div = $("graficaCampo");
  div.addEventListener("click", (e) => {
    const zona = div.querySelector(".nsewdrag");
    if (!r || !zona || !div._fullLayout) return;
    // Píxeles del clic -> coordenadas de datos, con los ejes de Plotly.
    const rect = zona.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const x = div._fullLayout.xaxis.p2d(e.clientX - rect.left);
    const y = div._fullLayout.yaxis.p2d(e.clientY - rect.top);
    anadirTrayectoria(x, y);
  });
  $("formTrayectoria").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      anadirTrayectoria(leerNumero($("trayX").value, "x"), leerNumero($("trayY").value, "y"));
    } catch (err) {
      mostrarError(err);
    }
  });
  $("borrarTrayectorias").addEventListener("click", () => { trayectorias = []; if (r) pintarGraficas(); });
}

function anadirTrayectoria(x, y) {
  if (!r || !Number.isFinite(x) || !Number.isFinite(y) || x < r.ventana[0] || x > r.ventana[1]) return;
  trayectorias.push({ x, y });
  if (trayectorias.length > 8) trayectorias.shift();
  pintarGraficas();
}

// --- Numérico -------------------------------------------------------------------------------------------

function pintarNumerico() {
  const ec = r.edo.ec;
  const est = r.estudio;
  $("numericoNota").textContent = !est ? t("edo1.estudio.calculando")
    : t(est.fuenteReferencia === "exacta" ? "edo1.estudio.exacta" : "edo1.estudio.numerica", { x: cifras(r.xf, 6), valor: cifras(est.referencia, 14) });

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
    const serie = (m, i, puntos, xDe, extra = "") => ({
      x: puntos.map(xDe), y: puntos.map((p) => (p.error > 0 ? p.error : null)), type: "scatter", mode: "lines+markers",
      name: `${t(`metodoEDO.${m}`)}${extra}`, line: { color: colorSerie(i), width: 2 }, marker: { symbol: SIMBOLOS[i], size: 8, color: colorSerie(i) },
    });
    dibujar($("graficaConvergencia"), () => ({
      datos: ["euler", "heun", "rk4"].map((m) => {
        const e = est.estudio[m];
        const extra = e.observado ? ` · ${t("edo1.pendiente", { p: e.observado.pendiente.toFixed(2), teorico: e.ordenTeorico })}` : "";
        return serie(m, COLOR_METODO[m], e.puntos, (p) => p.h, extra);
      }),
      diseno: disenoBase({ tituloX: t("numerico.ejeH"), tituloY: t("numerico.ejeError"), xaxis: { ...ejeLog, autorange: "reversed" }, yaxis: ejeLog, showlegend: true }),
    }));
    dibujar($("graficaEvaluaciones"), () => ({
      datos: METODOS.map((m) => serie(m, COLOR_METODO[m], est.estudio[m].puntos, (p) => p.evaluaciones)),
      diseno: disenoBase({ tituloX: t("numerico.ejeEvaluaciones"), tituloY: t("numerico.ejeError"), xaxis: ejeLog, yaxis: ejeLog, showlegend: true }),
    }));
  }

  // Tamaño de paso de Dormand–Prince (con la tolerancia elegida).
  const dp = r.dopriUsuario ?? dopriEnRango(r.f, r.x0, r.y0, r.xmin, r.xmax, { rtol: r.tol, atol: r.tol * 1e-3 });
  const xsPasos = [];
  const hs = [];
  for (const tramo of Object.values(dp.tramos)) {
    tramo.pasos.forEach((h, i) => { xsPasos.push((tramo.xs[i] + tramo.xs[i + 1]) / 2); hs.push(h); });
  }
  dibujar($("graficaPasos"), () => ({
    datos: [{ x: xsPasos, y: hs, type: "scatter", mode: "markers", marker: { size: 7, color: colorSerie(0) }, name: "h",
      hovertemplate: `${ec.independiente} = %{x:.4g}<br>h = %{y:.3g}<extra></extra>` }],
    diseno: disenoBase({ tituloX: ec.independiente, tituloY: t("edo1.pasosRK45.ejeY"), yaxis: { type: "log", exponentformat: "power" }, showlegend: false }),
  }));
  pintarRigidez(dp);
}

function pasoRigidez() {
  const L = Math.abs(r.xf - r.x0);
  const s = Number($("pasoRigidez").value) / 100;
  const [lo, hi] = [Math.log10(L / 2000), Math.log10(L / 4)];
  return 10 ** (lo + s * (hi - lo));
}

function pintarRigidez(dp) {
  const { minimo } = r.lambda;
  const texto = $("textoRigidez");
  if (!(minimo < 0)) {
    texto.textContent = t("edo1.rigidez.noNegativo");
  } else {
    textoConFormulas(texto, t("edo1.rigidez.texto", {
      lambda: cifras(minimo, 3), heuler: cifras(LIMITE_ESTABILIDAD.euler / -minimo, 3), hrk4: cifras(LIMITE_ESTABILIDAD.rk4 / -minimo, 3),
      evaluaciones: dp.evaluaciones, rechazados: dp.rechazados,
    }));
  }
  const h = pasoRigidez();
  $("pasoRigidezValor").textContent = cifras(h, 3);
  const N = Math.max(1, Math.round(Math.abs(r.xf - r.x0) / h));
  const explicito = integrarConPaso("euler", r.f, r.x0, r.y0, r.xf, h);
  const implicito = integrarImplicito("eulerImplicito", r.f, r.x0, r.y0, r.xf, N);
  const trapecio = integrarImplicito("trapecioImplicito", r.f, r.x0, r.y0, r.xf, N);
  const xsRef = r.referencia.denso.xs.filter((x) => (r.xf > r.x0 ? x >= r.x0 : x <= r.x0));
  const [ymin, ymax] = rangoY();
  dibujar($("graficaRigidez"), () => ({
    datos: [
      { x: xsRef, y: xsRef.map(referenciaEn), type: "scatter", mode: "lines", line: { color: coloresTema().texto, width: 2, dash: "dot" }, name: t(r.yExacta ? "edo1.exacta" : "edo1.referencia") },
      { x: explicito.xs, y: explicito.ys, type: "scatter", mode: "lines+markers", name: t("metodoEDO.euler"), line: { color: colorSerie(1), width: 2 }, marker: { symbol: SIMBOLOS[1], size: 6, color: colorSerie(1) } },
      { x: implicito.xs, y: implicito.ys, type: "scatter", mode: "lines+markers", name: t("metodoEDO.eulerImplicito"), line: { color: colorSerie(2), width: 2 }, marker: { symbol: SIMBOLOS[2], size: 6, color: colorSerie(2) } },
      { x: trapecio.xs, y: trapecio.ys, type: "scatter", mode: "lines+markers", name: t("metodoEDO.trapecioImplicito"), line: { color: colorSerie(4), width: 2 }, marker: { symbol: SIMBOLOS[4], size: 6, color: colorSerie(4) } },
    ],
    // Rango fijo en y: si Euler explota, se sale de la gráfica en vez de aplastar las demás curvas.
    diseno: disenoBase({ tituloX: r.edo.ec.independiente, tituloY: r.edo.ec.dependiente, showlegend: true, yaxis: { range: [ymin, ymax] } }),
  }));
  const factor = minimo < 0 ? Math.abs(1 + h * minimo) : null;
  textoConFormulas($("textoRigidezH"), factor === null ? t("edo1.rigidez.h.sinLambda", { h: cifras(h, 3) })
    : t(factor > 1 ? "edo1.rigidez.h.inestable" : "edo1.rigidez.h.estable", { h: cifras(h, 3), hl: cifras(h * minimo, 3), factor: cifras(factor, 3) }));
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
    if (v.simbolica) itemVerificacion("ok", "verif.edoResiduo");
    else if (v.numerica) itemVerificacion("ok", "verif.edoResiduoNumerico", { residuo: v.residuo });
    else itemVerificacion("bad", "verif.edoResiduoFalla", { residuo: v.residuo });
    itemVerificacion(v.ci ? "ok" : "bad", v.ci ? "verif.edoCI" : "verif.edoCIFalla");
  }
  // Comprobación independiente (JS, sin SymPy) contra Dormand–Prince fino.
  const xs = r.referencia.denso.xs.filter((_, i) => i % 5 === 0);
  if (r.yExacta) {
    let peor = 0;
    for (const x of xs) {
      const d = Math.abs(r.yExacta(x) - r.referencia.enX(x)) / Math.max(1, Math.abs(r.referencia.enX(x)));
      if (Number.isFinite(d)) peor = Math.max(peor, d);
    }
    itemVerificacion(peor < 1e-6 ? "ok" : "bad", "verif.edoNumerica", { error: cientifica(peor) });
  } else if (s?.implicita?.F && s.implicita.K !== null) {
    try {
      const F = prepararExpresion(s.implicita.F, ["x", "y"], { parametrosPermitidos: false }).fn;
      const K = Number(s.implicita.K);
      let peor = 0;
      for (const x of xs) {
        const d = Math.abs(F(x, r.referencia.enX(x)) - K) / Math.max(1, Math.abs(K));
        if (Number.isFinite(d)) peor = Math.max(peor, d);
      }
      itemVerificacion(peor < 1e-6 ? "ok" : "bad", "verif.edoImplicita", { error: cientifica(peor) });
    } catch {
      itemVerificacion("aviso", "verif.jsNoEvaluable");
    }
  } else if (!r.pendiente) {
    itemVerificacion("aviso", "verif.edoSoloNumerica");
  }
  // RK4 frente a Dormand–Prince: dos métodos numéricos distintos deben coincidir.
  const rk4 = integrarConPaso("rk4", r.f, r.x0, r.y0, r.xf, Math.abs(r.xf - r.x0) / 2000);
  const ref = r.referencia.enX(r.xf);
  if (!rk4.detenido && Number.isFinite(ref)) {
    const d = Math.abs(rk4.ys.at(-1) - ref);
    itemVerificacion(d < 1e-6 * Math.max(1, Math.abs(ref)) ? "ok" : "aviso", "verif.edoCruzada", { diferencia: cientifica(d), x: cifras(r.xf, 6) });
  }
  if (r.errorSimbolico) itemVerificacion("aviso", "verif.sinSimbolico", { detalle: mensajeDeError(r.errorSimbolico) });
}

// --- Código y exportación ----------------------------------------------------------------------------------

function textoPython() {
  return codigoEDO({
    f: sustituirParametros(r.edo.f), M: sustituirParametros(r.edo.M), N: sustituirParametros(r.edo.N),
    textoOriginal: r.entrada.ecuacion, x0: r.x0, y0: r.y0, xf: r.xf, metodo: r.simbolico?.metodo ?? null,
  });
}

function pintarCodigo() {
  $("codigoPython").textContent = textoPython();
}

function latexSolucion() {
  const s = r.simbolico;
  const lineas = [`${ecuacionTex(r.edo.ec)}, \\quad y(${cifras(r.x0)}) = ${cifras(r.y0)}`];
  if (s?.general) lineas.push(s.general);
  if (s?.particular) lineas.push(`y(x) = ${s.particular}`);
  else if (s?.implicita) lineas.push(s.implicita.tex);
  return lineas.join("\n");
}

function csvActual() {
  const filas = [["metodo", "x", "y"]];
  for (const m of METODOS.filter((x) => r.metodos[x])) r.metodos[m].xs.forEach((x, i) => filas.push([m, x, r.metodos[m].ys[i]]));
  r.referencia.denso.xs.forEach((x, i) => filas.push([r.yExacta ? "exacta" : "referencia", x, r.yExacta ? r.yExacta(x) : r.referencia.denso.ys[i]]));
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
  $("descargarCsv").addEventListener("click", () => descargarTexto(csvActual(), "diffeq-lab-edo.csv", "text/csv"));
  $("descargarPy").addEventListener("click", () => descargarTexto(textoPython(), "diffeq_lab_edo.py", "text/x-python"));
  $("copiarPy").addEventListener("click", async (e) => avisarCopia(e.currentTarget, await copiar(textoPython())));
  $("descargarPng").addEventListener("click", () => {
    const panel = document.querySelector(".panel:not([hidden])");
    descargarPNG(panel?.querySelector(".js-plotly-plot") ?? $("graficaCampo"), "diffeq-lab-edo");
  });
}

// --- Estado en la URL, ejemplos y arranque -------------------------------------------------------------------

/** `parametros`: los de la ecuación que se acaba de calcular (no los del último repintado). */
function guardarEnURL(parametros) {
  const e = leerEntrada();
  history.replaceState(null, "", escribirFragmento({
    // «desde» solo se escribe si se usa (vacío = x0). Ver migrarEstadoAntiguo para los enlaces viejos.
    e: e.ecuacion, x0: e.x0, y0: e.y0, xf: e.xf, desde: e.desde, h: e.h, tol: e.tol, m: e.metodoSimbolico,
    parametros: Object.fromEntries(parametros.map((p) => [p, valoresParametros[p]])),
  }));
}

function cargarEstado({ ecuacion, e, x0 = "0", y0 = "1", xf = "5", desde = "", h = "", tol = "1e-6", m = "", parametros = {} }) {
  campo.fijar(ecuacion ?? e ?? "");
  Object.assign($("x0"), { value: x0 });
  Object.assign($("y0"), { value: y0 });
  Object.assign($("xf"), { value: xf });
  Object.assign($("desde"), { value: desde });
  $("paso").value = h;
  $("tolerancia").value = tol;
  $("metodoSimbolico").value = m;
  Object.assign(valoresParametros, parametros);
  parametrosActuales = null;
  trayectorias = [];
  refrescarVivo();
}

function pintarEjemplos() {
  for (const e of EJEMPLOS.filter((x) => x.modulo === "edo1")) {
    const boton = crear("button", "chip", t(`ejemplo.${e.id}`));
    boton.type = "button";
    boton.addEventListener("click", () => { cargarEstado(e.datos); calcular({}); });
    $("ejemplos").append(boton);
  }
}

function estadoInicial() {
  const u = leerFragmento(location.hash);
  if (u.ejemplo && buscarEjemplo(u.ejemplo)?.modulo === "edo1") return buscarEjemplo(u.ejemplo).datos;
  if (u.e) return migrarEstadoAntiguo(u); // enlaces con xmin/xmax de la versión anterior
  return buscarEjemplo("logistica").datos;
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
  campo = crearCampoFormula({
    contenedor: $("campoEcuacion"), id: "ecuacion", etiquetaAria: t("edo1.ecuacion"), ejemplo: t("edo1.ecuacion.ejemplo"),
    aCodigo: (latex) => latexEcuacionACodigo(latex, (s) => latexACodigo(s, "ecuación")),
    aLatex: (codigo) => (codigo.trim() === "" ? "" : ecuacionTex(leerEcuacion(codigo))),
    alCambiar: programarVivo, alEnter: () => calcular({ desdeUsuario: true }),
  });
  conectarSelectorModo({ botonVisual: $("modoVisual"), botonCodigo: $("modoCodigo"), aviso: $("avisoModo"), campos: () => [campo], t });
  conectarPestanas(document.querySelector('[role="tablist"]'), { alCambiar: (_id, panel) => reajustar(panel) });
  for (const id of ["x0", "y0", "xf", "desde"]) {
    $(id).addEventListener("input", programarVivo);
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") calcular({ desdeUsuario: true }); });
  }
  $("calcular").addEventListener("click", () => calcular({ desdeUsuario: true }));
  $("pasoRigidez").addEventListener("input", () => { if (r) pintarRigidez(r.dopriUsuario ?? dopriEnRango(r.f, r.x0, r.y0, r.xmin, r.xmax, { rtol: r.tol, atol: r.tol * 1e-3 })); });
  alEstadoSimbolico(({ estado, paso }) => {
    $("estadoSimbolico").textContent = estado === "cargando" ? t(`simbolico.cargando.${paso ?? "pyodide"}`) : "";
  });
  conectarClicCampo();
  conectarExportar();
  pintarEjemplos();
  cargarEstado(estadoInicial());
  calcular({});
}

iniciar();
