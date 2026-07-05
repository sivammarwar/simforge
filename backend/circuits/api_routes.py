"""
FastAPI Route: /api/circuits/solve
=====================================
Wires netlist generation -> ngspice simulation -> Lcapy schematic into a
single endpoint for the Circuits domain.

BUGFIX (this version): the previous version raised HTTPException(detail={
"error": ..., "stage": ...}), but FastAPI always wraps whatever you pass to
`detail` inside a {"detail": {...}} envelope in the JSON response — it does
NOT put "error"/"stage" at the top level. The frontend's circuitsClient.js
reads data?.error / data?.stage directly, found nothing there, and silently
fell back to "Backend returned 422" / "stage: unknown", completely masking
the real failure reason. This version returns a flat JSON body matching
CircuitSolveResponse's shape on every path (success or failure), so the
real error/stage are always readable at the top level regardless of HTTP
status code. It also logs the real error server-side so it shows up in
your backend console/logs even before checking the frontend network tab.
"""

import logging
import uuid
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .orchestrator import solve_circuit_question, to_standardized_result

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/circuits", tags=["circuits"])


class CircuitSolveRequest(BaseModel):
    question: str
    provider: str = "groq"


class CircuitSolveResponse(BaseModel):
    success: bool
    result: dict | None = None
    error: str | None = None
    stage: str | None = None


def _make_llm_caller(provider: str):
    """
    Circuits uses its own strict SYSTEM_PROMPT/JSON contract (netlist_ai.py),
    which the shared /api/chat brain doesn't know about and isn't guaranteed
    to honor. Routing through it wastes ~60s on every request only to fall
    back anyway. Call the provider directly.
    """
    from .netlist_ai import default_call_llm

    def call_llm(prompt: str) -> str:
        return default_call_llm(prompt, provider=provider)

    return call_llm


@router.post("/solve", response_model=CircuitSolveResponse)
async def solve_circuit(request: CircuitSolveRequest):
    print(f"[FLOW TRACE] 3/9 api_routes.py — POST /api/circuits/solve received: {request.question[:80]}")
    task_id = f"circ-{uuid.uuid4().hex[:12]}"
    call_llm = _make_llm_caller(request.provider)

    output = solve_circuit_question(
        question=request.question,
        call_llm=call_llm,
        task_id=task_id,
    )

    if not output["success"]:
        # Log server-side FIRST, unconditionally — so the real reason is
        # visible in backend logs even if the frontend has its own bugs
        # reading the response.
        logger.error(
            f"[circuits] solve failed at stage='{output.get('stage')}' "
            f"question={request.question!r}: {output['error']}"
        )
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "result": None,
                "error": output["error"],
                "stage": output.get("stage"),
            },
        )

    standardized = to_standardized_result(output)
    return CircuitSolveResponse(success=True, result=standardized)
