// Llamadas a un Web Worker como promesas, con tiempo máximo y reinicio.
//
// Los cálculos pesados (SymPy en Pyodide, estudios de convergencia) corren en
// un Worker para no congelar la interfaz. Este módulo envuelve el Worker:
//   const t = crearTrabajador(url, { alEstado });
//   const r = await t.llamar("integrar", ["x*exp(x)"], { tiempoMaximo: 15000 });
//
// Tiempo máximo: un cálculo simbólico puede no terminar nunca (lo vimos al
// medir SymPy: algunas EDO exactas pasaban de 20 s). No se puede interrumpir
// un Worker a mitad de cálculo, así que al agotarse el tiempo se termina el
// Worker entero y se crea otro en la siguiente llamada. El reloj empieza
// cuando el Worker está listo: la descarga inicial de Pyodide no cuenta.
//
// Protocolo de mensajes del Worker:
//   { tipo: "estado", estado: "cargando" | "listo" | "error", paso?, detalle? }
//   { id, ok: resultado }  o  { id, error: { codigo?, datos?, mensaje } }

import { ErrorCalculo } from "../nucleo/errores.js";

export function crearTrabajador(url, { alEstado = () => {}, tiempoPorDefecto = 20000 } = {}) {
  let worker = null;
  let estado = "inactivo";
  let siguienteId = 1;
  const pendientes = new Map(); // id -> { resolver, rechazar, temporizador, tiempoMaximo }

  function fijarEstado(nuevo, extra = {}) {
    estado = nuevo;
    alEstado({ estado: nuevo, ...extra });
    if (nuevo === "listo") for (const p of pendientes.values()) iniciarReloj(p);
  }

  function iniciarReloj(p) {
    if (p.temporizador || !p.tiempoMaximo) return;
    p.temporizador = setTimeout(() => {
      reiniciar(new ErrorCalculo("tiempoAgotado", { segundos: Math.round(p.tiempoMaximo / 1000) }), p.id);
    }, p.tiempoMaximo);
  }

  /** Termina el Worker: la llamada `culpable` recibe `error`; las demás, «reiniciado». */
  function reiniciar(error, culpable) {
    worker?.terminate();
    worker = null;
    for (const [id, p] of pendientes) {
      clearTimeout(p.temporizador);
      p.rechazar(id === culpable ? error : new ErrorCalculo("calculoCancelado", {}));
    }
    pendientes.clear();
    fijarEstado("inactivo");
  }

  function arrancar() {
    worker = new Worker(url, { type: "module" });
    fijarEstado("cargando");
    worker.onmessage = ({ data }) => {
      if (data.tipo === "estado") {
        fijarEstado(data.estado, data);
        if (data.estado === "error") reiniciar(new ErrorCalculo("trabajadorNoDisponible", { detalle: data.detalle ?? "" }));
        return;
      }
      const p = pendientes.get(data.id);
      if (!p) return;
      pendientes.delete(data.id);
      clearTimeout(p.temporizador);
      if ("ok" in data) p.resolver(data.ok);
      else if (data.error?.codigo) p.rechazar(new ErrorCalculo(data.error.codigo, data.error.datos ?? {}));
      else p.rechazar(new ErrorCalculo("errorEnTrabajador", { detalle: data.error?.mensaje ?? "" }));
    };
    worker.onerror = (evento) => {
      evento.preventDefault?.();
      reiniciar(new ErrorCalculo("trabajadorNoDisponible", { detalle: evento.message ?? "" }));
    };
  }

  function llamar(funcion, args = [], { tiempoMaximo = tiempoPorDefecto } = {}) {
    if (!worker) arrancar();
    const id = siguienteId++;
    return new Promise((resolver, rechazar) => {
      const p = { id, resolver, rechazar, temporizador: null, tiempoMaximo };
      pendientes.set(id, p);
      if (estado === "listo") iniciarReloj(p);
      worker.postMessage({ id, funcion, args });
    });
  }

  return {
    llamar,
    /** Arranca el Worker sin pedir nada (p. ej. para precargar Pyodide). */
    precargar() { if (!worker) arrancar(); },
    /** Cancela todo lo pendiente. */
    cancelar() { if (worker) reiniciar(new ErrorCalculo("calculoCancelado", {})); },
    estado: () => estado,
  };
}
