// Biblioteca de ejemplos de un clic. Los de fases posteriores se listan para
// que la portada los muestre como «próximamente», sin datos todavía.
//
// Los valores numéricos que se citan en comentarios (soluciones exactas,
// valores de integrales) están comprobados en tests/ejemplos.test.mjs.

export const EJEMPLOS = Object.freeze([
  // --- Integrales (Fase 1a) ---
  { id: "partes", modulo: "integrales", fase: "1a", datos: { f: "x*exp(x)", a: "0", b: "1" } },              // = 1
  { id: "fracciones", modulo: "integrales", fase: "1a", datos: { f: "(3*x+5)/((x-1)*(x+2))", a: "2", b: "4" } },
  { id: "sustitucion", modulo: "integrales", fase: "1a", datos: { f: "2*x*cos(x^2)", a: "0", b: "sqrt(pi)" } }, // = 0
  { id: "trigonometrica", modulo: "integrales", fase: "1a", datos: { f: "sqrt(1-x^2)", a: "-1", b: "1" } },     // = π/2
  { id: "gaussiana", modulo: "integrales", fase: "1a", datos: { f: "exp(-x^2)", a: "-2", b: "2" } },            // = √π·erf(2)
  { id: "impropiaConverge", modulo: "integrales", fase: "1a", datos: { f: "1/x^2", a: "1", b: "inf" } },        // = 1
  { id: "impropiaDiverge", modulo: "integrales", fase: "1a", datos: { f: "1/x", a: "1", b: "inf" } },           // diverge
  { id: "singular", modulo: "integrales", fase: "1a", datos: { f: "1/sqrt(x)", a: "0", b: "1" } },              // = 2

  // --- EDO de primer orden (Fase 1b) ---
  { id: "logistica", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "y' = r*y*(1 - y/K)", x0: "0", y0: "1", xf: "10", parametros: { r: 1, K: 10 } } },
  { id: "enfriamiento", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "dy/dx = -k*(y - Ta)", x0: "0", y0: "90", xf: "20", parametros: { k: 0.3, Ta: 20 } } },
  { id: "lineal", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "y' + 2*y = exp(x)", x0: "0", y0: "1", xf: "3" } },        // y = eˣ/3 + (2/3)e^{−2x}
  { id: "bernoulli", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "y' + y/x = x*y^2", x0: "1", y0: "1", xf: "1.9" } },       // y = 1/(x(2 − x)), explota en x = 2
  { id: "exacta", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "2*x*y + (x^2 + 3*y^2)*y' = 0", x0: "1", y0: "1", xf: "3" } }, // x²y + y³ = 2
  { id: "rigidez", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "y' = -50*(y - cos(x))", x0: "0", y0: "0", xf: "1.5" } },
  { id: "riccati", modulo: "edo1", fase: "1b",
    datos: { ecuacion: "y' = x^2 + y^2", x0: "0", y0: "0", xf: "1.5" } },

  // --- EDO de orden 2 y sistemas 2×2 (Fase 2) ---
  { id: "pendulo", modulo: "edo2", fase: "2",                                      // equilibrios kπ: centros y sillas alternos
    datos: { tipo: "orden2", ecuacion: "x'' = -sin(x)", t0: "0", x0: "2", y0: "0", tf: "20",
      xmin: "-7", xmax: "7", ymin: "-3", ymax: "3", H: "v^2/2 - cos(x)" } },
  { id: "vanDerPol", modulo: "edo2", fase: "2",                                    // ciclo límite; origen: foco inestable
    datos: { tipo: "orden2", ecuacion: "x'' - mu*(1 - x^2)*x' + x = 0", t0: "0", x0: "0.5", y0: "0", tf: "30",
      xmin: "-3", xmax: "3", ymin: "-4", ymax: "4", parametros: { mu: 1 } } },
  { id: "vanDerPolRigido", modulo: "edo2", fase: "2",                              // rígido: Euler explícito necesita h < ≈0.03
    datos: { tipo: "orden2", ecuacion: "x'' - mu*(1 - x^2)*x' + x = 0", t0: "0", x0: "2", y0: "0", tf: "40", parametros: { mu: 20 } } },
  { id: "lotkaVolterra", modulo: "edo2", fase: "2",                                // centro no lineal en (c/d, a/b) = (1, 1)
    datos: { tipo: "sistema", f: "x*(a - b*y)", g: "y*(d*x - c)", t0: "0", x0: "2", y0: "1", tf: "30",
      xmin: "-0.2", xmax: "4", ymin: "-0.2", ymax: "3.5", H: "d*x - c*log(x) + b*y - a*log(y)", parametros: { a: 1, b: 1, c: 0.5, d: 0.5 } } },
  { id: "amortiguado", modulo: "edo2", fase: "2",                                  // y = e^{−x}(cos 2x + ½ sen 2x): foco estable
    datos: { tipo: "orden2", ecuacion: "y'' + 2*y' + 5*y = 0", t0: "0", x0: "1", y0: "0", tf: "6",
      xmin: "-1.5", xmax: "1.5", ymin: "-2", ymax: "2" } },
  { id: "resonancia", modulo: "edo2", fase: "2",                                   // y = cos x + x·sen(x)/2: no autónoma
    datos: { tipo: "orden2", ecuacion: "y'' + y = cos(x)", t0: "0", x0: "1", y0: "0", tf: "30" } },
  { id: "silla", modulo: "edo2", fase: "2",                                        // autovalores 3 y −1
    datos: { tipo: "sistema", f: "x + y", g: "4*x + y", t0: "0", x0: "1", y0: "-1.9", tf: "2",
      xmin: "-3", xmax: "3", ymin: "-3", ymax: "3" } },

  // --- Fases posteriores ---
  { id: "lorenz", modulo: "edo3d", fase: "5" }, // sistema 3D: fuera del plano de fase 2×2
  { id: "calor", modulo: "edp", fase: "3" },
  { id: "onda", modulo: "edp", fase: "3" },
  { id: "laplace", modulo: "edp", fase: "3" },
]);

/** Página de cada módulo disponible. Un módulo aparece aquí cuando su página existe. */
export const PAGINAS = Object.freeze({ integrales: "integrales.html", edo1: "edo1.html", edo2: "edo2.html" });

export const disponible = (ejemplo) => ejemplo.modulo in PAGINAS;

export function ejemplo(id) {
  return EJEMPLOS.find((e) => e.id === id) ?? null;
}
