import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from obx.agents.chat import obx_agent
from obx.cli.utils import ensure_configured

# Ensure obx configuration is loaded
ensure_configured()

app = FastAPI(title="obx API")

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

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    async def event_generator():
        try:
            # obx_agent is a Pydantic AI Agent. We use run_stream to stream deltas.
            async with obx_agent.run_stream(request.message) as result:
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
