// Traductor de diffeq-lab. El español es el idioma base; el inglés se irá
// completando (Fase 5) y, mientras tanto, lo que falte se muestra en español.
// La fábrica y los textos de los componentes compartidos vienen de lab-comun.

import { crearI18n } from "../../comun/js/i18n.js";
import es from "./es.js";
import en from "./en.js";

/** Idioma pedido en la URL (?lang=en) o, si no, el del documento. */
function idiomaInicial() {
  try {
    const pedido = new URLSearchParams(globalThis.location?.search ?? "").get("lang");
    if (pedido) return pedido;
  } catch { /* fuera del navegador */ }
  return globalThis.document?.documentElement.lang || "es";
}

const i18n = crearI18n({ es, en }, idiomaInicial());

export const { t, mensajeDeError, aplicarTextos, idiomaActual, claves } = i18n;
