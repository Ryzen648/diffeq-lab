"""Utilidades comunes de la parte simbólica (se ejecuta en Pyodide y en CPython).

La expresión llega desde JavaScript ya validada y traducida a sintaxis de
Python por `src/nucleo/python.js`; aquí se vuelve a comprobar que solo tenga
caracteres de una fórmula antes de pasarla a SymPy.
"""

import json
import re

import sympy as sp

X = sp.Symbol("x", real=True)

# Solo nombres, números, operadores y paréntesis: lo que genera python.js.
_PERMITIDO = re.compile(r"^[A-Za-z0-9_+\-*/().,\s]*$")

# Funciones con el nombre que usa python.js en estilo "sympy".
_FUNCIONES = {
    nombre: getattr(sp, nombre)
    for nombre in (
        "sin cos tan sec csc cot asin acos atan asec acsc acot "
        "sinh cosh tanh sech csch coth asinh acosh atanh exp log sqrt Abs real_root"
    ).split()
}


def leer(texto, variables=("x",)):
    """Texto en sintaxis de Python -> expresión de SymPy.

    Las variables se declaran reales (así sqrt(x**2) no se simplifica a x a
    ciegas). Los decimales se leen como fracciones exactas (rational=True).
    """
    if not _PERMITIDO.match(texto):
        raise ValueError("expresión con caracteres no admitidos")
    locales = dict(_FUNCIONES)
    locales.update({"pi": sp.pi, "E": sp.E})
    for nombre in variables:
        locales[nombre] = X if nombre == "x" else sp.Symbol(nombre, real=True)
    return sp.sympify(texto, locals=locales, rational=True)


def leer_limite(texto):
    """'oo', '-oo' o un número/expresión -> expresión de SymPy."""
    texto = texto.strip()
    if texto in ("oo", "+oo"):
        return sp.oo
    if texto == "-oo":
        return -sp.oo
    return leer(texto, variables=())


def tex(expr):
    """LaTeX con la notación de clase: ln en vez de log, arctan en vez de atan."""
    return sp.latex(expr, ln_notation=True, inv_trig_style="full")


def numero(expr, digitos=17):
    """Valor numérico como texto (float de JS) o None si no es real y finito."""
    try:
        valor = complex(sp.N(expr, digitos))
    except (TypeError, ValueError):
        return None
    if abs(valor.imag) > 1e-12 * max(1.0, abs(valor.real)) or valor.real != valor.real:
        return None
    if valor.real in (float("inf"), float("-inf")):
        return None
    return repr(valor.real)


# --- Expresión de SymPy -> texto que entiende math.js -----------------------
# Así la interfaz puede evaluar el resultado en JavaScript, sin SymPy, y
# comprobarlo de forma independiente (p. ej. derivar numéricamente la
# primitiva y compararla con el integrando).

_MATHJS = {
    sp.sin: "sin", sp.cos: "cos", sp.tan: "tan", sp.sec: "sec", sp.csc: "csc", sp.cot: "cot",
    sp.asin: "asin", sp.acos: "acos", sp.atan: "atan", sp.asec: "asec", sp.acsc: "acsc", sp.acot: "acot",
    sp.sinh: "sinh", sp.cosh: "cosh", sp.tanh: "tanh", sp.sech: "sech", sp.csch: "csch", sp.coth: "coth",
    sp.asinh: "asinh", sp.acosh: "acosh", sp.atanh: "atanh",
    sp.exp: "exp", sp.log: "log", sp.Abs: "abs",
}


class _ImpresoraMathjs(sp.printing.str.StrPrinter):
    def _print_Pow(self, expr):
        base, exp = expr.as_base_exp()
        if exp == sp.Rational(1, 2):
            return f"sqrt({self._print(base)})"
        if exp == -1:
            return f"1/({self._print(base)})"
        return f"({self._print(base)})^({self._print(exp)})"

    def _print_Function(self, expr):
        nombre = _MATHJS.get(expr.func)
        if nombre is None:
            raise ValueError(f"sin equivalente en math.js: {expr.func}")
        if expr.func == sp.log and len(expr.args) == 2:
            return f"(log({self._print(expr.args[0])})/log({self._print(expr.args[1])}))"
        return f"{nombre}({', '.join(self._print(a) for a in expr.args)})"

    def _print_Rational(self, expr):
        return f"({expr.p}/{expr.q})"

    def _print_Exp1(self, expr):
        return "e"

    def _print_Pi(self, expr):
        return "pi"

    def _print_ImaginaryUnit(self, expr):
        raise ValueError("número complejo")


def a_mathjs(expr):
    """Texto para math.js, o None si usa funciones que la página no evalúa (erf, Si…)."""
    try:
        return _ImpresoraMathjs().doprint(expr)
    except (ValueError, TypeError, AttributeError):
        return None


def responder(**datos):
    """Respuesta para JavaScript: un objeto JSON en texto."""
    return json.dumps(datos, ensure_ascii=False)
