// Estado compartible por URL, en el fragmento (#), legible a simple vista:
//   integrales.html#f=x*exp(x)&a=0&b=1&p.k=0.5
// Los parámetros van con el prefijo «p.». Se usa el fragmento y no la
// consulta (?): no se envía al servidor y cambiarlo no recarga la página.

/** "#f=x&a=0&p.k=2" -> { f: "x", a: "0", parametros: { k: 2 } } */
export function leerFragmento(fragmento) {
  const texto = fragmento.startsWith("#") ? fragmento.slice(1) : fragmento;
  const estado = { parametros: {} };
  for (const [clave, valor] of new URLSearchParams(texto)) {
    if (clave.startsWith("p.")) {
      const numero = Number(valor);
      if (Number.isFinite(numero)) estado.parametros[clave.slice(2)] = numero;
    } else {
      estado[clave] = valor;
    }
  }
  return estado;
}

/** Inversa de leerFragmento. Omite los valores vacíos. */
export function escribirFragmento(estado) {
  const pares = new URLSearchParams();
  for (const [clave, valor] of Object.entries(estado)) {
    if (clave === "parametros") continue;
    if (valor !== undefined && valor !== null && String(valor) !== "") pares.set(clave, String(valor));
  }
  for (const [nombre, valor] of Object.entries(estado.parametros ?? {})) pares.set(`p.${nombre}`, String(valor));
  return `#${pares.toString()}`;
}
