"""
Circuits Domain API Routes
==========================
FastAPI router for all circuits sub-domains. Foundation wires /solve to the
analog_sim pipeline via the shared orchestrator. Later phases will extend it
for multi-sub-domain requests and SSE streaming.
"""
import asyncio
import json
import logging
import uuid
from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .shared.orchestrator import solve_circuits_question, solve_circuits_question_stream
from .shared.answer_builder import build_structured_answer
from circuits.netlist_ai import default_call_llm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/circuits", tags=["circuits"])


class CircuitSolveRequest(BaseModel):
    question: str = ""
    provider: str = "groq"
    app: str = "seemulator"
    # Context from the current session (Seemulator contract §4)
    history: list = []
    active_input_file: str | None = None
    parameters: list = []
    # Re-run mode: bypasses Call 1 classification, uses pinned sub_domain/input_file
    rerun: bool = False
    sub_domain: str | None = None
    input_file: str | None = None


class CircuitRerunRequest(BaseModel):
    netlist: str
    system_type: str = "Circuit"
    sub_domain: str = "analog_sim"


class CircuitSolveResponse(BaseModel):
    success: bool
    result: dict | None = None
    error: str | None = None
    stage: str | None = None


def _make_llm_caller(provider: str):
    def call_llm(prompt: str) -> str:
        return default_call_llm(prompt, provider=provider)
    return call_llm


@router.post("/solve", response_model=CircuitSolveResponse)
async def solve_circuit(request: CircuitSolveRequest):
    print(f"[FLOW TRACE] 3/9 api_routes.py — POST /api/circuits/solve received: {request.question[:80]}")
    task_id = f"circ-{uuid.uuid4().hex[:12]}"
    call_llm = _make_llm_caller(request.provider)

    output = solve_circuits_question(
        question=request.question,
        call_llm=call_llm,
        task_id=task_id,
        context=request.active_input_file or "",
        history=request.history,
        active_input_file=request.active_input_file,
        parameters=request.parameters,
        rerun=request.rerun,
        sub_domain=request.sub_domain,
        input_file=request.input_file,
    )

    if not output.get("success", True):
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

    return CircuitSolveResponse(success=True, result=output)


@router.post("/rerun", response_model=CircuitSolveResponse)
async def rerun_circuit(request: CircuitRerunRequest):
    """
    Re-run a simulation with an edited netlist (from playground parameter edits).
    Bypasses LLM netlist generation — runs ngspice directly on the provided netlist.
    """
    from pathlib import Path
    from .analog_sim.pipeline import run_analog_sim_pipeline
    from .shared.result_registry import parse_result

    task_id = f"rerun-{uuid.uuid4().hex[:12]}"
    runs_dir = Path(__file__).parent / "simforge_runs"

    try:
        raw = run_analog_sim_pipeline(
            question="",
            call_llm=lambda _: "",
            task_id=task_id,
            tool="ngspice",
            runs_dir=runs_dir,
            max_repair_attempts=0,
            _prebuilt_netlist=request.netlist,
            _system_type=request.system_type,
        )
        if raw.get("success", True):
            try:
                parsed = parse_result("analog_sim", raw)
            except Exception:
                parsed = raw
            return CircuitSolveResponse(success=True, result=parsed)
        return JSONResponse(status_code=422, content={
            "success": False, "result": None,
            "error": raw.get("error", "Re-run failed"), "stage": raw.get("stage"),
        })
    except Exception as exc:
        logger.exception("[circuits] rerun failed")
        return JSONResponse(status_code=500, content={
            "success": False, "result": None, "error": str(exc), "stage": "rerun",
        })


def _event_stream(question: str, call_llm, task_id: str, request: CircuitSolveRequest):
    """
    Sync generator for the Seemulator streaming contract.

    Passes through all contract-format events from the orchestrator. If the
    orchestrator does not emit a final `done`, we append one. The SSE layer
    below formats each event as `event: <name>` + `data: <json>`.
    """
    seen_done = False
    for event in solve_circuits_question_stream(
        question=question,
        call_llm=call_llm,
        task_id=task_id,
        context=request.active_input_file or "",
        history=request.history,
        active_input_file=request.active_input_file,
        parameters=request.parameters,
        rerun=request.rerun,
        sub_domain=request.sub_domain,
        input_file=request.input_file,
    ):
        yield event
        if event.get("event") == "done":
            seen_done = True
        if event.get("event") == "result":
            result = event.get("data") or {}
            ai_count = result.get("_ai_call_count", 0)
            logger.info(f"[Two-Call Pipeline] AI calls made: {ai_count} for question: {question[:80]}")

    # Safety net: if the orchestrator did not emit a final done, append one.
    if not seen_done:
        yield {"event": "done", "data": {}}


async def _sse_from_sync_generator(sync_gen):
    """
    Wraps a blocking sync generator (LLM calls, ngspice subprocess, LaTeX
    rendering) for FastAPI's async StreamingResponse. Each `next()` call
    runs in the default thread pool executor so the event loop isn't
    blocked, and each event is flushed to the client as soon as it's
    produced — genuine incremental streaming, not batched.

    Emits the Seemulator contract format:
        event: <name>
        data: <single-line JSON>
    """
    loop = asyncio.get_event_loop()
    it = iter(sync_gen)
    while True:
        try:
            event = await loop.run_in_executor(None, next, it)
        except StopIteration:
            break
        event_name = event.get("event", "message")
        if event_name == "done":
            yield "event: done\ndata: [DONE]\n\n"
            continue
        payload = event.get("data") if event.get("data") is not None else event
        yield f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"


@router.post("/solve/stream")
async def solve_circuit_stream(request: CircuitSolveRequest):
    print(f"[FLOW TRACE] SSE api_routes.py — POST /api/circuits/solve/stream received: {request.question[:80]}")
    task_id = f"circ-{uuid.uuid4().hex[:12]}"
    call_llm = _make_llm_caller(request.provider)

    generator = _event_stream(request.question, call_llm, task_id, request)
    return StreamingResponse(
        _sse_from_sync_generator(generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
