// Deslizadores para los parámetros detectados (k, r, K…).
//
// Cada parámetro tiene un deslizador y un campo numérico enlazados. El rango
// se centra en el valor actual (de 0 a 2× si es positivo, simétrico si es
// negativo) y se puede ampliar escribiendo otro valor en el campo.
// `alMover` se llama en cada movimiento (para gráficas en tiempo real) y
// `alSoltar` al terminar (para lo caro: SymPy).

import { crear } from "./pagina.js";

function rangoPara(valor) {
  if (valor === 0) return [-5, 5];
  const m = Math.abs(valor);
  return valor > 0 ? [0, 2 * m] : [-2 * m, 0];
}

export function pintarDeslizadores(contenedor, parametros, valores, { t, alMover, alSoltar }) {
  contenedor.replaceChildren();
  contenedor.hidden = parametros.length === 0;
  if (!parametros.length) return;
  contenedor.append(crear("h3", null, t("parametros.titulo")));
  contenedor.append(crear("p", "hint", t("parametros.ayuda")));
  for (const nombre of parametros) {
    const valor = Number.isFinite(valores[nombre]) ? valores[nombre] : 1;
    valores[nombre] = valor;
    const [min, max] = rangoPara(valor);
    const fila = crear("div", "parametro");
    const id = `param-${nombre}`;
    const etiqueta = crear("label", null, nombre);
    etiqueta.htmlFor = id;
    const deslizador = Object.assign(crear("input"), { type: "range", id, min, max, step: (max - min) / 200, value: valor });
    const numero = Object.assign(crear("input", "campo numero"), { type: "number", value: valor, step: "any" });
    numero.setAttribute("aria-label", t("parametros.valorDe", { nombre }));

    deslizador.addEventListener("input", () => {
      valores[nombre] = Number(deslizador.value);
      numero.value = deslizador.value;
      alMover();
    });
    deslizador.addEventListener("change", alSoltar);
    numero.addEventListener("change", () => {
      const v = Number(numero.value);
      if (!Number.isFinite(v)) { numero.value = valores[nombre]; return; }
      valores[nombre] = v;
      const [lo, hi] = rangoPara(v);
      if (v < Number(deslizador.min) || v > Number(deslizador.max)) Object.assign(deslizador, { min: lo, max: hi, step: (hi - lo) / 200 });
      deslizador.value = v;
      alMover();
      alSoltar();
    });
    fila.append(etiqueta, deslizador, numero);
    contenedor.append(fila);
  }
}
