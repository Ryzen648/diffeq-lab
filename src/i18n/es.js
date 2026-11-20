// Textos en español (idioma base). Las claves `error.<código>` corresponden a
// los códigos que lanza el núcleo (`src/nucleo/errores.js`); los textos de
// los componentes compartidos (modo Visual/Código, tema, errores del editor
// visual) están en lab-comun. Los valores con etiquetas HTML solo se usan en
// elementos marcados con `data-i18n-html` y nunca incluyen texto del usuario.

export default {
  // --- Sitio y navegación ---
  "sitio.nombre": "DiffEq Lab",
  "nav.principal": "Secciones",
  "nav.inicio": "Inicio",
  "nav.integrales": "Integrales",
  "nav.edo1": "EDO de primer orden",
  "pie.texto":
    "Hecho por Ricardo Jaico Pradinett, estudiante de Ingeniería de Inteligencia Artificial (UNMSM). " +
    "Código en <a href=\"https://github.com/Ryzen648/diffeq-lab\">GitHub</a>. " +
    "Parte de una serie con la <a href=\"https://ryzen648.github.io/gradientes-jacobianos/\">calculadora de gradientes y jacobianos</a>.",
  "error.librerias": "No se pudieron cargar las librerías (math.js, KaTeX o Plotly). Revisa tu conexión y recarga la página.",

  // --- Errores del núcleo (src/nucleo/errores.js) ---
  "error.variableNoPermitida": "En la función {indice} aparece «{nombre}», pero aquí solo se admiten estas variables: {permitidas}.",
  "error.numeroInvalido": "No entiendo «{texto}» como valor de {campo}. Escribe un número o una expresión como pi/2 o sqrt(2).",
  "error.limitesIguales": "Los dos límites de integración son iguales: la integral vale 0. Cambia uno de los dos.",
  "error.limiteInfinitoNoAdmitido": "El valor de {campo} no puede ser infinito aquí.",
  "error.tiempoAgotado": "El cálculo simbólico superó {segundos} s y se detuvo. Puede que no tenga solución cerrada o que SymPy no la encuentre a tiempo; el resultado numérico sigue disponible.",
  "error.calculoCancelado": "El cálculo se canceló porque se pidió otro o se detuvo uno anterior.",
  "error.trabajadorNoDisponible": "No se pudo cargar el motor simbólico (Pyodide + SymPy). Revisa tu conexión; la parte numérica funciona igual. Detalle: {detalle}",
  "error.errorEnTrabajador": "SymPy no pudo completar el cálculo: {detalle}",
  "error.integrandoNoFinito": "El integrando no da un número finito en x = {x}. Si es una singularidad en un extremo, trátala como integral impropia.",
  "error.subintervalosInvalidos": "El número de subintervalos debe ser un entero mayor o igual que {minimo} (llegó {n}).",
  "error.simpsonImpar": "La regla de Simpson necesita un número par de subintervalos (llegó {n}): agrupa los subintervalos de dos en dos.",

  // --- Portada ---
  "inicio.entradilla":
    "Un laboratorio interactivo de integrales y ecuaciones diferenciales: no solo la respuesta, " +
    "sino el método, el error y la visualización.",
  "inicio.modulos": "Módulos",
  "inicio.disponible": "Disponible",
  "inicio.proximamente": "Próximamente · Fase {fase}",
  "inicio.abrir": "Abrir",
  "inicio.integrales.titulo": "Integrales",
  "inicio.integrales.texto":
    "Primitivas paso a paso con el método nombrado (sustitución, partes, fracciones parciales…), sumas de Riemann, " +
    "cuadratura numérica con su orden de convergencia, integración adaptativa e integrales impropias.",
  "inicio.edo1.titulo": "EDO de primer orden",
  "inicio.edo1.texto":
    "Campo de direcciones, Euler, Heun, RK4 y Dormand–Prince comparados, orden de convergencia, rigidez y " +
    "solución simbólica paso a paso (separable, lineal, exacta, Bernoulli).",
  "inicio.edo2.titulo": "EDO de orden 2 y sistemas",
  "inicio.edo2.texto": "Retratos de fase, equilibrios y su estabilidad con los autovalores del jacobiano.",
  "inicio.edp.titulo": "EDP",
  "inicio.edp.texto": "Calor, onda y Laplace por diferencias finitas, con animación y series de Fourier.",
  "inicio.pinn.titulo": "PINNs en el navegador",
  "inicio.pinn.texto": "Redes neuronales informadas por la física (TensorFlow.js) comparadas con el método clásico.",
  "inicio.ejemplos": "Biblioteca de ejemplos",
  "inicio.ejemplos.ayuda": "Un clic abre el ejemplo con todo cargado. Los de fases posteriores aparecen como próximamente.",
  "inicio.serie": "Otros proyectos de la serie",
  "inicio.serie.jacobianos": "Calculadora de gradientes y jacobianos",
  "inicio.serie.jacobianos.texto":
    "La estabilidad de los equilibrios (Fase 2) se decide con los autovalores del jacobiano: esa calculadora lo deriva y lo verifica.",

  // --- Ejemplos (nombres) ---
  "ejemplo.logistica": "Logística",
  "ejemplo.enfriamiento": "Enfriamiento de Newton",
  "ejemplo.lineal": "Lineal con factor integrante",
  "ejemplo.bernoulli": "Bernoulli",
  "ejemplo.exacta": "Exacta",
  "ejemplo.rigidez": "Rigidez",
  "ejemplo.riccati": "Riccati (sin solución elemental)",
  "ejemplo.pendulo": "Péndulo",
  "ejemplo.vanDerPol": "Van der Pol",
  "ejemplo.lotkaVolterra": "Lotka–Volterra",
  "ejemplo.lorenz": "Lorenz",
  "ejemplo.calor": "Ecuación del calor",
  "ejemplo.onda": "Ecuación de onda",
  "ejemplo.laplace": "Laplace 2D",
  "ejemplo.gaussiana": "Gaussiana",
  "ejemplo.partes": "Por partes",
  "ejemplo.fracciones": "Fracciones parciales",
  "ejemplo.sustitucion": "Sustitución",
  "ejemplo.trigonometrica": "Sustitución trigonométrica",
  "ejemplo.impropiaConverge": "Impropia convergente",
  "ejemplo.impropiaDiverge": "Impropia divergente",
  "ejemplo.singular": "Singularidad en un extremo",
};
