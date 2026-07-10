"""
Circuits Domain - Legacy support modules (netlist_ai, ngspice_runner, schematic).
orchestrator.py and api_routes.py were superseded by
backend/domains/circuits/ (see PRD "one folder per sub-domain") and renamed
to *.deprecated. This package now only exposes the low-level modules that
backend/domains/circuits/analog_sim/pipeline.py still imports during the
migration.
"""
