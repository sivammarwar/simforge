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
    question: str
    provider: str = "groq"


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


def _event_stream(question: str, call_llm, task_id: str):
    """
    Sync generator for the Two-Call AI Pipeline.

    Passes through all orchestrator events. When the orchestrator yields
    answer_done (from Call 2), streams the answer text in small chunks
    for the frontend's letter-by-letter effect.

    If Call 2 failed or was skipped, falls back to template-based
    build_structured_answer as a safety net.
    """
    answer_text = None
    for event in solve_circuits_question_stream(question=question, call_llm=call_llm, task_id=task_id):
        if event.get("stage") == "answer_done":
            answer_text = event.get("full_text", "")
            # Don't yield answer_done yet — stream chunks first
            continue
        yield event
        if event.get("stage") == "final_result":
            result = event.get("result") or {}
            ai_count = result.get("_ai_call_count", 0)
            logger.info(f"[Two-Call Pipeline] AI calls made: {ai_count} for question: {question[:80]}")

            # If Call 2 produced an answer, stream it in chunks
            if answer_text:
                chunk_size = 18
                for i in range(0, len(answer_text), chunk_size):
                    yield {"stage": "answer_chunk", "text": answer_text[i:i + chunk_size]}
                yield {"stage": "answer_done", "full_text": answer_text}
            elif result.get("success", True) is not False:
                # Fallback: template-based answer if Call 2 was skipped/failed
                fallback = build_structured_answer(result)
                chunk_size = 18
                for i in range(0, len(fallback), chunk_size):
                    yield {"stage": "answer_chunk", "text": fallback[i:i + chunk_size]}
                yield {"stage": "answer_done", "full_text": fallback}


async def _sse_from_sync_generator(sync_gen):
    """
    Wraps a blocking sync generator (LLM calls, ngspice subprocess, LaTeX
    rendering) for FastAPI's async StreamingResponse. Each `next()` call
    runs in the default thread pool executor so the event loop isn't
    blocked, and each event is flushed to the client as soon as it's
    produced — genuine incremental streaming, not batched.
    """
    loop = asyncio.get_event_loop()
    it = iter(sync_gen)
    while True:
        try:
            event = await loop.run_in_executor(None, next, it)
        except StopIteration:
            break
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/solve/stream")
async def solve_circuit_stream(request: CircuitSolveRequest):
    print(f"[FLOW TRACE] SSE api_routes.py — POST /api/circuits/solve/stream received: {request.question[:80]}")
    task_id = f"circ-{uuid.uuid4().hex[:12]}"
    call_llm = _make_llm_caller(request.provider)

    generator = _event_stream(request.question, call_llm, task_id)
    return StreamingResponse(
        _sse_from_sync_generator(generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
