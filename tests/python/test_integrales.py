"""Pruebas de la integración simbólica. Se ejecutan con pytest (CI) o con
`npm run test:py` (Pyodide en Node, sin instalar Python)."""

import json
import math

from integrales import integrar


def _r(texto, a=None, b=None):
    return json.loads(integrar(texto, a, b))


def _pasos(paso):
    yield paso
    for h in paso["hijos"]:
        yield from _pasos(h)


def test_sustitucion_elige_la_u_de_libro():
    r = _r("x*exp(x**2)")
    assert r["conPasos"] and r["metodos"][0] == "sustitucion"
    sustituciones = [p for p in _pasos(r["pasos"]) if p["regla"] == "sustitucion"]
    assert sustituciones[0]["datos"]["u"] == "x^{2}", "debe elegir u = x², no u = e^{x²}"
    assert r["verificacion"]["simbolica"]


def test_fracciones_parciales_se_nombran():
    r = _r("(3*x + 5)/((x - 1)*(x + 2))")
    assert "fraccionesParciales" in r["metodos"]
    assert r["verificacion"]["simbolica"]


def test_por_partes():
    r = _r("x*exp(x)")
    assert r["metodos"][0] == "partes"
    partes = next(p for p in _pasos(r["pasos"]) if p["regla"] == "partes")
    assert partes["datos"]["u"] == "x"
    assert partes["datos"]["dv"] == "e^{x}"


def test_partes_ciclica():
    r = _r("exp(x)*sin(x)")
    assert r["metodos"][0] == "partesCiclica"
    assert r["verificacion"]["simbolica"]


def test_identidad_trigonometrica():
    assert "identidadTrig" in _r("sin(x)**2")["metodos"]


def test_sustitucion_trigonometrica():
    r = _r("1/(x**2*sqrt(x**2 - 4))")
    assert "sustitucionTrig" in r["metodos"]
    assert r["verificacion"]["simbolica"] or r["verificacion"]["numerica"]


def test_sin_pasos_pero_con_resultado_de_integrate():
    r = _r("sec(x)**3")
    assert not r["conPasos"]
    assert r["primitiva"] is not None
    assert r["verificacion"]["simbolica"] or r["verificacion"]["numerica"]


def test_sin_forma_cerrada():
    r = _r("x**x")
    assert r["sinFormaCerrada"] and r["primitiva"] is None


def test_aviso_de_logaritmo_sin_valor_absoluto():
    assert _r("1/x")["avisoLogaritmo"]
    assert not _r("x**2")["avisoLogaritmo"]


def test_funcion_especial_y_sin_equivalente_en_mathjs():
    r = _r("exp(-x**2)")
    assert "funcionEspecial" in r["metodos"]
    assert r["primitivaMathjs"] is None  # erf: la página no la evalúa en JS


def test_primitiva_para_mathjs():
    r = _r("x*exp(x)")
    assert r["primitivaMathjs"] is not None
    assert "exp(x)" in r["primitivaMathjs"]


def test_decimales_exactos():
    r = _r("0.5*x")
    assert r["primitiva"] == "\\frac{x^{2}}{4}"


def test_definidas():
    assert math.isclose(float(_r("x*exp(x)", "0", "1")["definida"]["numero"]), 1.0, rel_tol=1e-14)
    assert math.isclose(float(_r("sqrt(1 - x**2)", "-1", "1")["definida"]["numero"]), math.pi / 2, rel_tol=1e-14)
    assert math.isclose(float(_r("x**(-2)", "1", "oo")["definida"]["numero"]), 1.0, rel_tol=1e-14)
    d = _r("1/x", "1", "oo")["definida"]
    assert d["diverge"] == "+"


def test_barrow_coincide_con_primitiva_continua():
    d = _r("x*exp(x)", "0", "1")["definida"]
    assert d["barrow"]["coincide"]


def test_barrow_a_ciegas_falla_con_singularidad_interior():
    # F = −1/x daría F(1) − F(−1) = −2, pero 1/x² > 0 y la integral diverge por x = 0.
    d = _r("x**(-2)", "-1", "1")["definida"]
    assert d["diverge"] == "+"
    assert d["barrow"]["coincide"] is False
