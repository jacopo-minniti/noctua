import typer
from pathlib import Path
from noctua.core.config import settings
from noctua.utils.ui import console
from noctua.utils.fs import update_note_yaml
from noctua.core.learning_parser import get_all_learning_items
from noctua.core.flashcard import calculate_memory_score
from noctua.core.exercise import calculate_exercise_score

def ensure_configured():
    if not settings.is_configured:
        console.print("[red]Error: noctua is not configured.[/red]")
        console.print("Run [bold]noctua config[/bold] to set up your vault path and API keys.")
        raise typer.Exit(code=1)

def update_note_scores(path: Path, note_items: dict, note_content: str) -> str:
    """
    Update the YAML frontmatter for a note with current memory and exercise scores.
    
    Args:
        path: Path to the note file
        note_items: Dict with 'flashcards' and 'exercises' lists for this note
        note_content: Current content of the note
        
    Returns:
        Updated content with new YAML scores
    """
    # Calculate scores based only on this note's items
    memory_score = calculate_memory_score(note_items['flashcards'])
    exercise_score = calculate_exercise_score(note_items['exercises'])
    
    # Update YAML frontmatter
    try:
        updated_content = update_note_yaml(note_content, {
            "memory": round(memory_score, 2),
            "exercise": round(exercise_score, 2),
        })
        return updated_content
    except Exception as e:
        console.print(f"[yellow]Warning: Could not update scores in {path.name}: {e}[/yellow]")
        return note_content
