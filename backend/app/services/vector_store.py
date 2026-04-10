"""
ChromaDB wrapper — single place that owns all vector DB operations.

Why a wrapper instead of using ChromaDB directly in other services?
- If we ever swap ChromaDB for Pinecone/Weaviate, only this file changes.
- Centralises collection naming conventions and metadata schemas.
- Makes mocking easy in tests.
"""
from functools import lru_cache

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import settings


@lru_cache
def get_chroma_client() -> chromadb.Client:
    """
    Persistent ChromaDB client — stores data on disk at CHROMA_PATH.
    lru_cache ensures we reuse the same client across requests instead
    of opening a new connection every time.
    """
    return chromadb.PersistentClient(
        path=settings.CHROMA_PATH,
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def get_collection(user_id: int) -> chromadb.Collection:
    """
    Each user gets their own ChromaDB collection — complete data isolation.

    Collection naming: 'user_{id}_docs'
    get_or_create means the first upload creates it, subsequent ones reuse it.
    """
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=f"user_{user_id}_docs",
        metadata={"hnsw:space": "cosine"},  # cosine similarity for text
    )


def upsert_chunks(
    user_id: int,
    document_id: int,
    chunks: list[str],
    embeddings: list[list[float]],
) -> int:
    """
    Store text chunks and their embeddings in ChromaDB.

    IDs are deterministic: 'doc_{doc_id}_chunk_{i}'
    This means re-uploading the same document overwrites its old chunks
    instead of creating duplicates — safe to call multiple times.

    Returns the number of chunks stored.
    """
    collection = get_collection(user_id)

    ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {"document_id": document_id, "chunk_index": i, "user_id": user_id}
        for i in range(len(chunks))
    ]

    collection.upsert(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(chunks)


def query_collection(
    user_id: int,
    query_embedding: list[float],
    n_results: int = 5,
    document_ids: list[int] | None = None,
) -> list[dict]:
    """
    Retrieve the top-k most similar chunks to the query embedding.

    Optional document_ids filter lets the user ask questions scoped
    to specific documents rather than their entire knowledge base.

    Returns list of dicts with 'text', 'document_id', 'chunk_index',
    and 'distance' (lower = more similar for cosine).
    """
    collection = get_collection(user_id)

    where = None
    if document_ids:
        where = {"document_id": {"$in": document_ids}}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    chunks = []
    for text, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        chunks.append({
            "text": text,
            "document_id": meta["document_id"],
            "chunk_index": meta["chunk_index"],
            "distance": dist,
        })

    return chunks


def delete_document_chunks(user_id: int, document_id: int) -> None:
    """Remove all chunks for a document — called when user deletes a doc."""
    collection = get_collection(user_id)
    collection.delete(where={"document_id": document_id})