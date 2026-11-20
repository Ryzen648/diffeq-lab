"""El botón «Ver código Python equivalente» entrega código que funciona y da
lo mismo que la página.

En CI, antes de pytest se ejecuta
    node scripts/generar-codigo-ejemplos.mjs codigo-generado
que escribe el script de cada ejemplo y el valor calculado por la página
(esperados.json). Aquí se ejecuta cada script con CPython + NumPy + SciPy +
SymPy y se compara la última línea (JSON) con ese valor.

Si la carpeta no existe (p. ej. al ejecutar pytest sin el paso de Node), las
pruebas se saltan en lugar de fallar.
"""

import json
import os
import pathlib
import subprocess
import sys

import pytest

CARPETA = pathlib.Path(os.environ.get("CODIGO_GENERADO", "codigo-generado"))
TOLERANCIA = 1e-7


def _esperados():
    archivo = CARPETA / "esperados.json"
    if not archivo.exists():
        return {}
    return json.loads(archivo.read_text(encoding="utf-8"))


ESPERADOS = _esperados()


@pytest.mark.skipif(not ESPERADOS, reason="falta ejecutar scripts/generar-codigo-ejemplos.mjs")
@pytest.mark.parametrize("ejemplo", sorted(ESPERADOS))
def test_el_codigo_generado_da_lo_mismo_que_la_pagina(ejemplo):
    esperado = ESPERADOS[ejemplo]
    proceso = subprocess.run(
        [sys.executable, str(CARPETA / f"{ejemplo}.py")],
        capture_output=True, text=True, timeout=300, check=False,
    )
    assert proceso.returncode == 0, proceso.stderr
    resultado = json.loads(proceso.stdout.strip().splitlines()[-1])
    if esperado["tipo"] == "integral":
        if esperado["diverge"]:
            assert resultado["exacto"] in ("oo", "-oo"), resultado
            return
        valor = resultado["quad"]
    elif esperado["tipo"] == "plano":
        # Las dos componentes en el tiempo final, con la escala del vector.
        escala = max(1.0, *(abs(v) for v in esperado["valor"]))
        for clave, v in zip(("x_final", "y_final"), esperado["valor"]):
            assert abs(resultado[clave] - v) <= TOLERANCIA * escala, (clave, resultado[clave], v)
        return
    else:
        valor = resultado["y_final"]
    escala = max(1.0, abs(esperado["valor"]))
    assert abs(valor - esperado["valor"]) <= TOLERANCIA * escala, (valor, esperado["valor"])
