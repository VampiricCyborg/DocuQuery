from app.services.document_service import (
    save_document,
    list_documents,
    delete_document,
    update_document_status,
)

# conversation_service is deliberately NOT re-exported here. It imports
# app.llm.models, which executes app/llm/__init__.py, which imports the retrieval
# pipeline -- and app.retrieval reaches app.services through app.ingestion. Doing
# it eagerly closes that loop, so importing app.retrieval first (as the evaluation
# harness does) fails with a partially initialised module. Callers import the
# submodule directly: `from app.services import conversation_service`.

__all__ = ["save_document", "list_documents", "delete_document", "update_document_status"]
