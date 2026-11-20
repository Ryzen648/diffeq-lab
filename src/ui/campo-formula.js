// Campo de fórmula con dos modos: Visual (MathLive) y Código (texto).
//
// El estado de verdad es siempre el texto en modo código (`x*exp(x)`): el
// editor visual se traduce a él al escribir y, al volver a Visual, se pinta a
// partir de él. Así hay un único lugar donde se valida (lab-comun: analizar).
// Cada página puede cambiar las traducciones (`aCodigo`, `aLatex`): la de EDO
// entiende además y', dy/dx y el signo «=».

import { cargarEditorVisual, crearCampoVisual, configurarCampoVisual } from "../../comun/js/editor-visual.js";
import { latexACodigo } from "../../comun/js/entrada/latex-a-codigo.js";
import { expresionTex } from "../../comun/js/entrada/impresion.js";
import { analizarFuncion } from "../../comun/js/entrada/analizar.js";

const latexPorDefecto = (codigo) => (codigo.trim() === "" ? "" : expresionTex(analizarFuncion(codigo)));

export function crearCampoFormula({
  contenedor, id, etiquetaAria, valor = "", ejemplo = "",
  aCodigo = (latex) => latexACodigo(latex, 1), aLatex = latexPorDefecto,
  alCambiar = () => {}, alEnter = () => {}, atajos = {},
}) {
  let codigo = valor;
  let errorVisual = null;
  let modo = "codigo";
  let elemento = null;

  function pintar() {
    contenedor.replaceChildren();
    if (modo === "visual") {
      elemento = crearCampoVisual();
      elemento.id = id;
      elemento.setAttribute("aria-label", etiquetaAria);
      contenedor.append(elemento);
      let latex = "";
      try { latex = aLatex(codigo); } catch { latex = ""; }
      configurarCampoVisual(elemento, latex, { atajos });
      elemento.addEventListener("input", () => {
        try {
          codigo = aCodigo(elemento.getValue("latex"));
          errorVisual = null;
        } catch (err) {
          errorVisual = err;
        }
        alCambiar();
      });
      elemento.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); alEnter(); } });
    } else {
      elemento = document.createElement("input");
      Object.assign(elemento, { id, type: "text", value: codigo, placeholder: ejemplo, autocomplete: "off", spellcheck: false });
      elemento.className = "campo";
      elemento.autocapitalize = "off";
      elemento.setAttribute("aria-label", etiquetaAria);
      elemento.addEventListener("input", () => { codigo = elemento.value; errorVisual = null; alCambiar(); });
      elemento.addEventListener("keydown", (e) => { if (e.key === "Enter") alEnter(); });
      contenedor.append(elemento);
    }
  }

  pintar();
  return {
    codigo: () => codigo,
    /** Error al traducir el editor visual (hueco vacío, símbolo no admitido…). */
    errorVisual: () => errorVisual,
    fijar(nuevo) { codigo = nuevo; errorVisual = null; pintar(); },
    async ponerModo(nuevo) { modo = nuevo; errorVisual = null; pintar(); },
    marcarError(hay) {
      if (hay) elemento.setAttribute("aria-invalid", "true"); else elemento.removeAttribute("aria-invalid");
    },
    enfocar: () => elemento.focus(),
    elemento: () => elemento,
  };
}

/**
 * Selector Visual / Código de la página: cambia todos los campos a la vez.
 * MathLive se carga la primera vez que se pide el modo visual; si no carga,
 * la página sigue en modo código y lo avisa.
 */
export function conectarSelectorModo({ botonVisual, botonCodigo, aviso, campos, t, alCambiar = () => {} }) {
  let modo = "codigo";
  const avisar = (texto) => { aviso.hidden = !texto; aviso.textContent = texto ?? ""; };
  const pintarBotones = () => {
    botonVisual.setAttribute("aria-pressed", String(modo === "visual"));
    botonCodigo.setAttribute("aria-pressed", String(modo === "codigo"));
  };

  async function cambiar(nuevo) {
    if (nuevo === modo) return;
    // Con un campo visual a medio escribir (error de traducción), cambiar perdería lo escrito.
    if (campos().some((c) => c.errorVisual())) { avisar(t("entrada.modo.corrige")); return; }
    if (nuevo === "visual") {
      avisar(t("comun.modo.cargando"));
      try {
        await cargarEditorVisual();
      } catch {
        avisar(t("comun.modo.sinEditor"));
        return;
      }
    }
    avisar(null);
    modo = nuevo;
    pintarBotones();
    for (const c of campos()) await c.ponerModo(modo);
    alCambiar(modo);
  }

  botonVisual.addEventListener("click", () => cambiar("visual"));
  botonCodigo.addEventListener("click", () => cambiar("codigo"));
  pintarBotones();
  return { cambiar, modo: () => modo };
}
