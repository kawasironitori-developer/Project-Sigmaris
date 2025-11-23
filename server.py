# server.py
from __future__ import annotations

import os
import json
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# .env 読み込み
load_dotenv()

# ====== AEI Core ======
from aei.identity import IdentityCore
from aei.episodic_memory import EpisodeStore
from aei.adapter import LLMAdapter
from aei.reflection import ReflectionCore
from aei.introspection import IntrospectionCore
from aei.psychology.longterm import LongTermPsychology
from aei.psychology.meta_reflection import MetaReflectionCore
from aei.reward import RewardCore
from aei.emotion.emotion_core import EmotionCore
from aei.value.value_core import ValueCore

# ====== Persona OS ======
from sigmaris_persona_core.persona_os import PersonaOS
from sigmaris_persona_core.config import PersonaOSConfig
from sigmaris_persona_core.types import (
    PersonaContext,
    Message,
)

# ====== Persona DB ======
from persona_db.memory_db import MemoryDB


# ============================================================
# AEI 初期化
# ============================================================

identity = IdentityCore()
episodes = EpisodeStore()

persona_config = PersonaOSConfig()
persona_os = PersonaOS(persona_config)

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
USE_REAL_API = OPENAI_KEY not in (None, "", "0", "false", "False")


# ============================================================
# LLM Adapter（実API or ダミー）
# ============================================================

def make_llm_adapter(dummy_json: str) -> LLMAdapter:
    if USE_REAL_API:
        return LLMAdapter(api_key=OPENAI_KEY)
    return LLMAdapter(test_mode=True, dummy_fn=lambda _prompt: dummy_json)


# ----- 各モジュール -----
llm_reflect = make_llm_adapter("""{
  "summary": "dummy summary",
  "emotion_hint": "neutral",
  "traits_hint": { "calm": 0.7, "empathy": 0.7, "curiosity": 0.7 }
}""")

llm_intro = make_llm_adapter("""{
  "mid_term_summary": "dummy mid summary",
  "pattern": "neutral",
  "trait_adjustment": { "calm": 0.0, "empathy": 0.0, "curiosity": 0.0 },
  "risk": { "drift_warning": false, "dependency_warning": false }
}""")

llm_meta = make_llm_adapter("""{
  "meta_summary": "dummy meta summary",
  "root_cause": "none",
  "adjustment": { "calm": 0.0, "empathy": 0.0, "curiosity": 0.0 },
  "risk": {
    "identity_drift_risk": false,
    "emotional_collapse_risk": false,
    "over_dependency_risk": false
  }
}""")

llm_reward = make_llm_adapter("""{
  "global_reward": 0.25,
  "trait_reward": { "calm": 0.02, "empathy": 0.03, "curiosity": 0.04 },
  "reason": "dummy reward"
}""")

llm_emotion = make_llm_adapter("""{
  "emotion": "calm-focus",
  "intensity": 0.4,
  "reason": "dummy emotion",
  "trait_shift": { "calm": 0.01, "empathy": 0.00, "curiosity": 0.02 },
  "meta": { "energy": 0.3, "stability": 0.8, "valence": 0.1 }
}""")

llm_value = make_llm_adapter("""{
  "importance": ["clarity", "self-consistency", "curiosity-growth"],
  "weight": 0.82,
  "tension": 0.14,
  "baseline_shift": {
    "calm": 0.01,
    "empathy": -0.01,
    "curiosity": 0.02
  }
}""")


# ============================================================
# FastAPI
# ============================================================

app = FastAPI(title="Sigmaris AEI Core API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Core modules
# ============================================================

reflection = ReflectionCore(identity, episodes, llm_reflect.as_function())
introspection = IntrospectionCore(identity, episodes, llm_intro.as_function())
longterm = LongTermPsychology(identity, episodes)
metaref = MetaReflectionCore(identity, episodes, llm_meta.as_function())
reward_core = RewardCore(identity, episodes, llm_reward.as_function())
emotion_core = EmotionCore(identity, episodes, llm_emotion.as_function())
value_core = ValueCore(identity, episodes, llm_value.as_function())

last_reward_state: Optional[Dict[str, Any]] = None


# ============================================================
# PersonaOS Bridge（AEI → PersonaOS）
# ============================================================

def bridge_reflection(user_text: str, summary: dict) -> None:
    msg = Message(role="reflection", content=user_text)
    ctx = PersonaContext(user_id="system", session_id="reflection")
    persona_os.feed_reflection(msg, summary, ctx)


def bridge_reward(reward_res: dict) -> None:
    persona_os.feed_reward(reward_res)


def bridge_emotion(emotion_res: dict) -> None:
    persona_os.feed_emotion(emotion_res)


def bridge_value(value_res: dict) -> None:
    persona_os.feed_value(value_res)


# ============================================================
# Models
# ============================================================

class LogInput(BaseModel):
    text: str
    episode_id: Optional[str] = None


class SyncInput(BaseModel):
    chat: dict
    context: dict


class PersonaDecisionInput(BaseModel):
    user: str
    context: dict
    session_id: str
    user_id: str


# ============================================================
# Normal AEI APIs
# ============================================================

@app.post("/reflect")
def api_reflect(inp: LogInput):
    ep = reflection.reflect(inp.text, episode_id=inp.episode_id)
    bridge_reflection(inp.text, ep.summary_dict())
    return {"episode": ep.as_dict(), "identity": identity.export_state()}


@app.post("/introspect")
def api_introspect():
    res = introspection.introspect()
    return {"introspection": res, "identity": identity.export_state()}


@app.post("/longterm")
def api_longterm():
    res = longterm.analyze()
    return {"longterm": res, "identity": identity.export_state()}


@app.post("/meta")
def api_meta():
    res = metaref.meta_reflect()
    return {"meta": res, "identity": identity.export_state()}


@app.post("/reward")
def api_reward():
    global last_reward_state
    res = reward_core.evaluate()
    last_reward_state = res
    bridge_reward(res)
    return {"reward": res, "identity": identity.export_state()}


@app.get("/reward/state")
def api_reward_state():
    return {"reward": last_reward_state, "identity": identity.export_state()}


@app.post("/emotion")
def api_emotion(inp: LogInput):
    res = emotion_core.analyze(inp.text)
    bridge_emotion(res)
    return {"emotion": res, "identity": identity.export_state()}


@app.post("/value")
def api_value():
    res = value_core.analyze()
    bridge_value(res)
    return {"value": res, "identity": identity.export_state()}


@app.get("/value/state")
def api_value_state():
    return value_core.export_state()


@app.get("/identity")
def api_identity():
    return identity.export_state()


@app.get("/memory")
def api_memory():
    eps = episodes.load_all()
    return {
        "episodes": [ep.as_dict() for ep in eps],
        "count": len(eps),
    }


# ============================================================
# Identity Sync（Next.js → AEI Core）
# ============================================================

@app.post("/sync")
def api_sync(data: SyncInput):
    user_text = data.chat.get("user", "")
    ai_text = data.chat.get("ai", "")

    if user_text:
        reflection.reflect(user_text)
    if ai_text:
        reflection.reflect(f"[AI_OUTPUT] {ai_text}")

    ctx_traits = data.context.get("traits", {})

    identity.update_traits(
        calm=ctx_traits.get("calm", identity.current.calm),
        empathy=ctx_traits.get("empathy", identity.current.empathy),
        curiosity=ctx_traits.get("curiosity", identity.current.curiosity),
    )

    return {
        "status": "synced",
        "identity": identity.export_state(),
        "episode_count": len(episodes.load_all()),
    }


# ============================================================
# PersonaOS Decision API（完全版）
# ============================================================

@app.post("/persona/decision")
def api_persona_decision(data: PersonaDecisionInput):
    msg = Message(role="user", content=data.user)

    ctx = PersonaContext(
        user_id=data.user_id,
        session_id=data.session_id,
        extra=data.context,
    )

    decision = persona_os.process(
        incoming=msg,
        context=ctx,
    )

    return {
        "decision": vars(decision),
        "identity": identity.export_state(),
    }


# ============================================================
# PersonaDB TEST（旧） / UI向けAPI
# ============================================================

@app.get("/persona_db/growth_logs")
def api_persona_db_growth_logs(user_id: str = "system", limit: int = 20):
    db = MemoryDB(user_id=user_id)
    logs = db.get_recent_growth_logs(limit=limit)
    return {"user_id": user_id, "count": len(logs), "logs": logs}


@app.get("/db/identity")
def api_db_identity(user_id: str = "system"):
    db = MemoryDB(user_id=user_id)
    traits = db.load_latest_traits()
    return {"user_id": user_id, "traits": traits}


@app.get("/db/concepts")
def api_db_concepts(user_id: str = "system", min_score: float = 0.0, limit: int = 64):
    db = MemoryDB(user_id=user_id)
    res = db.get_concept_map(min_score=min_score, limit=limit)
    return {"user_id": user_id, "concepts": res}


@app.get("/db/episodes")
def api_db_episodes(user_id: str = "system", limit: int = 50):
    db = MemoryDB(user_id=user_id)
    conn = db.conn
    cur = conn.cursor()

    cur.execute("""
        SELECT
            id, ts, session_id, role, content,
            topic_hint, emotion_hint, importance, meta_json
        FROM episodes
        ORDER BY id DESC
        LIMIT ?
    """, (int(limit),))

    rows = cur.fetchall()
    episodes_list = []

    for r in rows:
        try:
            meta = json.loads(r["meta_json"]) if r["meta_json"] else {}
        except Exception:
            meta = {"_parse_error": True}

        episodes_list.append({
            "id": r["id"],
            "ts": r["ts"],
            "session_id": r["session_id"],
            "role": r["role"],
            "content": r["content"],
            "topic_hint": r["topic_hint"],
            "emotion_hint": r["emotion_hint"],
            "importance": r["importance"],
            "meta": meta,
        })

    return {"user_id": user_id, "episodes": episodes_list, "count": len(episodes_list)}


@app.get("/db/growth")
def api_db_growth(user_id: str = "system", limit: int = 50):
    db = MemoryDB(user_id=user_id)
    logs = db.get_recent_growth_logs(limit=limit)
    return {"user_id": user_id, "count": len(logs), "logs": logs}