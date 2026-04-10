"""
Web research via DuckDuckGo — no API key required.

Uses the `duckduckgo-search` library which wraps DDG's unofficial
API. It returns titles, URLs, and text snippets we can inject
directly into the RAG context window.

We call this service when:
  1. User explicitly sets web_search=True in the request, OR
  2. ChromaDB similarity scores are all below RAG_SIMILARITY_THRESHOLD,
     meaning the uploaded docs don't contain a good answer.
"""
import asyncio
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


async def search_web(query: str) -> list[dict[str, Any]]:
    """
    Search DuckDuckGo and return RAG-ready results.

    Returns list of dicts:
    {
        "title":   "Page title",
        "url":     "https://...",
        "content": "Text snippet from the page",
        "score":   1.0   # DDG doesn't score — we use position rank
    }

    DDG's Python library is synchronous, so we run it in a thread
    executor to avoid blocking the async event loop.
    """
    if not query.strip():
        return []

    def _sync_search() -> list[dict]:
        """Runs in a thread — safe to call blocking DDG library here."""
        try:
            from duckduckgo_search import DDGS

            results = []
            # DDGS() is a context manager — handles session lifecycle
            with DDGS() as ddgs:
                hits = ddgs.text(
                    query,
                    region=settings.DDG_REGION,
                    max_results=settings.DDG_MAX_RESULTS,
                )
                # hits is a list of dicts: title, href, body
                for rank, hit in enumerate(hits or []):
                    content = (hit.get("body") or "").strip()
                    if not content:
                        continue
                    results.append({
                        "title":   hit.get("title", ""),
                        "url":     hit.get("href",  ""),
                        "content": content,
                        # Rank-based score: first result = 1.0, decreasing
                        "score":   round(1.0 - rank * 0.1, 2),
                    })
            return results

        except Exception as exc:
            # Never crash the RAG pipeline because DDG failed.
            # Log and return empty — engine falls back to doc-only context.
            logger.error(f"DuckDuckGo search failed: {exc}")
            return []

    try:
        # Run the blocking DDG call in a thread pool
        results = await asyncio.get_event_loop().run_in_executor(
            None, _sync_search
        )
        logger.info(
            f"DDG search '{query[:60]}' → {len(results)} results"
        )
        return results

    except Exception as exc:
        logger.error(f"Web research executor error: {exc}")
        return []


def format_web_context(results: list[dict]) -> str:
    """
    Format DDG results into a labelled block ready for the system prompt.
    Each result is capped at 600 chars — enough context without blowing
    the token budget.
    """
    if not results:
        return ""

    parts = ["## Web research results\n"]
    for i, r in enumerate(results, 1):
        parts.append(
            f"[Web {i}] {r['title']}\n"
            f"URL: {r['url']}\n"
            f"{r['content'][:600]}\n"
        )
    return "\n".join(parts)