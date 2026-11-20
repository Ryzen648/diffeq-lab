"""EDO lineales de orden 2 y sistemas lineales 2×2, con pasos.

Antes de calcular nada se CLASIFICA la ecuación; solo los casos lineales de
la tabla tienen método simbólico. Los no lineales (péndulo, Van der Pol,
Lotka–Volterra) y los lineales de coeficientes variables generales vuelven
al momento sin llamar a dsolve: en el spike, dsolve con el péndulo
y'' + sen y = 0 pasó de 4 minutos sin terminar (integral elíptica).

  orden 2, a·y'' + b·y' + c·y = r(x):
    coeficientes constantes   ecuación característica a·m² + b·m + c = 0
                              (+ coeficientes indeterminados para r(x))
    Cauchy–Euler (r = 0)      a·x²·y'' + b·x·y' + c·y = 0, ecuación indicial
  sistema X' = A·X + b, con A y b constantes:
    autovalores y autovectores de A; la solución con condición inicial es
    X(t) = X* + e^{A(t−t0)}·(X0 − X*), con X* = −A⁻¹·b si A es invertible.

Como en edo.py, SymPy solo hace álgebra (raíces, exponencial de una matriz,
sistemas lineales); los pasos son plantillas propias.
"""

import sympy as sp

from comun import X, a_mathjs, leer, numero, responder, tex
from edo import paso

C1, C2 = sp.symbols("C1 C2")
M = sp.Symbol("m")
T = sp.Symbol("t", real=True)


def _cero(expr):
    return sp.simplify(expr) == 0


def _combinacion(terminos):
    """[(coeficiente, texto)] -> «y'' + 2\\,y' - y» sin «1·», sin «+ -» y sin términos nulos."""
    partes = []
    for coef, texto in terminos:
        if coef == 0:
            continue
        negativo = coef.could_extract_minus_sign()
        absoluto = -coef if negativo else coef
        cuerpo = texto if absoluto == 1 else f"{tex(absoluto) if absoluto.is_Atom else '(' + tex(absoluto) + ')'}\\,{texto}"
        partes.append(("- " if negativo else "+ ") + cuerpo)
    if not partes:
        return "0"
    primero = partes[0]
    return " ".join([primero[2:] if primero.startswith("+") else "-" + primero[2:]] + partes[1:])


# --- Orden 2 ----------------------------------------------------------------------

def clasificar_orden2(F, y, y1, y2):
    """F(x, y, y', y'') = 0 -> (clase, (a, b, c, r)). Clase:
    noLineal | coefConstantes | cauchyEuler | coefVariables."""
    variables = (y, y1, y2)
    for u in variables:
        for v in variables:
            if not _cero(sp.diff(F, u, v)):
                return "noLineal", None
    a, b, c = (sp.simplify(sp.diff(F, u)) for u in (y2, y1, y))
    if _cero(a):
        return "noLineal", None  # no es de orden 2 de verdad
    r = sp.simplify(-F.subs({y: 0, y1: 0, y2: 0}))
    if not any(coef.has(X) for coef in (a, b, c)):
        return "coefConstantes", (a, b, c, r)
    k2, k1, k0 = sp.simplify(a / X**2), sp.simplify(b / X), c
    if r == 0 and not any(k.has(X) for k in (k2, k1, k0)):
        return "cauchyEuler", (k2, k1, k0, r)
    return "coefVariables", (a, b, c, r)


def _homogenea_caracteristica(a, b, c, variable, euler=False):
    """Raíces de a·m² + b·m + c (o la indicial) y la solución homogénea con C1, C2."""
    polinomio = a * M**2 + b * M + c
    raices = sp.roots(sp.Poly(polinomio, M))
    lista = []
    for raiz, mult in raices.items():
        lista += [sp.nsimplify(raiz) if raiz.is_number else raiz] * mult
    r1, r2 = lista
    base = sp.log(variable) if euler else variable  # Cauchy–Euler: x = e^s
    potencia = (lambda m: variable**m) if euler else (lambda m: sp.exp(m * variable))
    if sp.im(r1) != 0:
        alfa, beta = sp.re(r1), abs(sp.im(r1))
        yh = potencia(alfa) * (C1 * sp.cos(beta * base) + C2 * sp.sin(beta * base))
        caso = "complejas"
    elif sp.simplify(r1 - r2) == 0:
        yh = (C1 + C2 * base) * potencia(r1)
        caso = "doble"
    else:
        yh = C1 * potencia(r1) + C2 * potencia(r2)
        caso = "distintas"
    return polinomio, (r1, r2), caso, yh


def _resonancia(r, a, b, c):
    """¿Algún término de r(x) ya es solución de la homogénea? Entonces la
    propuesta de y_p se multiplica por x (resonancia). Criterio exacto:
    L[término] = a·u'' + b·u' + c·u = 0."""
    for termino in sp.Add.make_args(sp.expand(r)):
        parte = termino.as_independent(X)[1]
        if parte != 1 and _cero(a * sp.diff(parte, X, 2) + b * sp.diff(parte, X) + c * parte):
            return True
    return False


def resolver_orden2(texto_F, x0_texto, y0_texto, v0_texto):
    y, y1, y2 = sp.symbols("y D1y D2y", real=True)
    F = leer(texto_F, variables=("x", "y", "D1y", "D2y"))
    clase, coefs = clasificar_orden2(F, y, y1, y2)
    salida = {"clase": clase, "metodo": None, "pasos": [], "general": None, "particular": None,
              "particularMathjs": None, "verificacion": None, "notas": []}
    if clase in ("noLineal", "coefVariables"):
        return responder(**salida)  # sin dsolve: solo numérico

    a, b, c, r = coefs
    x0, y0, v0 = (leer(t, variables=()) for t in (x0_texto, y0_texto, v0_texto))
    pasos = []
    euler = clase == "cauchyEuler"
    salida["metodo"] = clase
    if euler:
        pasos.append(paso("edo2.euler.forma", _combinacion([(a, "x^2 y''"), (b, "x\\,y'"), (c, "y")]) + " = 0"))
        if x0 <= 0:
            salida["notas"].append("eulerSoloPositivo")
    else:
        pasos.append(paso("edo2.cc.forma", _combinacion([(a, "y''"), (b, "y'"), (c, "y")]) + f" = {tex(r)}"))
    if euler:
        # Con y = x^m: a·m(m − 1) + b·m + c = 0, es decir a·m² + (b − a)·m + c = 0.
        polinomio, (r1, r2), caso, yh = _homogenea_caracteristica(a, b - a, c, X, euler=True)
        clave_pol = "edo2.euler.indicial"
    else:
        polinomio, (r1, r2), caso, yh = _homogenea_caracteristica(a, b, c, X)
        clave_pol = "edo2.cc.caracteristica"
    pasos.append(paso(clave_pol, f"{tex(polinomio)} = 0 \\;\\Rightarrow\\; m_1 = {tex(r1)},\\; m_2 = {tex(r2)}"))
    pasos.append(paso(f"edo2.homogenea.{caso}", f"y_h = {tex(yh)}"))

    yp = sp.Integer(0)
    if r != 0:
        resonancia = _resonancia(r, a, b, c)
        hint = "nth_linear_constant_coeff_undetermined_coefficients"
        f = sp.Function("y")
        ecuacion = a * f(X).diff(X, 2) + b * f(X).diff(X) + c * f(X) - r
        try:
            yp = sp.dsolve(ecuacion, f(X), hint=hint).rhs.subs({C1: 0, C2: 0})
            clave = "edo2.particular.coefIndeterminados" + ("Resonancia" if resonancia else "")
        except (ValueError, NotImplementedError):
            yp = sp.dsolve(ecuacion, f(X), hint="nth_linear_constant_coeff_variation_of_parameters", simplify=False).rhs.subs({C1: 0, C2: 0})
            clave = "edo2.particular.variacion"
        yp = sp.simplify(yp)
        pasos.append(paso(clave, f"y_p = {tex(yp)}", resonancia="si" if resonancia else "no"))
    general = yh + yp
    salida["general"] = f"y = {tex(general)}"
    pasos.append(paso("edo2.general", f"y = y_h + y_p = {tex(general)}"))

    if euler and x0 <= 0:
        salida["pasos"] = pasos
        return responder(**salida)
    ecs = [sp.Eq(general.subs(X, x0), y0), sp.Eq(sp.diff(general, X).subs(X, x0), v0)]
    constantes = sp.solve(ecs, [C1, C2], dict=True)
    if not constantes:
        salida["pasos"] = pasos
        return responder(**salida)
    valores = constantes[0]
    particular = sp.simplify(general.subs(valores))
    pasos.append(paso("edo2.ci", f"y({tex(x0)}) = {tex(y0)},\\; y'({tex(x0)}) = {tex(v0)} \\;\\Rightarrow\\; "
                      f"C_1 = {tex(valores[C1])},\\; C_2 = {tex(valores[C2])}"))
    pasos.append(paso("edo.particular", f"y = {tex(particular)}"))
    # En Cauchy–Euler (a, b, c) son k₂, k₁, k₀ y la ecuación es k₂x²y'' + k₁xy' + k₀y = 0.
    a2, a1 = (a * X**2, b * X) if euler else (a, b)
    residuo = sp.simplify(a2 * sp.diff(particular, X, 2) + a1 * sp.diff(particular, X) + c * particular - r)
    ci = _cero(particular.subs(X, x0) - y0) and _cero(sp.diff(particular, X).subs(X, x0) - v0)
    salida.update(pasos=pasos, particular=tex(particular), particularMathjs=a_mathjs(particular),
                  derivadaMathjs=a_mathjs(sp.diff(particular, X)),
                  verificacion={"simbolica": residuo == 0, "numerica": None, "residuo": tex(residuo), "ci": bool(ci)})
    return responder(**salida)


# --- Sistemas 2×2 ---------------------------------------------------------------------

def clasificar_sistema(f, g, x, y):
    """(clase, (A, b)). Clase: lineal | linealNoAutonomo | noLineal."""
    F = sp.Matrix([f, g])
    A = F.jacobian([x, y]).applyfunc(sp.simplify)
    if any(e.has(x) or e.has(y) for e in A):
        return "noLineal", None
    b = (F - A * sp.Matrix([x, y])).applyfunc(sp.simplify)
    if any(e.has(T) for e in list(A) + list(b)):
        return "linealNoAutonomo", None
    return "lineal", (A, b)


def _vector_tex(v):
    return "\\begin{pmatrix}" + " \\\\ ".join(tex(sp.simplify(e)) for e in v) + "\\end{pmatrix}"


def _general_sistema(A):
    """Solución general de X' = A·X en forma de autovectores (real). Devuelve (caso, expresión con C1, C2, pasos)."""
    pasos = []
    vects = A.eigenvects()
    lambdas = [lam for lam, mult, _ in vects for _ in range(mult)]
    pasos.append(paso("edo2.sis.autovalores",
                      f"\\det(A - \\lambda I) = {tex(sp.expand((A - M * sp.eye(2)).det()).subs(M, sp.Symbol('lambda')))} = 0"
                      f" \\;\\Rightarrow\\; \\lambda_1 = {tex(lambdas[0])},\\; \\lambda_2 = {tex(lambdas[1])}"))
    lam1 = vects[0][0]
    if sp.im(lam1) != 0:
        # λ = α ± iβ con autovector v = p + i q: soluciones reales e^{αt}(p cos βt − q sin βt) y e^{αt}(p sin βt + q cos βt).
        lam, _, vs = next(v for v in vects if sp.im(v[0]) > 0)
        v = vs[0]
        alfa, beta = sp.re(lam), sp.im(lam)
        p = v.applyfunc(sp.re)
        q = v.applyfunc(sp.im)
        s1 = sp.exp(alfa * T) * (p * sp.cos(beta * T) - q * sp.sin(beta * T))
        s2 = sp.exp(alfa * T) * (p * sp.sin(beta * T) + q * sp.cos(beta * T))
        pasos.append(paso("edo2.sis.complejos", f"\\vec v = {_vector_tex(v)}"))
        return "complejos", C1 * s1 + C2 * s2, pasos
    if len(vects) == 2:
        (l1, _, v1), (l2, _, v2) = vects
        v1, v2 = v1[0], v2[0]
        pasos.append(paso("edo2.sis.autovectores", f"\\vec v_1 = {_vector_tex(v1)},\\quad \\vec v_2 = {_vector_tex(v2)}"))
        return "distintos", C1 * sp.exp(l1 * T) * v1 + C2 * sp.exp(l2 * T) * v2, pasos
    lam, mult, vs = vects[0]
    if len(vs) == 2:  # A = λI
        pasos.append(paso("edo2.sis.escalar", f"A = {tex(lam)}\\,I"))
        return "escalar", sp.exp(lam * T) * sp.Matrix([C1, C2]), pasos
    # Defectiva: un solo autovector v; se busca w con (A − λI)·w = v.
    v = vs[0]
    w0, w1 = sp.symbols("w0 w1")
    sol = sp.solve(list((A - lam * sp.eye(2)) * sp.Matrix([w0, w1]) - v), [w0, w1], dict=True)[0]
    w = sp.Matrix([w0, w1]).subs(sol).subs({w0: 0, w1: 0})
    pasos.append(paso("edo2.sis.defectiva", f"\\vec v = {_vector_tex(v)},\\quad (A - \\lambda I)\\,\\vec w = \\vec v \\Rightarrow \\vec w = {_vector_tex(w)}"))
    return "defectiva", C1 * sp.exp(lam * T) * v + C2 * sp.exp(lam * T) * (T * v + w), pasos


def resolver_sistema(texto_f, texto_g, t0_texto, x0_texto, y0_texto):
    x, y = sp.symbols("x y", real=True)
    f = leer(texto_f, variables=("t", "x", "y")).subs({X: x, sp.Symbol("t", real=True): T})
    g = leer(texto_g, variables=("t", "x", "y")).subs({X: x, sp.Symbol("t", real=True): T})
    clase, datos = clasificar_sistema(f, g, x, y)
    salida = {"clase": clase, "metodo": None, "pasos": [], "general": None, "particular": None,
              "particularMathjs": None, "verificacion": None, "notas": []}
    if clase != "lineal":
        return responder(**salida)  # sin dsolve: solo numérico
    A, b = datos
    t0, x0, y0 = (leer(s, variables=()) for s in (t0_texto, x0_texto, y0_texto))
    X0 = sp.Matrix([x0, y0])
    salida["metodo"] = "sistemaLineal"
    pasos = [paso("edo2.sis.forma", f"\\vec X' = {tex(A)}\\,\\vec X" + ("" if b == sp.zeros(2, 1) else f" + {_vector_tex(b)}"))]
    caso, general_h, pasos_h = _general_sistema(A)
    pasos += pasos_h
    homogeneo = b == sp.zeros(2, 1)
    if homogeneo:
        general = general_h
    elif A.det() != 0:
        equilibrio = (-A.inv() * b).applyfunc(sp.simplify)
        pasos.append(paso("edo2.sis.equilibrio", f"\\vec X^* = -A^{{-1}}\\vec b = {_vector_tex(equilibrio)}"))
        general = equilibrio + general_h
    else:
        salida["pasos"] = pasos
        salida["notas"].append("sinEquilibrio")
        return responder(**salida)
    salida["general"] = f"\\vec X(t) = {_vector_tex(general)}"
    pasos.append(paso("edo2.sis.general", f"\\vec X(t) = {_vector_tex(general)}"))
    valores = sp.solve(list(general.subs(T, t0) - X0), [C1, C2], dict=True)
    if not valores:
        salida["pasos"] = pasos
        return responder(**salida)
    particular = general.subs(valores[0]).applyfunc(lambda e: sp.simplify(sp.expand_complex(e)))
    pasos.append(paso("edo2.sis.ci", f"\\vec X({tex(t0)}) = {_vector_tex(X0)} \\;\\Rightarrow\\; C_1 = {tex(valores[0][C1])},\\; C_2 = {tex(valores[0][C2])}"))
    pasos.append(paso("edo2.sis.particular", f"\\vec X(t) = {_vector_tex(particular)}"))
    residuo = (particular.diff(T) - (A * particular + b)).applyfunc(sp.simplify)
    ci = all(_cero(e) for e in particular.subs(T, t0) - X0)
    salida.update(pasos=pasos, caso=caso, particular=[tex(e) for e in particular],
                  particularMathjs=[a_mathjs(e.subs(T, sp.Symbol("x"))) for e in particular],
                  verificacion={"simbolica": residuo == sp.zeros(2, 1), "numerica": None,
                                "residuo": _vector_tex(residuo), "ci": bool(ci)})
    return responder(**salida)
