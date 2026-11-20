// Exportar: descargar texto (CSV, LaTeX, Python) y copiar al portapapeles.

/** Descarga `contenido` como archivo, sin servidor (Blob + enlace temporal). */
export function descargarTexto(contenido, nombre, tipo = "text/plain") {
  const url = URL.createObjectURL(new Blob([contenido], { type: `${tipo};charset=utf-8` }));
  const enlace = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filas (arrays) -> CSV con coma, comillas cuando hace falta y números con toda su precisión. */
export function aCSV(filas) {
  const celda = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return filas.map((fila) => fila.map(celda).join(",")).join("\n") + "\n";
}

/** Copia texto; devuelve true si se pudo. */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Respaldo para navegadores sin permiso de portapapeles.
    const area = Object.assign(document.createElement("textarea"), { value: texto });
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
}
