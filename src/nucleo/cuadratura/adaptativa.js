// Simpson adaptativo: refina solo donde hace falta.
//
// Una regla compuesta usa el mismo h en todo [a, b]. Si f es tranquila en
// casi todo el intervalo y cambia bruscamente en un trozo, esa h uniforme
// desperdicia evaluaciones donde f es suave. La versión adaptativa decide el
// tamaño de cada trozo según el error que estima en él:
//
//   1. En [a, b] calcula Simpson con un panel, S₁, y con dos mitades, S₂.
//   2. Como Simpson es de orden 4, el error de S₂ es aproximadamente
//      (S₂ − S₁)/15  (extrapolación de Richardson: E(h/2) ≈ E(h)/16).
//   3. Si |S₂ − S₁| ≤ 15·tol, acepta S₂ + (S₂ − S₁)/15 para ese trozo.
//      Si no, parte [a, b] en dos y repite en cada mitad con tol/2, para que
//      la suma de los errores de los trozos siga siendo ≤ tol.
//
// La lista de trozos aceptados es justo lo que la interfaz dibuja: los
// trozos pequeños delatan dónde f es difícil.
//
// Límites honestos: la estimación del paso 2 supone que f es suave en el
// trozo; con singularidades o funciones que oscilan rápido puede engañarse.
// Por eso hay un tope de profundidad y de evaluaciones, y si se alcanza se
// devuelve `agotado: true` en lugar de presentar el resultado como fiable.

import { evaluarFinito } from "./riemann.js";

export function simpsonAdaptativo(f, a, b, { tol = 1e-10, profundidadMaxima = 50, maxEvaluaciones = 200000 } = {}) {
  const evaluar = (x) => { evaluaciones++; return evaluarFinito(f, x); };
  let evaluaciones = 0;
  let agotado = false;

  const simpsonPanel = (fa, fm, fb, ancho) => (ancho / 6) * (fa + 4 * fm + fb);

  const fa = evaluar(a);
  const fb = evaluar(b);
  const fm = evaluar((a + b) / 2);
  // Pila explícita en vez de recursión: evita desbordar la pila con muchas divisiones.
  const pila = [{ a, b, fa, fm, fb, S: simpsonPanel(fa, fm, fb, b - a), tol, profundidad: 0 }];
  const intervalos = [];
  let valor = 0;
  let errorEstimado = 0;

  while (pila.length) {
    const t = pila.pop();
    const m = (t.a + t.b) / 2;
    const fIzq = evaluar((t.a + m) / 2);
    const fDer = evaluar((m + t.b) / 2);
    const izquierda = simpsonPanel(t.fa, fIzq, t.fm, m - t.a);
    const derecha = simpsonPanel(t.fm, fDer, t.fb, t.b - m);
    const S2 = izquierda + derecha;
    const diferencia = S2 - t.S;

    const aceptable = Math.abs(diferencia) <= 15 * t.tol;
    const sinMargen = t.profundidad >= profundidadMaxima || evaluaciones >= maxEvaluaciones;
    if (aceptable || sinMargen) {
      if (!aceptable) agotado = true;
      valor += S2 + diferencia / 15;
      errorEstimado += Math.abs(diferencia) / 15;
      intervalos.push([t.a, t.b]);
      continue;
    }
    const tolHija = t.tol / 2;
    const profundidad = t.profundidad + 1;
    // Se apila primero la derecha para procesar de izquierda a derecha.
    pila.push({ a: m, b: t.b, fa: t.fm, fm: fDer, fb: t.fb, S: derecha, tol: tolHija, profundidad });
    pila.push({ a: t.a, b: m, fa: t.fa, fm: fIzq, fb: t.fm, S: izquierda, tol: tolHija, profundidad });
  }

  intervalos.sort((p, q) => p[0] - q[0]);
  return { valor, errorEstimado, intervalos, evaluaciones, agotado };
}
