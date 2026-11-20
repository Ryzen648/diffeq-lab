# DiffEq Lab

[![Pruebas](https://github.com/Ryzen648/diffeq-lab/actions/workflows/pruebas.yml/badge.svg)](https://github.com/Ryzen648/diffeq-lab/actions/workflows/pruebas.yml)

Laboratorio interactivo de **integrales**, **ecuaciones diferenciales ordinarias** de primer y segundo orden y **sistemas 2×2**. No se limita a dar la respuesta: muestra el método, el error y la visualización.

**https://ryzen648.github.io/diffeq-lab/**

Es una página estática. Todo se calcula en el navegador, sin servidor: los métodos numéricos están programados a mano en JavaScript, y la parte simbólica usa SymPy dentro del navegador (Pyodide).

| | |
|---|---|
| ![Campo de direcciones de la ecuación logística con varias trayectorias](docs/capturas/edo-campo-direcciones.jpg) | ![Euler explícito inestable frente a Euler implícito en un problema rígido](docs/capturas/edo-rigidez.jpg) |
| ![Pasos de una integral por fracciones parciales](docs/capturas/integrales-pasos.jpg) | ![Orden de convergencia de seis reglas de cuadratura en escala log-log](docs/capturas/integrales-convergencia.jpg) |
| ![Retrato de fase del péndulo: campo vectorial, nulclinas, centros, sillas y trayectorias](docs/capturas/edo2-retrato-fase.jpg) | ![Diagrama traza–determinante con los equilibrios del péndulo](docs/capturas/edo2-traza-determinante.jpg) |

## Qué hace

### Integrales (Fase 1a)

- **Primitiva paso a paso** con el método nombrado: sustitución, por partes (también cíclica), fracciones parciales, identidades trigonométricas, sustitución trigonométrica, completar el cuadrado y funciones especiales.
  - Los pasos salen del árbol de reglas de SymPy (`integral_steps`), traducido al español con LaTeX.
- **Sumas de Riemann** (izquierda, derecha y punto medio) con un deslizador para el número de rectángulos.
- **Cuadratura numérica:** punto medio, trapecio, Simpson y Gauss–Legendre de 2 y 3 puntos.
  - Tabla de errores y gráfica log-log del error frente a h, con la **pendiente observada junto al orden teórico**.
  - Error frente al número de evaluaciones, que es la comparación justa entre métodos.
  - Gauss–Legendre de n puntos en escala semilogarítmica, porque su convergencia es exponencial.
- **Simpson adaptativo**, mostrando dónde refina.
- **Integrales impropias** (límites infinitos y singularidades en los extremos o en el interior):
  - criterio de comparación con p-integrales, estimando el exponente;
  - cuadratura doble exponencial (tanh-sinh);
  - sucesión de integrales truncadas;
  - el veredicto de SymPy.
- Detecta cuándo la **regla de Barrow aplicada a ciegas** da un valor falso. Ejemplo: ∫₋₁¹ 1/x² dx "= −2", cuando en realidad diverge.

### EDO de primer orden (Fase 1b)

- **Notación flexible:** `y' = x*y`, `dy/dx = x*y`, `2*x*y + (x^2+3*y^2)*y' = 0`, `dy/dt = -k*y` o solo `x*y`.
  - Reconoce también las de orden 2 (`y''`), que remite a su página, y las EDP (`u_t = k*u_xx`, `∂u/∂t`), que llegan en la Fase 3.
- **Clasificación en vivo** mientras se escribe: orden, lineal o no, homogénea, separable, Bernoulli (con su n), exacta, Riccati y autónoma.
- **Parámetros detectados solos** (`r`, `K`, `k`…), cada uno con su deslizador:
  - lo numérico se actualiza al mover;
  - lo simbólico se recalcula al soltar.
- **Intervalo:** se dan x₀, y₀ y «hasta» (x final). Si «hasta» es menor que x₀, se integra hacia atrás con todos los métodos.
  - «Desde», en las opciones avanzadas, amplía la ventana al otro lado de x₀: el campo de direcciones la cubre entera y la solución se traza a ambos lados.
- **Singularidades:** si la solución deja de existir dentro del intervalo, el cálculo se detiene ahí y un aviso dice en qué x y por qué. Los motivos que distingue son: la solución diverge, el coeficiente de y′ se anula, la pendiente se hace infinita o f sale de su dominio.
  - Ejemplo: en (2xy + 3x²) + (x² + 4y)·y′ = 0 con y(1) = 1, x² + 4y se anula en x ≈ 1.72088.
  - Sin este corte, RK4 con paso fijo cruzaría la singularidad sin enterarse y devolvería un valor sin sentido.
- **Campo de direcciones:** un clic (o el formulario accesible) traza la solución que pasa por ese punto.
- **Comparador de métodos:**
  - Euler, Heun (RK2), RK4 y Dormand–Prince 5(4) adaptativo;
  - curvas juntas y error a lo largo de x frente a la solución exacta.
- **Orden de convergencia observado**, y error frente a evaluaciones (Dormand–Prince varía su tolerancia).
- **Rigidez:**
  - estima λ = ∂f/∂y a lo largo de la solución y calcula el paso máximo estable;
  - con un deslizador de h se compara Euler explícito con Euler implícito y con el trapecio implícito.
- **Solución simbólica paso a paso** para cuatro tipos: separable, lineal (factor integrante), Bernoulli y exacta (incluidos los factores integrantes μ(x) y μ(y)).
  - Aplica la condición inicial.
  - Avisa de las soluciones de equilibrio que se pierden al separar variables.

### EDO de orden 2 y sistemas 2×2 (Fase 2)

- **Dos entradas, una sola forma.** Una EDO de orden 2 (`x'' = -sin(x)`, `y'' + 2*y' + 5*y = cos(x)`) se despeja y se reescribe como sistema de posición y velocidad; un sistema se escribe directamente como x′ = f(t, x, y), y′ = g(t, x, y). Los parámetros reciben deslizador, como en primer orden.
- **Clasificación en vivo:** lineal o no, homogéneo, autónomo, coeficientes constantes o de Cauchy–Euler.
- **Retrato de fase:**
  - campo vectorial con flechas de igual longitud en pantalla;
  - nulclinas (curvas donde x′ = 0 o y′ = 0);
  - equilibrios marcados por tipo;
  - un clic traza la trayectoria que pasa por ese punto, hacia adelante y hacia atrás.
  - Si el sistema no es autónomo, no se dibuja el campo (cambia con t), pero sí las trayectorias.
- **Equilibrios y estabilidad** (pestaña propia):
  - se buscan con Newton en 2D desde una rejilla de la ventana, con un paso de Levenberg–Marquardt donde el jacobiano es singular. Hace falta: con el péndulo, `solve` de SymPy devuelve solo 0 y π, y en [−7, 7] hay cinco;
  - para cada uno: jacobiano (simbólico, con math.js), traza, determinante, autovalores, autovectores y tipo (silla, nodo, foco, estrella, nodo degenerado, centro);
  - en los no hiperbólicos, el aviso de Hartman–Grobman: un «centro» de la linealización no decide el tipo del sistema no lineal. Una prueba lo comprueba con x′ = −y + x(x² + y²), y′ = x + y(x² + y²), que es un foco inestable aunque su linealización sea un centro;
  - diagrama traza–determinante con la parábola D = T²/4;
  - un enlace abre el jacobiano de cada equilibrio en la [calculadora de gradientes y jacobianos](https://ryzen648.github.io/gradientes-jacobianos/).
- **Métodos numéricos:** Euler, Heun, RK4 y Dormand–Prince sobre vectores, con su trayectoria en el plano de fase, el estudio de convergencia y, si se da una cantidad conservada H (la energía del péndulo, el invariante de Lotka–Volterra), cuánto se desvía de ella cada método.
- **Solución exacta paso a paso, solo en los casos lineales:**
  - orden 2 con coeficientes constantes: ecuación característica (raíces distintas, doble o complejas), coeficientes indeterminados con detección de resonancia y, si no aplican, variación de parámetros;
  - Cauchy–Euler, con la ecuación indicial;
  - sistemas lineales con autovalores reales distintos, complejos (en forma real), A = λI y matriz defectiva (autovector generalizado), también con término constante (se traslada el origen al equilibrio).
  - **Las no lineales no llegan a SymPy.** La clasificación las detiene antes: con el péndulo, `dsolve` pasó más de 4 minutos sin terminar. Además, el Worker de SymPy se reinicia si un cálculo supera su tiempo máximo.

### Común a todos los módulos

- Editor **visual** (MathLive) o **de código**.
- Resultados en pestañas: Solución, Pasos, Gráficas, Numérico, Verificación y Código (y Estabilidad en orden 2 y sistemas).
- **Etiqueta de confianza:** dice si el resultado es exacto (simbólico) o numérico, y con qué método. Si los dos no coinciden, lo señala en rojo.
- **Verificación doble:**
  - sustitución simbólica (residuo F′ − f o y′ − f(x, y) en SymPy);
  - comprobación independiente en JavaScript, sin SymPy: derivada numérica de la primitiva, o comparación con Dormand–Prince con tolerancia 10⁻¹².
- **«Ver código Python equivalente»** con NumPy, SciPy y SymPy. La integración continua ejecuta el código de cada ejemplo y comprueba que da lo mismo que la página.
- **Estado compartible por URL** (`integrales.html#f=x*exp(x)&a=0&b=1`).
- Exportación a PNG, CSV, LaTeX y Python.
- **Web Workers:** SymPy y los estudios de convergencia corren en segundo plano, con tiempo máximo y reinicio si un cálculo no termina.
- Tema claro, oscuro o automático. Diseño responsive y accesible: pestañas con teclado, etiquetas ARIA y una paleta validada para daltonismo.
- En el móvil, el teclado en pantalla no tapa el botón «Calcular» ni el resultado.
- Interfaz preparada para traducir: español por defecto; el inglés se completará en la Fase 5.

## Cómo funciona

| Pieza | Decisión y motivo |
|---|---|
| Sitio | Estático, sin build, en GitHub Pages. Módulos ES y librerías desde CDN. |
| Núcleo numérico | Escrito a mano en `src/nucleo/`, sin DOM y sin librerías de integración: cada método está explicado en los comentarios de su archivo. Las expresiones se compilan a funciones de JavaScript (no se evalúa el árbol de math.js en cada punto), porque un estudio de convergencia pide millones de evaluaciones. Los métodos de EDO trabajan con vectores (`sistemas.js`); los de primer orden son envoltorios, y las pruebas los comparan con el código escalar original para que den lo mismo. |
| Parte simbólica | SymPy 1.14.0 en Pyodide 314.0.8, en un Web Worker que se carga bajo demanda (ver «Limitaciones»). Los pasos de las EDO son plantillas propias: `dsolve` no da pasos y, medido, tardaba más de 20 s en algunas exactas (y más de 4 minutos, sin terminar, con el péndulo). |
| Gráficas y fórmulas | Plotly (paquete cartesiano) y KaTeX. |
| Código compartido | [lab-comun](https://github.com/Ryzen648/lab-comun) como submódulo `comun/`, compartido con la [calculadora de gradientes y jacobianos](https://github.com/Ryzen648/gradientes-jacobianos): editor visual, tema, lectura de expresiones con mensajes de error útiles e i18n. |

### Órdenes de convergencia comprobados

Las pruebas exigen que la pendiente log-log observada esté cerca del orden teórico. Valores medidos con f(x) = eˣ en [0, 1]:

| Regla | Orden teórico | Pendiente observada |
|---|---|---|
| Riemann (extremo izquierdo) | 1 | 1.000 |
| Punto medio | 2 | 2.000 |
| Trapecio | 2 | 2.000 |
| Simpson | 4 | 4.000 |
| Gauss–Legendre, 2 puntos (compuesta) | 4 | 4.000 |
| Gauss–Legendre, 3 puntos (compuesta) | 6 | 5.994 |

Con √x en [0, 1] todas bajan a ≈ 1.5, porque la derivada no está acotada en 0. Hay una prueba que lo comprueba: la página no le atribuye a Simpson un orden 4 que ahí no tiene.

En EDO, Euler, Heun y RK4 dan pendientes 1, 2 y 4 (±0.1) en y′ = y y en y′ = −2xy. En la ecuación logística la página muestra 1.00, 2.00 y 4.03. En sistemas, las pruebas exigen 1, 2 y 4 en el oscilador armónico, y comprueban que Euler multiplica la energía exactamente por (1 + h²) en cada paso: por eso su órbita se abre en espiral. En el péndulo hasta t = 20, la página muestra 1.24, 1.94 y 3.71: con un intervalo tan largo, los pasos más grandes aún no están en la zona asintótica.

**Rigidez**, con y′ = −50(y − cos x): Euler explícito es estable solo si h < 2/50 = 0.04. Con tolerancia 10⁻³ hasta x = 20, Dormand–Prince necesita 336 pasos, frente a 28 con λ = −1: su paso queda atado al límite de estabilidad, no a la precisión.

## Pruebas

- **JavaScript** (`node:test`): 124 pruebas en 15 archivos.
  - Cada método se compara con soluciones analíticas conocidas.
  - Se comprueba el orden de convergencia, la exactitud de Gauss–Legendre hasta grado 2n − 1 (y el error exacto en grado 2n) y la estabilidad en el problema rígido.
  - Equilibrios: matrices canónicas de cada tipo, el péndulo (cinco equilibrios alternando centro y silla), Lotka–Volterra, un modelo de competencia con biestabilidad, una recta de equilibrios y el contraejemplo de Hartman–Grobman.
  - También se prueban la notación, la clasificación, el enlace a la calculadora de jacobianos y que todos los textos y códigos de error existan (y que ningún texto tenga caracteres de control, que es lo que deja una barra invertida perdida en LaTeX).
- **Python:** 40 pruebas de la parte simbólica (pasos, métodos, verificación; en orden 2, que las no lineales vuelven al momento sin llamar a `dsolve`) y una prueba por cada ejemplo que ejecuta el código Python generado.
  - En CI corren con pytest sobre CPython y SymPy 1.14.0.
  - En local, `npm run test:py` las ejecuta dentro de Pyodide, sin instalar Python.

Los 23 scripts generados (los 21 ejemplos disponibles y 2 casos de integración hacia atrás) coinciden con la página con diferencias de entre 10⁻¹⁷ y 10⁻¹¹. Los de orden 2 y sistemas comparan las dos componentes en el tiempo final y, en los lineales, `checkodesol` confirma la solución de `dsolve`.

## Desarrollo

Requisitos: Node.js 22 o posterior. Python no hace falta.

Clona con los submódulos:

```bash
git clone --recurse-submodules https://github.com/Ryzen648/diffeq-lab.git
```

Instala las dependencias de desarrollo:

```bash
npm install
```

Ejecuta las pruebas de JavaScript:

```bash
npm test
```

Ejecuta las pruebas de Python dentro de Pyodide (descarga SymPy la primera vez):

```bash
npm run test:py
```

Genera el código Python de los ejemplos, ejecútalo y compáralo con la página:

```bash
npm run test:codigo
```

Abre el sitio en http://localhost:8767/:

```bash
npm run servir
```

**Despliegue:** `.github/workflows/pages.yml` publica en GitHub Pages en cada push a `main`, solo si pasan las pruebas. Hay que configurar una vez *Settings → Pages → Source: GitHub Actions*.

## Estructura

```
├─ index.html · integrales.html · edo1.html · edo2.html
├─ comun/                      submódulo lab-comun (editor, tema, entrada, i18n)
├─ css/lab.css
├─ src/
│  ├─ nucleo/                  sin DOM, probado en Node
│  │  ├─ expresion.js          texto validado -> función JS compilada
│  │  ├─ convergencia.js       orden observado (regresión log-log)
│  │  ├─ cuadratura/           Riemann, Newton–Cotes, Gauss–Legendre, adaptativa, doble exponencial, impropias
│  │  ├─ edo/                  Euler/Heun/RK4 y Dormand–Prince vectoriales, implícitos, campo, notación,
│  │  │                        clasificación, plano de fase y equilibrios
│  │  └─ codigo/               generadores de código Python
│  ├─ simbolico/               Worker de Pyodide, cliente y módulos de Python (pasos, métodos)
│  ├─ workers/                 RPC con tiempo máximo y Worker numérico
│  ├─ ui/                      páginas, gráficas, pestañas, campo de fórmula, deslizadores
│  └─ i18n/                    textos (es, en)
├─ tests/                      node:test y tests/python (pytest)
└─ scripts/                    servidor local y ejecutores de pruebas
```

## Limitaciones

- **Primera carga de la parte simbólica:** ≈10 MB comprimidos (Pyodide y SymPy). Después quedan en la caché del navegador. Mientras cargan, la parte numérica ya funciona.
- **Cobertura de los pasos de integrales.** Medida con una batería propia de 57 integrales de libro (una muestra, no una estadística): `integral_steps` da pasos completos en 50.
  - Sin pasos, pero con resultado de `integrate`: sec³x, cosh²x, 1/(1+x⁴), 1/(sen x + cos x) y 1/(2 + cos x). SymPy no implementa la sustitución de Weierstrass en los pasos.
  - Ni siquiera `integrate` encuentra la primitiva de √(tan x), aunque es elemental.
  - xˣ no tiene primitiva elemental.
- **Logaritmos:** SymPy escribe ln u donde la primitiva real es ln|u|. La página lo avisa en vez de cambiarlo.
- **Integrales impropias:** decidir la convergencia en general es imposible.
  - El criterio numérico no decide cuando el exponente es ≈ 1 (lo intenta con la sucesión truncada) ni con integrandos oscilantes.
  - La detección de singularidades interiores es numérica.
  - Cuando SymPy da un veredicto exacto, prevalece.
  - Con 1/√(1−x²), la cuadratura tanh-sinh pierde precisión (≈10⁻⁸) por la cancelación al calcular 1 − x² cerca de ±1.
- **Clasificación en vivo:** es una comprobación numérica en puntos de prueba. La definitiva es la de SymPy al calcular.
- **Corte ante una singularidad:** todos los métodos se integran hasta el 99 % del tramo entre x₀ y el punto donde se detiene Dormand–Prince (con tolerancia 10⁻¹²). La última parte antes de la singularidad no se muestra.
  - Para distinguir «la solución diverge» de «tangente vertical» se usa un umbral: |y| ≥ 10⁴·max(1, |y₀|) en el punto de parada. Una solución que explota muy despacio o una tangente vertical con |y| enorme podrían clasificarse mal.
- **Orden 2 y sistemas: sin solución simbólica para las no lineales** (a propósito, ver arriba), ni para las lineales de coeficientes variables que no son de Cauchy–Euler (Airy, Bessel), ni para los sistemas lineales no autónomos. Tienen todo lo numérico y la linealización.
  - Cauchy–Euler: la solución con potencias xᵐ vale para x > 0; con x₀ ≤ 0 se da solo la general.
  - Sistema con término constante y A singular: no hay equilibrio al que trasladar el origen, y se queda sin solución simbólica.
- **Equilibrios:** se buscan solo dentro de la ventana del plano de fase, con Newton desde una rejilla de 14 × 14 puntos. Uno con una cuenca de atracción de Newton muy estrecha podría escaparse. Con más de 30, la página avisa de que probablemente hay una curva de equilibrios.
- **Linealización:** en un equilibrio no hiperbólico (centro o autovalor nulo de la linealización) no decide el tipo del sistema no lineal. La página lo dice, pero no lo resuelve; el retrato de fase o una cantidad conservada sí lo muestran.
- **Nulclinas:** se dibujan como la curva de nivel 0 de f y de g en una rejilla. Donde f tiene un polo (por ejemplo, 1/x) cambia de signo pasando por infinito, y puede aparecer una línea falsa sobre él.
- **Solo hasta 2×2.** Los sistemas 3D (Lorenz) quedan para la Fase 5.
- **Despejar y:** solo se intenta cuando es razonable (polinómica de grado ≤ 2, o y aparece como mucho dos veces). Si no, la solución queda en forma implícita, que es correcta.
- **Parámetros en la parte simbólica:** se sustituyen por su valor numérico exacto (0.3 → 3/10). Se recalcula al soltar el deslizador, no se resuelve con el parámetro como símbolo.
- **Dominio real:** (−8)^(1/3) da NaN, como en una calculadora. Para la raíz cúbica real se usa `cbrt` o `nthRoot`.
- El inglés está incompleto: lo que falta se muestra en español.

## Lo que queda (Fases 2, 3 y 5)

- **Fase 2, opcionales:**
  - separatrices de las sillas (las variedades estable e inestable trazadas desde los autovectores);
  - métodos implícitos para sistemas, para Van der Pol rígido (μ grande).
- **Fase 3. EDP:**
  - calor 1D, onda 1D y Laplace 2D por diferencias finitas, con animación y series de Fourier;
  - análisis de estabilidad (condición CFL).
- **Fase 5 (opcional):**
  - traducción completa al inglés;
  - sistemas 3D: Lorenz;
  - integrales dobles y Monte Carlo;
  - modo práctica e historial.

## Autor y licencia

Ricardo Jaico Pradinett, estudiante de Ingeniería de Inteligencia Artificial (UNMSM, Lima). Código bajo licencia MIT.
