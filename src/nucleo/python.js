// Árbol de math.js -> texto en sintaxis de Python.
//
// Se usa en dos sitios:
//   - para enviar la expresión a SymPy (Pyodide) sin ambigüedades;
//   - para el botón «Ver código Python equivalente», en dos sabores:
//       "sympy":  sin(x), exp(x), log(x), real_root(x, 3)…
//       "numpy":  np.sin(x), np.exp(x), np.log(x), np.cbrt(x)…
//
// Los decimales se escriben tal cual (0.3); en SymPy se leen con
// `rational=True`, así 0.3 es exactamente 3/10 y la integral sale exacta.

const SYMPY = Object.freeze({
  sin: "sin", cos: "cos", tan: "tan", sec: "sec", csc: "csc", cot: "cot",
  asin: "asin", acos: "acos", atan: "atan", asec: "asec", acsc: "acsc", acot: "acot",
  sinh: "sinh", cosh: "cosh", tanh: "tanh", sech: "sech", csch: "csch", coth: "coth",
  asinh: "asinh", acosh: "acosh", atanh: "atanh",
  exp: "exp", log: "log", sqrt: "sqrt", abs: "Abs",
});

const NUMPY = Object.freeze({
  sin: "np.sin", cos: "np.cos", tan: "np.tan",
  asin: "np.arcsin", acos: "np.arccos", atan: "np.arctan",
  sinh: "np.sinh", cosh: "np.cosh", tanh: "np.tanh",
  asinh: "np.arcsinh", acosh: "np.arccosh", atanh: "np.arctanh",
  exp: "np.exp", log: "np.log", log10: "np.log10", sqrt: "np.sqrt", cbrt: "np.cbrt", abs: "np.abs",
});

/** Las que NumPy no trae se escriben con su definición. */
const NUMPY_DEFINICION = Object.freeze({
  sec: (a) => `1/np.cos(${a})`, csc: (a) => `1/np.sin(${a})`, cot: (a) => `1/np.tan(${a})`,
  asec: (a) => `np.arccos(1/(${a}))`, acsc: (a) => `np.arcsin(1/(${a}))`, acot: (a) => `np.arctan(1/(${a}))`,
  sech: (a) => `1/np.cosh(${a})`, csch: (a) => `1/np.sinh(${a})`, coth: (a) => `1/np.tanh(${a})`,
  nthRoot: (a, n = "2") => `np.sign(${a})*np.abs(${a})**(1/(${n}))`,
});

const SYMPY_DEFINICION = Object.freeze({
  log10: (a) => `log(${a}, 10)`,
  cbrt: (a) => `real_root(${a}, 3)`,
  nthRoot: (a, n = "2") => `real_root(${a}, ${n})`,
});

const PRECEDENCIA = Object.freeze({ add: 1, subtract: 1, multiply: 2, divide: 2, unaryMinus: 3, unaryPlus: 3, pow: 4 });

function precedencia(nodo) {
  // Todos los niveles de paréntesis, no solo uno: `escribir` los quita todos, así
  // que la precedencia tiene que ser la del nodo de dentro. El editor visual
  // escribe x^(((5)/(2))); con un solo nivel, ((5)/(2)) contaba como un átomo,
  // el exponente salía sin paréntesis (x**5/2) y SymPy integraba otra función.
  let n = nodo;
  while (n.isParenthesisNode) n = n.content;
  if (n.isOperatorNode) return PRECEDENCIA[n.fn] ?? 0;
  if (n.isConstantNode && n.value < 0) return 3; // un número negativo se comporta como −a
  return 9;
}

function numero(v) {
  if (Number.isInteger(v)) return String(v);
  return String(v); // 0.3, 1e-05: ambas son sintaxis válida en Python
}

/**
 * `estilo`: "sympy" o "numpy". `constantes`: cómo escribir pi y e en cada estilo.
 */
export function aPython(nodo, estilo = "sympy") {
  const tablas = estilo === "numpy"
    ? { f: NUMPY, def: NUMPY_DEFINICION, pi: "np.pi", e: "np.e" }
    : { f: SYMPY, def: SYMPY_DEFINICION, pi: "pi", e: "E" };

  const escribir = (n) => {
    if (n.isParenthesisNode) return escribir(n.content);
    if (n.isConstantNode) return numero(n.value);
    if (n.isSymbolNode) {
      if (n.name === "pi") return tablas.pi;
      if (n.name === "e") return tablas.e;
      return n.name;
    }
    if (n.isOperatorNode) {
      const p = PRECEDENCIA[n.fn];
      // Envuelve el operando si su precedencia es menor (o igual en el lado
      // derecho de - y /, y en la base de **, que en Python asocia por la derecha).
      const operando = (hijo, lado) => {
        const q = precedencia(hijo);
        const necesita = q < p
          || (q === p && lado === "der" && (n.fn === "subtract" || n.fn === "divide"))
          || (n.fn === "pow" && lado === "izq" && q <= p);
        const texto = escribir(hijo);
        return necesita ? `(${texto})` : texto;
      };
      if (n.fn === "unaryMinus") return `-${operando(n.args[0], "der")}`;
      if (n.fn === "unaryPlus") return operando(n.args[0], "der");
      const simbolo = { add: " + ", subtract: " - ", multiply: "*", divide: "/", pow: "**" }[n.fn];
      return `${operando(n.args[0], "izq")}${simbolo}${operando(n.args[1], "der")}`;
    }
    if (n.isFunctionNode) {
      const nombre = n.fn.name;
      const args = n.args.map(escribir);
      if (nombre in tablas.def) return tablas.def[nombre](...args);
      if (nombre in tablas.f) return `${tablas.f[nombre]}(${args.join(", ")})`;
      throw new Error(`función sin equivalente en Python: ${nombre}`);
    }
    throw new Error(`nodo no admitido: ${n.type}`);
  };
  return escribir(nodo);
}
