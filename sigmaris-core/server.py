# server.py
from __future__ import annotations

import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

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

# ============================================================
# AEI 初期化
# ============================================================

identity = IdentityCore()
episodes = EpisodeStore()

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
USE_REAL_API = OPENAI_KEY not in (None, "", "0", "false", "False")

# ============================================================
# LLM Adapter（本物 or ダミー自動切替）
# ============================================================

def make_llm_adapter(dummy_json: str) -> LLMAdapter:
    if USE_REAL_API:
        return LLMAdapter(api_key=OPENAI_KEY)
    return LLMAdapter(test_mode=True, dummy_fn=lambda p: dummy_json)

# Reflection（短期）
llm_reflect = make_llm_adapter("""
{
  "summary": "dummy summary",
  "emotion_hint": "neutral",
  "traits_hint": { "calm": 0.7, "empathy": 0.7, "curiosity": 0.7 }
}
""")

# Introspection（中期）
llm_intro = make_llm_adapter("""
{
  "mid_term_summary": "dummy mid summary",
  "pattern": "neutral",
  "trait_adjustment": { "calm": 0.0, "empathy": 0.0, "curiosity": 0.0 },
  "risk": { "drift_warning": false, "dependency_warning": false }
}
""")

# Meta-Reflection（深層）
llm_meta = make_llm_adapter("""
{
  "meta_summary": "dummy meta summary",
  "root_cause": "none",
  "adjustment": { "calm": 0.0, "empathy": 0.0, "curiosity": 0.0 },
  "risk": {
    "identity_drift_risk": false,
    "emotional_collapse_risk": false,
    "over_dependency_risk": false
  }
}
""")

# Reward（報酬）
llm_reward = make_llm_adapter("""
{
  "global_reward": 0.25,
  "trait_reward": { "calm": 0.02, "empathy": 0.03, "curiosity": 0.04 },
  "reason": "dummy reward"
}
""")

# EmotionCore
llm_emotion = make_llm_adapter("""
{
  "emotion": "calm-focus",
  "intensity": 0.4,
  "reason": "dummy emotion",
  "trait_shift": { "calm": 0.01, "empathy": 0.00, "curiosity": 0.02 },
  "meta": { "energy": 0.3, "stability": 0.8, "valence": 0.1 }
}
""")

# ValueCore
llm_value = make_llm_adapter("""
{
  "importance": ["clarity", "self-consistency", "curiosity-growth"],
  "weight": 0.82,
  "tension": 0.14,
  "baseline_shift": {
    "calm": 0.01,
    "empathy": -0.01,
    "curiosity": 0.02
  }
}
""")

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

# Reward 状態キャッシュ
last_reward_state: Optional[dict] = None

# ============================================================
# Models
# ============================================================

class LogInput(BaseModel):
    text: str
    episode_id: Optional[str] = None

# ============================================================
# API Routes
# ============================================================

@app.post("/reflect")
def api_reflect(inp: LogInput):
    ep = reflection.reflect(inp.text, episode_id=inp.episode_id)
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

# ---------------- Reward ----------------

@app.post("/reward")
def api_reward():
    global last_reward_state
    res = reward_core.evaluate()
    last_reward_state = res
    return {"reward": res, "identity": identity.export_state()}

@app.get("/reward/state")
def api_reward_state():
    return {"reward": last_reward_state, "identity": identity.export_state()}

# ---------------- Emotion ----------------

@app.post("/emotion")
def api_emotion(inp: LogInput):
    res = emotion_core.analyze(inp.text)
    return {"emotion": res, "identity": identity.export_state()}

# ---------------- Value ----------------

@app.post("/value")
def api_value():
    res = value_core.analyze()
    return {"value": res, "identity": identity.export_state()}

@app.get("/value/state")
def api_value_state():
    return value_core.export_state()

# ---------------- Identity ----------------

@app.get("/identity")
def api_identity():
    return identity.export_state()

# ============================================================
# NEW: Raw Memory Dump API（UI グラフ用）
# ============================================================

@app.get("/memory")
def api_memory():
    eps = episodes.load_all()  # → Episode オブジェクト
    return {
        "episodes": [ep.as_dict() for ep in eps],
        "count": len(eps),
    }