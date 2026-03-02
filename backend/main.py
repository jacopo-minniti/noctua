import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from noctua.agents.chat import build_noctua_agent
from noctua.cli.utils import ensure_configured

# Ensure noctua configuration is loaded
ensure_configured()

app = FastAPI(title="noctua API")

# Setup CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    webSearchEnabled: bool = True
    scholarSearchEnabled: bool = False

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    async def event_generator():
        try:
            noctua_agent = build_noctua_agent(
                web_search_enabled=request.webSearchEnabled,
                scholar_search_enabled=request.scholarSearchEnabled,
            )
            # noctua_agent is a Pydantic AI Agent. We use run_stream to stream deltas.
            async with noctua_agent.run_stream(request.message) as result:
                async for chunk in result.stream_text(delta=True):
                    yield chunk
        except Exception as e:
            yield f"\n[Error: {str(e)}]"

    return StreamingResponse(event_generator(), media_type="text/plain")

# Mount the static Next.js frontend if it exists
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")

if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    @app.get("/")
    async def root():
        return {"message": "Frontend not built yet. Run 'npm run build' inside the frontend directory."}
