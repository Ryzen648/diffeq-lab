import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { leerProblema, exigirPrimerOrden } from "../src/nucleo/edo/problema.js";
import { leerEcuacion } from "../src/nucleo/edo/notacion.js";
import { lanza, cerca } from "./ayuda.mjs";

const base = { x0: "0", y0: "1", xmin: "0", xmax: "10", h: "", tol: "1e-6" };

test("lee el problema y pone h por defecto = rango/40", () => {
  const p = leerProblema({ ...base, y0: "pi/2" });
  cerca(p.y0, Math.PI / 2, 1e-15);
  assert.equal(p.h, 0.25);
  assert.equal(p.tol, 1e-6);
});

test("errores del problema de valor inicial", () => {
  lanza(() => leerProblema({ ...base, xmax: "0" }), "rangoInvalido");
  lanza(() => leerProblema({ ...base, x0: "12" }), "condicionFueraDeRango", { x0: 12 });
  lanza(() => leerProblema({ ...base, h: "-0.1" }), "pasoInvalido");
  lanza(() => leerProblema({ ...base, h: "20" }), "pasoInvalido");
  lanza(() => leerProblema({ ...base, tol: "2" }), "toleranciaInvalida");
  lanza(() => leerProblema({ ...base, y0: "inf" }), "limiteInfinitoNoAdmitido");
});

test("orden 2 y EDP se rechazan con su fase", () => {
  lanza(() => exigirPrimerOrden(leerEcuacion("y'' + y = 0")), "orden2Fase2", { orden: 2 });
  lanza(() => exigirPrimerOrden(leerEcuacion("u_t = u_xx")), "edpFase3");
  assert.doesNotThrow(() => exigirPrimerOrden(leerEcuacion("y' = x*y")));
});
