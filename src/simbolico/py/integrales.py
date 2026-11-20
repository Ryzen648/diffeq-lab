"""Integración simbólica con pasos y verificación (se llama desde JavaScript).

integrar(texto)              -> primitiva, pasos, métodos, verificación
integrar(texto, a, b)        -> además el valor de la integral definida

Verificación de la primitiva F de f, en dos niveles:
  1. simbólica: simplify(F' − f) == 0;
  2. numérica: |F'(x) − f(x)| pequeño en varios puntos, por si simplify no
     logra reducir a 0 una expresión que sí es nula (pasa con raíces y
     logaritmos). La interfaz hace además su propia comprobación, en JS y sin
     SymPy, derivando F numéricamente (verificación independiente).
"""

import dataclasses

import sympy as sp
from sympy.integrals.manualintegrate import integral_steps
from sympy.integrals import manualintegrate as mi

from comun import X, a_mathjs, leer, leer_limite, numero, responder, tex
from pasos_integral import elegir, es_desconocida, metodos, traducir, usa_logaritmo_sin_valor_absoluto

PUNTOS_PRUEBA = (sp.Rational(37, 100), sp.Rational(71, 100), sp.Rational(113, 100), sp.Rational(19, 10), sp.Rational(-3, 5))


def resolver(regla):
    """Copia del árbol con cada AlternativeRule sustituida por la ruta elegida.

    Así el resultado de cada paso que se muestra corresponde a la ruta que se
    explica (AlternativeRule.eval() usaría siempre la primera alternativa).
    """
    regla = elegir(regla)
    cambios = {}
    for campo in dataclasses.fields(regla):
        valor = getattr(regla, campo.name)
        if isinstance(valor, mi.Rule):
            cambios[campo.name] = resolver(valor)
        elif isinstance(valor, list) and any(isinstance(v, mi.Rule) for v in valor):
            cambios[campo.name] = [resolver(v) if isinstance(v, mi.Rule) else v for v in valor]
    return dataclasses.replace(regla, **cambios) if cambios else regla


def verificar_primitiva(F, f):
    residuo = sp.simplify(sp.diff(F, X) - f)
    simbolica = residuo == 0
    numerica = None
    if not simbolica:
        errores = []
        for p in PUNTOS_PRUEBA:
            try:
                valor = complex(sp.N((sp.diff(F, X) - f).subs(X, p)))
                escala = max(1.0, abs(complex(sp.N(f.subs(X, p)))))
            except (TypeError, ValueError, ZeroDivisionError):
                continue
            if valor == valor:  # descarta NaN (punto fuera del dominio)
                errores.append(abs(valor) / escala)
        numerica = bool(errores) and max(errores) < 1e-9
    return {"simbolica": bool(simbolica), "numerica": numerica, "residuo": tex(residuo)}


def _definida(f, F, a_texto, b_texto):
    A, B = leer_limite(a_texto), leer_limite(b_texto)
    valor = sp.integrate(f, (X, A, B))
    if valor.has(sp.Integral):
        return {"encontrada": False}
    resultado = {"encontrada": True, "valor": tex(valor), "numero": numero(valor), "diverge": None}
    if valor in (sp.oo, -sp.oo):
        resultado["diverge"] = "+" if valor == sp.oo else "-"
    elif valor in (sp.zoo, sp.nan) or valor.has(sp.zoo, sp.nan):
        resultado["diverge"] = "indeterminada"
    # Regla de Barrow con la primitiva mostrada: solo vale si F es continua en [a, b].
    if F is not None and A.is_finite and B.is_finite:
        try:
            fa, fb = sp.limit(F, X, A, "+"), sp.limit(F, X, B, "-")
            diferencia = numero(fb - fa)
            resultado["barrow"] = {
                "fa": tex(fa), "fb": tex(fb),
                "coincide": diferencia is not None and resultado["numero"] is not None
                and abs(float(diferencia) - float(resultado["numero"])) <= 1e-9 * max(1.0, abs(float(resultado["numero"]))),
            }
        except (NotImplementedError, ValueError, TypeError):
            pass
    return resultado


def integrar(texto, a=None, b=None):
    f = leer(texto)
    arbol = integral_steps(f, X)
    con_pasos = not es_desconocida(arbol)
    pasos = None
    if con_pasos:
        ruta = resolver(arbol)
        F = ruta.eval()
        pasos = traducir(ruta)
    else:
        F = sp.integrate(f, X)

    sin_forma = F.has(sp.Integral)
    salida = {
        "integrando": tex(f),
        # Para que la página compruebe que SymPy integró la misma función que escribió el usuario.
        "integrandoMathjs": a_mathjs(f),
        "conPasos": con_pasos,
        "sinFormaCerrada": sin_forma,
        "primitiva": None if sin_forma else tex(F),
        "primitivaMathjs": None if sin_forma else a_mathjs(F),
        "pasos": pasos,
        "metodos": metodos(pasos) if pasos else [],
        "avisoLogaritmo": bool(pasos) and usa_logaritmo_sin_valor_absoluto(pasos),
        "verificacion": None if sin_forma else verificar_primitiva(F, f),
        "definida": None,
    }
    if a is not None and b is not None:
        salida["definida"] = _definida(f, None if sin_forma else F, a, b)
    return responder(**salida)
