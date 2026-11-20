import "./preparar.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { crearTrabajador } from "../src/workers/rpc.js";

// Worker falso: responde según `comportamiento[funcion]` y anuncia «listo» al arrancar.
let creados = [];
const comportamiento = {};
class WorkerFalso {
  constructor() {
    this.terminado = false;
    creados.push(this);
    queueMicrotask(() => this.onmessage?.({ data: { tipo: "estado", estado: "listo" } }));
  }
  postMessage({ id, funcion, args }) {
    const accion = comportamiento[funcion];
    if (accion === "colgar") return; // nunca responde
    setTimeout(() => {
      if (this.terminado) return;
      if (accion === "fallar") this.onmessage({ data: { id, error: { mensaje: "ZeroDivisionError" } } });
      else this.onmessage({ data: { id, ok: { eco: args } } });
    }, 5);
  }
  terminate() { this.terminado = true; }
}

beforeEach(() => {
  creados = [];
  globalThis.Worker = WorkerFalso;
  for (const k of Object.keys(comportamiento)) delete comportamiento[k];
});

test("una llamada devuelve lo que responde el Worker", async () => {
  const estados = [];
  const t = crearTrabajador("x.js", { alEstado: (e) => estados.push(e.estado) });
  assert.deepEqual(await t.llamar("eco", [1, 2]), { eco: [1, 2] });
  assert.deepEqual(estados, ["cargando", "listo"]);
});

test("un error de Python llega como ErrorCalculo con el detalle", async () => {
  comportamiento.f = "fallar";
  const t = crearTrabajador("x.js");
  await assert.rejects(t.llamar("f"), (e) => e.codigo === "errorEnTrabajador" && e.datos.detalle === "ZeroDivisionError");
});

test("al agotarse el tiempo se termina el Worker, se cancelan las demás y la siguiente arranca otro", async () => {
  comportamiento.lenta = "colgar";
  const t = crearTrabajador("x.js");
  const lenta = t.llamar("lenta", [], { tiempoMaximo: 30 });
  const otra = t.llamar("lenta", [], { tiempoMaximo: 10000 });
  await assert.rejects(lenta, (e) => e.codigo === "tiempoAgotado");
  await assert.rejects(otra, (e) => e.codigo === "calculoCancelado");
  assert.equal(creados[0].terminado, true);
  assert.deepEqual(await t.llamar("eco", ["otra vez"]), { eco: ["otra vez"] });
  assert.equal(creados.length, 2);
});

test("la versión de Pyodide del navegador es la misma que la probada en Node", () => {
  const paquete = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const worker = readFileSync(new URL("../src/simbolico/pyodide.worker.js", import.meta.url), "utf8");
  const version = /VERSION_PYODIDE = "([^"]+)"/.exec(worker)[1];
  assert.equal(version, paquete.devDependencies.pyodide);
});

test("el Worker solo carga módulos .py que existen", () => {
  const worker = readFileSync(new URL("../src/simbolico/pyodide.worker.js", import.meta.url), "utf8");
  const modulos = JSON.parse(/MODULOS_PY = (\[[^\]]+\])/.exec(worker)[1]);
  for (const m of modulos) assert.doesNotThrow(() => readFileSync(new URL(`../src/simbolico/py/${m}`, import.meta.url)), m);
});
