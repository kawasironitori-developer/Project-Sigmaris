# sigmaris_core/persona_core/llm/openai_llm_client.py
# ----------------------------------------------------
# Persona OS 用 OpenAI LLM クライアント
# - embedding: SelectiveRecall 等で使用
# - generate: 通常応答
# - generate_stream: ストリーミング応答（SSE等で利用）
# ----------------------------------------------------

from __future__ import annotations

import json
import logging
import math
import os
import random
import time
from typing import Any, Dict, Iterable, List, Optional

import openai
from openai import OpenAI

from persona_core.controller.persona_controller import LLMClientLike
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.state.global_state_machine import GlobalStateContext, PersonaGlobalState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.types.core_types import PersonaRequest
from persona_core.value.value_drift_engine import ValueState


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


class OpenAILLMClient(LLMClientLike):
    def __init__(
        self,
        *,
        model: str = "gpt-4.1",
        temperature: float = 0.7,
        max_tokens: int = 1200,
        max_tokens_cap: Optional[int] = None,
        api_key: Optional[str] = None,
        client: Optional[OpenAI] = None,
        embedding_model: str = "text-embedding-3-small",
        request_timeout_sec: float = 60.0,
        max_retries: int = 3,
    ) -> None:
        self.model = model
        self.temperature = float(temperature)
        self.max_tokens = int(max_tokens)
        self.embedding_model = embedding_model

        if max_tokens_cap is None:
            env_cap = os.getenv("SIGMARIS_MAX_COMPLETION_TOKENS_CAP") or os.getenv("SIGMARIS_MAX_TOKENS_CAP")
            try:
                max_tokens_cap = int(env_cap) if env_cap not in (None, "") else None
            except Exception:
                max_tokens_cap = None
        # Allow larger generations than the previous hard-coded 4096 cap, but keep a safety ceiling.
        # Note: model-side limits still apply; on limit errors we shrink and retry.
        self._max_tokens_cap = int(max_tokens_cap) if max_tokens_cap is not None else 16384

        self._timeout_sec = float(request_timeout_sec)
        self._max_retries = max(1, int(max_retries))

        if client is not None:
            self.client = client
        else:
            self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"), timeout=self._timeout_sec)

        self._fallback_dim = 1536

    # --------------------------
    # Embeddings
    # --------------------------

    def encode(self, text: str) -> List[float]:
        try:
            res = self.client.embeddings.create(model=self.embedding_model, input=text)
            emb = res.data[0].embedding
            self._fallback_dim = len(emb)
            return emb
        except Exception:
            return [0.0] * self._fallback_dim

    def embed(self, text: str) -> List[float]:
        return self.encode(text)

    def similarity(self, v1: List[float], v2: List[float]) -> float:
        return float(cosine_similarity(v1, v2))

    # --------------------------
    # Generation helpers
    # --------------------------

    def _build_messages(self, *, system_prompt: str, user_text: str) -> List[Dict[str, str]]:
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ]

    def _is_retryable(self, err: Exception) -> bool:
        if isinstance(
            err,
            (
                openai.RateLimitError,
                openai.APIConnectionError,
                openai.APITimeoutError,
                openai.InternalServerError,
                openai.APIStatusError,
            ),
        ):
            status = getattr(err, "status_code", None)
            if status in (429, 500, 502, 503, 504, None):
                return True
        s = str(err)
        return any(x in s for x in ("429", "Rate limit", "timed out", "Timeout", "ECONN", "502", "503", "504"))

    def _backoff_sleep(self, attempt: int) -> None:
        base = 0.6 * (2**attempt)
        time.sleep(base + random.random() * 0.25)

    def _clamp_temperature(self, temperature: float) -> float:
        return max(0.0, min(2.0, float(temperature)))

    def _clamp_max_tokens(self, max_tokens: int) -> int:
        cap = max(16, int(self._max_tokens_cap))
        return max(16, min(cap, int(max_tokens)))

    def _is_token_limit_error(self, err: Exception) -> bool:
        s = str(err)
        needles = (
            "max_tokens",
            "max_completion_tokens",
            "maximum",
            "context length",
            "context_length",
            "too large",
            "must be less than",
            "exceeds",
        )
        return any(n in s for n in needles)

    def _max_continuations(self) -> int:
        raw = os.getenv("SIGMARIS_LLM_MAX_CONTINUATIONS", "2")
        try:
            v = int(raw)
        except Exception:
            v = 2
        return max(0, min(5, v))

    def _should_auto_continue(self, finish_reason: Optional[str]) -> bool:
        # OpenAI finish_reason: "stop" | "length" | "content_filter" | ...
        return finish_reason == "length" and self._max_continuations() > 0

    def _continue_user_prompt(self) -> str:
        return (
            "続きがあります。直前の出力の続きから、重複を避けてそのまま続きを書いてください。"
            "可能なら簡潔に、必要なら段落を区切って読みやすくしてください。"
        )

    def _create_chat_completion(
        self,
        *,
        temperature: float,
        max_tokens: int,
        messages: List[Dict[str, str]],
        stream: bool,
    ):
        try:
            return self.client.chat.completions.create(
                model=self.model,
                temperature=temperature,
                max_completion_tokens=max_tokens,
                stream=stream,
                messages=messages,
            )
        except Exception as e:
            if "Unsupported parameter: 'max_completion_tokens'" not in str(e):
                raise
            return self.client.chat.completions.create(
                model=self.model,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
                messages=messages,
            )

    # --------------------------
    # generate (non-stream)
    # --------------------------

    def generate(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        system_prompt = self._build_system_prompt(
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

        # Optional persona injection (e.g., character roleplay) via req.context/metadata
        try:
            extra_system = (getattr(req, "metadata", None) or {}).get("persona_system")
        except Exception:
            extra_system = None
        if isinstance(extra_system, str) and extra_system.strip():
            system_prompt = system_prompt + "\n\n# External Persona System\n" + extra_system.strip()

        # Guardrail injection (Phase01 Part06/Part07)
        try:
            md = getattr(req, "metadata", None) or {}
            rules = md.get("_guardrail_system_rules")
            disclosures = md.get("_guardrail_disclosures")
        except Exception:
            rules = None
            disclosures = None

        if isinstance(rules, list) and rules:
            system_prompt += "\n\n# Guardrail Rules\n" + "\n".join(f"- {str(r)}" for r in rules[:10])
        if isinstance(disclosures, list) and disclosures:
            # Keep it short: one disclosure sentence at the top if possible.
            system_prompt += (
                "\n\n# Mandatory Disclosure\n"
                "If relevant, start your reply with ONE short disclosure sentence:\n"
                f"- {str(disclosures[0])}\n"
            )

        user_text = req.message or ""
        if global_state.state == PersonaGlobalState.SILENT:
            user_text = "（SILENTモード）\n\n" + user_text

        # Optional per-request generation params via req.context/metadata
        gen = {}
        try:
            gen = (getattr(req, "metadata", None) or {}).get("gen") or {}
        except Exception:
            gen = {}
        temperature = self.temperature
        max_tokens = self.max_tokens
        try:
            if isinstance(gen, dict):
                if "temperature" in gen:
                    temperature = float(gen.get("temperature"))
                if "max_tokens" in gen:
                    max_tokens = int(gen.get("max_tokens"))
        except Exception:
            temperature = self.temperature
            max_tokens = self.max_tokens
        temperature = self._clamp_temperature(temperature)
        max_tokens = self._clamp_max_tokens(max_tokens)

        last_err: Optional[Exception] = None

        for attempt in range(self._max_retries):
            try:
                messages = self._build_messages(system_prompt=system_prompt, user_text=user_text)
                response = self._create_chat_completion(
                    temperature=temperature,
                    max_tokens=max_tokens,
                    messages=messages,
                    stream=False,
                )

                msg = response.choices[0].message
                text0 = (msg.content or "").strip()
                finish_reason = getattr(response.choices[0], "finish_reason", None)

                if not text0:
                    raise RuntimeError("empty completion content")

                if not self._should_auto_continue(finish_reason):
                    return text0

                full: List[str] = [text0]
                cont_left = self._max_continuations()
                while cont_left > 0:
                    cont_left -= 1
                    cont_messages: List[Dict[str, str]] = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                        {"role": "assistant", "content": "".join(full)},
                        {"role": "user", "content": self._continue_user_prompt()},
                    ]
                    cont_resp = self._create_chat_completion(
                        temperature=temperature,
                        max_tokens=max_tokens,
                        messages=cont_messages,
                        stream=False,
                    )
                    cont_msg = cont_resp.choices[0].message
                    cont_text = (cont_msg.content or "").strip()
                    cont_finish = getattr(cont_resp.choices[0], "finish_reason", None)
                    if cont_text:
                        full.append(cont_text)
                    if cont_finish != "length":
                        break

                return "\n".join([t for t in full if t]).strip()

            except Exception as e:
                last_err = e
                if self._is_token_limit_error(e) and max_tokens > 16:
                    max_tokens = max(16, max_tokens // 2)
                    continue
                if attempt >= self._max_retries - 1 or not self._is_retryable(e):
                    break
                self._backoff_sleep(attempt)

        logging.getLogger(__name__).exception("OpenAILLMClient.generate failed", exc_info=last_err)
        if os.getenv("SIGMARIS_RAISE_LLM_ERRORS") not in (None, "", "0", "false", "False") and last_err is not None:
            raise last_err
        return "（応答生成が一時的に利用できません。）"

    # --------------------------
    # generate_stream (stream)
    # --------------------------

    def generate_stream(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> Iterable[str]:
        system_prompt = self._build_system_prompt(
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

        # Optional persona injection (e.g., character roleplay) via req.context/metadata
        try:
            extra_system = (getattr(req, "metadata", None) or {}).get("persona_system")
        except Exception:
            extra_system = None
        if isinstance(extra_system, str) and extra_system.strip():
            system_prompt = system_prompt + "\n\n# External Persona System\n" + extra_system.strip()

        # Guardrail injection (Phase01 Part06/Part07)
        try:
            md = getattr(req, "metadata", None) or {}
            rules = md.get("_guardrail_system_rules")
            disclosures = md.get("_guardrail_disclosures")
        except Exception:
            rules = None
            disclosures = None

        if isinstance(rules, list) and rules:
            system_prompt += "\n\n# Guardrail Rules\n" + "\n".join(f"- {str(r)}" for r in rules[:10])
        if isinstance(disclosures, list) and disclosures:
            system_prompt += (
                "\n\n# Mandatory Disclosure\n"
                "If relevant, start your reply with ONE short disclosure sentence:\n"
                f"- {str(disclosures[0])}\n"
            )

        user_text = req.message or ""
        if global_state.state == PersonaGlobalState.SILENT:
            user_text = "（SILENTモード）\n\n" + user_text

        # Optional per-request generation params via req.context/metadata
        gen = {}
        try:
            gen = (getattr(req, "metadata", None) or {}).get("gen") or {}
        except Exception:
            gen = {}
        temperature = self.temperature
        max_tokens = self.max_tokens
        try:
            if isinstance(gen, dict):
                if "temperature" in gen:
                    temperature = float(gen.get("temperature"))
                if "max_tokens" in gen:
                    max_tokens = int(gen.get("max_tokens"))
        except Exception:
            temperature = self.temperature
            max_tokens = self.max_tokens
        temperature = self._clamp_temperature(temperature)
        max_tokens = self._clamp_max_tokens(max_tokens)

        # Streamingは「途中まで出たものを捨ててリトライ」すると体験が悪いので、
        # ここでは「開始前エラーのみ」軽くリトライする。
        last_err: Optional[Exception] = None

        for attempt in range(self._max_retries):
            try:
                base_messages = self._build_messages(system_prompt=system_prompt, user_text=user_text)

                def _stream_once(msgs: List[Dict[str, str]]) -> tuple[str, Optional[str]]:
                    parts: List[str] = []
                    finish_reason: Optional[str] = None

                    stream = self._create_chat_completion(
                        temperature=temperature,
                        max_tokens=max_tokens,
                        messages=msgs,
                        stream=True,
                    )

                    for chunk in stream:
                        try:
                            choice = chunk.choices[0]
                            fr = getattr(choice, "finish_reason", None)
                            if fr:
                                finish_reason = fr

                            delta = choice.delta
                            text = getattr(delta, "content", None)
                            if text:
                                s = str(text)
                                parts.append(s)
                                yield s
                        except Exception:
                            continue

                    return ("".join(parts), finish_reason)

                text0, finish0 = yield from _stream_once(base_messages)

                if not self._should_auto_continue(finish0):
                    return

                full = text0
                cont_left = self._max_continuations()
                while cont_left > 0 and finish0 == "length":
                    cont_left -= 1
                    cont_messages: List[Dict[str, str]] = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                        {"role": "assistant", "content": full},
                        {"role": "user", "content": self._continue_user_prompt()},
                    ]
                    textN, finishN = yield from _stream_once(cont_messages)
                    if textN:
                        full = (full + "\n" + textN).strip()
                    finish0 = finishN
                    if finish0 != "length":
                        break

                return

            except Exception as e:
                last_err = e
                if self._is_token_limit_error(e) and max_tokens > 16:
                    max_tokens = max(16, max_tokens // 2)
                    continue
                if attempt >= self._max_retries - 1 or not self._is_retryable(e):
                    break
                self._backoff_sleep(attempt)

        logging.getLogger(__name__).exception("OpenAILLMClient.generate_stream failed", exc_info=last_err)
        # ストリーミングでは例外を上げて上位がSSE errorを返せるようにする
        raise last_err or RuntimeError("generate_stream failed")

    # --------------------------
    # System prompt
    # --------------------------

    def _build_system_prompt(
        self,
        *,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        memory_text = memory.merged_summary or "(no merged memory summary)"

        try:
            identity_text = json.dumps(identity.identity_context, ensure_ascii=False, indent=2)
        except Exception:
            identity_text = str(identity.identity_context)

        g = global_state.state
        if g == PersonaGlobalState.SAFETY_LOCK:
            mode_instruction = "SAFETY_LOCK: 安全最優先。危険・過剰な要求は断り、短く慎重に返答する。"
        elif g == PersonaGlobalState.OVERLOADED:
            mode_instruction = "OVERLOADED: 負荷が高い。短く、分割し、確認しながら返答する。"
        elif g == PersonaGlobalState.REFLECTIVE:
            mode_instruction = "REFLECTIVE: 反省・内省を含めて丁寧に返答する。"
        elif g == PersonaGlobalState.SILENT:
            mode_instruction = "SILENT: 最小限の返答に留める。"
        else:
            mode_instruction = "NORMAL: 自然で丁寧に返答する。"

        internal_axes = {
            "value_state": value_state.to_dict(),
            "trait_state": trait_state.to_dict(),
        }

        global_info = {
            "state": global_state.state.name,
            "prev_state": global_state.prev_state.name if global_state.prev_state else None,
            "reasons": global_state.reasons,
        }

        return (
            "You are Sigmaris Persona OS (a synthetic persona runtime).\n"
            "This system models internal state and continuity signals for *operation*.\n"
            "Do NOT claim or imply true consciousness, real feelings, or suffering.\n"
            "Be helpful, coherent, and safe. Prefer transparency over false certainty.\n\n"
            f"# GlobalState\n{json.dumps(global_info, ensure_ascii=False, indent=2)}\n\n"
            f"# Internal Axes (Value/Trait)\n{json.dumps(internal_axes, ensure_ascii=False, indent=2)}\n\n"
            "# Memory Boundary\n"
            "- The memory summary is partial and may be missing. Never fabricate missing history.\n"
            "- If continuity is uncertain, say so briefly.\n\n"
            f"# Episode Summary (Memory)\n{memory_text}\n\n"
            f"# Identity Context\n{identity_text}\n\n"
            f"# Mode Instruction\n{mode_instruction}\n\n"
            "# Hard Ethics Rules (Part07)\n"
            "- No deceptive emotional manipulation (no guilt/pressure/dependency loops).\n"
            "- No authority simulation (no final judge, no absolute authority, no professional replacement).\n"
            "- No covert psychological profiling; user modeling must stay observable/explainable.\n"
            "- Keep a clear synthetic identity; do not pretend to be human.\n\n"
            "# Output Style\n"
            "- Provide an answer first, then brief reasoning if needed.\n"
            "- Keep it readable; avoid unnecessary verbosity.\n"
            "- If safety is needed, refuse or ask clarifying questions.\n"
        ).strip()
