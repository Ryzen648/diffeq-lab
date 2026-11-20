// Clasificación en vivo de y' = f(x, y), sin SymPy (instantánea al teclear).
//
// Cada tipo es una IDENTIDAD que f cumple en todos los puntos, y aquí se
// comprueba en una colección de puntos de prueba:
//
//   separable    f(x,y) = g(x)·h(y)  ⇔  f(x₁,y₁)·f(x₂,y₂) = f(x₁,y₂)·f(x₂,y₁)
//   lineal       f afín en y          ⇔  f(x,a) + f(x,b) = f(x,a+b) + f(x,0)
//   homogénea    lineal y f(x,0) = 0  (y' = a(x)·y; en el sentido de «lineal homogénea»)
//   autónoma     f no depende de x    ⇔  f(x₁,y) = f(x₂,y)
//   Riccati      f = a + b·y + c·y² con c ≠ 0  (diferencia tercera en y nula)
//   Bernoulli    f = a(x)·y + b(x)·yⁿ, n ∉ {0, 1}
//   exacta       M + N·y' = 0 con ∂M/∂y = ∂N/∂x (con las M, N tal como se escribieron)
//
// Es una comprobación numérica, no una demostración: una identidad que se
// cumple en muchos puntos al azar casi seguro se cumple siempre, pero la
// interfaz lo presenta como «provisional» y SymPy confirma al calcular.

const PUNTOS_X = [-1.7, -0.6, 0.35, 0.8, 1.45, 2.3, 3.1];
const PUNTOS_Y = [0.3, 0.55, 0.9, 1.25, 1.8, 2.6, -0.45, -1.3];
const TOL = 1e-8;

function igualesRelativo(a, b) {
  return Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Llama a `prueba` en los puntos donde todo es finito; null si hay pocos válidos. */
function identidad(muestras, prueba, minimo = 6) {
  let validos = 0;
  for (const m of muestras) {
    const r = prueba(m);
    if (r === null) continue; // fuera del dominio
    if (!r) return false;
    validos++;
  }
  return validos >= minimo ? true : null;
}

const fin = (...v) => v.every(Number.isFinite);

export function clasificarEDO1(f, { M = null, N = null } = {}) {
  const pares = [];
  for (const x of PUNTOS_X) for (const y of PUNTOS_Y) pares.push([x, y]);

  const separable = identidad(pares.slice(0, 40).map((p, i) => [p, pares[(i * 7 + 11) % pares.length]]), ([[x1, y1], [x2, y2]]) => {
    const a = f(x1, y1) * f(x2, y2);
    const b = f(x1, y2) * f(x2, y1);
    return fin(a, b) ? igualesRelativo(a, b) : null;
  });

  const lineal = identidad(pares, ([x, y]) => {
    const a = y;
    const b = 0.7 * y + 0.3;
    const v = [f(x, a), f(x, b), f(x, a + b), f(x, 0)];
    return fin(...v) ? igualesRelativo(v[0] + v[1], v[2] + v[3]) : null;
  });

  const homogenea = lineal ? identidad(PUNTOS_X.map((x) => x), (x) => {
    const v = f(x, 0);
    return fin(v) ? Math.abs(v) <= TOL * Math.max(1, Math.abs(f(x, 1))) : null;
  }, 4) : false;

  const autonoma = identidad(pares, ([x, y]) => {
    const a = f(x, y);
    const b = f(x + 0.731, y);
    return fin(a, b) ? igualesRelativo(a, b) : null;
  });

  // Riccati: cuadrática en y con término y² ⇒ diferencias finitas en y: 3ª nula, 2ª no.
  let riccati = false;
  if (!lineal) {
    let segundaNoNula = false;
    riccati = identidad(pares, ([x, y]) => {
      const v = [0, 1, 2, 3].map((k) => f(x, y + 0.5 * k));
      if (!fin(...v)) return null;
      const tercera = v[3] - 3 * v[2] + 3 * v[1] - v[0];
      const segunda = v[2] - 2 * v[1] + v[0];
      if (Math.abs(segunda) > 1e-6 * Math.max(1, ...v.map(Math.abs))) segundaNoNula = true;
      return Math.abs(tercera) <= 1e-7 * Math.max(1, ...v.map(Math.abs));
    }) === true && segundaNoNula;
  }

  const bernoulli = lineal ? null : detectarBernoulli(f);

  let exacta = null;
  if (M && N) {
    exacta = identidad(pares, ([x, y]) => {
      const d = 1e-5;
      const My = (M(x, y + d) - M(x, y - d)) / (2 * d);
      const Nx = (N(x + d, y) - N(x - d, y)) / (2 * d);
      return fin(My, Nx) ? Math.abs(My - Nx) <= 1e-6 * Math.max(1, Math.abs(My), Math.abs(Nx)) : null;
    });
  }

  return {
    separable: separable === true,
    lineal: lineal === true,
    homogenea: homogenea === true,
    autonoma: autonoma === true,
    riccati,
    bernoulli, // null o { n }
    exacta: exacta === true,
    dudoso: separable === null || lineal === null, // pocos puntos válidos (dominio pequeño)
  };
}

/**
 * Bernoulli: f(x, y) = a(x)·y + b(x)·yⁿ. Para y > 0 fijo x:
 *   f(x,2y) − 2f(x,y) = b·yⁿ·(2ⁿ − 2)   y   f(x,4y) − 2f(x,2y) = b·(2y)ⁿ·(2ⁿ − 2),
 * así que su cociente es 2ⁿ y da n. Luego se comprueba el modelo en otros puntos.
 */
function detectarBernoulli(f) {
  const estimaciones = [];
  for (const x of [0.6, 1.1, 1.7, 2.4]) {
    for (const y of [0.4, 0.75, 1.2]) {
      const d1 = f(x, 2 * y) - 2 * f(x, y);
      const d2 = f(x, 4 * y) - 2 * f(x, 2 * y);
      if (!fin(d1, d2) || Math.abs(d1) < 1e-12) continue;
      const cociente = d2 / d1;
      if (cociente <= 0) return null;
      estimaciones.push(Math.log2(cociente));
    }
  }
  if (estimaciones.length < 6) return null;
  const n = estimaciones[0];
  if (!estimaciones.every((m) => Math.abs(m - n) < 1e-6)) return null;
  if (Math.abs(n) < 1e-6 || Math.abs(n - 1) < 1e-6) return null;
  // Verificación del modelo: con a y b sacados de dos puntos, el tercero debe cuadrar.
  for (const x of [0.8, 1.9]) {
    const [y1, y2, y3] = [0.5, 1.3, 2.1];
    const det = y1 * y2 ** n - y2 * y1 ** n;
    if (Math.abs(det) < 1e-12) return null;
    const b = (y1 * f(x, y2) - y2 * f(x, y1)) / det;
    const a = (f(x, y1) - b * y1 ** n) / y1;
    if (!igualesRelativo(a * y3 + b * y3 ** n, f(x, y3))) return null;
  }
  const redondeado = Math.round(n * 1e6) / 1e6;
  return { n: Math.abs(redondeado - Math.round(redondeado)) < 1e-6 ? Math.round(redondeado) : redondeado };
}

/** Orden 2 (o cualquiera): ¿es lineal en (y, y', y'') y homogénea? F en x, y, D1y, D2y. */
export function clasificarLinealidad(Fc) {
  let validos = 0;
  for (const x of PUNTOS_X) {
    const v = [0.4, -0.7, 1.3];
    const w = [-0.9, 0.5, 0.25];
    const vals = [Fc(x, v), Fc(x, w), Fc(x, v.map((a, i) => a + w[i])), Fc(x, [0, 0, 0])];
    if (!fin(...vals)) continue;
    validos++;
    if (!igualesRelativo(vals[0] + vals[1], vals[2] + vals[3])) return { lineal: false, homogenea: false };
  }
  if (validos < 4) return { lineal: null, homogenea: null };
  const homogenea = PUNTOS_X.every((x) => { const v = Fc(x, [0, 0, 0]); return !fin(v) || Math.abs(v) < TOL; });
  return { lineal: true, homogenea };
}
