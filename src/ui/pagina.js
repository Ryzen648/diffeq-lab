// Arranque común de todas las páginas: textos, botón de tema y navegación.

import { conectarBotonTema } from "../../comun/js/tema.js";
import { t, aplicarTextos, idiomaActual } from "../i18n/index.js";

export const $ = (id) => document.getElementById(id);

export function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

/** Fórmula con KaTeX; si falla, muestra el código tal cual (nunca rompe la página). */
export function pintarTex(el, fuente, enBloque = true) {
  if (!globalThis.katex) { el.textContent = fuente; return; }
  globalThis.katex.render(fuente, el, { displayMode: enBloque, throwOnError: false });
}

export function iniciarPagina() {
  document.documentElement.lang = idiomaActual();
  aplicarTextos(document);
  const boton = $("tema");
  if (boton) conectarBotonTema(boton, (tema) => t(`comun.tema.${tema}`));
  // Marca la sección actual en la navegación.
  const actual = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    if (a.getAttribute("href") === actual) a.setAttribute("aria-current", "page");
  });
}
