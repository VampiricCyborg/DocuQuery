from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import SecurityHeadersMiddleware, configure_rate_limiter
from app.database.base import engine, Base
from app.api import (
    health_router,
    upload_router,
    documents_router,
    chat_router,
    auth_router,
    retrieve_router,
)

settings = get_settings()
configure_logging(debug=settings.debug)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    
    # Eager-load the embedding model to avoid cold-load OOM on first /chat request
    import logging
    from app.ingestion.embeddings import get_embedding_service
    logger = logging.getLogger(__name__)
    logger.info("[startup] Eager-loading embedding model to avoid OOM on first request...")
    service = get_embedding_service()
    service._load_model()  # Load BAAI/bge-small-en-v1.5 (~130MB) now, not on first /chat
    logger.info("[startup] Embedding model loaded. Application ready.")
    
    yield
    
    # Shutdown (nothing needed yet)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        # Disable interactive docs in production
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
        lifespan=lifespan,
    )

    app.add_middleware(SecurityHeadersMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    configure_rate_limiter(app)

    app.include_router(health_router, tags=["Health"])
    app.include_router(upload_router, tags=["Upload"])
    app.include_router(documents_router, tags=["Documents"])
    app.include_router(chat_router, tags=["Chat"])
    app.include_router(auth_router, tags=["Auth"])
    app.include_router(retrieve_router, tags=["Retrieval"])

    return app


app = create_app()
