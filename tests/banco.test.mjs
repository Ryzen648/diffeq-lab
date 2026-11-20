import "./preparar.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { math } from "../comun/js/mathjs.js";
import { clasificar, mismaPrimitiva } from "./banco/clasificar.mjs";
import { generarIntegrales, azar } from "./banco/generador.mjs";
import { simpsonAdaptativo } from "../src/nucleo/cuadratura/adaptativa.js";

const nada = { primitiva: null, primitivaTexto: null, valorExacto: null, valorNumerico: null, diverge: false, sinFormaCerrada: false };

test("clasificar: verificado y correcto es acierto; verificado e incorrecto es «errónea verificada»", () => {
  const caso = { esperado: { tipo: "definida", valor: -1 / 3 } };
  assert.equal(clasificar(caso, { ...nada, valorExacto: -1 / 3 }, "simbolica"), "acierto");
  assert.equal(clasificar(caso, { ...nada, valorExacto: -1 / 16 }, "simbolica"), "erronea_verificada");
  assert.equal(clasificar(caso, { ...nada, valorExacto: -1 / 16 }, "fallida"), "erronea_detectada");
  assert.equal(clasificar(caso, { ...nada, valorExacto: -1 / 16 }, "parcial"), "erronea_sin_marcar");
  assert.equal(clasificar(caso, { ...nada }, "inconclusa"), "rechazo_honesto");
});

test("clasificar: «diverge» con un valor finito a la vista no es correcto (1/x en [−1, 1] mostraba ≈ 0)", () => {
  const caso = { esperado: { tipo: "diverge" } };
  assert.equal(clasificar(caso, { ...nada, diverge: true }, "simbolica"), "acierto");
  assert.equal(clasificar(caso, { ...nada, diverge: true, valorNumerico: 0 }, "simbolica"), "erronea_verificada");
  assert.equal(clasificar(caso, { ...nada, valorExacto: -2 }, "simbolica"), "erronea_verificada"); // Barrow a ciegas
});

test("clasificar: primitivas salvo constante; si no se puede evaluar, no comprobable", () => {
  const caso = { esperado: { tipo: "indefinida", primitiva: "x^3" } };
  const Fref = (x) => x ** 3;
  assert.equal(clasificar(caso, { ...nada, primitiva: (x) => x ** 3 + 7 }, "simbolica", Fref), "acierto");
  assert.equal(clasificar(caso, { ...nada, primitiva: (x) => x ** 3 / 2 }, "simbolica", Fref), "erronea_verificada");
  assert.equal(clasificar(caso, { ...nada, primitiva: () => NaN }, "simbolica", Fref), "no_comprobable");
  assert.equal(mismaPrimitiva((x) => Math.log(x - 4), (x) => Math.log(Math.abs(x - 4))), null); // ln de negativos: no real
});

test("clasificar: sin forma cerrada declarada es un rechazo honesto; funciones especiales, por su nombre", () => {
  assert.equal(clasificar({ esperado: { tipo: "sinFormaCerrada" } }, { ...nada, sinFormaCerrada: true }, "inconclusa"), "rechazo_honesto");
  assert.equal(clasificar({ esperado: { tipo: "especial", funcion: "erf" } }, { ...nada, primitivaTexto: "\\frac{\\sqrt{\\pi} \\operatorname{erf}{\\left(x \\right)}}{2}" }, "simbolica"), "acierto");
});

test("generador: reproducible, con dos variantes de entrada y referencias que una cuadratura independiente confirma", () => {
  const a = generarIntegrales(7, 30);
  assert.deepEqual(a, generarIntegrales(7, 30));
  assert.notDeepEqual(a, generarIntegrales(8, 30));
  assert.ok(a.some((c) => c.variante === "visual"));
  for (const c of a.filter((x) => x.esperado.tipo === "definida")) {
    const f = (x) => math.evaluate(c.f, { x: x });
    const q = simpsonAdaptativo(f, Number(c.a), Number(c.b), { tol: 1e-11 }).valor;
    assert.ok(Math.abs(q - c.esperado.valor) <= 1e-7 * Math.max(1, Math.abs(q)), `${c.id}: ∫ ${c.f} de ${c.a} a ${c.b}`);
  }
  // azar() en [0, 1)
  const r = azar(3);
  for (let i = 0; i < 100; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test("el banco escrito a mano tiene campos completos y referencias con las que se puede comparar", () => {
  const banco = JSON.parse(readFileSync(new URL("./banco/integrales.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const c of banco.casos) {
    assert.ok(!ids.has(c.id), `id repetido: ${c.id}`);
    ids.add(c.id);
    assert.ok(c.tema && c.nivel && c.f && c.esperado?.tipo, c.id);
    if (c.esperado.tipo === "definida") assert.ok(Number.isFinite(c.esperado.valor) && c.a !== undefined && c.b !== undefined, c.id);
    if (c.esperado.tipo === "indefinida") assert.doesNotThrow(() => math.evaluate(c.esperado.primitiva, { x: 0.7 }), c.id);
  }
});

test("temario: cada tema tiene nombre y estado válido, y cada tema del banco existe en el temario", async () => {
  const { TEMARIO } = await import("../src/temario.js");
  const { claves } = await import("../src/i18n/index.js");
  const existentes = new Set(claves("es"));
  const ids = new Set();
  for (const [seccion, temas] of Object.entries(TEMARIO)) {
    assert.ok(existentes.has(`cobertura.seccion.${seccion}`), seccion);
    for (const tema of temas) {
      assert.ok(!ids.has(tema.id), `tema repetido: ${tema.id}`);
      ids.add(tema.id);
      assert.ok(existentes.has(`cobertura.tema.${tema.id}`), `falta el nombre de ${tema.id}`);
      assert.ok(["banco", "disponible", "parcial", "pendiente"].includes(tema.estado), tema.id);
      assert.ok(["N", "E", "A", "C"].includes(tema.nivel), tema.id);
      if (tema.estado === "pendiente") assert.match(tema.hito ?? "", /^H\d+$/, tema.id);
      if (tema.nota) assert.ok(existentes.has(`cobertura.nota.${tema.nota}`), `falta la nota ${tema.nota}`);
    }
  }
  const banco = JSON.parse(readFileSync(new URL("./banco/integrales.json", import.meta.url), "utf8"));
  const temasBanco = new Set([...banco.casos.map((c) => c.tema), ...generarIntegrales(1, 40).map((c) => c.tema)]);
  for (const tema of temasBanco) {
    const t = TEMARIO.integrales.find((x) => x.id === tema);
    assert.ok(t, `el banco usa el tema «${tema}», que no está en el temario`);
    assert.equal(t.estado, "banco", `${tema} tiene casos en el banco: su estado debe ser «banco»`);
  }
});
