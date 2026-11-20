// Enlace a la calculadora de gradientes y jacobianos con el jacobiano de un
// equilibrio ya cargado: las dos funciones del sistema, el punto y el orden de
// las variables, en el formato de su URL (#f=…&f=…&v.x=…&v.y=…&orden=x, y).
//
// Se usan los nombres que ve el usuario (en una EDO de orden 2, la posición y
// la velocidad v), para que la calculadora muestre lo mismo que esta página.
// Solo hay enlace si las dos variables aparecen en el sistema: si falta una,
// la calculadora derivaría respecto de una sola y daría un jacobiano 2×1.

import { math } from "../../../comun/js/mathjs.js";
import { variablesDe } from "../../../comun/js/entrada/analizar.js";

export const URL_JACOBIANOS = "https://ryzen648.github.io/gradientes-jacobianos/";

const numero = (v) => String(Number(v.toPrecision(15)));

/**
 * f, g: árboles en x, y (con los parámetros ya sustituidos por números).
 * nombres: [nombre de x, nombre de y] en pantalla. punto: [x*, y*].
 * Devuelve la URL o null.
 */
export function enlaceJacobiano(f, g, [nx, ny], [x0, y0]) {
  const cambios = { x: nx, y: ny };
  const renombrar = (nodo) => nodo.transform((n, ruta) => (n.isSymbolNode && ruta !== "fn" && n.name in cambios
    ? new math.SymbolNode(cambios[n.name]) : n));
  const [F, G] = [f, g].map(renombrar);
  const usadas = new Set([...variablesDe(F), ...variablesDe(G)]);
  if (usadas.size !== 2 || !usadas.has(nx) || !usadas.has(ny)) return null;
  if (![x0, y0].every(Number.isFinite)) return null;
  const pares = new URLSearchParams();
  pares.append("f", F.toString());
  pares.append("f", G.toString());
  pares.set(`v.${nx}`, numero(x0));
  pares.set(`v.${ny}`, numero(y0));
  pares.set("orden", `${nx}, ${ny}`);
  return `${URL_JACOBIANOS}#${pares}`;
}
