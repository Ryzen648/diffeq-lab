// Errores del núcleo de DiffEq Lab.
//
// El núcleo no escribe mensajes: lanza un código y los datos del caso, y la
// interfaz los traduce con `src/i18n`. La clase `ErrorCalculo` y los códigos
// de la lectura de expresiones (sintaxis y editor visual) vienen de lab-comun.

import { ErrorCalculo, CODIGOS_ENTRADA_TEXTO, CODIGOS_ENTRADA_VISUAL } from "../../comun/js/errores.js";

export { ErrorCalculo };

const CODIGOS_PROPIOS = [
  // --- Expresiones ---
  "variableNoPermitida",       // { indice, nombre, permitidas }

  // --- Números y límites ---
  "numeroInvalido",            // { campo, texto }
  "limitesIguales",            // {}
  "limiteInfinitoNoAdmitido",  // { campo }

  // --- Ecuaciones diferenciales (src/nucleo/edo/notacion.js) ---
  "ecuacionVacia",             // {}
  "variosIguales",             // {}
  "ladoVacio",                 // {}
  "variasDependientes",        // { lista }
  "variasIndependientes",      // { lista }
  "sinDerivada",               // {}
  "noFormaNormal",             // {}
  "nombreReservado",           // { nombre }

  // --- Cálculos en un Web Worker (src/workers/rpc.js) ---
  "tiempoAgotado",             // { segundos }
  "calculoCancelado",          // {}
  "trabajadorNoDisponible",    // { detalle }
  "errorEnTrabajador",         // { detalle }

  // --- Cuadratura ---
  "integrandoNoFinito",        // { x }
  "subintervalosInvalidos",    // { n, minimo }
  "simpsonImpar",              // { n }
];

export const CODIGOS = Object.freeze([...CODIGOS_PROPIOS, ...CODIGOS_ENTRADA_TEXTO, ...CODIGOS_ENTRADA_VISUAL]);
