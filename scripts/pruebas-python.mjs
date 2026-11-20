// Ejecuta las pruebas de Python (tests/python/test_*.py) dentro de Pyodide,
// con la misma versión de SymPy que usa la página. Sirve para probar en local
// sin instalar Python: `npm run test:py`. En CI se usan además con pytest y
// CPython (ver .github/workflows/pruebas.yml).
//
// Es un ejecutor mínimo: importa cada archivo de pruebas, llama a cada
// función test_* y cuenta las que lanzan una excepción.

import { readdirSync, readFileSync } from "node:fs";
import { loadPyodide } from "pyodide";

const RAIZ = new URL("../", import.meta.url);
const CARPETAS = { "/lab/py": "src/simbolico/py/", "/lab/pruebas": "tests/python/" };

const py = await loadPyodide();
await py.loadPackage("sympy", { messageCallback: () => {} });
for (const [destino, origen] of Object.entries(CARPETAS)) {
  py.FS.mkdirTree(destino);
  for (const archivo of readdirSync(new URL(origen, RAIZ)).filter((f) => f.endsWith(".py"))) {
    py.FS.writeFile(`${destino}/${archivo}`, readFileSync(new URL(origen + archivo, RAIZ), "utf8"));
  }
}

const resultado = py.runPython(String.raw`
import sys, time, traceback, importlib, os
sys.path[:0] = ["/lab/py", "/lab/pruebas"]
lineas, fallos, total = [], 0, 0
# test_codigo_generado.py necesita subprocess (no existe en Pyodide): su
# equivalente local es scripts/probar-codigo-generado.mjs.
for archivo in sorted(f for f in os.listdir("/lab/pruebas") if f.startswith("test_") and f.endswith(".py") and f != "test_codigo_generado.py"):
    modulo = importlib.import_module(archivo[:-3])
    for nombre in sorted(n for n in dir(modulo) if n.startswith("test_")):
        total += 1
        inicio = time.time()
        try:
            getattr(modulo, nombre)()
            lineas.append(f"✔ {archivo}::{nombre} ({(time.time() - inicio) * 1000:.0f} ms)")
        except Exception:
            fallos += 1
            lineas.append(f"✖ {archivo}::{nombre}\n" + traceback.format_exc())
lineas.append(f"\n{total - fallos} de {total} pruebas pasan")
"\n".join(lineas) + ("\nFALLOS" if fallos else "")
`);
console.log(resultado);
process.exitCode = resultado.endsWith("FALLOS") ? 1 : 0;
