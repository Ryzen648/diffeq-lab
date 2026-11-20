"""pytest: los módulos de la parte simbólica viven en src/simbolico/py."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "src" / "simbolico" / "py"))
