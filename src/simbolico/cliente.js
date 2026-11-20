// Acceso a la parte simbólica (SymPy en Pyodide) desde la página.
//
// Un único Worker para toda la página, creado la primera vez que se pide
// algo. `alEstadoSimbolico` permite pintar el indicador de carga.

import { crearTrabajador } from "../workers/rpc.js";

const oyentes = new Set();
let ultimo = { estado: "inactivo" };

const trabajador = crearTrabajador(new URL("./pyodide.worker.js", import.meta.url), {
  tiempoPorDefecto: 20000,
  alEstado: (e) => { ultimo = e; for (const f of oyentes) f(e); },
});

/** Se llama con { estado, paso? } cada vez que cambia; devuelve la función para dejar de escuchar. */
export function alEstadoSimbolico(fn) {
  oyentes.add(fn);
  fn(ultimo);
  return () => oyentes.delete(fn);
}

export const precargarSimbolico = () => trabajador.precargar();
export const cancelarSimbolico = () => trabajador.cancelar();

/**
 * Primitiva con pasos y, si se dan límites, la integral definida.
 * `textoPython`: el integrando en sintaxis de SymPy (src/nucleo/python.js).
 * `a`, `b`: texto de SymPy ("0", "pi/2", "oo", "-oo") o null.
 */
export function integrarSimbolico(textoPython, a = null, b = null) {
  return trabajador.llamar("integrales.integrar", [textoPython, a, b], { tiempoMaximo: 20000 });
}
