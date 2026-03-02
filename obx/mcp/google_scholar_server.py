from __future__ import annotations

from typing import Optional, List, Dict, Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("google-scholar")

try:
    from scholarly import scholarly  # type: ignore
except Exception:  # pragma: no cover
    scholarly = None


def _dependency_error() -> str:
    return (
        "Google Scholar MCP dependency is missing. Install it with: "
        "`pip install scholarly` (or add it to your project dependencies)."
    )


@mcp.tool()
def search_google_scholar_key_words(query: str, num_results: int = 5) -> List[Dict[str, Any]] | str:
    if scholarly is None:
        return _dependency_error()

    search_iter = scholarly.search_pubs(query)
    results: List[Dict[str, Any]] = []
    for _ in range(max(1, num_results)):
        try:
            pub = next(search_iter)
        except StopIteration:
            break

        bib = pub.get("bib", {})
        results.append(
            {
                "title": bib.get("title"),
                "author": bib.get("author"),
                "year": bib.get("pub_year"),
                "venue": bib.get("venue"),
                "url": pub.get("pub_url") or pub.get("eprint_url"),
                "citations": pub.get("num_citations"),
            }
        )
    return results


@mcp.tool()
def search_google_scholar_advanced(
    query: str,
    author: Optional[str] = None,
    year_range: Optional[tuple[int, int]] = None,
    num_results: int = 5,
) -> List[Dict[str, Any]] | str:
    if scholarly is None:
        return _dependency_error()

    year_low: Optional[int] = None
    year_high: Optional[int] = None
    if year_range:
        year_low, year_high = year_range

    search_iter = scholarly.search_pubs(
        query=query,
        author=author,
        year_low=year_low,
        year_high=year_high,
    )
    results: List[Dict[str, Any]] = []
    for _ in range(max(1, num_results)):
        try:
            pub = next(search_iter)
        except StopIteration:
            break

        bib = pub.get("bib", {})
        results.append(
            {
                "title": bib.get("title"),
                "author": bib.get("author"),
                "year": bib.get("pub_year"),
                "venue": bib.get("venue"),
                "abstract": bib.get("abstract"),
                "url": pub.get("pub_url") or pub.get("eprint_url"),
                "citations": pub.get("num_citations"),
            }
        )
    return results


@mcp.tool()
def get_author_info(author_name: str) -> Dict[str, Any] | str:
    if scholarly is None:
        return _dependency_error()

    author_iter = scholarly.search_author(author_name)
    try:
        author = next(author_iter)
    except StopIteration:
        return {"error": f"No author found for '{author_name}'"}

    author_filled = scholarly.fill(author, sections=["basics", "indices", "counts"])
    return {
        "name": author_filled.get("name"),
        "affiliation": author_filled.get("affiliation"),
        "interests": author_filled.get("interests", []),
        "hindex": author_filled.get("hindex"),
        "i10index": author_filled.get("i10index"),
        "citedby": author_filled.get("citedby"),
        "scholar_id": author_filled.get("scholar_id"),
        "url_picture": author_filled.get("url_picture"),
    }


if __name__ == "__main__":
    mcp.run()
