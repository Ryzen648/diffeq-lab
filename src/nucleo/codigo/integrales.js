// «Ver código Python equivalente» para el módulo de integrales.
//
// El script hace en Python lo mismo que la página: la primitiva con SymPy y
// su comprobación, el valor exacto, el valor numérico con SciPy (QUADPACK,
// una cuadratura adaptativa de referencia que la página NO usa: así sirve de
// comprobación independiente) y, si la integral es propia, la regla de
// Simpson compuesta escrita a mano con su orden de convergencia.
// El CI ejecuta los scripts de los ejemplos y compara con la página.

import { aPython } from "../python.js";

/** Límite como texto: { sympy: "pi/2" | "oo", numpy: "np.pi/2" | "np.inf" }. */
export function limitePython(nodoOInfinito) {
  if (nodoOInfinito === Infinity) return { sympy: "sp.oo", numpy: "np.inf" };
  if (nodoOInfinito === -Infinity) return { sympy: "-sp.oo", numpy: "-np.inf" };
  return { sympy: `sp.sympify("${aPython(nodoOInfinito, "sympy")}", rational=True)`, numpy: aPython(nodoOInfinito, "numpy") };
}

/**
 * nodo: árbol del integrando (con los parámetros ya sustituidos por números).
 * a, b: árbol del límite, ±Infinity, o null (indefinida).
 */
export function codigoIntegral({ nodo, textoOriginal, a = null, b = null }) {
  const fSympy = aPython(nodo, "sympy");
  const fNumpy = aPython(nodo, "numpy");
  const definida = a !== null && b !== null;
  const lineas = [
    `# DiffEq Lab: integral de f(x) = ${textoOriginal}`,
    "# Requiere: pip install numpy scipy sympy",
    "import json",
    "import numpy as np",
    "import sympy as sp",
    "from scipy import integrate",
    "",
    "x = sp.symbols('x', real=True)",
    `f = sp.sympify("${fSympy}", locals={"x": x}, rational=True)`,
    "",
    "# Primitiva con SymPy y comprobación: F'(x) - f(x) debe simplificarse a 0",
    "F = sp.integrate(f, x)",
    "print('F(x) =', F)",
    "print(\"F'(x) - f(x) =\", sp.simplify(sp.diff(F, x) - f))",
  ];
  if (!definida) return lineas.join("\n") + "\n";

  const la = limitePython(a);
  const lb = limitePython(b);
  const finitos = a !== Infinity && a !== -Infinity && b !== Infinity && b !== -Infinity;
  lineas.push(
    "",
    "# Integral definida",
    `a_s, b_s = ${la.sympy}, ${lb.sympy}`,
    "exacto = sp.integrate(f, (x, a_s, b_s))",
    "print('Valor exacto:', exacto)",
    "",
    "# Valor numérico con SciPy (QUADPACK): referencia independiente de la página",
    `def f_num(x):`,
    `    return ${fNumpy}`,
    "",
    `a, b = ${la.numpy}, ${lb.numpy}`,
    "valor, error_estimado = integrate.quad(f_num, a, b, limit=200)",
    "print('quad:', valor, '± error estimado', error_estimado)",
  );
  if (finitos) {
    lineas.push(
      "",
      "# Regla de Simpson compuesta (n par) y su orden de convergencia observado",
      "def simpson(f, a, b, n):",
      "    xs = np.linspace(a, b, n + 1)",
      "    ys = f(xs)",
      "    h = (b - a) / n",
      "    return h / 3 * (ys[0] + ys[-1] + 4 * ys[1:-1:2].sum() + 2 * ys[2:-1:2].sum())",
      "",
      "ns = [2 ** k for k in range(1, 11)]",
      "errores = [abs(simpson(f_num, a, b, n) - valor) for n in ns]",
      "for n, e in zip(ns, errores):",
      "    print(f'n = {n:5d}   error = {e:.3e}')",
      "# Pendiente log-log con los puntos por encima del redondeo (~1e-13)",
      "utiles = [(np.log10((b - a) / n), np.log10(e)) for n, e in zip(ns, errores) if e > 1e-13]",
      "if len(utiles) >= 3:",
      "    pendiente = np.polyfit(*zip(*utiles[-5:]), 1)[0]",
      "    print('Orden observado de Simpson:', round(pendiente, 2), '(teórico: 4)')",
    );
  }
  lineas.push(
    "",
    "# Una línea con los resultados, para comparar automáticamente con la página",
    "print(json.dumps({'quad': valor, 'exacto': float(exacto) if exacto.is_finite else str(exacto)}))",
  );
  return lineas.join("\n") + "\n";
}
