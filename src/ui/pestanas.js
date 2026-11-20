// Pestañas accesibles (patrón WAI-ARIA «tabs»): flechas para moverse,
// Inicio/Fin para ir a los extremos, y un único Tab para entrar al grupo.
//
// HTML esperado:
//   <div role="tablist"> <button role="tab" aria-controls="panelX"> … </div>
//   <section role="tabpanel" id="panelX"> … </section>

export function conectarPestanas(lista, { alCambiar = () => {} } = {}) {
  const pestanas = [...lista.querySelectorAll('[role="tab"]')];

  function activar(pestana, enfocar = false) {
    for (const p of pestanas) {
      const activa = p === pestana;
      p.setAttribute("aria-selected", String(activa));
      p.tabIndex = activa ? 0 : -1;
      document.getElementById(p.getAttribute("aria-controls")).hidden = !activa;
    }
    if (enfocar) pestana.focus();
    alCambiar(pestana.dataset.pestana, document.getElementById(pestana.getAttribute("aria-controls")));
  }

  lista.addEventListener("click", (e) => {
    const pestana = e.target.closest('[role="tab"]');
    if (pestana && !pestana.disabled) activar(pestana);
  });
  lista.addEventListener("keydown", (e) => {
    const visibles = pestanas.filter((p) => !p.disabled);
    const i = visibles.indexOf(document.activeElement);
    if (i < 0) return;
    const destino = {
      ArrowRight: visibles[(i + 1) % visibles.length],
      ArrowLeft: visibles[(i - 1 + visibles.length) % visibles.length],
      Home: visibles[0],
      End: visibles.at(-1),
    }[e.key];
    if (destino) { e.preventDefault(); activar(destino, true); }
  });

  activar(pestanas.find((p) => p.getAttribute("aria-selected") === "true") ?? pestanas[0]);
  return {
    mostrar: (id) => activar(pestanas.find((p) => p.dataset.pestana === id)),
    actual: () => pestanas.find((p) => p.getAttribute("aria-selected") === "true")?.dataset.pestana,
  };
}
