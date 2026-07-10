"""
Chat API Routes
POST /api/chat - Send message to AI provider
GET /api/providers - Get available AI providers
"""

import logging
import os
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


# ─── DATA MODELS ──────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    domain: str
    provider: str = "groq"
    conversationHistory: List[dict] = []


class ChatResponse(BaseModel):
    success: bool
    content: Optional[str] = None
    error: Optional[str] = None
    suggestion: Optional[str] = None
    fallback_message: Optional[str] = None
    error_code: Optional[str] = None
    retry_after_seconds: Optional[int] = None


class ProvidersResponse(BaseModel):
    providers: List[str]


# ─── PROVIDER CONFIGURATION ─────────────────────────────────────────────

PROVIDER_CONFIG = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "env": "GROQ_API_KEY",
        "model": "llama-3.3-70b-versatile",
    },
    "claude": {
        "base_url": "https://api.anthropic.com/v1",
        "env": "ANTHROPIC_API_KEY",
        "model": "claude-3-5-sonnet-20241022",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "env": "GEMINI_API_KEY",
        "model": "gemini-2.0-flash-exp",
    },
    "cerebras": {
        "base_url": "https://api.cerebras.ai/v1",
        "env": "CEREBRAS_API_KEY",
        "model": "gpt-oss-120b",
    },
}


# ─── HELPER FUNCTIONS ───────────────────────────────────────────────────

def get_available_providers() -> List[str]:
    """Return list of providers with valid API keys configured."""
    available = []
    for provider_name, config in PROVIDER_CONFIG.items():
        if os.environ.get(config["env"]):
            available.append(provider_name)
    return available


def call_provider(provider: str, messages: List[dict]) -> str:
    """Call the specified AI provider using the appropriate client."""
    
    if provider not in PROVIDER_CONFIG:
        raise ValueError(f"Provider '{provider}' is not configured")

    cfg = PROVIDER_CONFIG[provider]
    api_key = os.environ.get(cfg["env"])
    
    if not api_key:
        raise RuntimeError(f"Missing {cfg['env']} environment variable for provider '{provider}'")

    # OpenAI-compatible providers (Groq, Cerebras)
    if provider in ["groq", "cerebras"]:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=cfg["base_url"])
        response = client.chat.completions.create(
            model=cfg["model"],
            temperature=0.1,
            messages=messages,
            timeout=30.0,
        )
        return response.choices[0].message.content
    
    # Anthropic Claude
    elif provider == "claude":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        
        # Convert messages to Anthropic format
        system_message = ""
        anthropic_messages = []
        
        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
            elif msg["role"] == "user":
                anthropic_messages.append({"role": "user", "content": msg["content"]})
            elif msg["role"] == "assistant":
                anthropic_messages.append({"role": "assistant", "content": msg["content"]})
        
        response = client.messages.create(
            model=cfg["model"],
            max_tokens=4096,
            temperature=0.1,
            system=system_message,
            messages=anthropic_messages,
        )
        return response.content[0].text
    
    # Google Gemini
    elif provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(cfg["model"])
        
        # Convert messages to Gemini format
        gemini_messages = []
        for msg in messages:
            if msg["role"] == "system":
                # Gemini doesn't have system messages, prepend to first user message
                continue
            elif msg["role"] == "user":
                gemini_messages.append(msg["content"])
            elif msg["role"] == "assistant":
                gemini_messages.append(f"Assistant: {msg['content']}")
        
        # Prepend system message to first user message if exists
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
        if system_msg and gemini_messages:
            gemini_messages[0] = f"{system_msg}\n\nUser: {gemini_messages[0]}"
        
        response = model.generate_content(
            "\n".join(gemini_messages),
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=4096,
            )
        )
        return response.text
    
    else:
        raise ValueError(f"Provider '{provider}' is not implemented")


# ─── API ENDPOINTS ──────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the AI provider.
    
    Request body:
    - message: User's message
    - domain: Engineering domain (e.g., "Circuits")
    - provider: AI provider name (default: "groq")
    - conversationHistory: Array of {role, content} messages
    
    Returns:
    - success: true/false
    - content: AI response text (on success)
    - error: Error message (on failure)
    - suggestion: Optional suggestion for user (on failure)
    - error_code: Optional error code (e.g., "rate_limit")
    - retry_after_seconds: Optional retry delay (on rate limit)
    """
    try:
        # Check if provider is supported
        if request.provider not in PROVIDER_CONFIG:
            return ChatResponse(
                success=False,
                error=f"Provider '{request.provider}' is not yet supported",
                suggestion=f"Available providers: {', '.join(get_available_providers())}"
            )
        
        # Check if provider has API key configured
        cfg = PROVIDER_CONFIG[request.provider]
        if not os.environ.get(cfg["env"]):
            return ChatResponse(
                success=False,
                error=f"API key for provider '{request.provider}' is not configured",
                suggestion=f"Set the {cfg['env']} environment variable to use this provider"
            )
        
        # Build messages array
        system_prompt = f"""You are a professional engineering assistant for the {request.domain} domain. Provide clear, accurate, and technically sound answers to engineering questions.

FORMAT YOUR RESPONSE USING MARKDOWN:
- Use ## for section headers (e.g., ## Description, ## Intuition, ## Mathematics, ## Formula/Laws Used)
- Use **bold** for emphasis on key terms
- Use proper spacing between sections (blank line after each header)
- Use bullet points for lists
- Format mathematical expressions clearly
- Keep explanations concise but thorough"""
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        for msg in request.conversationHistory:
            if msg.get("role") in ["user", "assistant"] and msg.get("content"):
                messages.append({"role": msg["role"], "content": msg["content"]})
        
        # Add current user message
        messages.append({"role": "user", "content": request.message})
        
        # Call provider
        content = call_provider(request.provider, messages)
        
        return ChatResponse(success=True, content=content)
        
    except ValueError as e:
        # Provider not configured
        return ChatResponse(
            success=False,
            error=str(e),
            suggestion=f"Available providers: {', '.join(get_available_providers())}"
        )
        
    except RuntimeError as e:
        # Missing API key
        return ChatResponse(
            success=False,
            error=str(e),
            suggestion="Check that the required environment variable is set"
        )
        
    except Exception as e:
        # Network error, timeout, or other failure
        error_msg = str(e)
        error_code = None
        retry_after = None
        
        # Detect rate limit (common pattern in error messages)
        if "rate limit" in error_msg.lower() or "429" in error_msg:
            error_code = "rate_limit"
            retry_after = 60  # Suggest 60 second retry
        
        logger.error(f"[/api/chat] Error calling provider '{request.provider}': {e}")
        
        return ChatResponse(
            success=False,
            error=f"Failed to call AI provider: {error_msg}",
            suggestion="Please try again later or switch to a different provider",
            error_code=error_code,
            retry_after_seconds=retry_after
        )


@router.get("/providers", response_model=ProvidersResponse)
async def get_providers():
    """
    Get list of available AI providers.
    
    Returns:
    - providers: Array of provider names that have API keys configured
    """
    available = get_available_providers()
    return ProvidersResponse(providers=available)
