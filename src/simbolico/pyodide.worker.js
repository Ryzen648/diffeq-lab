// Web Worker con Pyodide + SymPy. Lo arranca src/simbolico/cliente.js la
// primera vez que hace falta algo simbólico (no al abrir la página: son
// ≈10 MB comprimidos la primera vez; luego los guarda la caché del navegador).
//
// Carga Pyodide desde jsDelivr, instala SymPy y copia los módulos .py de
// ./py/ a su sistema de archivos virtual. Después atiende peticiones
// { id, funcion, args } y responde con el JSON que devuelve cada función.

// Misma versión que el devDependency `pyodide` de package.json (lo comprueba
// una prueba): así lo que se prueba en Node es lo que corre en el navegador.
export const VERSION_PYODIDE = "314.0.8";
const URL_PYODIDE = `https://cdn.jsdelivr.net/pyodide/v${VERSION_PYODIDE}/full/pyodide.mjs`;

const MODULOS_PY = ["comun.py", "pasos_integral.py", "integrales.py", "edo.py", "edo2.py"];

/** Funciones que se pueden llamar desde la página: "modulo.funcion". */
const PERMITIDAS = new Set(["integrales.integrar", "edo.resolver_edo1", "edo2.resolver_orden2", "edo2.resolver_sistema"]);

const estado = (datos) => postMessage({ tipo: "estado", ...datos });

const listo = (async () => {
  estado({ estado: "cargando", paso: "pyodide" });
  const { loadPyodide } = await import(URL_PYODIDE);
  const py = await loadPyodide();
  estado({ estado: "cargando", paso: "sympy" });
  await py.loadPackage("sympy", { messageCallback: () => {} });
  estado({ estado: "cargando", paso: "modulos" });
  py.FS.mkdirTree("/lab");
  for (const archivo of MODULOS_PY) {
    // Con la misma ?v= que este Worker (la pone scripts/versionar.mjs al publicar; en local, vacía):
    // así un despliegue nuevo no usa módulos .py viejos de la caché.
    const respuesta = await fetch(new URL(`./py/${archivo}${new URL(import.meta.url).search}`, import.meta.url));
    if (!respuesta.ok) throw new Error(`no se pudo leer ${archivo}`);
    py.FS.writeFile(`/lab/${archivo}`, await respuesta.text());
  }
  py.runPython("import sys; sys.path.insert(0, '/lab')");
  estado({ estado: "listo" });
  return py;
})();

listo.catch((err) => estado({ estado: "error", detalle: String(err?.message ?? err) }));

self.onmessage = async ({ data: { id, funcion, args } }) => {
  try {
    if (!PERMITIDAS.has(funcion)) throw new Error(`función no permitida: ${funcion}`);
    const py = await listo;
    const [modulo, nombre] = funcion.split(".");
    // En Pyodide, `null` llega a Python como JsNull (no como None); `undefined` sí es None.
    const argumentos = args.map((a) => (a === null ? undefined : a));
    const texto = py.pyimport(modulo)[nombre](...argumentos);
    postMessage({ id, ok: JSON.parse(texto) });
  } catch (err) {
    // Las excepciones de Python llegan con el traceback entero: basta la última línea.
    const mensaje = String(err?.message ?? err).trim().split("\n").filter(Boolean).at(-1) ?? "";
    postMessage({ id, error: { mensaje } });
  }
};
