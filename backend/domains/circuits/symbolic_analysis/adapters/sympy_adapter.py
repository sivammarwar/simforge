"""Sympy adapter — thin wrapper around SymPy for symbolic circuit analysis."""


class SympyAdapter:
    tool_name = "sympy"

    def available(self) -> bool:
        try:
            import sympy  # noqa: F401
            return True
        except ImportError:
            return False
