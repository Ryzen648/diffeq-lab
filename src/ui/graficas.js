// Gráficas con Plotly, con los colores del tema y redibujo al cambiarlo.
//
// Paleta categórica: la de referencia de la guía de visualización, validada
// contra las superficies de esta página (#ffffff claro, #1b2029 oscuro) con su
// script: daltonismo (ΔE ≥ 8 entre vecinos) y visión normal (ΔE ≥ 15). En
// modo claro tres colores quedan por debajo de 3:1 de contraste, así que cada
// serie lleva además su propio símbolo de marcador y la leyenda se acompaña
// de la tabla de valores (pestaña Numérico). Los colores están en lab.css como
// --serie-1…--serie-6 para que claro y oscuro cambien en un solo sitio.

const variable = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

export const SIMBOLOS = Object.freeze(["circle", "square", "diamond", "triangle-up", "x", "star"]);

/** Color de la serie i (0, 1, 2…), en orden fijo: el color sigue a la serie, no a su posición. */
export const colorSerie = (i) => variable(`--serie-${(i % 6) + 1}`);

function tema() {
  return {
    texto: variable("--text"),
    secundario: variable("--muted"),
    rejilla: variable("--rejilla"),
    eje: variable("--border"),
    acento: variable("--accent"),
    area: variable("--area"),
  };
}

/** Diseño base: fondo transparente, rejilla discreta, un solo eje y. */
export function disenoBase(extra = {}) {
  const c = tema();
  const eje = (titulo) => ({
    title: { text: titulo ?? "", font: { color: c.secundario, size: 13 } },
    gridcolor: c.rejilla, zerolinecolor: c.eje, linecolor: c.eje,
    tickfont: { color: c.secundario, size: 12 }, automargin: true,
  });
  const { tituloX, tituloY, xaxis = {}, yaxis = {}, ...resto } = extra;
  return {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: c.texto, size: 13 },
    margin: { l: 56, r: 16, t: 16, b: 48 },
    hovermode: "closest",
    hoverlabel: { font: { family: "system-ui, sans-serif" } },
    // Leyenda encima del área de dibujo: debajo chocaba con el título del eje x.
    legend: { orientation: "h", x: 0, y: 1.02, xanchor: "left", yanchor: "bottom", font: { color: c.texto } },
    xaxis: { ...eje(tituloX), ...xaxis },
    yaxis: { ...eje(tituloY), ...yaxis },
    ...resto,
  };
}

export const coloresTema = tema;

// Sin barra de herramientas de Plotly: en pantallas estrechas tapaba la
// leyenda. Se sigue pudiendo hacer zoom arrastrando (doble clic lo
// restablece) y la página tiene su propio botón «PNG».
const CONFIG = Object.freeze({
  responsive: true,
  displaylogo: false,
  displayModeBar: false,
  locale: "es",
});

const dibujadas = new Map(); // div -> () => { datos, diseno }

/**
 * Dibuja (o redibuja) en `div`. `construir` devuelve { datos, diseno } y se
 * vuelve a llamar al cambiar el tema, para leer los colores nuevos.
 */
export function dibujar(div, construir) {
  if (!globalThis.Plotly) return;
  dibujadas.set(div, construir);
  const { datos, diseno } = construir();
  globalThis.Plotly.react(div, datos, diseno, CONFIG);
}

export function borrar(div) {
  dibujadas.delete(div);
  globalThis.Plotly?.purge(div);
}

/** Las pestañas ocultas tienen ancho 0: al mostrarlas hay que reajustar. */
export function reajustar(contenedor) {
  if (!globalThis.Plotly) return;
  contenedor.querySelectorAll(".js-plotly-plot").forEach((div) => globalThis.Plotly.Plots.resize(div));
}

document.addEventListener("cambiotema", () => {
  // Espera a que el navegador aplique las variables CSS del tema nuevo.
  requestAnimationFrame(() => {
    for (const [div, construir] of dibujadas) {
      if (!div.isConnected) { dibujadas.delete(div); continue; }
      const { datos, diseno } = construir();
      globalThis.Plotly.react(div, datos, diseno, CONFIG);
    }
  });
});

/** Descarga la gráfica como PNG (el mismo botón que trae Plotly, accesible desde fuera). */
export function descargarPNG(div, nombre) {
  return globalThis.Plotly?.downloadImage(div, { format: "png", scale: 2, filename: nombre });
}

/** Muestras de f en [a, b] para dibujarla; los valores no finitos cortan la línea (null). */
export function muestrear(f, a, b, n = 600) {
  const xs = [];
  const ys = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    let y;
    try { y = f(x); } catch { y = NaN; }
    xs.push(x);
    ys.push(Number.isFinite(y) ? y : null);
  }
  return { xs, ys };
}

/**
 * Rango vertical razonable: recorta picos (p. ej. cerca de una asíntota) para
 * que no aplasten el resto de la curva. Usa los percentiles 2 y 98.
 */
export function rangoRobusto(...series) {
  const v = series.flat().filter((y) => y !== null && Number.isFinite(y)).sort((p, q) => p - q);
  if (!v.length) return undefined;
  const p = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  let lo = Math.min(p(0.02), 0);
  let hi = Math.max(p(0.98), 0);
  if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
  const margen = 0.08 * (hi - lo);
  return [lo - margen, hi + margen];
}
