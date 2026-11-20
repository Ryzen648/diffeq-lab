"""EDO de primer orden M(x, y) + N(x, y)·y' = 0: tipo, solución con pasos y verificación.

Los pasos NO vienen de `dsolve` (que no da pasos y, medido en el spike, pasaba
de 20 s en algunas exactas por intentar despejar y). Son plantillas propias
de los cuatro métodos de clase, que usan SymPy solo para integrar,
simplificar y despejar. Cada integral que aparece trae sus propios pasos
(los de pasos_integral.py), así que el estudiante ve el método completo.

Despejar y: solo se intenta cuando es razonable (y aparece una vez, o la
relación es polinómica de grado ≤ 2 en y); si no, la solución se deja en
forma implícita F(x, y) = C, que es igual de correcta y no tarda.
"""

import sympy as sp
from sympy.integrals.manualintegrate import integral_steps

from comun import X, a_mathjs, leer, numero, responder, tex
from integrales import resolver
from pasos_integral import es_desconocida, traducir

Y = sp.Symbol("y", real=True)
C = sp.Symbol("C")
V = sp.Symbol("v", real=True)
PRIORIDAD = ("separable", "lineal", "bernoulli", "exacta")
PUNTOS = ((sp.Rational(3, 10), sp.Rational(7, 10)), (sp.Rational(11, 10), sp.Rational(13, 10)),
          (sp.Rational(17, 10), sp.Rational(2, 5)), (sp.Rational(9, 5), sp.Rational(23, 10)))


class SinFormaCerrada(Exception):
    """Alguna integral del método no tiene primitiva elemental."""


def integrar(expr, var, rol=None):
    """∫ expr d(var) con sus pasos. Devuelve (primitiva, paso o None)."""
    arbol = integral_steps(expr, var)
    if not es_desconocida(arbol):
        ruta = resolver(arbol)
        resultado, paso = ruta.eval(), traducir(ruta)
    else:
        resultado, paso = sp.integrate(expr, var), None
    if resultado.has(sp.Integral):
        raise SinFormaCerrada(str(expr))
    if paso is not None and rol:
        paso["rol"] = rol
    return sp.simplify(resultado), paso


def paso(regla, ecuacion=None, hijos=(), **datos):
    return {"regla": regla, "ecuacion": ecuacion, "datos": {k: v for k, v in datos.items()},
            "hijos": [h for h in hijos if h]}


# --- Clasificación (con SymPy: definitiva) -------------------------------------

def potencias_en_y(f):
    """f como Σ coef(x)·y^k. Devuelve {k: coef} o None si algún término no es así."""
    grupos = {}
    for termino in sp.Add.make_args(sp.expand(f)):
        coef, parte_y = termino.as_independent(Y, as_Add=False)
        if parte_y == 1:
            k = sp.Integer(0)
        elif parte_y == Y:
            k = sp.Integer(1)
        elif parte_y.is_Pow and parte_y.base == Y and parte_y.exp.is_number:
            k = parte_y.exp
        else:
            return None
        if coef.has(Y):
            return None
        grupos[k] = grupos.get(k, 0) + coef
    return {k: sp.simplify(c) for k, c in grupos.items() if sp.simplify(c) != 0}


def clasificar(M, N, f):
    t = {"separable": False, "lineal": False, "homogenea": False, "bernoulli": None,
         "exacta": None, "riccati": False, "autonoma": not f.has(X)}
    partes = sp.separatevars(f, [X, Y], dict=True)
    t["separable"] = partes is not None
    potencias = potencias_en_y(f)
    if potencias is not None:
        exps = set(potencias)
        if exps <= {0, 1}:
            t["lineal"] = True
            t["homogenea"] = 0 not in exps
        elif exps <= {0, 1, 2} and 2 in exps:
            t["riccati"] = True
        no_lineales = [k for k in exps if k not in (0, 1)]
        if 0 not in exps and len(no_lineales) == 1:
            t["bernoulli"] = str(no_lineales[0])
    if sp.simplify(sp.diff(M, Y) - sp.diff(N, X)) == 0:
        t["exacta"] = "directa"
    else:
        num, den = sp.fraction(sp.together(f))
        if sp.simplify(sp.diff(-num, Y) - sp.diff(den, X)) == 0:
            t["exacta"] = "fraccion"
        else:
            R = sp.simplify((sp.diff(M, Y) - sp.diff(N, X)) / N)
            S = sp.simplify((sp.diff(N, X) - sp.diff(M, Y)) / M)
            if not R.has(Y):
                t["exacta"] = "factorX"
            elif not S.has(X):
                t["exacta"] = "factorY"
    return t, partes, potencias


def metodos_disponibles(t):
    disponibles = []
    if t["separable"]:
        disponibles.append("separable")
    if t["lineal"]:
        disponibles.append("lineal")
    if t["bernoulli"] is not None:
        disponibles.append("bernoulli")
    if t["exacta"] is not None:
        disponibles.append("exacta")
    return disponibles


# --- Despejar y -------------------------------------------------------------------------

def despejable(relacion):
    """Polinómica en y: solo hasta grado 2 (una cúbica da raíces enormes y lentas).
    No polinómica (logaritmos, exponenciales): si y aparece como mucho dos veces,
    p. ej. ln y − ln(y − 10) = x + C; si aparece más (x²eʸ + y·sen x − y), se deja implícita."""
    try:
        return sp.Poly(relacion, Y).degree() <= 2
    except sp.PolynomialError:
        return relacion.count(Y) <= 2


def despejar(izquierda, derecha):
    """Soluciones explícitas de izquierda = derecha para y (lista, quizá vacía)."""
    if not despejable(izquierda - derecha):
        return []
    try:
        return [sp.simplify(s) for s in sp.solve(sp.Eq(izquierda, derecha), Y)]
    except (NotImplementedError, ValueError):
        return []


# --- Métodos ------------------------------------------------------------------------------

def metodo_separable(f, partes):
    g = partes["coeff"] * partes[X]
    h = partes[Y]
    pasos = [paso("edo.separable.forma", f"\\frac{{dy}}{{dx}} = {tex(g)} \\cdot {tex(h)}", g=tex(g), h=tex(h))]
    if not h.has(Y):  # y' = g(x): integración directa
        G, p = integrar(f, X, "derecha")
        pasos.append(paso("edo.directa", f"y = \\int {tex(f)}\\,dx = {tex(G)} + C", hijos=[p]))
        return pasos, {"explicitas": [G + C]}
    pasos.append(paso("edo.separable.separar", f"\\frac{{dy}}{{{tex(h)}}} = {tex(g)}\\,dx"))
    H, p_izq = integrar(1 / h, Y, "izquierda")
    G, p_der = integrar(g, X, "derecha")
    pasos.append(paso("edo.separable.integrar", f"{tex(H)} = {tex(G)} + C", hijos=[p_izq, p_der]))
    constantes = []
    try:
        constantes = [r for r in sp.solve(h, Y) if r.is_real is not False]
    except (NotImplementedError, ValueError):
        pass
    soluciones = despejar(H, G + C)
    resultado = {"implicita": (H - G, C), "constantes": constantes}
    if soluciones:
        resultado["explicitas"] = soluciones
    return pasos, resultado


def resolver_lineal(P, Q, nombre="y"):
    """y' + P·y = Q por factor integrante. Devuelve (pasos, solución general explícita en C)."""
    v = sp.Symbol(nombre)
    pasos = [paso("edo.lineal.forma", f"{nombre}' + {tex(P)}\\,{nombre} = {tex(Q)}", P=tex(P), Q=tex(Q), v=nombre)]
    intP, pP = integrar(P, X, "factor")
    mu = sp.simplify(sp.exp(intP))
    pasos.append(paso("edo.lineal.factor", f"\\mu(x) = e^{{\\int {tex(P)}\\,dx}} = {tex(mu)}", hijos=[pP], mu=tex(mu)))
    pasos.append(paso("edo.lineal.producto", f"\\frac{{d}}{{dx}}\\left({tex(mu)}\\,{nombre}\\right) = {tex(sp.simplify(mu * Q))}", v=nombre))
    intMQ, pMQ = integrar(sp.simplify(mu * Q), X, "derecha")
    pasos.append(paso("edo.lineal.integrar", f"{tex(mu)}\\,{nombre} = {tex(intMQ)} + C", hijos=[pMQ], v=nombre))
    general = sp.simplify((intMQ + C) / mu)
    pasos.append(paso("edo.despejar", f"{nombre} = {tex(general)}", v=nombre))
    return pasos, general, v


def metodo_lineal(f):
    P = sp.simplify(-sp.diff(f, Y))
    Q = sp.simplify(f.subs(Y, 0))
    pasos, general, _ = resolver_lineal(P, Q)
    return pasos, {"explicitas": [general]}


def metodo_bernoulli(f, potencias, n):
    n = sp.sympify(n)
    P = sp.simplify(-potencias.get(1, 0))
    Q = sp.simplify(potencias[n])
    pasos = [paso("edo.bernoulli.forma", f"y' + {tex(P)}\\,y = {tex(Q)}\\,y^{{{tex(n)}}}", n=tex(n))]
    pasos.append(paso("edo.bernoulli.cambio", f"v = y^{{{tex(1 - n)}}}, \\quad v' = {tex(1 - n)}\\,y^{{{tex(-n)}}}\\,y'", n=tex(n)))
    pasos_v, general_v, _ = resolver_lineal(sp.simplify((1 - n) * P), sp.simplify((1 - n) * Q), "v")
    pasos.append(paso("edo.bernoulli.lineal", None, hijos=[{"regla": "edo.grupo", "datos": {}, "hijos": pasos_v}]))
    pasos.append(paso("edo.bernoulli.deshacer", f"y^{{{tex(1 - n)}}} = {tex(general_v)}"))
    # Forma implícita F(x, y) = C: se despeja C de y^{1−n} = v(x, C) (que es lineal en C).
    F = sp.simplify(sp.solve(sp.Eq(Y ** (1 - n), general_v), C)[0])
    resultado = {"implicita": (F, C), "explicitas": despejar(Y ** (1 - n), general_v)}
    if n.is_positive:
        resultado["constantes"] = [sp.Integer(0)]
    return pasos, resultado


def metodo_exacta(M, N, f, clase):
    pasos = []
    if clase == "fraccion":
        num, den = sp.fraction(sp.together(f))
        M, N = sp.expand(-num), sp.expand(den)
        pasos.append(paso("edo.exacta.reescribir", f"\\left({tex(M)}\\right)dx + \\left({tex(N)}\\right)dy = 0"))
    elif clase in ("factorX", "factorY"):
        if clase == "factorX":
            R = sp.simplify((sp.diff(M, Y) - sp.diff(N, X)) / N)
            integral, p = integrar(R, X, "factor")
        else:
            R = sp.simplify((sp.diff(N, X) - sp.diff(M, Y)) / M)
            integral, p = integrar(R, Y, "factor")
        mu = sp.simplify(sp.exp(integral))
        pasos.append(paso(f"edo.exacta.{clase}", f"\\mu = e^{{\\int {tex(R)}}} = {tex(mu)}", hijos=[p], mu=tex(mu)))
        M, N = sp.simplify(mu * M), sp.simplify(mu * N)
    else:
        pasos.append(paso("edo.exacta.forma", f"\\left({tex(M)}\\right)dx + \\left({tex(N)}\\right)dy = 0"))
    My, Nx = sp.simplify(sp.diff(M, Y)), sp.simplify(sp.diff(N, X))
    pasos.append(paso("edo.exacta.comprobar", f"\\frac{{\\partial M}}{{\\partial y}} = {tex(My)} = \\frac{{\\partial N}}{{\\partial x}}"))
    intM, pM = integrar(M, X, "derecha")
    pasos.append(paso("edo.exacta.integrarM", f"F(x, y) = \\int M\\,dx = {tex(intM)} + g(y)", hijos=[pM]))
    gprima = sp.simplify(N - sp.diff(intM, Y))
    g, pg = integrar(gprima, Y, "izquierda") if gprima != 0 else (sp.Integer(0), None)
    pasos.append(paso("edo.exacta.hallarG", f"g'(y) = N - \\frac{{\\partial}}{{\\partial y}}\\int M\\,dx = {tex(gprima)} \\;\\Rightarrow\\; g(y) = {tex(g)}", hijos=[pg]))
    F = sp.simplify(intM + g)
    pasos.append(paso("edo.exacta.solucion", f"{tex(F)} = C"))
    resultado = {"implicita": (F, C)}
    soluciones = despejar(F, C)
    if soluciones:
        resultado["explicitas"] = soluciones
    return pasos, resultado


# --- Condición inicial y verificación ------------------------------------------------------

def _cerca(a, b):
    try:
        return abs(complex(sp.N(a - b))) < 1e-9 * max(1.0, abs(complex(sp.N(b))))
    except (TypeError, ValueError):
        return False


def aplicar_ci(resultado, x0, y0):
    """Elige la solución particular. Devuelve (particular explícita | None, (F, K) implícita | None, c0)."""
    implicita = resultado.get("implicita")
    # Constante de la implícita: F(x, y) = C  ⇒  C = F(x0, y0).
    c0 = None
    if implicita is not None:
        F, _ = implicita
        c0 = sp.simplify(F.subs({X: x0, Y: y0}))
    for sol in resultado.get("explicitas", []):
        if c0 is None:
            candidatos = sp.solve(sp.Eq(sol.subs(X, x0), y0), C)
            if not candidatos:
                continue
            c = candidatos[0]
        else:
            c = c0
        particular = sp.simplify(sol.subs(C, c))
        if _cerca(particular.subs(X, x0), y0):
            return particular, None, c
    # Sin forma explícita que pase por (x0, y0): se queda implícita.
    if implicita is not None:
        F, _ = implicita
        return None, (F, c0), c0
    return None, None, None


def verificar(f, particular, implicita, x0, y0):
    if particular is not None:
        residuo = sp.simplify(sp.diff(particular, X) - f.subs(Y, particular))
        ci = _cerca(particular.subs(X, x0), y0)
    else:
        F, _ = implicita
        residuo = sp.simplify(-sp.diff(F, X) / sp.diff(F, Y) - f)
        ci = True  # K se eligió para que pase por (x0, y0)
    simbolica = residuo == 0
    numerica = None
    if not simbolica:
        errores = []
        for px, py in PUNTOS:
            try:
                valor = residuo.subs({X: px, Y: py}) if particular is None else residuo.subs(X, px)
                errores.append(abs(complex(sp.N(valor))))
            except (TypeError, ValueError, ZeroDivisionError):
                continue
        errores = [e for e in errores if e == e]
        numerica = bool(errores) and max(errores) < 1e-8
    return {"simbolica": bool(simbolica), "numerica": numerica, "residuo": tex(residuo), "ci": bool(ci)}


def resolver_edo1(texto_M, texto_N, x0_texto, y0_texto, preferido=None):
    M = leer(texto_M, variables=("x", "y"))
    N = leer(texto_N, variables=("x", "y"))
    f = sp.simplify(-M / N)
    x0, y0 = leer(x0_texto, variables=()), leer(y0_texto, variables=())
    tipos, partes, potencias = clasificar(M, N, f)
    disponibles = metodos_disponibles(tipos)
    salida = {"f": tex(f), "tipos": tipos, "metodos": disponibles, "metodo": None, "pasos": [],
              "general": None, "particular": None, "particularMathjs": None, "implicita": None,
              "constantes": [], "verificacion": None, "sinFormaCerrada": False}
    if not disponibles:
        return responder(**salida)
    metodo = preferido if preferido in disponibles else next(m for m in PRIORIDAD if m in disponibles)
    salida["metodo"] = metodo
    try:
        if metodo == "separable":
            pasos, resultado = metodo_separable(f, partes)
        elif metodo == "lineal":
            pasos, resultado = metodo_lineal(f)
        elif metodo == "bernoulli":
            pasos, resultado = metodo_bernoulli(f, potencias, tipos["bernoulli"])
        else:
            pasos, resultado = metodo_exacta(M, N, f, tipos["exacta"])
    except SinFormaCerrada:
        salida["sinFormaCerrada"] = True
        return responder(**salida)

    explicitas = resultado.get("explicitas") or []
    if explicitas:
        salida["general"] = "y = " + tex(explicitas[0])
    elif resultado.get("implicita") is not None:
        salida["general"] = tex(resultado["implicita"][0]) + " = C"
    salida["constantes"] = [tex(c) for c in resultado.get("constantes", [])]

    # Si y0 es un equilibrio (h(y0) = 0 en una separable, o y0 = 0 en Bernoulli),
    # la solución es la constante y = y0: la fórmula general no la contiene
    # (se perdió al dividir) y C saldría infinita.
    if any(_cerca(c, y0) for c in resultado.get("constantes", [])):
        pasos.append(paso("edo.ciEquilibrio", f"y = {tex(y0)}", y0=tex(y0)))
        salida.update(pasos=pasos, particular=tex(y0), particularMathjs=a_mathjs(y0))
        salida["verificacion"] = verificar(f, y0 + 0 * X, None, x0, y0)
        return responder(**salida)

    particular, implicita, c0 = aplicar_ci(resultado, x0, y0)
    if c0 is not None:
        # SymPy integra 1/u como ln u (logaritmo complejo): con u < 0 la constante
        # sale con un iπ, p. ej. C = −ln 9 − iπ. Con la convención real ln|u|,
        # que es la que se enseña, la constante es su parte real (−ln 9). La
        # solución particular es la misma con cualquiera de las dos.
        c_mostrado = sp.simplify(sp.re(c0)) if c0.has(sp.I) else c0
        clave = "edo.ciLogaritmo" if c0.has(sp.I) else "edo.ci"
        pasos.append(paso(clave, f"y({tex(x0)}) = {tex(y0)} \\;\\Rightarrow\\; C = {tex(c_mostrado)}"))
    if particular is not None:
        pasos.append(paso("edo.particular", f"y = {tex(particular)}"))
        salida["particular"] = tex(particular)
        salida["particularMathjs"] = a_mathjs(particular)
    elif implicita is not None:
        F, K = implicita
        pasos.append(paso("edo.particularImplicita", f"{tex(F)} = {tex(K)}"))
        salida["implicita"] = {"tex": f"{tex(F)} = {tex(K)}", "F": a_mathjs(F), "K": numero(K)}
    salida["pasos"] = pasos
    if particular is not None or implicita is not None:
        salida["verificacion"] = verificar(f, particular, implicita or (None, None), x0, y0)
    return responder(**salida)
