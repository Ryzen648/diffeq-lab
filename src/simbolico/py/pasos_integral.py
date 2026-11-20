"""Árbol de reglas de SymPy (`integral_steps`) -> pasos explicables.

`sympy.integrals.manualintegrate.integral_steps(f, x)` devuelve un árbol de
reglas (sustitución, partes, reescritura…) que imita cómo se integra a mano.
Aquí ese árbol se convierte en una lista anidada de pasos con:
  - "regla": clave del tipo de paso; la interfaz la traduce (paso.<regla>);
  - "integral" y "resultado": LaTeX de la integral del paso y de su primitiva;
  - "datos": LaTeX de lo que el texto del paso necesita (u, du, dv…);
  - "hijos": los pasos de las integrales que aparecen dentro.

Tres decisiones (comprobadas con el árbol real de SymPy 1.14):
  1. AlternativeRule trae varias rutas válidas y la primera no siempre es la
     de libro: para x·e^{x²} propone primero u = e^{x²}. Se elige la ruta con
     menos pasos y, a igualdad, la de u más sencilla.
  2. Las fracciones parciales no tienen regla propia: llegan como
     RewriteRule cuyo resultado es apart(f). Se detecta para nombrarlas.
  3. ReciprocalRule da log(u) sin valor absoluto (convención de SymPy). La
     interfaz lo avisa en vez de cambiar el resultado en silencio.
"""

import sympy as sp
from sympy.integrals import manualintegrate as mi

from comun import tex

MAX_PASOS = 80  # tope para que un árbol enorme no inunde la pantalla

_TRIG = (sp.sin, sp.cos, sp.tan, sp.sec, sp.csc, sp.cot)

_ESPECIALES = {
    "ErfRule": "erf", "SiRule": "Si", "CiRule": "Ci", "EiRule": "Ei", "LiRule": "li",
    "ShiRule": "Shi", "ChiRule": "Chi", "FresnelSRule": "S", "FresnelCRule": "C",
    "UpperGammaRule": "\\Gamma", "PolylogRule": "\\operatorname{Li}",
    "EllipticERule": "E", "EllipticFRule": "F",
}

_TRIG_BASICAS = {"SinRule", "CosRule", "Sec2Rule", "Csc2Rule", "SecTanRule", "CscCotRule"}


def limpiar(expr):
    """Renombra las variables auxiliares de SymPy (_u) a nombres legibles (u)."""
    if not hasattr(expr, "free_symbols"):
        return expr
    cambios = {s: sp.Symbol(s.name.lstrip("_") or "u") for s in expr.free_symbols if s.name.startswith("_")}
    return expr.xreplace(cambios) if cambios else expr


def _subreglas(regla):
    hijos = []
    for valor in vars(regla).values():
        if isinstance(valor, mi.Rule):
            hijos.append(valor)
        elif isinstance(valor, (list, tuple)):
            hijos.extend(v for v in valor if isinstance(v, mi.Rule))
    return hijos


def contar_nodos(regla):
    if isinstance(regla, mi.AlternativeRule):
        return min(contar_nodos(a) for a in regla.alternatives)
    return 1 + sum(contar_nodos(h) for h in _subreglas(regla))


def _complejidad_u(regla):
    """Suma de la complejidad de las u de las sustituciones (menos es más de libro)."""
    total = 0
    if isinstance(regla, mi.URule):
        total += sp.count_ops(regla.u_func)
    for hijo in _subreglas(regla):
        total += _complejidad_u(hijo)
    return total


def elegir(regla):
    """Desenvuelve AlternativeRule eligiendo la ruta más sencilla."""
    while isinstance(regla, mi.AlternativeRule):
        regla = min(regla.alternatives, key=lambda a: (contar_nodos(a), _complejidad_u(a)))
    return regla


def es_desconocida(regla):
    """¿Hay algún DontKnowRule en la ruta elegida? Entonces no hay pasos completos."""
    regla = elegir(regla)
    if isinstance(regla, mi.DontKnowRule):
        return True
    return any(es_desconocida(h) for h in _subreglas(regla))


def _tipo_reescritura(regla):
    f, g, v = regla.integrand, regla.rewritten, regla.variable
    if isinstance(regla, mi.CompleteSquareRule):
        return "completarCuadrado"
    try:
        if f.is_rational_function(v) and g.is_Add and sp.simplify(sp.apart(f, v) - g) == 0:
            return "fraccionesParciales"
    except (sp.PolynomialError, NotImplementedError):
        pass
    if f.has(*_TRIG) or f.has(sp.sinh, sp.cosh, sp.tanh):
        return "identidadTrig"
    if sp.expand(f) == g:
        return "desarrollar"
    return "reescribir"


class _Contador:
    def __init__(self):
        self.n = 0


def traducir(regla, contador=None):
    """Regla (ya sin AlternativeRule) -> dict de paso con sus hijos."""
    contador = contador or _Contador()
    regla = elegir(regla)
    contador.n += 1
    nombre = type(regla).__name__
    var = limpiar(regla.variable) if getattr(regla, "variable", None) is not None else None
    integrando = limpiar(regla.integrand) if getattr(regla, "integrand", None) is not None else None

    paso = {"regla": "otra", "tipo": nombre, "datos": {}, "hijos": []}
    if integrando is not None and var is not None:
        paso["integral"] = tex(sp.Integral(integrando, var))
        try:
            paso["resultado"] = tex(limpiar(regla.eval()))
        except Exception:  # noqa: BLE001 - algunas reglas internas no se evalúan solas
            paso["resultado"] = None

    def hijo(sub):
        if contador.n >= MAX_PASOS:
            return {"regla": "recortado", "datos": {}, "hijos": []}
        return traducir(sub, contador)

    d = paso["datos"]
    if isinstance(regla, mi.ConstantRule):
        paso["regla"] = "constante"
    elif isinstance(regla, (mi.PowerRule, mi.NestedPowRule)):
        paso["regla"] = "potencia"
        d["n"] = tex(regla.exp)
    elif isinstance(regla, mi.ReciprocalRule):
        paso["regla"] = "reciproco"
        d["u"] = tex(limpiar(regla.base))
    elif isinstance(regla, mi.ExpRule):
        paso["regla"] = "exponencial" if regla.base == sp.E else "exponencialBase"
        d["base"] = tex(regla.base)
    elif isinstance(regla, mi.ConstantTimesRule):
        paso["regla"] = "constanteFuera"
        d["c"] = tex(regla.constant)
        d["resto"] = tex(sp.Integral(limpiar(regla.other), var))
        paso["hijos"].append(hijo(regla.substep))
    elif isinstance(regla, mi.AddRule):
        paso["regla"] = "suma"
        paso["hijos"] = [hijo(s) for s in regla.substeps]
    elif isinstance(regla, mi.URule):
        paso["regla"] = "sustitucion"
        u = sp.Symbol("u")
        d["u"] = tex(limpiar(regla.u_func))
        d["du"] = tex(sp.diff(limpiar(regla.u_func), var))
        d["var"] = tex(var)
        d["integralU"] = tex(sp.Integral(limpiar(regla.substep.integrand).subs(sp.Symbol("u"), u), u))
        paso["hijos"].append(hijo(regla.substep))
    elif isinstance(regla, mi.CyclicPartsRule):
        paso["regla"] = "partesCiclica"
        d["coeficiente"] = tex(regla.coefficient)
        for parte in regla.parts_rules:
            d.setdefault("partes", []).append({"u": tex(limpiar(parte.u)), "dv": tex(limpiar(parte.dv))})
    elif isinstance(regla, mi.PartsRule):
        paso["regla"] = "partes"
        u, dv = limpiar(regla.u), limpiar(regla.dv)
        d["u"] = tex(u)
        d["dv"] = tex(dv)
        d["du"] = tex(sp.diff(u, var))
        d["v"] = tex(limpiar(regla.v_step.eval()))
        d["var"] = tex(var)
        paso["hijos"].append(hijo(regla.v_step))
        if regla.second_step is not None:
            paso["hijos"].append(hijo(regla.second_step))
    elif isinstance(regla, mi.RewriteRule):  # incluye CompleteSquareRule
        paso["regla"] = _tipo_reescritura(regla)
        d["reescrito"] = tex(limpiar(regla.rewritten))
        paso["hijos"].append(hijo(regla.substep))
    elif isinstance(regla, mi.TrigSubstitutionRule):
        paso["regla"] = "sustitucionTrig"
        d["theta"] = tex(limpiar(regla.theta))
        d["x"] = tex(limpiar(regla.func))
        d["var"] = tex(var)
        d["reescrito"] = tex(limpiar(regla.rewritten))
        paso["hijos"].append(hijo(regla.substep))
    elif isinstance(regla, mi.ArctanRule):
        paso["regla"] = "arcotangente"
    elif isinstance(regla, (mi.ArcsinRule, mi.ArcsinhRule)):
        paso["regla"] = "arcoseno" if isinstance(regla, mi.ArcsinRule) else "arcosenoHiperbolico"
    elif nombre in _TRIG_BASICAS or isinstance(regla, mi.HyperbolicRule):
        paso["regla"] = "tabla"
    elif isinstance(regla, (mi.SqrtQuadraticRule, mi.SqrtQuadraticDenomRule, mi.ReciprocalSqrtQuadraticRule)):
        paso["regla"] = "formulaRaiz"
    elif nombre in _ESPECIALES:
        paso["regla"] = "funcionEspecial"
        d["funcion"] = _ESPECIALES[nombre]
    elif isinstance(regla, mi.DontKnowRule):
        paso["regla"] = "desconocida"
    elif isinstance(regla, mi.DerivativeRule):
        paso["regla"] = "derivada"
    return paso


# Métodos que se nombran en el resumen, en orden de importancia.
_METODOS = [
    "partesCiclica", "partes", "sustitucionTrig", "fraccionesParciales", "completarCuadrado",
    "sustitucion", "identidadTrig", "funcionEspecial", "formulaRaiz",
]


def metodos(paso):
    """Métodos «con nombre» usados en el árbol, del más al menos importante."""
    usados = set()

    def recorrer(p):
        usados.add(p["regla"])
        for h in p["hijos"]:
            recorrer(h)

    recorrer(paso)
    lista = [m for m in _METODOS if m in usados]
    return lista or ["inmediata"]


def usa_logaritmo_sin_valor_absoluto(paso):
    """True si algún paso integra 1/u: SymPy escribe ln(u) y la primitiva real es ln|u|."""
    if paso["regla"] == "reciproco":
        return True
    return any(usa_logaritmo_sin_valor_absoluto(h) for h in paso["hijos"])
