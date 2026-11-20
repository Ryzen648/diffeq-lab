// Hilo con Pyodide + SymPy para el banco (scripts/banco.mjs): lo mismo que el
// Worker de la página (src/simbolico/pyodide.worker.js), pero en Node. Al
// estar en otro hilo, el banco puede cortarlo si un cálculo no termina.

import { parentPort } from "node:worker_threads";
import { readdirSync, readFileSync } from "node:fs";
import { loadPyodide } from "pyodide";

const CARPETA = new URL("../src/simbolico/py/", import.meta.url);

const py = await loadPyodide();
await py.loadPackage("sympy", { messageCallback: () => {} });
py.FS.mkdirTree("/lab");
for (const archivo of readdirSync(CARPETA).filter((f) => f.endsWith(".py"))) {
  py.FS.writeFile(`/lab/${archivo}`, readFileSync(new URL(archivo, CARPETA), "utf8"));
}
py.runPython("import sys; sys.path.insert(0, '/lab')");
parentPort.postMessage({ listo: true });

parentPort.on("message", ({ id, funcion, args }) => {
  try {
    const [modulo, nombre] = funcion.split(".");
    // Como en la página: null llega a Python como None si se pasa undefined.
    const texto = py.pyimport(modulo)[nombre](...args.map((a) => (a === null ? undefined : a)));
    parentPort.postMessage({ id, ok: JSON.parse(texto) });
  } catch (err) {
    parentPort.postMessage({ id, error: String(err?.message ?? err).trim().split("\n").filter(Boolean).at(-1) });
  }
});
