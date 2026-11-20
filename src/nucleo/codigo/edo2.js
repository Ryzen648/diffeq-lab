// «Ver código Python equivalente» para el plano de fase: un sistema
// x' = f(t, x, y), y' = g(t, x, y) (una EDO de orden 2 se escribe así con
// x = posición, y = velocidad). El script hace lo mismo que la página:
//   - SciPy solve_ivp (RK45, el Dormand–Prince que la página programa a mano);
//   - RK4 de paso fijo en NumPy, con su orden observado;
//   - cada equilibrio que encontró la página: jacobiano por diferencias
//     centradas y autovalores con numpy.linalg.eig;
//   - SymPy dsolve si el problema es lineal (los no lineales no tienen método
//     simbólico en esta fase).

import { aPython } from "../python.js";

const numero = (v) => String(Number(v.toPrecision(15)));

/**
 * f, g: árboles en t, x, y con los parámetros ya sustituidos.
 * equilibrios: [{ x, y }]. simbolico: null | { tipo: "sistema" } | { tipo: "orden2", F } (F en x, y, D1y, D2y).
 * nombres: { t, x, y } que ve el usuario (para los comentarios).
 */
export function codigoPlano({ f, g, textoOriginal, nombres, t0, Y0, tf, equilibrios = [], simbolico = null }) {
  const lineas = [
    `# DiffEq Lab: ${textoOriginal}`,
    `# Sistema x' = f(t, x, y), y' = g(t, x, y); en pantalla: x = ${nombres.x}, y = ${nombres.y}, t = ${nombres.t}`,
    `# Condición inicial (x, y)(${numero(t0)}) = (${numero(Y0[0])}, ${numero(Y0[1])}), hasta t = ${numero(tf)}`,
    "# Requiere: pip install numpy scipy sympy",
    "import json",
    "import numpy as np",
    "from scipy.integrate import solve_ivp",
    "",
    "def F(t, Y):",
    "    x, y = Y",
    `    return [${aPython(f, "numpy")}, ${aPython(g, "numpy")}]`,
    "",
    `t0, tf = ${numero(t0)}, ${numero(tf)}`,
    `Y0 = [${numero(Y0[0])}, ${numero(Y0[1])}]`,
    "",
    "# Referencia: Dormand-Prince (RK45) de SciPy con tolerancias muy finas",
    "ref = solve_ivp(F, (t0, tf), Y0, method='RK45', rtol=1e-12, atol=1e-14)",
    "Y_ref = ref.y[:, -1]",
    "print('RK45 (SciPy): (x, y)(tf) =', Y_ref, '| evaluaciones:', ref.nfev)",
    "",
    "# RK4 de paso fijo, como lo programa la página, y su orden observado",
    "def rk4(F, t0, Y0, tf, n):",
    "    h = (tf - t0) / n",
    "    t, Y = t0, np.array(Y0, dtype=float)",
    "    for _ in range(n):",
    "        k1 = np.array(F(t, Y))",
    "        k2 = np.array(F(t + h / 2, Y + h * k1 / 2))",
    "        k3 = np.array(F(t + h / 2, Y + h * k2 / 2))",
    "        k4 = np.array(F(t + h, Y + h * k3))",
    "        Y = Y + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6",
    "        t = t + h",
    "    return Y",
    "",
    "ns = [2 ** k for k in range(4, 12)]",
    "escala = max(1.0, np.max(np.abs(Y_ref)))",
    "errores = [np.max(np.abs(rk4(F, t0, Y0, tf, n) - Y_ref)) / escala for n in ns]",
    "utiles = [(np.log10(abs(tf - t0) / n), np.log10(e)) for n, e in zip(ns, errores) if e > 1e-12]",
    "if len(utiles) >= 3:",
    "    print(f'RK4: orden observado {np.polyfit(*zip(*utiles[-5:]), 1)[0]:.2f} (teórico 4)')",
  ];
  if (equilibrios.length) {
    lineas.push(
      "",
      "# Equilibrios encontrados por la página y su linealización",
      "def jacobiano(F, x, y, d=1e-6):",
      "    hx, hy = d * max(1, abs(x)), d * max(1, abs(y))",
      "    fx = (np.array(F(0, [x + hx, y])) - np.array(F(0, [x - hx, y]))) / (2 * hx)",
      "    fy = (np.array(F(0, [x, y + hy])) - np.array(F(0, [x, y - hy]))) / (2 * hy)",
      "    return np.column_stack([fx, fy])",
      "",
      `equilibrios = [${equilibrios.map((e) => `(${numero(e.x)}, ${numero(e.y)})`).join(", ")}]`,
      "for xe, ye in equilibrios:",
      "    J = jacobiano(F, xe, ye)",
      "    autovalores = np.linalg.eigvals(J)",
      "    print(f'({xe:.6g}, {ye:.6g}): |F| = {np.max(np.abs(F(0, [xe, ye]))):.1e}, traza = {np.trace(J):.6g}, det = {np.linalg.det(J):.6g}, autovalores = {np.round(autovalores, 6)}')",
    );
  }
  if (simbolico?.tipo === "sistema") {
    lineas.push(
      "",
      "# Solución simbólica (sistema lineal) con SymPy",
      "import sympy as sp",
      "t = sp.symbols('t')",
      "x, y = sp.Function('x'), sp.Function('y')",
      "ambito = {'t': t, 'x': x(t), 'y': y(t)}",
      `f = sp.sympify("${aPython(f, "sympy")}", locals=ambito, rational=True)`,
      `g = sp.sympify("${aPython(g, "sympy")}", locals=ambito, rational=True)`,
      "ecuaciones = [sp.Eq(x(t).diff(t), f), sp.Eq(y(t).diff(t), g)]",
      "solucion = sp.dsolve(ecuaciones, [x(t), y(t)], ics={x(t0): sp.nsimplify(Y0[0]), y(t0): sp.nsimplify(Y0[1])})",
      "print(solucion)",
      "print('Comprobación (checkodesol):', sp.checkodesol(ecuaciones, solucion))",
    );
  } else if (simbolico?.tipo === "orden2") {
    lineas.push(
      "",
      "# Solución simbólica (lineal de orden 2) con SymPy",
      "import sympy as sp",
      "x = sp.symbols('x')",
      "y = sp.Function('y')",
      `F = sp.sympify("${aPython(simbolico.F, "sympy")}", locals={'x': x, 'y': y(x), 'D1y': y(x).diff(x), 'D2y': y(x).diff(x, 2)}, rational=True)`,
      "ecuacion = sp.Eq(F, 0)",
      "ci = {y(t0): sp.nsimplify(Y0[0]), y(x).diff(x).subs(x, t0): sp.nsimplify(Y0[1])}",
      "solucion = sp.dsolve(ecuacion, y(x), ics=ci)",
      "print(solucion)",
      "print('Comprobación (checkodesol):', sp.checkodesol(ecuacion, solucion))",
    );
  }
  lineas.push(
    "",
    "# Una línea con los resultados, para comparar automáticamente con la página",
    "print(json.dumps({'x_final': float(Y_ref[0]), 'y_final': float(Y_ref[1])}))",
  );
  return lineas.join("\n") + "\n";
}
