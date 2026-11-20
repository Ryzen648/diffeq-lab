// Pintado de la verificación compartido por todas las páginas (ver
// src/nucleo/verificacion.js para los estados). Cada página solo decide QUÉ
// comprueba; cómo se muestra y qué estado resulta es igual en todas.

import { estadoGlobal, componentesFallidos } from "../nucleo/verificacion.js";
import { t } from "../i18n/index.js";
import { crear } from "./pagina.js";
import { textoConFormulas } from "./pasos.js";

const ICONO = Object.freeze({ ok: "✓", falla: "✗", inconclusa: "?", pendiente: "…", informativa: "!" });
const CLASE = Object.freeze({ ok: "ok", falla: "bad", inconclusa: "aviso", pendiente: "pendiente", informativa: "aviso" });
const CLASE_ESTADO = Object.freeze({ simbolica: "ok", numerica: "ok", parcial: "aviso", pendiente: "aviso", inconclusa: "aviso", fallida: "bad" });

const cientifica = (v) => (v === 0 ? "0" : v.toExponential(2));

/** Nombres legibles de los componentes que fallan: «la primitiva, el valor definido». */
function nombresComponentes(lista) {
  return lista.map((c) => t(`verif.componente.${c}`)).join(", ");
}

/**
 * Pinta la lista en `ul` (encabezada por el estado global) y devuelve
 * { estado, fallidos } para que la página derive de ahí su etiqueta.
 */
export function pintarComprobaciones(ul, lista) {
  ul.replaceChildren();
  const estado = estadoGlobal(lista);
  const fallidos = componentesFallidos(lista);
  const cabecera = crear("li", `verif verif-estado ${CLASE_ESTADO[estado]}`);
  cabecera.append(crear("span", "verif-icono", { simbolica: "✓", numerica: "✓", parcial: "!", pendiente: "…", inconclusa: "?", fallida: "✗" }[estado]));
  const texto = crear("span");
  textoConFormulas(texto, t(`verif.estado.${estado}`, { componentes: nombresComponentes(fallidos) }));
  cabecera.append(texto);
  ul.append(cabecera);
  for (const c of lista) {
    const li = crear("li", `verif ${CLASE[c.resultado]}`);
    li.append(crear("span", "verif-icono", ICONO[c.resultado]));
    const cuerpo = crear("span");
    textoConFormulas(cuerpo, t(c.clave, c.datos));
    if (c.errorAbs !== null || c.errorRel !== null) {
      cuerpo.append(crear("span", "verif-errores muted", ` ${t("verif.errores", {
        abs: c.errorAbs === null ? "—" : cientifica(c.errorAbs), rel: c.errorRel === null ? "—" : cientifica(c.errorRel),
      })}`));
    }
    li.append(cuerpo);
    ul.append(li);
  }
  return { estado, fallidos };
}

/**
 * Aviso al principio de la pestaña Solución cuando la verificación falla: el
 * resultado sigue a la vista (para poder revisarlo), pero nunca como bueno.
 */
export function avisarEnSolucion(panel, { estado, fallidos }) {
  let aviso = panel.querySelector(":scope > .aviso-verificacion");
  if (estado !== "fallida") { aviso?.remove(); return; }
  if (!aviso) {
    aviso = crear("p", "aviso-verificacion error");
    aviso.setAttribute("role", "alert");
    panel.prepend(aviso);
  }
  aviso.textContent = t("verif.avisoSolucion", { componentes: nombresComponentes(fallidos) });
}
