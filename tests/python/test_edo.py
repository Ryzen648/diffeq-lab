"""Pruebas de los métodos simbólicos para EDO de primer orden.

Cada caso se comprueba contra la solución conocida (calculada a mano) y
con la verificación por sustitución que hace el propio módulo."""

import json
import math

import sympy as sp

from edo import resolver_edo1


def _r(M, N, x0, y0, metodo=None):
    return json.loads(resolver_edo1(M, N, x0, y0, metodo))


def _evaluar(texto_mathjs, x):
    """Evalúa la salida para math.js con SymPy (^ -> **)."""
    return float(sp.sympify(texto_mathjs.replace("^", "**"), locals={"e": sp.E}).subs(sp.Symbol("x"), x))


def _ok(r):
    v = r["verificacion"]
    assert v["simbolica"] or v["numerica"], v
    assert v["ci"]


def test_separable_con_ci():
    # y' = x y, y(0) = 1  ->  y = e^{x²/2}
    r = _r("-x*y", "1", "0", "1")
    assert r["tipos"]["separable"] and r["tipos"]["lineal"] and r["tipos"]["homogenea"]
    assert r["metodo"] == "separable"
    _ok(r)
    assert math.isclose(_evaluar(r["particularMathjs"], 1.3), math.exp(1.3 ** 2 / 2), rel_tol=1e-12)


def test_separable_pierde_la_solucion_constante():
    # logística y' = y(1 − y/10): y = 0 e y = 10 son soluciones constantes.
    r = _r("-y*(1 - y/10)", "1", "0", "1")
    assert set(r["constantes"]) == {"0", "10"}
    _ok(r)
    esperado = 10 / (1 + 9 * math.exp(-2.0))
    assert math.isclose(_evaluar(r["particularMathjs"], 2.0), esperado, rel_tol=1e-12)


def test_ci_en_un_equilibrio():
    r = _r("-y*(1 - y/10)", "1", "0", "10")
    assert r["particular"] == "10"
    assert any(p["regla"] == "edo.ciEquilibrio" for p in r["pasos"])


def test_lineal_factor_integrante():
    # y' + 2y = eˣ, y(0) = 1  ->  y = eˣ/3 + (2/3)e^{−2x}
    r = _r("2*y - exp(x)", "1", "0", "1")
    assert r["tipos"]["lineal"] and not r["tipos"]["homogenea"]
    assert r["metodo"] == "lineal"
    _ok(r)
    reglas = [p["regla"] for p in r["pasos"]]
    assert "edo.lineal.factor" in reglas
    x = 0.8
    assert math.isclose(_evaluar(r["particularMathjs"], x), math.exp(x) / 3 + 2 * math.exp(-2 * x) / 3, rel_tol=1e-12)


def test_bernoulli():
    # y' + y/x = x y², y(1) = 1  ->  y = 1/(x(2 − x))
    r = _r("y/x - x*y**2", "1", "1", "1")
    assert r["tipos"]["bernoulli"] == "2"
    r = _r("y/x - x*y**2", "1", "1", "1", "bernoulli")
    assert r["metodo"] == "bernoulli"
    _ok(r)
    assert math.isclose(_evaluar(r["particularMathjs"], 1.5), 1 / (1.5 * 0.5), rel_tol=1e-12)


def test_exacta_implicita():
    # 2xy + (x² + 3y²) y' = 0, y(1) = 1  ->  x² y + y³ = 2 (cúbica en y: se deja implícita)
    r = _r("2*x*y", "x**2 + 3*y**2", "1", "1")
    assert r["tipos"]["exacta"] == "directa"
    r = _r("2*x*y", "x**2 + 3*y**2", "1", "1", "exacta")
    _ok(r)
    assert r["implicita"] is not None
    assert float(r["implicita"]["K"]) == 2.0


def test_exacta_con_exponencial():
    r = _r("y*cos(x) + 2*x*exp(y)", "sin(x) + x**2*exp(y) - 1", "0", "0", "exacta")
    assert r["metodo"] == "exacta"
    _ok(r)


def test_exacta_por_fraccion():
    # Escrita como y' = −2xy/(x² + 3y²): no es exacta con N = 1, sí al multiplicar por el denominador.
    r = _r("2*x*y/(x**2 + 3*y**2)", "1", "1", "1", "exacta")
    assert r["tipos"]["exacta"] == "fraccion"
    _ok(r)


def test_factor_integrante_en_x():
    # (3xy + y²) + (x² + xy) y' = 0 tiene factor integrante μ(x) = x.
    r = _r("3*x*y + y**2", "x**2 + x*y", "1", "1", "exacta")
    assert r["tipos"]["exacta"] == "factorX"
    _ok(r)


def test_sin_metodo_riccati():
    r = _r("-(x**2 + y**2)", "1", "0", "0")
    assert r["tipos"]["riccati"]
    assert r["metodo"] is None and r["metodos"] == []


def test_integracion_directa():
    r = _r("-cos(x)", "1", "0", "2")
    _ok(r)
    assert math.isclose(_evaluar(r["particularMathjs"], 1.0), math.sin(1.0) + 2, rel_tol=1e-12)
