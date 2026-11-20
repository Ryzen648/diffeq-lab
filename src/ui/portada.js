// Portada: tarjetas de módulos y biblioteca de ejemplos.

import { EJEMPLOS, PAGINAS, disponible } from "../ejemplos.js";
import { t } from "../i18n/index.js";
import { $, crear, iniciarPagina } from "./pagina.js";

const MODULOS = [
  { id: "integrales", fase: "1a" },
  { id: "edo1", fase: "1b" },
  { id: "edo2", fase: "2" },
  { id: "edp", fase: "3" },
  { id: "pinn", fase: "4" },
];

function pintarModulos() {
  for (const m of MODULOS) {
    const listo = m.id in PAGINAS;
    const tarjeta = crear(listo ? "a" : "div", `card modulo${listo ? "" : " pronto"}`);
    if (listo) tarjeta.href = PAGINAS[m.id];
    tarjeta.append(
      crear("span", `etiqueta${listo ? " ok" : ""}`, listo ? t("inicio.disponible") : t("inicio.proximamente", { fase: m.fase })),
      crear("h3", null, t(`inicio.${m.id}.titulo`)),
      crear("p", "muted", t(`inicio.${m.id}.texto`)),
    );
    $("modulos").append(tarjeta);
  }
}

function pintarEjemplos() {
  for (const e of EJEMPLOS) {
    if (disponible(e)) {
      const enlace = crear("a", "chip", t(`ejemplo.${e.id}`));
      enlace.href = `${PAGINAS[e.modulo]}#ejemplo=${e.id}`;
      $("ejemplos").append(enlace);
    } else {
      const chip = crear("span", "chip pronto", t(`ejemplo.${e.id}`));
      chip.title = t("inicio.proximamente", { fase: e.fase });
      chip.append(crear("span", "solo-lectores", ` (${chip.title})`));
      $("ejemplos").append(chip);
    }
  }
}

iniciarPagina();
pintarModulos();
pintarEjemplos();
