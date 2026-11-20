// Generador de integrales con la respuesta conocida por construcción.
//
// Se elige una primitiva F de una familia (con coeficientes al azar, semilla
// fija), se deriva con math.js (f = F') y se pide ∫f. La referencia es F, sin
// depender de SymPy ni de ninguna tabla escrita a mano. Para las definidas se
// elige un intervalo donde F y f son finitas y continuas: el valor es F(b) − F(a).
//
// Cada caso sale también en «variante visual»: f pasa a LaTeX y vuelve a código
// como lo hace el editor visual (ahí apareció el error de los paréntesis
// anidados), para que el banco recorra los dos caminos de entrada.
//
// Semillas: el desarrollo usa la 1; CI ejecuta además la semilla reservada
// (scripts/banco.mjs), que no se usa para ajustar nada.

import { math } from "../../comun/js/mathjs.js";
import { expresionTex } from "../../comun/js/entrada/impresion.js";
import { latexACodigo } from "../../comun/js/entrada/latex-a-codigo.js";
import { simpsonAdaptativo } from "../../src/nucleo/cuadratura/adaptativa.js";

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entero = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const noCero = (rnd, lo, hi) => { let v; do v = entero(rnd, lo, hi); while (v === 0); return v; };
const elegir = (rnd, lista) => lista[Math.floor(rnd() * lista.length)];

/** Familias: cada una devuelve { tema, F } (texto de math.js). */
const FAMILIAS = [
  (rnd) => ({ tema: "basicas", F: `${noCero(rnd, -3, 3)}*x^4 + ${entero(rnd, -4, 4)}*x^3 + ${entero(rnd, -4, 4)}*x^2 + ${entero(rnd, -4, 4)}*x` }),
  (rnd) => ({ tema: "partes", F: `(${noCero(rnd, -3, 3)}*x + ${entero(rnd, -3, 3)})*exp(${noCero(rnd, -2, 2)}*x)` }),
  (rnd) => { const k = noCero(rnd, 1, 3); return { tema: "partes", F: `${noCero(rnd, -3, 3)}*x*sin(${k}*x) + ${entero(rnd, -3, 3)}*cos(${k}*x)` }; },
  // La familia del error: potencias fraccionarias de x² + c.
  (rnd) => ({ tema: "sustitucion", F: `(x^2 + ${entero(rnd, 1, 4)})^(${elegir(rnd, [-5, -3, -1, 1, 3, 5])}/2)` }),
  (rnd) => ({ tema: "sustitucion", F: `${noCero(rnd, -3, 3)}*sin(x^2 + ${entero(rnd, 0, 2)})` }),
  (rnd) => ({ tema: "sustitucion", F: `log(x^2 + ${entero(rnd, 1, 5)})` }),
  (rnd) => { const m = entero(rnd, -2, 2); const k = entero(rnd, 1, 3); return { tema: "completarCuadrado", F: `atan((x + ${m})/${k})` }; },
  // Fracciones parciales: logaritmos de |x − r| (con raíces fuera del intervalo, ver abajo).
  (rnd) => { const r1 = entero(rnd, 3, 5); const r2 = -entero(rnd, 3, 5); return { tema: "fraccionesParciales", F: `${noCero(rnd, -3, 3)}*log(abs(x - ${r1})) + ${noCero(rnd, -3, 3)}*log(abs(x - (${r2})))`, polos: [r1, r2] }; },
  (rnd) => { const r = entero(rnd, 3, 5); return { tema: "fraccionesParciales", F: `${noCero(rnd, -3, 3)}/(x - ${r}) + ${noCero(rnd, -2, 2)}*log(abs(x - ${r}))`, polos: [r] }; },
  (rnd) => { const k = noCero(rnd, 1, 3); return { tema: "trigonometricas", F: `sin(${k}*x)^3 / ${3 * k}` }; },
  (rnd) => ({ tema: "trigonometricas", F: `tan(x) - x` }),
];

/** f = F' como texto, y su variante «visual» (LaTeX -> código, como el editor visual). */
function derivar(F) {
  const f = math.simplify(math.derivative(F, "x"));
  const texto = f.toString();
  let visual = null;
  try { visual = latexACodigo(expresionTex(math.parse(texto)), 1); } catch { visual = null; }
  return { texto, visual };
}

/**
 * Intervalo [a, b] donde F(b) − F(a) es de verdad la integral: F y f finitas en
 * una rejilla Y una cuadratura independiente (Simpson adaptativo) que da lo
 * mismo. Sin lo segundo, un polo entre dos puntos de la rejilla (tan x en
 * −π/2) pasaba inadvertido y la «referencia» era falsa: el banco lo detectó.
 */
function intervalo(rnd, Ffn, ffn, polos = []) {
  for (let intento = 0; intento < 40; intento++) {
    const a = Math.round((rnd() * 3 - 2) * 4) / 4; // múltiplos de 0.25 entre −2 y 1
    const b = a + Math.round((0.5 + rnd() * 2) * 4) / 4;
    if (polos.some((p) => p >= a - 0.5 && p <= b + 0.5)) continue;
    let bien = true;
    for (let i = 0; i <= 400 && bien; i++) {
      const x = a + ((b - a) * i) / 400;
      if (!Number.isFinite(Ffn(x)) || !Number.isFinite(ffn(x))) bien = false;
    }
    if (!bien) continue;
    let cuadratura;
    try { cuadratura = simpsonAdaptativo(ffn, a, b, { tol: 1e-11 }); } catch { continue; }
    const barrow = Ffn(b) - Ffn(a);
    if (Math.abs(cuadratura.valor - barrow) <= 1e-8 * Math.max(1, Math.abs(barrow))) return [a, b];
  }
  return null;
}

/**
 * n casos con la semilla dada. Cada uno:
 * { id, tema, nivel, f, a?, b?, variante: "codigo"|"visual", esperado: { tipo, primitiva | valor } }
 */
export function generarIntegrales(semilla, n) {
  const rnd = azar(semilla);
  const casos = [];
  for (let k = 0; k < n; k++) {
    const familia = FAMILIAS[k % FAMILIAS.length];
    const { tema, F, polos } = familia(rnd);
    const { texto, visual } = derivar(F);
    const Ffn = (x) => math.evaluate(F, { x });
    const ffn = (x) => math.evaluate(texto, { x });
    const definida = rnd() < 0.5;
    const base = { tema, nivel: "N", generado: true, semilla };
    let esperado;
    let limites = {};
    if (definida) {
      const ab = intervalo(rnd, Ffn, ffn, polos);
      if (!ab) continue;
      limites = { a: String(ab[0]), b: String(ab[1]) };
      esperado = { tipo: "definida", valor: Ffn(ab[1]) - Ffn(ab[0]) };
    } else {
      esperado = { tipo: "indefinida", primitiva: F };
    }
    casos.push({ ...base, id: `gen${semilla}-${k}-codigo`, f: texto, ...limites, variante: "codigo", esperado });
    if (visual && visual !== texto) casos.push({ ...base, id: `gen${semilla}-${k}-visual`, f: visual, ...limites, variante: "visual", esperado });
  }
  return casos;
}
