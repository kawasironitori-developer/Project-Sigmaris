# aei/adapter/llm_adapter.py
from __future__ import annotations

import json
import os
from typing import Callable, Dict, Any, Optional

from openai import OpenAI


# ============================================================
# 公開される唯一の関数型表現（AEI 全体で統一）
# ============================================================
LLMFn = Callable[[str], str]


class LLMAdapter:
    """
    Sigmaris OS — LLM Adapter
    -------------------------

    AEI Core（Python）と外部LLM（GPT等）を安全・安定に接続するレイヤ。

    - JSON を強制（暴走抑止）
    - OpenAI SDK の仕様変更を 1 箇所に隔離
    - test_mode / dummy_fn によるユニットテストが容易
    - Reflection / Introspection / LongTermPsychology が
      期待する LLMFn: (str) -> str を一貫提供
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        api_key: Optional[str] = None,
        temperature: float = 0.2,
        timeout: int = 30,
        test_mode: bool = False,
        dummy_fn: Optional[LLMFn] = None,
    ) -> None:
        """
        Parameters
        ----------
        model:
            使用する OpenAI モデル名。
            環境変数 SIGMARIS_LLM_MODEL があればそちらを優先。
        api_key:
            OpenAI API キー。未指定なら OPENAI_API_KEY を読む。
        temperature:
            サンプリング温度。0.0〜1.0 目安。
        timeout:
            ネットワークタイムアウト秒（現状は SDK 側の設定に依存。
            パラメータとして保持だけしておく）
        test_mode:
            True の場合は OpenAI API を叩かず dummy_fn を使う。
        dummy_fn:
            test_mode 用のダミー関数 (str) -> str。必ず JSON 文字列を返す必要がある。
        """
        # モデル名は環境変数で上書き可能
        env_model = os.getenv("SIGMARIS_LLM_MODEL")
        self.model = env_model or model

        self.temperature = temperature
        self.timeout = timeout
        self.test_mode = bool(test_mode)
        self.dummy_fn = dummy_fn

        # ==== OpenAI Client 初期化 ====
        if not self.test_mode:
            key = api_key or os.getenv("OPENAI_API_KEY")
            if not key:
                raise RuntimeError(
                    "OPENAI_API_KEY is not set and no api_key was given for LLMAdapter."
                )
            # openai>=1.x スタイル
            self.client = OpenAI(api_key=key)
        else:
            self.client = None  # test mode

    # ============================================================
    # コア：プロンプト → JSON文字列
    # ============================================================
    def run(self, prompt: str) -> str:
        """
        LLM にプロンプトを投げ、必ず JSON 文字列を返す。

        AEI Core（Reflection / Introspection / LongTermPsychology）は
        このメソッドだけを直接使う。
        """

        # ---- test_mode: ダミーLLM ----
        if self.test_mode:
            if self.dummy_fn is None:
                raise RuntimeError("LLMAdapter: test_mode=True but dummy_fn is None.")
            result = self.dummy_fn(prompt)
            if not isinstance(result, str):
                raise RuntimeError("LLMAdapter: dummy_fn must return a JSON string.")
            # JSON 妥当性だけ軽くチェック
            try:
                json.loads(result)
            except json.JSONDecodeError as e:
                raise RuntimeError(
                    f"LLMAdapter: dummy_fn returned invalid JSON: {e}"
                )
            return result

        # ---- OpenAI API ----
        try:
            # openai>=1.x の chat.completions.create を想定
            resp = self.client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a JSON-only engine. "
                            "Return ONLY valid JSON. No explanations. No markdown. "
                            "If you need to express text, put it into JSON fields."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=800,
                # timeout はクライアント側設定になるため、
                # ここでは self.timeout を保持しておくだけ
            )

            # 返却メッセージ構造の互換性確保
            msg = resp.choices[0].message
            if isinstance(msg, dict):
                text = (msg.get("content") or "").strip()
            else:
                # openai>=1.x の ChatCompletionMessage
                text = (msg.content or "").strip()

        except Exception as e:
            raise RuntimeError(f"LLMAdapter: OpenAI request failed: {e}")

        if not text:
            raise RuntimeError("LLMAdapter: LLM returned empty content.")

        # ---- JSON 妥当性チェック ----
        try:
            json.loads(text)
        except json.JSONDecodeError as e:
            # ここで落ちる場合はプロンプト設計かモデル側の問題
            raise RuntimeError(
                "LLMAdapter: LLM output is NOT valid JSON:\n"
                f"{text}\n"
                f"error: {e}"
            )

        return text

    # ============================================================
    # AEI が利用する関数型インターフェース
    # ============================================================
    def as_function(self) -> LLMFn:
        """
        ReflectionCore / IntrospectionCore / LongTermPsychology が
        共通で期待する “LLMFn: (str) -> str” を返す。
        """
        return self.run

    # ============================================================
    # デバッグ（JSON を dict で返す）
    # ============================================================
    def debug_run(self, prompt: str) -> Dict[str, Any]:
        """
        デバッグ用ヘルパー。
        - run() の戻り値(JSON文字列)を dict にして返す。
        """
        raw = self.run(prompt)
        return json.loads(raw)