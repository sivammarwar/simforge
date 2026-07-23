"""
Maps a SymPy simplified boolean expression to a gate-level netlist.

The expression from simplify_logic(form="dnf") is already composed of
And/Or/Not nodes (structural mapping, 1 sympy node = 1 logic gate) — this
is not a new solver.

VERIFIED (throwaway script against real sympy output before writing this):
DNF is by definition an OR-of-ANDs of literals, so simplify_logic(form="dnf")
never emits a top-level Xor node — an "A ^ B" input decomposes into
Or(And(A, ~B), And(B, ~A)) i.e. pure And/Or/Not. The Xor entry below is kept
for correctness/future-proofing (e.g. if a caller ever passes a non-DNF
sympy expression), but in the current pipeline it will not be exercised.
"""
from typing import Dict, Any, List
from sympy.logic.boolalg import And, Or, Not, Xor
from sympy import Symbol

_GATE_TYPE_MAP = {And: "AND", Or: "OR", Not: "NOT", Xor: "XOR"}


def build_gate_netlist(simplified_expr, input_variables: List[str], output_variable: str) -> Dict[str, Any]:
    gates: List[Dict[str, Any]] = []
    gate_count_by_type: Dict[str, int] = {"AND": 0, "OR": 0, "NOT": 0, "XOR": 0}
    memo = {}  # sympy sub-expression -> net name, so shared subexpressions
               # become a single gate with fanout > 1 instead of duplicating

    def _net_name(expr) -> str:
        if isinstance(expr, Symbol):
            return str(expr)
        if expr in memo:
            return memo[expr]
        gate_type = _GATE_TYPE_MAP.get(type(expr))
        if gate_type is None:
            # Unrecognized node (e.g. a boolean constant True/False from a
            # tautology/contradiction input) — treat as a pass-through net,
            # don't gate it.
            return str(expr)

        input_nets = [_net_name(arg) for arg in expr.args]
        gate_id = f"g{len(gates) + 1}"
        net = f"n{len(gates) + 1}"
        gates.append({
            "id": gate_id,
            "type": gate_type,
            "inputs": input_nets,
            "output": net,
        })
        gate_count_by_type[gate_type] = gate_count_by_type.get(gate_type, 0) + 1
        memo[expr] = net
        return net

    final_net = _net_name(simplified_expr)
    # Rename the last gate's output to the actual output variable name so the
    # netlist and schematic read naturally (Y, not n3).
    if gates and final_net == gates[-1]["output"]:
        gates[-1]["output"] = output_variable
    else:
        # Degenerate case: expression collapsed to a bare input/constant with
        # no gates at all (e.g. simplifies to just "A"). Still valid — the
        # frontend should render this as a direct wire, not an error.
        pass

    return {
        "gates": gates,
        "primary_inputs": list(input_variables),
        "primary_outputs": [output_variable],
        "gate_count_by_type": gate_count_by_type,
        "total_gate_count": len(gates),
    }
