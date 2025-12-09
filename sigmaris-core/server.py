# server.py  (part 1/2)
# ============================================================
# Sigmaris AEI Core + Persona Core 完全版
# ============================================================

from __future__ import annotations

import os
import json
from dataclasses import asdict
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# -----------------------------------------
# .env 読み込み
# -----------------------------------------
load_dotenv()

# ============================================================
# AEI Core 依存モジュール
# ============================================================

from aei.identity import IdentityCore
from aei.adapter import LLMAdapter
from aei.reflection import ReflectionCore
from aei.introspection import IntrospectionCore
from aei.psychology.longterm import LongTermPsychology
from aei.psychology.meta_reflection import MetaReflectionCore
from aei.reward import RewardCore
from aei.emotion.emotion_core import EmotionCore
from aei.value.value_core import ValueCore

# EpisodeStore（AEI / Persona Core 共用）
from persona_core.memory.episode_store import EpisodeStore

# ------------------------------------------------------------
# Persona OS（旧）互換レイヤ
# ------------------------------------------------------------
from persona_core.persona_os import PersonaOS
from persona_core.config import PersonaOSConfig
from persona_core.types import PersonaContext, Message

# ------------------------------------------------------------
# Persona DB / MemoryDB
# ------------------------------------------------------------
from persona_db.memory_db import MemoryDB          # 既存 AEI/成長ログ用
from persona_core.persona_db import PersonaDB      # Persona OS 完全版用 JSON DB

# ------------------------------------------------------------
# Persona Core 完全版依存
# ------------------------------------------------------------
from persona_core.types.core_types import PersonaRequest

from persona_core.memory.selective_recall import SelectiveRecall
from persona_core.memory.episode_merger import EpisodeMerger
from persona_core.memory.ambiguity_resolver import AmbiguityResolver
from persona_core.memory.memory_orchestrator import MemoryOrchestrator

from persona_core.identity.identity_continuity import IdentityContinuityEngineV3
from persona_core.value.value_drift_engine import ValueDriftEngine, ValueState
from persona_core.trait.trait_drift_engine import TraitDriftEngine, TraitState
from persona_core.state.global_state_machine import GlobalStateMachine

from persona_core.controller.persona_controller import (
    PersonaController,
    PersonaControllerConfig,
)

from persona_core.llm.openai_llm_client import OpenAILLMClient


# ============================================================
# AEI Core 初期化
# ============================================================

identity = IdentityCore()
episodes = EpisodeStore()

# 旧 PersonaOS（ブリッジ用途）
persona_os = PersonaOS(PersonaOSConfig())

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
USE_REAL_API = OPENAI_KEY not in (None, "", "0", "false", "False")


# ============================================================
# LLM Adapter utility
# ============================================================

def make_llm_adapter(dummy_json: str) -> LLMAdapter:
    """実 API / ダミーを切り替えるユーティリティ。"""
    if USE_REAL_API:
        return LLMAdapter(api_key=OPENAI_KEY)
    return LLMAdapter(test_mode=True, dummy_fn=lambda _prompt: dummy_json)


# ------------------------------------------------------------
# 各種 AEI LLM Adapter
# ------------------------------------------------------------
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
# FastAPI 初期化
# ============================================================

app = FastAPI(title="Sigmaris AEI Core API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """ヘルスチェック用。"""
    return {"status": "ok", "service": "sigmaris-aei-core"}


# ============================================================
# AEI Core Modules
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
# Persona Core v2（完全版）初期化
# ============================================================

persona_model_name = os.getenv("SIGMARIS_PERSONA_MODEL", "gpt-4.1")

persona_llm_client = OpenAILLMClient(
    model=persona_model_name,
    temperature=0.7,
    max_tokens=1200,
    api_key=OPENAI_KEY,
)

# EpisodeStore を memory_backend として使用（AEI と共有）
memory_backend = episodes
embedding_model = persona_llm_client  # encode/similarity を提供

# --- 記憶統合レイヤ ---
selective_recall = SelectiveRecall(
    memory_backend=memory_backend,
    embedding_model=embedding_model,
)
episode_merger = EpisodeMerger(memory_backend=memory_backend)
ambiguity_resolver = AmbiguityResolver(embedding_model=embedding_model)

memory_orchestrator = MemoryOrchestrator(
    selective_recall=selective_recall,
    episode_merger=episode_merger,
    ambiguity_resolver=ambiguity_resolver,
)

identity_v3 = IdentityContinuityEngineV3()
value_engine = ValueDriftEngine()
trait_engine = TraitDriftEngine()
global_fsm = GlobalStateMachine()

# PersonaDB（Value/Trait Drift / Episode 永続化用・JSON backend）
persona_db = PersonaDB()

persona_controller = PersonaController(
    config=PersonaControllerConfig(default_user_id="system"),
    memory_orchestrator=memory_orchestrator,
    identity_engine=identity_v3,
    value_engine=value_engine,
    trait_engine=trait_engine,
    global_fsm=global_fsm,
    episode_store=episodes,   # 既存 EpisodeStore をそのまま利用
    persona_db=persona_db,    # PersonaDB 永続化を有効化（記憶完全版）
    llm_client=persona_llm_client,
    initial_value_state=ValueState(),
    initial_trait_state=TraitState(),
)


# ============================================================
# PersonaOS Bridge（旧 PersonaOS 互換層）
# ============================================================

def bridge_reflection(user_text: str, summary: dict) -> None:
    msg = Message(role="meta", content=user_text)
    ctx = PersonaContext(user_id="system", session_id="reflection")
    persona_os.feed_reflection(msg, summary, ctx)


def bridge_reward(res: dict) -> None:
    persona_os.feed_reward(res)


def bridge_emotion(res: dict) -> None:
    persona_os.feed_emotion(res)


def bridge_value(res: dict) -> None:
    persona_os.feed_value(res)


# ============================================================
# Pydantic Models
# ============================================================

class LogInput(BaseModel):
    text: str
    episode_id: Optional[str] = None


class SyncInput(BaseModel):
    chat: Dict[str, Any]
    context: Dict[str, Any]


# 旧 PersonaOS 用入力
class PersonaDecisionInput(BaseModel):
    user: str
    context: Dict[str, Any]
    session_id: str
    user_id: str


# Persona Core v2 用入力モデル
class PersonaRequestModel(BaseModel):
    message: str


class ValueStateModel(BaseModel):
    stability: float
    openness: float
    safety_bias: float
    user_alignment: float


class TraitStateModel(BaseModel):
    calm: float
    empathy: float
    curiosity: float


class PersonaDecisionV2Input(BaseModel):
    """
    /persona/v2/decision 用の完全版入力スキーマ。
    """
    user_id: str
    request: PersonaRequestModel
    value_state: ValueStateModel
    trait_state: TraitStateModel
    overload_score: Optional[float] = None
    safety_flag: Optional[str] = None
    prev_global_state: Optional[str] = None


# ============================================================
# AEI Core API
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
# Identity Sync（Next.js → AEI）
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
# PersonaOS Decision API（旧システム）
# ============================================================

@app.post("/persona/decision")
def api_persona_decision(data: PersonaDecisionInput):
    """
    従来どおりの PersonaOS（旧 sigmaris_persona_core）を使った意思決定。
    """
    msg = Message(role="user", content=data.user)

    ctx = PersonaContext(
        user_id=data.user_id,
        session_id=data.session_id,
        extra=data.context,
    )

    try:
        decision = persona_os.process(incoming=msg, context=ctx)
        decision_dict = asdict(decision)
    except Exception as e:
        return {"error": "persona_os_process_failed", "detail": str(e)}

    return {
        "decision": decision_dict,
        "identity": identity.export_state(),
    }
    # server.py  (part 2/2)

# ============================================================
# Persona Core v2 Decision API（完全版 Persona OS）
# ============================================================

@app.post("/persona/v2/decision")
def api_persona_v2_decision(data: PersonaDecisionV2Input):
    """
    新 Persona Core（記憶完全版）の PersonaController を使った応答生成。
    旧 PersonaOS とは独立に動作する。
    """

    # 必須フィールドから PersonaRequest を構築
    preq = PersonaRequest(
        message=data.request.message,
        user_id=data.user_id,
        # v2 では session_id を外部入力に依存させない。なければ user_id ベースで固定。
        session_id=data.user_id,
        context={},  # 将来 Next.js 側と連携する場合に拡張
    )

    try:
        result = persona_controller.handle_turn(
            preq,
            user_id=data.user_id,
            safety_flag=data.safety_flag,
            overload_score=data.overload_score,
            reward_signal=0.0,
            affect_signal=None,
        )
    except Exception as e:
        return {"error": "persona_v2_process_failed", "detail": str(e)}

    return {
        "reply": result.reply_text,
        "global_state": result.global_state.to_dict(),
        "meta": result.meta,
    }


# ============================================================
# PersonaDB TEST API（MemoryDB を利用した既存可視化系）
# ============================================================

@app.get("/persona_db/growth_logs")
def api_persona_db_growth_logs(user_id: str = "system", limit: int = 20):
    """
    こちらは既存 MemoryDB（SQLite 等）を使った成長ログの可視化 API。
    Persona OS 完全版の JSON PersonaDB とは役割が異なる。
    """
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
    """
    episodes テーブルに対しては MemoryDB の公開 API を使う。
    （スキーマ内部実装に依存しないようにする）
    """
    db = MemoryDB(user_id=user_id)
    records = db.load_recent_episodes(limit=int(limit))

    episodes_list = []
    for r in records:
        episodes_list.append(
            {
                "id": r.id,
                "ts": r.ts,
                "session_id": r.session_id,
                "role": r.role,
                "content": r.content,
                "topic_hint": r.topic_hint,
                "emotion_hint": r.emotion_hint,
                "importance": r.importance,
                "meta": r.meta,
            }
        )

    return {"user_id": user_id, "episodes": episodes_list, "count": len(episodes_list)}


@app.get("/db/growth")
def api_db_growth(user_id: str = "system", limit: int = 50):
    db = MemoryDB(user_id=user_id)
    logs = db.get_recent_growth_logs(limit=limit)
    return {"user_id": user_id, "count": len(logs), "logs": logs}