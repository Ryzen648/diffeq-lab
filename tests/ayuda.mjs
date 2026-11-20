// Ayudas para las pruebas.
import assert from "node:assert/strict";

/** Comprueba que `fn` lanza un ErrorCalculo con ese código y (si se dan) esos datos. */
export function lanza(fn, codigo, datos = {}) {
  assert.throws(fn, (err) => {
    assert.equal(err.name, "ErrorCalculo", `se esperaba ErrorCalculo y llegó ${err}`);
    assert.equal(err.codigo, codigo);
    for (const [clave, valor] of Object.entries(datos)) assert.deepEqual(err.datos[clave], valor, `dato ${clave}`);
    return true;
  });
}

/** |a − b| ≤ tol·max(1, |b|). */
export function cerca(a, b, tol = 1e-12, mensaje = "") {
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${mensaje} ${a} no está cerca de ${b} (tol ${tol})`);
}
