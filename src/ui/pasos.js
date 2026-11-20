// Pinta los pasos de una solución simbólica (árbol de { regla, datos, hijos }).
//
// Los textos están en el diccionario (paso.<regla>) y llevan fórmulas entre
// $…$. Al pintarlos, lo que está entre $ se pasa a KaTeX y el resto se inserta
// como texto plano (textContent): nunca se interpreta HTML.

import { t } from "../i18n/index.js";
import { crear, pintarTex } from "./pagina.js";

/** "Texto con $x^2$ fórmulas" -> nodos: texto plano y KaTeX en línea. */
export function textoConFormulas(el, texto) {
  el.replaceChildren();
  texto.split("$").forEach((trozo, i) => {
    if (trozo === "") return;
    if (i % 2 === 0) {
      el.append(document.createTextNode(trozo));
    } else {
      const span = crear("span", "formula-linea");
      pintarTex(span, trozo, false);
      el.append(span);
    }
  });
  return el;
}

/** Los datos que no son texto (p. ej. listas) no se sustituyen en el mensaje. */
function datosDeTexto(paso) {
  const datos = { tipo: paso.tipo ?? "" };
  for (const [clave, valor] of Object.entries(paso.datos ?? {})) if (typeof valor === "string") datos[clave] = valor;
  return datos;
}

function pintarPaso(paso) {
  const li = crear("li", `paso paso-${paso.regla}`);
  if (paso.rol) li.append(textoConFormulas(crear("p", "paso-rol"), t(`paso.rol.${paso.rol}`)));
  li.append(textoConFormulas(crear("p", "paso-texto"), t(`paso.${paso.regla}`, datosDeTexto(paso))));
  if (paso.regla === "partesCiclica") {
    for (const parte of paso.datos.partes ?? []) {
      li.append(textoConFormulas(crear("p", "paso-detalle"), t("paso.partesCiclica.parte", parte)));
    }
  }
  if (paso.integral && paso.resultado) {
    const ecuacion = crear("div", "math paso-ecuacion");
    pintarTex(ecuacion, `${paso.integral} = ${paso.resultado}`);
    li.append(ecuacion);
  }
  const hijos = (paso.hijos ?? []).filter(Boolean);
  if (hijos.length) {
    const lista = crear("ol", "pasos-hijos");
    for (const h of hijos) lista.append(pintarPaso(h));
    li.append(lista);
  }
  return li;
}

export function pintarPasos(contenedor, raiz) {
  contenedor.replaceChildren();
  const lista = crear("ol", "pasos");
  lista.append(pintarPaso(raiz));
  contenedor.append(lista);
}
