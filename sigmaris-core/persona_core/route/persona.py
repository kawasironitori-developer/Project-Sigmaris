# sigmaris_persona_core/routes/persona.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from sigmaris_persona_core.persona_os import PersonaOS
from persona_db.memory_db import MemoryDB

# ------------------------------------------------------------
# Router
# ------------------------------------------------------------
router = APIRouter()

# ------------------------------------------------------------
# Request models
# ------------------------------------------------------------
class MessageModel(BaseModel):
    role: str
    content: str
    timestamp: Optional[float] = None


class PersonaRequest(BaseModel):
    user_id: str
    session_id: str
    messages: List[MessageModel]


# ------------------------------------------------------------
# PersonaOS インスタンス（user_id ごとに DB を持つ）
# ------------------------------------------------------------
def get_os(user_id: str) -> PersonaOS:
    """user_id ごとに MemoryDB を持つ PersonaOS を生成."""
    db = MemoryDB(user_id=user_id)
    return PersonaOS(user_id=user_id, db=db)


# ------------------------------------------------------------
# API: /persona/respond
# ------------------------------------------------------------
@router.post("/respond")
def persona_respond(req: PersonaRequest) -> Dict[str, Any]:
    os = get_os(req.user_id)

    try:
        # PersonaOS に問い合わせ
        result = os.process(
            session_id=req.session_id,
            messages=[
                {
                    "role": m.role,
                    "content": m.content,
                    "timestamp": m.timestamp,
                }
                for m in req.messages
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result


# ------------------------------------------------------------
# API: /persona/state
# ------------------------------------------------------------
@router.get("/state/{user_id}")
def persona_state(user_id: str) -> Dict[str, Any]:
    os = get_os(user_id)
    try:
        return os.export_state()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------
# API: /persona/memory/recent
# ------------------------------------------------------------
@router.get("/memory/recent/{user_id}")
def persona_memory_recent(user_id: str) -> Dict[str, Any]:
    db = MemoryDB(user_id=user_id)
    try:
        logs = db.get_recent_growth_logs(limit=100)
        return {"growth_log": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))