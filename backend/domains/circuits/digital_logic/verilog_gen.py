"""
Deterministic Verilog module generation from a digital_logic result.
No LLM involved — pure string templating from data already computed by
SymPy / netlist_builder.py.

IMPORTANT (confirmed against real pipeline output before writing this):
`generate_behavioral_verilog`'s `boolean_expression` argument MUST be the
&|~^-normalized expression (pipeline.py's `expr_str`, produced by
_normalize_boolean_notation), NOT the raw `plan["boolean_expression"]` /
`result["boolean_expression"]`. Real Call-1 output is frequently textbook
notation like "A'B + AB' + AB" (prime for NOT, juxtaposition for AND) —
Verilog has no such operators (`'` is actually its sized-literal syntax,
e.g. 8'hFF), so passing the raw string would emit invalid Verilog. Once
normalized to &|~^, the symbols are identical to Verilog's own bitwise
operators on 1-bit values, so no further translation is needed.
"""
from typing import Dict, Any, List


def generate_behavioral_verilog(module_name: str, input_variables: List[str],
                                  output_variable: str, boolean_expression: str) -> str:
    ports = ", ".join(input_variables + [output_variable])
    inputs = "\n".join(f"    input {v};" for v in input_variables)
    return (
        f"module {module_name} ({ports});\n"
        f"{inputs}\n"
        f"    output {output_variable};\n\n"
        f"    assign {output_variable} = {boolean_expression};\n"
        f"endmodule\n"
    )


_PRIMITIVE_MAP = {"AND": "and", "OR": "or", "NOT": "not", "XOR": "xor"}


def generate_structural_verilog(module_name: str, gate_netlist: Dict[str, Any]) -> str:
    inputs = gate_netlist["primary_inputs"]
    outputs = gate_netlist["primary_outputs"]
    ports = ", ".join(inputs + outputs)
    lines = [f"module {module_name} ({ports});"]
    lines += [f"    input {v};" for v in inputs]
    lines += [f"    output {v};" for v in outputs]

    # Declare intermediate nets (anything that's a gate output but not a
    # primary output).
    internal_nets = [g["output"] for g in gate_netlist["gates"] if g["output"] not in outputs]
    if internal_nets:
        lines.append(f"    wire {', '.join(internal_nets)};")

    lines.append("")
    if not gate_netlist["gates"]:
        # Degenerate case: expression collapsed to a bare input/constant —
        # netlist_builder produced zero gates. Still valid Verilog: a
        # direct wire from the (sole) input to the output.
        if inputs and outputs:
            lines.append(f"    assign {outputs[0]} = {inputs[0]};")
    for g in gate_netlist["gates"]:
        prim = _PRIMITIVE_MAP.get(g["type"])
        if prim is None:
            continue  # unsupported gate type — skip rather than emit invalid Verilog
        args = ", ".join([g["output"]] + g["inputs"])
        lines.append(f"    {prim} {g['id']} ({args});")

    lines.append("endmodule")
    return "\n".join(lines) + "\n"
