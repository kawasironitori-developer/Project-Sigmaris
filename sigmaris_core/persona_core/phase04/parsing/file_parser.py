from __future__ import annotations

import ast
import re
from typing import Any, Dict, Optional, Tuple


def _clamp(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[: max(0, n - 1)] + "…"


def _decode_text(data: bytes) -> Tuple[str, Dict[str, Any]]:
    """
    Best-effort text decode (no external deps).
    Prefers UTF-8; falls back to UTF-8 with replacement.
    """
    try:
        return data.decode("utf-8"), {"encoding": "utf-8", "errors": "strict"}
    except Exception:
        return data.decode("utf-8", errors="replace"), {"encoding": "utf-8", "errors": "replace"}


def _token_estimate(text: str) -> int:
    # Rough heuristic: 1 token ~= 4 chars in English; Japanese differs, but this is "best-effort".
    return max(0, int(len(text) / 4))


def _parse_markdown(text: str) -> Dict[str, Any]:
    headings = []
    code_blocks = []
    link_count = 0

    lines = text.splitlines()

    in_code = False
    code_lang = ""
    code_buf = []
    for line in lines:
        if line.startswith("```"):
            if not in_code:
                in_code = True
                code_lang = line[3:].strip()
                code_buf = []
            else:
                in_code = False
                code_blocks.append(
                    {
                        "language": code_lang or None,
                        "snippet": _clamp("\n".join(code_buf).strip(), 1200),
                    }
                )
                code_lang = ""
                code_buf = []
            continue

        if in_code:
            code_buf.append(line)
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            headings.append({"level": len(m.group(1)), "title": m.group(2).strip()})

        link_count += len(re.findall(r"\[[^\]]+\]\([^)]+\)", line))

    # Sections are extracted as a light outline only.
    return {
        "file_type": "markdown",
        "headings": headings,
        "code_blocks": code_blocks,
        "link_count": int(link_count),
        "text_excerpt": _clamp("\n".join(lines[:80]).strip(), 3000),
    }


def _parse_code(text: str, *, language_hint: Optional[str]) -> Dict[str, Any]:
    detected = (language_hint or "").lower().strip() or "unknown"

    outline = []
    notes = []

    if detected in ("py", "python"):
        try:
            tree = ast.parse(text)
            for node in tree.body:
                if isinstance(node, ast.FunctionDef):
                    outline.append({"kind": "function", "name": node.name, "lineno": int(node.lineno)})
                elif isinstance(node, ast.ClassDef):
                    outline.append({"kind": "class", "name": node.name, "lineno": int(node.lineno)})
            notes.append("parsed_with=python_ast")
        except Exception as e:
            notes.append(f"python_ast_error={type(e).__name__}")

    return {
        "file_type": "code",
        "detected_language": detected,
        "confidence": (0.9 if detected != "unknown" else 0.2),
        "outline": outline,
        "raw_excerpt": _clamp(text.strip(), 4000),
        "notes": notes,
    }


def _parse_text(text: str) -> Dict[str, Any]:
    return {
        "file_type": "text",
        "content_summary": _clamp(text.strip(), 1200),
        "raw_excerpt": _clamp(text.strip(), 3000),
        "token_estimate": _token_estimate(text),
    }


def _infer_kind(*, file_name: str, mime_type: str) -> str:
    fn = (file_name or "").lower()
    mt = (mime_type or "").lower()
    if mt.startswith("image/") or fn.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")):
        return "image"
    if fn.endswith(".md") or mt in ("text/markdown", "text/x-markdown"):
        return "markdown"
    if fn.endswith((".py", ".ts", ".tsx", ".js", ".jsx", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".cs")):
        return "code"
    return "text"


def _language_hint_from_filename(file_name: str) -> Optional[str]:
    fn = (file_name or "").lower()
    if fn.endswith(".py"):
        return "python"
    if fn.endswith(".ts") or fn.endswith(".tsx"):
        return "typescript"
    if fn.endswith(".js") or fn.endswith(".jsx"):
        return "javascript"
    if fn.endswith(".go"):
        return "go"
    if fn.endswith(".rs"):
        return "rust"
    if fn.endswith(".java"):
        return "java"
    if fn.endswith(".cs"):
        return "csharp"
    if fn.endswith(".c") or fn.endswith(".h"):
        return "c"
    if fn.endswith(".cpp"):
        return "cpp"
    return None


def parse_file_bytes(
    *,
    data: bytes,
    file_name: str,
    mime_type: str,
    kind: Optional[str],
) -> Tuple[str, Dict[str, Any]]:
    """
    Returns (kind, parsed_dict).
    Kinds: text | markdown | code | image
    """
    k = (kind or "").strip().lower() or _infer_kind(file_name=file_name, mime_type=mime_type)

    if k == "image":
        from persona_core.phase04.parsing.image_parser import parse_image_bytes

        return "image", parse_image_bytes(data=data, file_name=file_name, mime_type=mime_type)

    text, dec_meta = _decode_text(data)
    meta = {"file_name": file_name, "mime_type": mime_type, **dec_meta}

    if k == "markdown":
        out = _parse_markdown(text)
        out["metadata"] = meta
        return "markdown", out

    if k == "code":
        out = _parse_code(text, language_hint=_language_hint_from_filename(file_name))
        out["metadata"] = meta
        return "code", out

    out = _parse_text(text)
    out["metadata"] = meta
    return "text", out

