// Temario de DiffEq Lab por sección, con el nivel y el estado de cada tema.
// Lo lee la página «Qué resuelve y qué no» (cobertura.html), que lo cruza con
// el informe del banco de pruebas (cobertura.json, generado al publicar).
//
// Niveles: N núcleo, E extendido, A avanzado, C científico.
// Estado:
//   "banco"      implementado y medido por el banco de pruebas (las cifras
//                de la página salen del banco, no de aquí)
//   "disponible" implementado y verificado en la página, aún sin casos en el banco
//   "parcial"    implementado en parte (se dice qué falta en `nota`)
//   "pendiente"  no implementado todavía; `hito` dice en cuál está previsto
// `id` coincide con el campo `tema` de los casos del banco.

export const TEMARIO = Object.freeze({
  integrales: [
    { id: "basicas", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "sustitucion", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "partes", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "trigonometricas", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "sustitucionTrig", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "fraccionesParciales", nivel: "N", estado: "banco", pagina: "integrales.html", nota: "ln|·|" },
    { id: "completarCuadrado", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "impropias", nivel: "N", estado: "banco", pagina: "integrales.html", nota: "valorPrincipal" },
    { id: "noElementales", nivel: "N", estado: "banco", pagina: "integrales.html" },
    { id: "cuadraturaNumerica", nivel: "N", estado: "disponible", pagina: "integrales.html", nota: "cotasError" },
    { id: "aplicaciones1d", nivel: "N", estado: "pendiente", hito: "H1" },
    { id: "weierstrassIrracionales", nivel: "E", estado: "pendiente", hito: "H6" },
    { id: "parametricasPolares", nivel: "E", estado: "pendiente", hito: "H6" },
    { id: "gammaBeta", nivel: "E", estado: "pendiente", hito: "H6" },
    { id: "multiples", nivel: "E", estado: "pendiente", hito: "H6" },
    { id: "lineaSuperficie", nivel: "A", estado: "pendiente", hito: "H8" },
    { id: "parametroLeibniz", nivel: "A", estado: "pendiente", hito: "H8" },
    { id: "residuos", nivel: "A", estado: "pendiente", hito: "H8" },
    { id: "cuadraturaCientifica", nivel: "C", estado: "pendiente", hito: "H11" },
    { id: "montecarlo", nivel: "C", estado: "pendiente", hito: "H11" },
    { id: "asintoticas", nivel: "C", estado: "pendiente", hito: "H11" },
  ],
  edo: [
    { id: "edo1Basicas", nivel: "N", estado: "disponible", pagina: "edo1.html" },
    { id: "edo1Resto", nivel: "N", estado: "pendiente", hito: "H2" },
    { id: "ordenN", nivel: "N", estado: "parcial", pagina: "edo2.html", hito: "H2", nota: "soloOrden2" },
    { id: "laplace", nivel: "N", estado: "pendiente", hito: "H3" },
    { id: "sistemasLineales", nivel: "N", estado: "parcial", pagina: "edo2.html", hito: "H3", nota: "solo2x2" },
    { id: "series", nivel: "N", estado: "pendiente", hito: "H3" },
    { id: "numericosEDO", nivel: "N", estado: "disponible", pagina: "edo1.html" },
    { id: "cualitativo", nivel: "E", estado: "disponible", pagina: "edo2.html" },
    { id: "frobeniusEspeciales", nivel: "E", estado: "pendiente", hito: "H5" },
    { id: "frontera", nivel: "E", estado: "pendiente", hito: "H5" },
    { id: "edoAvanzado", nivel: "A", estado: "pendiente", hito: "H9" },
    { id: "caos", nivel: "C", estado: "pendiente", hito: "H11" },
    { id: "rigidezAvanzada", nivel: "C", estado: "parcial", pagina: "edo2.html", hito: "H11", nota: "implicitosFijos" },
    { id: "estocasticas", nivel: "C", estado: "pendiente", hito: "H11" },
  ],
  edp: [
    { id: "clasificacionEDP", nivel: "N", estado: "pendiente", hito: "H4" },
    { id: "caracteristicas", nivel: "N", estado: "pendiente", hito: "H4" },
    { id: "fourier", nivel: "N", estado: "pendiente", hito: "H4" },
    { id: "separacion", nivel: "N", estado: "pendiente", hito: "H4" },
    { id: "dalembert", nivel: "N", estado: "pendiente", hito: "H4" },
    { id: "diferenciasFinitas", nivel: "N", estado: "pendiente", hito: "H4" },
    { id: "edpExtendido", nivel: "E", estado: "pendiente", hito: "H7" },
    { id: "edpAvanzado", nivel: "A", estado: "pendiente", hito: "H10" },
    { id: "edpCientifico", nivel: "C", estado: "pendiente", hito: "H12" },
  ],
});
