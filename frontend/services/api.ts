/**
 * Real API service — talks to the FastAPI backend.
 * Base URL is set via NEXT_PUBLIC_API_URL environment variable.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentOut {
  id: string
  original_filename: string
  file_type: string
  file_size: number
  status: "uploaded" | "processing" | "indexed" | "failed"
  total_chunks: number
  upload_time: string
}

export interface CitationOut {
  document_id: string
  filename: string
  page: number
  chunk_index: number
  source_type?: "document" | "web"
  title?: string
  url?: string
}

export interface ChatResponseBody {
  answer: string
  citations: CitationOut[]
  model: string
  conversation_id?: string
}

/**
 * Structured result of parsing a single SSE stream.
 * `tokens` is the full assembled text; `citations` are the structured citations
 * extracted from the `event: citations` frame.
 */
export interface StreamResult {
  tokens: string
  citations: CitationOut[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`API ${res.status}: ${detail}`)
  }
  // DELETE answers 204 with no body; parsing that as JSON would throw.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T
  }
  return res.json() as Promise<T>
}

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentApi = {
  list: (): Promise<DocumentOut[]> =>
    request("/documents"),

  get: (id: string): Promise<DocumentOut> =>
    request(`/documents/${id}`),

  delete: (id: string): Promise<void> =>
    request(`/documents/${id}`, { method: "DELETE" }),

  upload: async (file: File, onProgress?: (p: number) => void): Promise<DocumentOut> => {
    const form = new FormData()
    form.append("file", file)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${BASE_URL}/upload`)
      xhr.withCredentials = true

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status === 201) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error("Upload network error"))
      xhr.send(form)
    })
  },
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatApi = {
  /**
   * Streaming chat.
   *
   * Yields `{ type: "token", data: string }` for each token and
   * `{ type: "citations", data: CitationOut[] }` once at the end.
   *
   * SSE protocol from backend:
   *   data: <token>               — token event (default event type)
   *   event: citations            — citation event
   *   data: <json array>
   *   data: [DONE]                — sentinel
   *   event: error                — error event
   *   data: <message>
   */
  async *stream(
    message: string,
    conversationId?: string,
    mode: "docuquery" | "llm" | "hybrid" = "docuquery",
  ): AsyncGenerator<{ type: "token"; data: string } | { type: "citations"; data: CitationOut[] } | { type: "error"; data: string }> {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId ?? null, mode }),
    })

    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let currentEventType = "message" // default SSE event type

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE is newline-delimited; split on double-newline (event boundary)
      // but process line by line to track event type
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        // Only remove the transport CR. Trimming the complete line corrupts
        // streamed tokens whose first character is meaningful whitespace.
        const normalizedLine = line.endsWith("\r") ? line.slice(0, -1) : line

        if (normalizedLine === "") {
          // End of an SSE event block — reset event type
          currentEventType = "message"
          continue
        }

        if (normalizedLine.startsWith("event:")) {
          currentEventType = normalizedLine.slice(6).trim()
          continue
        }

        if (normalizedLine.startsWith("data:")) {
          // SSE permits one optional U+0020 after the field colon. Remove
          // only that framing space; preserve every character from the LLM.
          const rawPayload = normalizedLine.slice(5)
          const payload = rawPayload.startsWith(" ") ? rawPayload.slice(1) : rawPayload

          if (payload === "[DONE]") return

          if (currentEventType === "citations") {
            try {
              const citations = JSON.parse(payload) as CitationOut[]
              yield { type: "citations", data: citations }
            } catch {
              // malformed citation JSON — skip
            }
          } else if (currentEventType === "error") {
            yield { type: "error", data: payload }
          } else if (currentEventType === "token") {
            try {
              yield { type: "token", data: JSON.parse(payload) as string }
            } catch {
              yield { type: "token", data: payload }
            }
          } else {
            // Regular token
            yield { type: "token", data: payload }
          }
        }
      }
    }
  },

  /** Non-streaming fallback. */
  send: (message: string, conversationId?: string, mode: "docuquery" | "llm" | "hybrid" = "docuquery"): Promise<ChatResponseBody> =>
    request("/chat", {
      method: "POST",
      body: JSON.stringify({ message, conversation_id: conversationId ?? null, mode }),
    }),
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  check: (): Promise<{ status: string; version: string }> =>
    request("/health"),
}
