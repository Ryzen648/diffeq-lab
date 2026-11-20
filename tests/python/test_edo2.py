"""Pruebas de EDO lineales de orden 2 y sistemas lineales 2×2.

Cada solución esperada está calculada a mano (o es la de SymPy dsolve en el
spike de la Fase 2) y se compara evaluando en varios puntos."""

import json
import math
import time

import sympy as sp

from edo2 import resolver_orden2, resolver_sistema

PUNTOS = (0.3, 1.1, 2.4)


def _f(texto, variable="x"):
    expr = sp.sympify(texto.replace("^", "**"), locals={"e": sp.E})
    return lambda v: float(expr.subs(sp.Symbol(variable), v))


def _orden2(F, x0, y0, v0):
    return json.loads(resolver_orden2(F, x0, y0, v0))


def _sistema(f, g, t0, x0, y0):
    return json.loads(resolver_sistema(f, g, t0, x0, y0))


def _coincide(r, esperada):
    y = _f(r["particularMathjs"])
    for p in PUNTOS:
        assert math.isclose(y(p), esperada(p), rel_tol=1e-12, abs_tol=1e-12), (p, y(p), esperada(p))
    v = r["verificacion"]
    assert v["simbolica"] and v["ci"], v


# --- Orden 2, coeficientes constantes ---------------------------------------------------

def test_raices_complejas_puras():
    r = _orden2("D2y + y", "0", "1", "0")  # y'' + y = 0
    assert r["clase"] == "coefConstantes"
    _coincide(r, math.cos)


def test_raices_reales_distintas():
    r = _orden2("D2y + 3*D1y + 2*y", "0", "1", "0")
    _coincide(r, lambda x: 2 * math.exp(-x) - math.exp(-2 * x))
    assert any(p["regla"] == "edo2.homogenea.distintas" for p in r["pasos"])


def test_raiz_doble():
    r = _orden2("D2y - 2*D1y + y", "0", "1", "0")
    _coincide(r, lambda x: (1 - x) * math.exp(x))
    assert any(p["regla"] == "edo2.homogenea.doble" for p in r["pasos"])


def test_raices_complejas_amortiguado():
    # y'' + 2y' + 5y = 0, y(0) = 1, y'(0) = 0  ->  e^{−x}(cos 2x + ½ sen 2x)
    r = _orden2("D2y + 2*D1y + 5*y", "0", "1", "0")
    _coincide(r, lambda x: math.exp(-x) * (math.cos(2 * x) + 0.5 * math.sin(2 * x)))
    assert any(p["regla"] == "edo2.homogenea.complejas" for p in r["pasos"])


def test_forzada_y_resonancia():
    # y'' + y = cos x: el forzamiento ya es solución de la homogénea (resonancia).
    r = _orden2("D2y + y - cos(x)", "0", "1", "0")
    _coincide(r, lambda x: math.cos(x) + x * math.sin(x) / 2)
    particular = next(p for p in r["pasos"] if p["regla"].startswith("edo2.particular"))
    assert particular["datos"]["resonancia"] == "si"
    # y'' + 3y' + 2y = eˣ: sin resonancia.
    r = _orden2("D2y + 3*D1y + 2*y - exp(x)", "0", "1", "0")
    _coincide(r, lambda x: math.exp(x) / 6 + 1.5 * math.exp(-x) - 2 * math.exp(-2 * x) / 3)
    particular = next(p for p in r["pasos"] if p["regla"].startswith("edo2.particular"))
    assert particular["datos"]["resonancia"] == "no"


def test_cauchy_euler():
    # x²y'' + xy' − y = 0, y(1) = 2, y'(1) = 0  ->  x + 1/x
    r = _orden2("x**2*D2y + x*D1y - y", "1", "2", "0")
    assert r["clase"] == "cauchyEuler"
    _coincide(r, lambda x: x + 1 / x)


def test_no_lineal_no_llama_a_dsolve():
    # El péndulo colgaba dsolve más de 4 minutos: aquí tiene que volver al momento.
    inicio = time.time()
    r = _orden2("D2y + sin(y)", "0", "1", "0")
    assert r["clase"] == "noLineal" and r["metodo"] is None
    assert time.time() - inicio < 2
    assert _orden2("D2y + (1 - y**2)*D1y + y", "0", "1", "0")["clase"] == "noLineal"  # Van der Pol


def test_coeficientes_variables_sin_metodo():
    r = _orden2("D2y + x*y", "0", "1", "0")  # Airy: lineal, pero no de esta fase
    assert r["clase"] == "coefVariables" and r["metodo"] is None


# --- Sistemas lineales 2×2 ---------------------------------------------------------------

def _coincide_sistema(r, ex, ey):
    fx, fy = (_f(t) for t in r["particularMathjs"])
    for p in PUNTOS:
        assert math.isclose(fx(p), ex(p), rel_tol=1e-12, abs_tol=1e-12), ("x", p)
        assert math.isclose(fy(p), ey(p), rel_tol=1e-12, abs_tol=1e-12), ("y", p)
    v = r["verificacion"]
    assert v["simbolica"] and v["ci"], v


def test_sistema_autovalores_reales():
    r = _sistema("y", "-2*x - 3*y", "0", "1", "0")
    assert r["caso"] == "distintos"
    _coincide_sistema(r, lambda t: 2 * math.exp(-t) - math.exp(-2 * t), lambda t: -2 * math.exp(-t) + 2 * math.exp(-2 * t))


def test_sistema_centro_en_forma_real():
    r = _sistema("y", "-x", "0", "1", "0")
    assert r["caso"] == "complejos"
    _coincide_sistema(r, math.cos, lambda t: -math.sin(t))
    assert "i" not in r["particularMathjs"][0].replace("sin", "").replace("pi", "")  # sin unidad imaginaria


def test_sistema_defectivo():
    # x' = x + y, y' = y, (0, 1)  ->  x = t eᵗ, y = eᵗ
    r = _sistema("x + y", "y", "0", "0", "1")
    assert r["caso"] == "defectiva"
    _coincide_sistema(r, lambda t: t * math.exp(t), math.exp)


def test_sistema_con_termino_constante():
    # x' = y, y' = −x + 1: equilibrio (1, 0); desde (0, 0): x = 1 − cos t, y = sen t
    r = _sistema("y", "-x + 1", "0", "0", "0")
    _coincide_sistema(r, lambda t: 1 - math.cos(t), math.sin)
    assert any(p["regla"] == "edo2.sis.equilibrio" for p in r["pasos"])


def test_sistema_no_lineal_sin_metodo():
    r = _sistema("x*(1 - y)", "0.5*y*(x - 1)", "0", "1", "2")  # Lotka–Volterra
    assert r["clase"] == "noLineal" and r["metodo"] is None
    assert _sistema("y", "-x + sin(t)", "0", "1", "0")["clase"] == "linealNoAutonomo"
