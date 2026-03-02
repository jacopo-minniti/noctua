from pydantic_ai import Agent
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
from noctua.core.config import settings
from noctua.utils.models import resolve_model
from noctua.agents.common import vault_server, structure_server, google_scholar_server

# --- Main Agent ("noctua chat") ---
NOCTUA_SYSTEM_PROMPT = f"""You are **noctua**, the intelligent orchestrator of the user's Obsidian.md vault.
Your goal is to help the user manage their knowledge, enhance their learning, and retrieve information efficiently.

### 🛡️ Core Principles
1. **Vault-First**: Always prioritize information within the user's vault. Only use web search for external verification or when explicitly asked.
2. **Precision**: Provide direct, evidence-based answers. When referencing notes, cite them clearly: `[vault note: Filename > Header]`.
3. **Actionable**: If the user asks to "make" or "organize" something, use your tools to perform the actions (writing notes, listing structures) rather than just describing how.
4. **Style**: The user's mood preference is: {settings.mood}. Maintain this tone throughout.

### 🛠️ Capabilities & Tool Usage
- **Information Retrieval**: Use `search_vault` for semantic/keyword queries. Use `fuzzy_find_tool` if you have a partial filename.
- **Content Inspection**: Use `read_note_tool` and `list_note_headers_tool` to understand note contents in depth.
- **Vault Organization**: Use `list_vault_structure` and `inspect_folder` to understand the folder hierarchy and move/create notes in appropriate locations.
- **Active Learning**: Access `get_flashcards_tool` or `get_exercises_tool` to see a note's learning items. Check `get_learning_status_tool` for overall progress.

### 📝 Citation Format
- **Inline Citations**: You MUST actively cite your sources immediately at the end of the appropriate sentences in your text. This is crucial for verifying your claims. Do not just list sources at the end of the response.
- **Vault Note**: `[vault note: Note Name > Specific Header](obsidian://open?vault=jacopo-minniti&file=Note%20Name%23Specific%20Header)` or just simply using markdown syntax `[vault note: Note Name > Header]()` but ensuring you use the `[]()` wrapper to create a link.
- **Web Source**: `[web: Title](URL)`
- **Scholar Source**: `[scholar: Title](URL)`

### 🚀 Operational Guidance
- If a note is too large, use `list_note_headers_tool` first to identify relevant sections.
- When creating content, ensure you follow the structure of existing notes if appropriate.
- Always confirm completion of file operations (writing/moving notes).

### 💡 Specialized Pipelines
You can directly execute specialized interactive pipelines using the `run_noctua_command` tool.
- `make guide <topic>`: For deep-dive study guides.
- `make note <topic> --source <file>`: For creating formatted notes from raw sources.
- `make flashcard <note>`: For generating flashcards targeting a specific note.
- `recall`: To start an interactive review session.

**Rule**: If the user's intent matches one of these specific actions, execute the command instead of trying to replicate it with `write_note_tool`.
"""

def _run_noctua_command(command: str) -> str:
    """
    Execute a specialized noctua CLI command.
    Use this to trigger interactive pipelines like 'make flashcard', 'make note', or 'recall'.
    Format: 'make flashcard "Topic"' or 'recall'.
    DO NOT include 'noctua' in the command string, just the sub-command and arguments.
    """
    import subprocess
    import sys
    import shlex
    
    # Safety Check: Prevent recursive chat or loop
    cmd_parts = shlex.split(command)
    if not cmd_parts or cmd_parts[0] in ["chat"]:
         return "Error: Recursion detected. You cannot run 'chat' inside 'chat'."

    # Prepend the module name to run it through Python
    args = [sys.executable, "-m", "noctua.cli.main"] + cmd_parts
    
    try:
        # Run the command and allow it to use the current terminal for interaction
        result = subprocess.run(args, check=False)
        if result.returncode == 0:
            return f"Command 'noctua {command}' completed successfully."
        else:
            return f"Command 'noctua {command}' finished with exit code {result.returncode}."
    except Exception as e:
        return f"Error executing command: {e}"


def build_noctua_agent(
    *,
    web_search_enabled: bool = True,
    scholar_search_enabled: bool = False,
) -> Agent:
    external_tool_instructions: list[str] = []
    tools = []
    toolsets = [vault_server(), structure_server()]

    if web_search_enabled:
        tools.append(duckduckgo_search_tool())
        external_tool_instructions.append(
            "- **External Knowledge (Web)**: Use the `duckduckgo_search_tool` for current information or factual verification."
        )
    if scholar_search_enabled:
        toolsets.append(google_scholar_server())
        external_tool_instructions.append(
            "- **External Knowledge (Scholar)**: Use Google Scholar tools when the user needs academic papers, citations, or author profiles."
        )

    if not external_tool_instructions:
        external_tool_instructions.append(
            "- **External Knowledge**: External web and scholar tools are disabled for this request. Answer strictly from vault data and internal reasoning."
        )

    prompt = NOCTUA_SYSTEM_PROMPT.replace(
        "### 📝 Citation Format",
        "\n".join(external_tool_instructions) + "\n\n### 📝 Citation Format",
    )

    agent = Agent(
        model=resolve_model(settings.reasoning_model),
        system_prompt=prompt,
        deps_type=None,
        tools=tools,
        toolsets=toolsets,
    )
    agent.tool_plain(_run_noctua_command)
    return agent


# Backward-compatible default agent for CLI flows.
noctua_agent = build_noctua_agent()
