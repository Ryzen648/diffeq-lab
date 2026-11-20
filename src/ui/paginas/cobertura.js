// «Qué resuelve y qué no»: el temario (src/temario.js) cruzado con el informe
// del banco de pruebas (cobertura.json, que genera el despliegue con
// scripts/banco.mjs). Las cifras salen del banco: lo que no tiene casos en el
// banco se muestra como «disponible» o «pendiente», sin cifras inventadas.

import { TEMARIO } from "../../temario.js";
import { t } from "../../i18n/index.js";
import { $, crear, iniciarPagina } from "../pagina.js";

const COLUMNAS = ["acierto", "rechazo_honesto", "erronea_detectada", "erronea_sin_marcar", "no_comprobable", "erronea_verificada"];

async function leerInforme() {
  try {
    const respuesta = await fetch("cobertura.json", { cache: "no-cache" });
    return respuesta.ok ? await respuesta.json() : null;
  } catch {
    return null;
  }
}

function celda(etiqueta, texto, clase) {
  const c = crear(etiqueta, clase, texto);
  if (etiqueta === "th") c.scope = "col";
  return c;
}

function pintarSeccion(seccion, temas, informe) {
  const caja = crear("section", "card");
  caja.append(crear("h2", null, t(`cobertura.seccion.${seccion}`)));
  const tabla = crear("table", "tabla");
  const cab = crear("tr");
  for (const clave of ["cobertura.col.tema", "cobertura.col.nivel", "cobertura.col.estado", ...COLUMNAS.map((c) => `cobertura.desenlace.${c}`)]) {
    cab.append(celda("th", t(clave)));
  }
  tabla.append(crear("thead"));
  tabla.tHead.append(cab);
  const cuerpo = crear("tbody");
  const metricas = informe?.seccion === seccion ? informe.porTema : null;
  for (const tema of temas) {
    const tr = crear("tr");
    const nombre = crear("th");
    nombre.scope = "row";
    if (tema.pagina) {
      const a = crear("a", null, t(`cobertura.tema.${tema.id}`));
      a.href = tema.pagina;
      nombre.append(a);
    } else {
      nombre.textContent = t(`cobertura.tema.${tema.id}`);
    }
    if (tema.nota) nombre.append(crear("span", "muted", ` · ${t(`cobertura.nota.${tema.nota}`)}`));
    const estado = tema.estado === "pendiente" ? t("cobertura.estado.pendiente", { hito: tema.hito }) : t(`cobertura.estado.${tema.estado}`);
    tr.append(nombre, crear("td", null, tema.nivel), crear("td", `etiqueta-estado ${tema.estado}`, estado));
    const m = metricas?.[tema.id];
    for (const c of COLUMNAS) {
      const valor = m ? String(m[c] ?? 0) : "—";
      tr.append(crear("td", `num${c === "erronea_verificada" && m?.[c] > 0 ? " bad" : ""}`, valor));
    }
    cuerpo.append(tr);
  }
  tabla.append(cuerpo);
  const envoltorio = crear("div", "tabla-desplazable");
  envoltorio.append(tabla);
  caja.append(envoltorio);
  return caja;
}

async function iniciar() {
  iniciarPagina();
  const informe = await leerInforme();
  const resumen = $("resumen");
  if (informe) {
    const tot = informe.total;
    const casos = Object.values(tot).reduce((s, v) => s + v, 0);
    resumen.textContent = t("cobertura.resumen", {
      casos: String(casos), aciertos: String(tot.acierto), rechazos: String(tot.rechazo_honesto + tot.erronea_detectada),
      erroneas: String(tot.erronea_verificada), semilla: String(informe.semilla), fecha: informe.fecha ?? "—",
    });
  } else {
    resumen.textContent = t("cobertura.sinInforme");
  }
  for (const [seccion, temas] of Object.entries(TEMARIO)) $("secciones").append(pintarSeccion(seccion, temas, informe));
}

iniciar();
