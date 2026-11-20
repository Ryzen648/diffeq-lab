import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { leerProblema, exigirPrimerOrden, migrarEstadoAntiguo } from "../src/nucleo/edo/problema.js";
import { leerEcuacion } from "../src/nucleo/edo/notacion.js";
import { lanza, cerca } from "./ayuda.mjs";

const base = { x0: "0", y0: "1", xf: "10", desde: "", h: "", tol: "1e-6" };

test("hacia adelante: ventana [x0, xf], h por defecto = |xf − x0|/40", () => {
  const p = leerProblema(base);
  assert.equal(p.direccion, 1);
  assert.deepEqual(p.ventana, [0, 10]);
  assert.equal(p.desde, 0);
  assert.equal(p.h, 0.25);
});

test("hacia atrás: xf < x0 basta, sin otros datos", () => {
  const p = leerProblema({ ...base, xf: "-1" });
  assert.equal(p.direccion, -1);
  assert.deepEqual(p.ventana, [-1, 0]);
  assert.equal(p.h, 1 / 40);
});

test("«desde» amplía la ventana al otro lado de x0", () => {
  assert.deepEqual(leerProblema({ ...base, desde: "-3" }).ventana, [-3, 10]);
  assert.deepEqual(leerProblema({ ...base, xf: "-2", desde: "5" }).ventana, [-2, 5]);
  assert.deepEqual(leerProblema({ ...base, desde: "0" }).ventana, [0, 10]); // igual a x0: como vacío
});

test("expresiones como pi/2 en x0, y0 y xf", () => {
  const p = leerProblema({ ...base, x0: "pi/2", y0: "sqrt(2)", xf: "pi" });
  cerca(p.x0, Math.PI / 2, 1e-15);
  cerca(p.y0, Math.SQRT2, 1e-15);
  cerca(p.xf, Math.PI, 1e-15);
});

test("validación con su código de error", () => {
  lanza(() => leerProblema({ ...base, xf: "0" }), "hastaIgualX0", { x0: 0 });
  lanza(() => leerProblema({ ...base, xf: "2*0" }), "hastaIgualX0");
  lanza(() => leerProblema({ ...base, desde: "2" }), "desdeNoContieneX0", { desde: 2 });    // mismo lado que xf
  lanza(() => leerProblema({ ...base, desde: "12" }), "desdeNoContieneX0");                 // más allá de xf
  lanza(() => leerProblema({ ...base, xf: "inf" }), "limiteInfinitoNoAdmitido");
  lanza(() => leerProblema({ ...base, xf: "1/0" }), "numeroInvalido");
  lanza(() => leerProblema({ ...base, xf: "" }), "numeroInvalido");
  lanza(() => leerProblema({ ...base, desde: "abc" }), "numeroInvalido");
  lanza(() => leerProblema({ ...base, h: "-0.1" }), "pasoInvalido");
  lanza(() => leerProblema({ ...base, h: "20" }), "pasoInvalido");
  lanza(() => leerProblema({ ...base, tol: "2" }), "toleranciaInvalida");
});

test("enlaces antiguos con desde/hasta (xmin/xmax) siguen funcionando", () => {
  // Antes: ventana [xmin, xmax] alrededor de x0, resuelta a ambos lados.
  assert.deepEqual(migrarEstadoAntiguo({ e: "x*y", x0: "0", y0: "1", xmin: "0", xmax: "10" }),
    { e: "x*y", x0: "0", y0: "1", xf: "10", desde: "" });
  assert.deepEqual(migrarEstadoAntiguo({ e: "x*y", x0: "0", y0: "1", xmin: "-2", xmax: "3" }),
    { e: "x*y", x0: "0", y0: "1", xf: "3", desde: "-2" });
  assert.deepEqual(migrarEstadoAntiguo({ e: "x*y", x0: "5", y0: "1", xmin: "-1", xmax: "5" }),
    { e: "x*y", x0: "5", y0: "1", xf: "-1", desde: "" });
  // Un estado nuevo no se toca.
  const nuevo = { e: "x*y", x0: "0", y0: "1", xf: "-1" };
  assert.equal(migrarEstadoAntiguo(nuevo), nuevo);
  // Y lo migrado se puede leer.
  assert.doesNotThrow(() => leerProblema({ ...migrarEstadoAntiguo({ x0: "0", y0: "1", xmin: "-2", xmax: "3" }), h: "", tol: "1e-6" }));
});

test("orden 2 y EDP se rechazan con su fase", () => {
  lanza(() => exigirPrimerOrden(leerEcuacion("y'' + y = 0")), "orden2Fase2", { orden: 2 });
  lanza(() => exigirPrimerOrden(leerEcuacion("u_t = u_xx")), "edpFase3");
  assert.doesNotThrow(() => exigirPrimerOrden(leerEcuacion("y' = x*y")));
});
