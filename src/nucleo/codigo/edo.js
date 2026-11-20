// «Ver código Python equivalente» para EDO de primer orden y' = f(x, y).
//
// El script hace lo mismo que la página, con librerías estándar:
//   - SciPy solve_ivp (RK45 = Dormand–Prince, el mismo método que la página
//     programa a mano): sirve de comprobación independiente;
//   - Euler y RK4 escritos en NumPy, con su orden de convergencia observado;
//   - SymPy dsolve con el método elegido, cuando hay solución simbólica.
// El CI ejecuta los scripts de los ejemplos y compara y(x_final) con la página.

import { aPython } from "../python.js";

const HINT_DSOLVE = Object.freeze({
  separable: "separable",
  lineal: "1st_linear",
  bernoulli: "Bernoulli",
  exacta: "1st_exact",
});

/**
 * f: árbol de f(x, y) con los parámetros ya sustituidos; M, N: los de la forma
 * M + N·y' = 0 (hacen falta para el método exacto: escrita como y' = f, una
 * exacta deja de parecerlo y dsolve no reconoce el hint «1st_exact»).
 * x0, y0, xf: números. metodo: el simbólico elegido (o null).
 */
export function codigoEDO({ f, M = null, N = null, textoOriginal, x0, y0, xf, metodo = null }) {
  const fNumpy = aPython(f, "numpy");
  const fSympy = aPython(f, "sympy");
  const lineas = [
    `# DiffEq Lab: ${textoOriginal}`,
    `# y' = f(x, y) con y(${x0}) = ${y0}, resuelta hasta x = ${xf}`,
    "# Requiere: pip install numpy scipy sympy",
    "import json",
    "import numpy as np",
    "from scipy.integrate import solve_ivp",
    "",
    "def f(x, y):",
    `    return ${fNumpy}`,
    "",
    `x0, y0, xf = ${x0}, ${y0}, ${xf}`,
    "",
    "# Referencia: Dormand-Prince (RK45) de SciPy con tolerancias muy finas",
    "ref = solve_ivp(f, (x0, xf), [y0], method='RK45', rtol=1e-12, atol=1e-14)",
    "y_ref = ref.y[0, -1]",
    "print('RK45 (SciPy): y(xf) =', y_ref, '| evaluaciones de f:', ref.nfev)",
    "",
    "# Euler y RK4 de paso fijo, como los programa la página",
    "def euler(f, x0, y0, xf, n):",
    "    h = (xf - x0) / n",
    "    x, y = x0, y0",
    "    for _ in range(n):",
    "        y = y + h * f(x, y)",
    "        x = x + h",
    "    return y",
    "",
    "def rk4(f, x0, y0, xf, n):",
    "    h = (xf - x0) / n",
    "    x, y = x0, y0",
    "    for _ in range(n):",
    "        k1 = f(x, y)",
    "        k2 = f(x + h / 2, y + h * k1 / 2)",
    "        k3 = f(x + h / 2, y + h * k2 / 2)",
    "        k4 = f(x + h, y + h * k3)",
    "        y = y + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6",
    "        x = x + h",
    "    return y",
    "",
    "# Orden observado: pendiente de log(error) frente a log(h)",
    "ns = [2 ** k for k in range(4, 12)]",
    "for nombre, metodo, teorico in [('Euler', euler, 1), ('RK4', rk4, 4)]:",
    "    errores = [abs(metodo(f, x0, y0, xf, n) - y_ref) for n in ns]",
    "    utiles = [(np.log10(abs(xf - x0) / n), np.log10(e)) for n, e in zip(ns, errores) if e > 1e-12]",
    "    if len(utiles) >= 3:",
    "        p = np.polyfit(*zip(*utiles[-5:]), 1)[0]",
    "        print(f'{nombre}: orden observado {p:.2f} (teórico {teorico})')",
  ];
  if (metodo && HINT_DSOLVE[metodo]) {
    lineas.push(
      "",
      `# Solución simbólica con SymPy (método: ${metodo})`,
      "import sympy as sp",
      "x = sp.symbols('x')",
      "y = sp.Function('y')",
      ...(metodo === "exacta" && M && N
        ? [
          "# Forma M + N·y' = 0: así la reconoce dsolve como exacta",
          `M = sp.sympify("${aPython(M, "sympy")}", locals={"x": x, "y": y(x)}, rational=True)`,
          `N = sp.sympify("${aPython(N, "sympy")}", locals={"x": x, "y": y(x)}, rational=True)`,
          "ecuacion = sp.Eq(M + N * y(x).diff(x), 0)",
        ]
        : [
          `F = sp.sympify("${fSympy}", locals={"x": x, "y": y(x)}, rational=True)`,
          "ecuacion = sp.Eq(y(x).diff(x), F)",
        ]),
      "# simplify=False: sin él, dsolve intenta despejar y y puede tardar mucho (p. ej. en exactas)",
      `solucion = sp.dsolve(ecuacion, y(x), hint="${HINT_DSOLVE[metodo]}", simplify=False)`,
      "print(solucion)",
      "soluciones = solucion if isinstance(solucion, list) else [solucion]",
      "# solve_for_func=False: comprueba derivando sin despejar y (despejar una cúbica puede no terminar)",
      "print('Comprobación (checkodesol):', [sp.checkodesol(ecuacion, s, solve_for_func=False)[0] for s in soluciones])",
    );
  }
  lineas.push(
    "",
    "# Una línea con los resultados, para comparar automáticamente con la página",
    "print(json.dumps({'y_final': float(y_ref)}))",
  );
  return lineas.join("\n") + "\n";
}
