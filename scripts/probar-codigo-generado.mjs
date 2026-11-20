// Prueba en local, sin instalar Python, que el código Python generado para
// cada ejemplo funciona y da lo mismo que la página. Hace lo mismo que
// tests/python/test_codigo_generado.py (que es el que corre en CI con
// CPython), pero dentro de Pyodide con NumPy, SciPy y SymPy:
//   node scripts/generar-codigo-ejemplos.mjs codigo-generado
//   node scripts/probar-codigo-generado.mjs codigo-generado

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadPyodide } from "pyodide";

const carpeta = resolve(process.argv[2] ?? "codigo-generado");
const esperados = JSON.parse(readFileSync(join(carpeta, "esperados.json"), "utf8"));
const TOLERANCIA = 1e-7;

const py = await loadPyodide();
await py.loadPackage(["numpy", "scipy", "sympy"], { messageCallback: () => {} });

let fallos = 0;
for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith(".py")).sort()) {
  const id = archivo.slice(0, -3);
  const esperado = esperados[id];
  const inicio = performance.now();
  let salida = "";
  try {
    py.setStdout({ batched: (linea) => { salida += `${linea}\n`; } });
    py.runPython(readFileSync(join(carpeta, archivo), "utf8"), { globals: py.toPy({ __name__: "__main__" }) });
    const resultado = JSON.parse(salida.trim().split("\n").at(-1));
    let ok;
    let detalle;
    if (esperado.tipo === "integral" && esperado.diverge) {
      ok = ["oo", "-oo"].includes(resultado.exacto);
      detalle = `exacto = ${resultado.exacto}`;
    } else if (esperado.tipo === "plano") {
      const valor = [resultado.x_final, resultado.y_final];
      const dif = Math.max(...valor.map((v, k) => Math.abs(v - esperado.valor[k])));
      ok = dif <= TOLERANCIA * Math.max(1, ...esperado.valor.map(Math.abs));
      detalle = `Python (${valor.join(", ")}) | página (${esperado.valor.join(", ")}) | diferencia ${dif.toExponential(2)}`;
    } else {
      const valor = esperado.tipo === "integral" ? resultado.quad : resultado.y_final;
      const dif = Math.abs(valor - esperado.valor);
      ok = dif <= TOLERANCIA * Math.max(1, Math.abs(esperado.valor));
      detalle = `Python ${valor} | página ${esperado.valor} | diferencia ${dif.toExponential(2)}`;
    }
    if (!ok) fallos++;
    console.log(`${ok ? "✔" : "✖"} ${id} (${((performance.now() - inicio) / 1000).toFixed(1)} s) ${detalle}`);
  } catch (err) {
    fallos++;
    console.log(`✖ ${id}: ${String(err.message).split("\n").filter(Boolean).slice(-2).join(" | ")}`);
  }
}
console.log(fallos ? `\n${fallos} fallos` : "\nTodos los scripts generados funcionan y coinciden con la página");
process.exitCode = fallos ? 1 : 0;
