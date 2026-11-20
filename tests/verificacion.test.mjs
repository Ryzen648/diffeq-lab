import { test } from "node:test";
import assert from "node:assert/strict";

import { comprobacion, estadoGlobal, componentesFallidos, estaVerificado, errores } from "../src/nucleo/verificacion.js";

const c = (componente, metodo, resultado, extra = {}) => comprobacion({ componente, metodo, resultado, clave: "x", ...extra });

test("todas pasan: simbólica si alguna lo es; si no, numérica", () => {
  assert.equal(estadoGlobal([c("primitiva", "simbolica", "ok"), c("primitiva", "numerica", "ok")]), "simbolica");
  assert.equal(estadoGlobal([c("solucionNumerica", "numerica", "ok")]), "numerica");
});

test("una sola requerida que falla basta para «fallida», aunque las demás pasen", () => {
  const lista = [c("primitiva", "simbolica", "ok"), c("primitiva", "numerica", "falla"), c("valorDefinido", "numerica", "ok")];
  assert.equal(estadoGlobal(lista), "fallida");
  assert.deepEqual(componentesFallidos(lista), ["primitiva"]);
  assert.equal(estaVerificado(estadoGlobal(lista)), false);
});

test("lo informativo no cuenta (un aviso de Barrow no hace fallar ni verifica)", () => {
  const aviso = c("barrow", "numerica", "informativa");
  assert.equal(aviso.requerida, false);
  assert.equal(estadoGlobal([aviso]), "inconclusa");
  assert.equal(estadoGlobal([c("primitiva", "simbolica", "ok"), aviso]), "simbolica");
  // Una no requerida que falla tampoco decide.
  assert.equal(estadoGlobal([c("primitiva", "simbolica", "ok"), c("extra", "numerica", "falla", { requerida: false })]), "simbolica");
});

test("parcial, pendiente e inconclusa", () => {
  assert.equal(estadoGlobal([c("primitiva", "simbolica", "ok"), c("valorDefinido", "numerica", "inconclusa")]), "parcial");
  assert.equal(estadoGlobal([c("primitiva", "numerica", "ok"), c("primitiva", "simbolica", "pendiente")]), "pendiente");
  assert.equal(estadoGlobal([]), "inconclusa");
  assert.equal(estadoGlobal([c("primitiva", "simbolica", "inconclusa")]), "inconclusa");
  // Una falla gana a todo, también a lo pendiente.
  assert.equal(estadoGlobal([c("a", "numerica", "falla"), c("b", "simbolica", "pendiente")]), "fallida");
});

test("los campos se validan y errores() da absoluto y relativo", () => {
  assert.throws(() => comprobacion({ componente: "a", resultado: "bien", clave: "k" }));
  assert.throws(() => comprobacion({ componente: "a", metodo: "magia", resultado: "ok", clave: "k" }));
  assert.deepEqual(errores(1.5, 1), { errorAbs: 0.5, errorRel: 0.5 });
  assert.deepEqual(errores(0.001, 0), { errorAbs: 0.001, errorRel: 0.001 }); // escala max(1, |ref|)
  assert.deepEqual(errores(210, 200), { errorAbs: 10, errorRel: 0.05 });
});
