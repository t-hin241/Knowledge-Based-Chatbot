"""
RAG engine — orchestrates the full query pipeline:

  embed query → search vectors → (optional) DDG web search →
  assemble context → stream Groq / Llama response

Groq uses an OpenAI-compatible API. The `groq` SDK exposes
`client.chat.completions.create(stream=True)` which yields
delta chunks — exactly the same pattern as OpenAI streaming.
"""
import logging
from collections.abc import AsyncGenerator
from typing import Any

from groq import AsyncGroq

from app.core.config import settings
from app.services.doc_processor import get_embed_model
from app.services.vector_store import query_collection
from app.services.web_research import format_web_context, search_web

logger = logging.getLogger(__name__)

# Module-level Groq client — one connection pool for the whole process
_groq_client: AsyncGroq | None = None


def get_groq_client() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        if not settings.GROQ_API_KEY:
            raise RuntimeError(
                "GROQ_API_KEY is not set. "
                "Get a free key at https://console.groq.com"
            )
        _groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return _groq_client


# ── Context assembly ──────────────────────────────────────────────────────────

def _build_doc_context(chunks: list[dict]) -> str:
    """Format retrieved doc chunks into a numbered context block."""
    if not chunks:
        return ""
    parts = ["## Knowledge base\n"]
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[Doc {i} | document_id={chunk['document_id']} "
            f"chunk={chunk['chunk_index']}]\n"
            f"{chunk['text']}\n"
        )
    return "\n".join(parts)


def _build_system_prompt(
    doc_context: str,
    web_context: str,
    has_docs: bool = False,
) -> str:
    """
    Build the system prompt injected as the first message.

    Groq / Llama receives system instructions via role="system" in
    the messages list — same pattern as OpenAI chat completions.
    """
    context_blocks = []
    if doc_context:
        context_blocks.append(doc_context)
    if web_context:
        context_blocks.append(web_context)

    context_section = "\n\n".join(context_blocks)

    no_context_note = (
        "No relevant documents or web results are available. "
        "Answer from general knowledge and clearly state you are doing so."
        if not context_section
        else ""
    )

    return f"""You are Talk2DocBot, an intelligent knowledge assistant.
Answer questions based on the context provided below.

Rules:
- Ground your answers in the provided context. Cite sources as [Doc N] or [Web N].
- If the context is insufficient, say so — do not fabricate information.
- Be concise and structured. Use markdown where it aids clarity.
- Use conversation history to maintain continuity across follow-up questions.

{context_section}
{no_context_note}""".strip()


def _trim_history(history: list[dict], max_messages: int) -> list[dict]:
    """Keep the most recent N messages, preserving user/assistant pairs."""
    if len(history) <= max_messages:
        return history
    keep = max_messages if max_messages % 2 == 0 else max_messages - 1
    return history[-keep:]


# ── Main streaming pipeline ───────────────────────────────────────────────────

async def stream_rag_response(
    user_message: str,
    user_id: int,
    history: list[dict],
    document_ids: list[int] | None = None,
    web_search_requested: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Full RAG pipeline as an async generator.

    Yields event dicts consumed by the SSE route:
      {"type": "sources", "sources": [...]}   — emitted before first token
      {"type": "token",   "token": "..."}     — one per streamed chunk
      {"type": "done",    "full_text": "...","sources": [...]}
      {"type": "error",   "detail": "..."}    — on any failure
    """
    try:
        # ── Step 1: Embed query ───────────────────────────────────────────
        model = get_embed_model()
        query_embedding = model.encode(
            user_message, show_progress_bar=False
        ).tolist()

        # ── Step 2: Vector search ─────────────────────────────────────────
        doc_chunks: list[dict] = []
        needs_web = web_search_requested

        try:
            doc_chunks = query_collection(
                user_id=user_id,
                query_embedding=query_embedding,
                n_results=settings.RAG_TOP_K,
                document_ids=document_ids,
            )
            # Auto-trigger web search if best doc match is below threshold
            if doc_chunks:
                best_similarity = 1 - doc_chunks[0]["distance"]
                if best_similarity < settings.RAG_SIMILARITY_THRESHOLD:
                    logger.info(
                        f"Best similarity {best_similarity:.2f} < "
                        f"{settings.RAG_SIMILARITY_THRESHOLD} — triggering DDG search"
                    )
                    needs_web = True

        except Exception as exc:
            logger.warning(f"Vector search failed: {exc} — falling back to web only")
            needs_web = True

        # ── Step 3: Optional DDG web research ────────────────────────────
        web_results: list[dict] = []
        if needs_web:
            web_results = await search_web(user_message)

        # ── Step 4: Assemble sources for citation ─────────────────────────
        sources: list[dict] = []
        for chunk in doc_chunks:
            sources.append({
                "type":        "document",
                "document_id": chunk["document_id"],
                "chunk_index": chunk["chunk_index"],
            })
        for result in web_results:
            sources.append({
                "type":  "web",
                "url":   result["url"],
                "title": result["title"],
            })

        # Emit sources before first token — frontend shows citations early
        yield {"type": "sources", "sources": sources}

        # ── Step 5: Build context + messages list ─────────────────────────
        doc_context   = _build_doc_context(doc_chunks)
        web_context   = format_web_context(web_results)
        system_prompt = _build_system_prompt(doc_context, web_context, bool(doc_chunks))

        if len(system_prompt) > settings.MAX_CONTEXT_CHARS:
            system_prompt = system_prompt[: settings.MAX_CONTEXT_CHARS]
            logger.warning("System prompt truncated to MAX_CONTEXT_CHARS")

        trimmed_history = _trim_history(history, settings.MAX_HISTORY_MESSAGES)

        # Groq uses the OpenAI chat format:
        # system message first, then alternating user/assistant turns
        messages = (
            [{"role": "system", "content": system_prompt}]
            + trimmed_history
            + [{"role": "user", "content": user_message}]
        )

        # ── Step 6: Stream Groq / Llama response ──────────────────────────
        client  = get_groq_client()
        full_text = ""

        stream = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=messages,
            max_tokens=2048,
            temperature=0.7,
            stream=True,
        )

        async for chunk in stream:
            # Each chunk has choices[0].delta.content — may be None on last chunk
            token = chunk.choices[0].delta.content
            if token:
                full_text += token
                yield {"type": "token", "token": token}

        # ── Step 7: Done ──────────────────────────────────────────────────
        yield {"type": "done", "full_text": full_text, "sources": sources}

    except RuntimeError as exc:
        # Catches missing GROQ_API_KEY
        yield {"type": "error", "detail": str(exc)}

    except Exception as exc:
        # Groq SDK raises groq.AuthenticationError, groq.RateLimitError etc.
        # Catching broadly here so the SSE stream always closes cleanly.
        error_name = type(exc).__name__
        logger.exception(f"RAG pipeline error ({error_name}): {exc}")

        if "Authentication" in error_name or "auth" in str(exc).lower():
            yield {"type": "error", "detail": "Invalid GROQ_API_KEY. Check your .env file."}
        elif "RateLimit" in error_name:
            yield {"type": "error", "detail": "Groq rate limit reached. Wait a moment and retry."}
        else:
            yield {"type": "error", "detail": f"Unexpected error: {error_name}"}