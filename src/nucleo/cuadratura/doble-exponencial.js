// Cuadratura doble exponencial (tanh-sinh y variantes).
//
// Idea: cambiar de variable x = φ(t) de forma que el nuevo integrando
// g(t) = f(φ(t))·φ'(t) decaiga MUY rápido (doble exponencialmente) cuando
// |t| → ∞, y luego aplicar la regla del trapecio en t ∈ (−∞, ∞). Para
// funciones así, el trapecio con paso h converge de forma exponencial en 1/h.
//
//   [a, b] finito     tanh-sinh:  x = c + r·tanh(π/2·sinh t)
//   [a, ∞)            exp-sinh:   x = a + exp(π/2·sinh t)
//   (−∞, ∞)           sinh-sinh:  x = sinh(π/2·sinh t)
//
// Por qué sirve para integrales impropias: los nodos se amontonan junto a los
// extremos sin tocarlos nunca, y el factor φ'(t) es tan pequeño allí que
// compensa singularidades como 1/√x en 0. Con límites infinitos, la
// sustitución lleva el intervalo infinito a uno donde g decae rápido.
//
// Detalle numérico: cerca de un extremo finito, calcular x = c + r·tanh(u)
// pierde todas las cifras (tanh(u) ≈ 1). Se usa en su lugar la distancia al
// extremo, b − x = 2r/(e^{2u} + 1), que se calcula sin cancelación.
//
// Se refina partiendo h a la mitad (reutilizando la suma anterior) hasta que
// dos niveles seguidos coinciden. Si no coinciden nunca, la integral
// probablemente diverge o f oscila demasiado: se devuelve `convergio: false`.

// Hasta dónde llega t. En [a, b] con t = 4.5 el nodo está a ~1e−61 del
// extremo: lo que queda fuera es despreciable incluso con 1/√x (con 3.2 se
// perdían ~1e−8, medido). Más allá, el peso se hace 0 en coma flotante.
const T_MAX = { finito: 4.5, semiinfinito: 4.0, infinito: 3.5 };
const MEDIO_PI = Math.PI / 2;

/** Nodo y peso del cambio de variable para un t dado, o null si no es utilizable. */
function transformacion(tipo, a, b) {
  if (tipo === "finito") {
    const r = (b - a) / 2;
    return (t) => {
      const u = MEDIO_PI * Math.sinh(t);
      const distancia = (2 * r) / (Math.exp(2 * Math.abs(u)) + 1); // al extremo más cercano
      const x = t >= 0 ? b - distancia : a + distancia;
      const cosh = Math.cosh(u);
      const peso = (r * MEDIO_PI * Math.cosh(t)) / (cosh * cosh);
      // Si al sumar la distancia el nodo cae justo en el extremo (redondeo), se omite.
      if (distancia === 0 || x === a || x === b || !Number.isFinite(peso) || peso === 0) return null;
      return { x, peso };
    };
  }
  if (tipo === "derecha" || tipo === "izquierda") {
    // [a, ∞) o (−∞, b]: x = a + e^{π/2·sinh t}  (o b − …)
    const base = tipo === "derecha" ? a : b;
    const signo = tipo === "derecha" ? 1 : -1;
    return (t) => {
      const e = Math.exp(MEDIO_PI * Math.sinh(t));
      const peso = MEDIO_PI * Math.cosh(t) * e;
      if (e === 0 || !Number.isFinite(peso)) return null;
      return { x: base + signo * e, peso };
    };
  }
  // (−∞, ∞)
  return (t) => {
    const u = MEDIO_PI * Math.sinh(t);
    const peso = MEDIO_PI * Math.cosh(t) * Math.cosh(u);
    if (!Number.isFinite(peso)) return null;
    return { x: Math.sinh(u), peso };
  };
}

function clasificar(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return { tipo: "finito", tmax: T_MAX.finito };
  if (Number.isFinite(a)) return { tipo: "derecha", tmax: T_MAX.semiinfinito };
  if (Number.isFinite(b)) return { tipo: "izquierda", tmax: T_MAX.semiinfinito };
  return { tipo: "infinito", tmax: T_MAX.infinito };
}

/**
 * ∫ₐᵇ f(x) dx con a o b finitos o infinitos (a < b).
 * Devuelve { valor, errorEstimado, convergio, niveles, evaluaciones }.
 * Los puntos donde f no es finita se ignoran (pueden ser el propio extremo
 * singular redondeado); si son demasiados, el resultado no se da por bueno.
 */
export function dobleExponencial(f, a, b, { tol = 1e-12, nivelMaximo = 9 } = {}) {
  const { tipo, tmax } = clasificar(a, b);
  const phi = transformacion(tipo, a, b);
  let evaluaciones = 0;
  let noFinitos = 0;

  const termino = (t) => {
    const nodo = phi(t);
    if (!nodo) return 0;
    evaluaciones++;
    const y = f(nodo.x);
    if (!Number.isFinite(y)) { noFinitos++; return 0; }
    return y * nodo.peso;
  };

  // Nivel 0: h = 1, nodos en los enteros. Cada nivel añade los puntos medios.
  let h = 1;
  let suma = termino(0);
  for (let k = 1; k <= tmax; k++) suma += termino(k) + termino(-k);
  let anterior = suma * h;
  const niveles = [anterior];

  for (let nivel = 1; nivel <= nivelMaximo; nivel++) {
    h /= 2;
    for (let t = h; t <= tmax; t += 2 * h) suma += termino(t) + termino(-t);
    const actual = suma * h;
    niveles.push(actual);
    const diferencia = Math.abs(actual - anterior);
    if (nivel >= 3 && diferencia <= Math.max(tol, tol * Math.abs(actual))) {
      return { valor: actual, errorEstimado: diferencia, convergio: noFinitos <= 2, niveles, evaluaciones };
    }
    anterior = actual;
  }
  return { valor: anterior, errorEstimado: Math.abs(niveles.at(-1) - niveles.at(-2)), convergio: false, niveles, evaluaciones };
}
