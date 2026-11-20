import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { leerNumero, leerLimites } from "../src/nucleo/numeros.js";
import { lanza, cerca } from "./ayuda.mjs";

test("lee números y expresiones", () => {
  assert.equal(leerNumero("2", "a"), 2);
  cerca(leerNumero("pi/2", "a"), Math.PI / 2, 1e-15);
  cerca(leerNumero("sqrt(2)", "a"), Math.SQRT2, 1e-15);
  cerca(leerNumero("e^-1", "a"), 1 / Math.E, 1e-15);
  cerca(leerNumero("−3", "a"), -3, 0); // signo menos tipográfico
});

test("infinito en todas sus formas, solo donde se admite", () => {
  for (const t of ["inf", "Infinity", "∞", "oo", "+inf", "infinito"]) assert.equal(leerNumero(t, "b", { admiteInfinito: true }), Infinity, t);
  for (const t of ["-inf", "-∞", "- oo"]) assert.equal(leerNumero(t, "a", { admiteInfinito: true }), -Infinity, t);
  lanza(() => leerNumero("inf", "x₀"), "limiteInfinitoNoAdmitido", { campo: "x₀" });
});

test("valores no válidos dicen qué campo y qué texto", () => {
  lanza(() => leerNumero("dos", "a"), "numeroInvalido", { campo: "a", texto: "dos" });
  lanza(() => leerNumero("", "y₀"), "numeroInvalido", { campo: "y₀" });
  lanza(() => leerNumero("1/0", "a"), "numeroInvalido");
  lanza(() => leerNumero("sqrt(-1)", "a"), "numeroInvalido");
});

test("límites: iguales es un error; invertidos se respetan", () => {
  lanza(() => leerLimites("1", "1"), "limitesIguales");
  assert.deepEqual(leerLimites("2", "0"), { a: 2, b: 0 });
  assert.deepEqual(leerLimites("0", "inf"), { a: 0, b: Infinity });
});
