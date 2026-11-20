import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { leerOrden2, leerSistema, clasificarPlano, tipoCoeficientes, leerProblemaPlano } from "../src/nucleo/edo/plano.js";
import { campoVectorial, rejilla } from "../src/nucleo/edo/campo.js";
import { aJS, compilarFuente } from "../src/nucleo/expresion.js";
import { variablesDe } from "../comun/js/entrada/analizar.js";

/** Problema del plano -> F(t, [x, y]) con los parámetros dados. */
function compilar(p, valores = {}) {
  const args = ["t", "x", "y", ...p.parametros];
  const [f, g] = [p.f, p.g].map((n) => compilarFuente(aJS(n), args));
  const extra = p.parametros.map((q) => valores[q] ?? 1);
  return (t, [x, y]) => [f(t, x, y, ...extra), g(t, x, y, ...extra)];
}
const usaT = (p) => [p.f, p.g].some((n) => variablesDe(n).has("t"));

test("orden 2 -> sistema (posición, velocidad), con los nombres del usuario", () => {
  const p = leerOrden2("x'' = -sin(x)"); // péndulo en t
  assert.deepEqual(p.nombres, { t: "t", x: "x", y: "x'" });
  const F = compilar(p);
  const [a, b] = F(0, [0.7, -0.3]);
  assert.equal(a, -0.3);
  assert.ok(Math.abs(b + Math.sin(0.7)) < 1e-15);

  // Despeja y'' aunque lleve coeficiente y esté mezclada: 2y'' + 3y' − y = x  ->  y'' = (x − 3y' + y)/2
  const q = leerOrden2("2*y'' + 3*y' - y = x");
  assert.deepEqual(q.nombres, { t: "x", x: "y", y: "y'" });
  const G = compilar(q);
  const [t, y, v] = [1.3, 0.4, -0.9];
  assert.ok(Math.abs(G(t, [y, v])[1] - (t - 3 * v + y) / 2) < 1e-14);
  assert.equal(G(t, [y, v])[0], v);

  // Van der Pol con parámetro.
  const vdp = leerOrden2("x'' - mu*(1 - x^2)*x' + x = 0");
  assert.deepEqual(vdp.parametros, ["mu"]);
  const H = compilar(vdp, { mu: 2 });
  assert.ok(Math.abs(H(0, [0.5, 1])[1] - (2 * (1 - 0.25) * 1 - 0.5)) < 1e-14);
});

test("orden 2: rechaza lo que no lo es o no se puede despejar", () => {
  assert.throws(() => leerOrden2("y' = y"), (e) => e.codigo === "noOrden2");
  assert.throws(() => leerOrden2("(y'')^2 + y = 0"), (e) => e.codigo === "noFormaNormal2");
  assert.throws(() => leerOrden2("u_t = u_xx"), (e) => e.codigo === "edpFase3");
  // «t» como parámetro chocaría con el nombre interno del tiempo.
  assert.throws(() => leerOrden2("y'' + t*x*y = 0"), (e) => e.codigo === "nombreReservado");
});

test("sistema: parámetros = los símbolos que no son t, x, y", () => {
  const p = leerSistema("x*(a - b*y)", "y*(d*x - c)");
  assert.deepEqual(p.parametros, ["a", "b", "c", "d"]);
  const F = compilar(p, { a: 1, b: 1, c: 0.5, d: 0.5 });
  assert.deepEqual(F(0, [1, 1]), [0, 0]); // equilibrio (c/d, a/b)
});

test("clasificación en vivo: lineal, homogéneo, autónomo, coeficientes constantes", () => {
  const caso = (f, g) => { const p = leerSistema(f, g); return clasificarPlano(compilar(p), { usaT: usaT(p) }); };
  assert.deepEqual(caso("y", "-2*x - 3*y"), { autonomo: true, lineal: true, homogeneo: true, constante: true });
  assert.deepEqual(caso("y", "-x + 1"), { autonomo: true, lineal: true, homogeneo: false, constante: true });
  assert.deepEqual(caso("y", "-x + sin(t)"), { autonomo: false, lineal: true, homogeneo: false, constante: false });
  assert.deepEqual(caso("y", "-t*x"), { autonomo: false, lineal: true, homogeneo: true, constante: false });
  const lv = caso("x*(1 - y)", "0.5*y*(x - 1)");
  assert.equal(lv.lineal, false);
  assert.equal(lv.autonomo, true);
  const pendulo = leerOrden2("x'' = -sin(x)");
  assert.equal(clasificarPlano(compilar(pendulo), { usaT: usaT(pendulo) }).lineal, false);
});

test("tipo de coeficientes de una lineal de orden 2", () => {
  const Fc = (texto) => {
    const { ec } = leerOrden2(texto);
    const fn = compilarFuente(aJS(ec.F), ["x", "y", "D1y", "D2y", ...ec.parametros]);
    return (x, [y, v, a]) => fn(x, y, v, a, ...ec.parametros.map(() => 1));
  };
  assert.equal(tipoCoeficientes(Fc("y'' + 2*y' + 5*y = cos(x)")), "coefConstantes");
  assert.equal(tipoCoeficientes(Fc("3*y'' - y = 0")), "coefConstantes");
  assert.equal(tipoCoeficientes(Fc("x^2*y'' + x*y' - y = 0")), "cauchyEuler");
  assert.equal(tipoCoeficientes(Fc("y'' + x*y = 0")), "coefVariables"); // Airy
});

test("campo vectorial: flechas de la misma longitud en pantalla, apuntando con el campo", () => {
  const F = (x, y) => [y, -x]; // giro horario
  const ventana = [[-2, 2], [-10, 10]]; // escalas muy distintas a propósito
  const c = campoVectorial(F, ...ventana, { nx: 5, ny: 5 });
  assert.equal(c.validos, 24); // el origen (equilibrio) no lleva flecha
  const largos = [];
  for (let k = 0; k < c.xs.length; k += 7) {
    const [x0, x1, y0, y1] = [c.xs[k], c.xs[k + 1], c.ys[k], c.ys[k + 1]];
    largos.push(Math.hypot((x1 - x0) / 4, (y1 - y0) / 20)); // en fracciones de cada eje
    // La punta va hacia donde apunta el campo en el centro del tallo.
    const [f, g] = F((x0 + x1) / 2, (y0 + y1) / 2);
    assert.ok((x1 - x0) * f + (y1 - y0) * g > 0);
  }
  for (const l of largos) assert.ok(Math.abs(l - largos[0]) < 1e-12);
});

test("rejilla para las nulclinas: z[j][i] = h(x_i, y_j), null fuera del dominio", () => {
  const r = rejilla((x, y) => (x > 0 ? Math.log(x) + y : NaN), [-1, 1], [0, 2], { nx: 3, ny: 2 });
  assert.deepEqual(r.x, [-1, 0, 1]);
  assert.deepEqual(r.y, [0, 2]);
  assert.deepEqual(r.z, [[null, null, 0], [null, null, 2]]);
});

test("datos del problema: ventana opcional, completa y ordenada", () => {
  const nombres = { t0: "t₀", x0: "x(t₀)", y0: "y(t₀)", tf: "t final" };
  const base = { t0: "0", x0: "1", y0: "pi/2", tf: "10", h: "", tol: "1e-6" };
  const d = leerProblemaPlano(base, nombres);
  assert.deepEqual(d.Y0, [1, Math.PI / 2]);
  assert.equal(d.h, 0.25);
  assert.equal(d.ventana, null);
  assert.deepEqual(leerProblemaPlano({ ...base, xmin: "-pi", xmax: "pi", ymin: "-3", ymax: "3" }, nombres).ventana, { x: [-Math.PI, Math.PI], y: [-3, 3] });
  assert.throws(() => leerProblemaPlano({ ...base, xmin: "-1" }, nombres), (e) => e.codigo === "ventanaIncompleta");
  assert.throws(() => leerProblemaPlano({ ...base, xmin: "1", xmax: "-1", ymin: "0", ymax: "1" }, nombres), (e) => e.codigo === "ventanaInvalida");
});
