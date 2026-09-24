import json
from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The value auth_secret falls back to when nothing sets AUTH_SECRET. It is a public
# constant in a public repo, so a deployment still carrying it signs session cookies
# with a key anyone can read. _reject_insecure_auth_secret below refuses to build a
# non-debug Settings in that state.
DEV_AUTH_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "DocuQuery"
    app_version: str = "0.1.0"
    debug: bool = False

    # CORS — comma-separated list of allowed origins
    allowed_origins: str = "http://localhost:3000"

    # Rate limiting
    rate_limit_upload: str = "10/minute"
    rate_limit_chat: str = "30/minute"

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/docuquery"

    @property
    def async_database_url(self) -> str:
        """Normalize Railway's postgresql:// to postgresql+asyncpg://."""
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.database_url

    upload_dir: str = "uploads"
    max_file_size_mb: int = 50
    allowed_extensions: str = "pdf,docx,txt,md"

    # Ingestion
    chunk_size: int = 800
    chunk_overlap: int = 120
    embedding_model: str = "BAAI/bge-small-en-v1.5"  # descriptive label only, used in logs
    embedding_model_dir: str = "models/bge-small-en-v1.5-onnx-int8"
    embedding_batch_size: int = 32

    # Retrieval
    retrieval_top_k: int = 5
    retrieval_similarity_threshold: float = 0.30
    retrieval_max_context_chunks: int = 10
    retrieval_vector_distance: str = "cosine"  # reserved for Phase 6

    # LLM
    llm_provider: str = "groq"
    llm_model: str = "qwen/qwen3.8-27b"
    llm_temperature: float = 0.1
    llm_max_tokens: int = 1024
    llm_max_context_tokens: int = 3000
    llm_streaming_enabled: bool = True
    llm_timeout: float = 30.0
    llm_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    # Conversation memory (Phase 8)
    # How many prior turns (one turn = a user message and the assistant reply to it)
    # are replayed to the provider. Older turns are dropped first.
    chat_history_turns: int = 6
    # History gets its own budget, deliberately separate from llm_max_context_tokens.
    # Sharing one budget would let a long conversation crowd out retrieved passages,
    # which is the opposite of what a document assistant should do under pressure.
    chat_history_max_tokens: int = 1000
    # Query condensing: rewrite an elliptical follow-up into a standalone search query.
    chat_query_rewrite: bool = True
    chat_query_rewrite_max_tokens: int = 80
    # Kept well under llm_timeout -- condensing sits in front of retrieval, so its
    # timeout is added to every follow-up's time-to-first-token. On expiry the raw
    # message is used instead, which is a worse query but not a failed request.
    chat_query_rewrite_timeout: float = 6.0
    # Upper bound on the one-time localStorage import. Mirrored in the request schema.
    chat_import_max_conversations: int = 200

    # Authentication. Set a strong value in Railway/Vercel environments.
    auth_secret: str = DEV_AUTH_SECRET
    auth_cookie_name: str = "docuquery_session"
    auth_session_days: int = 30
    # Production-safe default for Vercel -> Railway cross-site requests.
    # Set AUTH_COOKIE_SECURE=false for local http development.
    auth_cookie_secure: bool = True

    # Live web search (used by Hybrid mode only)
    tavily_api_key: str = ""
    tavily_max_results: int = 5
    tavily_search_depth: str = "basic"

    @property
    def allowed_origins_list(self) -> list[str]:
        raw = self.allowed_origins.strip()
        if not raw:
            return []

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw

        if isinstance(parsed, list):
            candidates = parsed
        else:
            candidates = str(parsed).split(",")

        origins: list[str] = []
        for origin in candidates:
            normalized = str(origin).strip().strip('"').strip("'").rstrip("/")
            if normalized:
                origins.append(normalized)
        return origins

    @property
    def allowed_ext_set(self) -> set[str]:
        return {ext.strip().lower() for ext in self.allowed_extensions.split(",")}

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @model_validator(mode="after")
    def _reject_insecure_auth_secret(self) -> "Settings":
        """Refuse to build production settings that sign sessions with a known key.

        auth_secret is the only input to the session cookie's HMAC, so the shipped
        default lets anyone mint a cookie for any user id. Failing here — at
        Settings() construction — means the process dies before create_app() wires a
        single route, rather than serving forgeable sessions. Debug builds are exempt
        so local development needs no setup.
        """
        if self.debug:
            return self
        if not self.auth_secret.strip() or self.auth_secret == DEV_AUTH_SECRET:
            raise ValueError(
                "AUTH_SECRET is unset or still the development default. Set it to a "
                "strong random value (e.g. `python -c \"import secrets; "
                "print(secrets.token_urlsafe(48))\"`) in the deployment environment, "
                "or set DEBUG=true for local development."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
