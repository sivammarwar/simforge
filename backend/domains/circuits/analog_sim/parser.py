"""
Analog Simulation Result Parser
================================
Normalizes an AnalogSimResult into the frontend display shape expected by
plotFactory.js / CircuitsResultsPane. The registry's default parser is
sufficient for analog_sim, but this module is the dedicated extension point.
"""
from typing import Dict, Any


def parse_analog_sim_result(raw: Dict[str, Any]) -> Dict[str, Any]:
    """No-op for now; schema already matches frontend contract."""
    return raw
