**Languages:** [English](README.md) | 日本語

# sigmaris-core（Sigmaris Persona OS Engine）

`sigmaris-core` は Project Sigmaris の **バックエンド（エンジン）**です。  
FastAPI のHTTP APIを提供し、Persona OS（LLM外部制御層）を実装します。

- 記憶の取捨選択と再注入（Memory orchestration）
- セッションをまたぐ同一性（Identity continuity）
- 価値/特性のドリフト（Value/Trait drift）
- 会話状態ルーティング（Phase03）
- Safety / Guardrails
- 可観測性（`trace_id` + `meta`）

このエンジンを利用するUI:

- `sigmaris-os/`（コアを忠実に表に出すUI）
- `touhou-talk-ui/`（コアの汎用性を試す分岐UI）

---

## API

- `POST /persona/chat` → `{ reply, meta }`
- `POST /persona/chat/stream` → SSE（`start` / `delta` / `done`）

Swagger:

- `http://127.0.0.1:8000/docs`

### 最小リクエスト

```bash
curl -X POST "http://127.0.0.1:8000/persona/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"こんにちは。1文で返して。"}'
```

### Streaming（SSE）

```bash
curl -N -X POST "http://127.0.0.1:8000/persona/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"こんにちは。ストリームで返して。"}'
```

---

## Quickstart（local）

### 必要要件

- Python 3.11+ 推奨

### 1) Install

```bash
pip install -r sigmaris_core/requirements.txt
```

### 2) env 設定

最小:

- `OPENAI_API_KEY`

任意（永続化/アップロード/ストレージ連携）:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3) 起動

```bash
python -m uvicorn sigmaris_core.server:app --reload --port 8000
```

---

## 会話自然化（v1）

「面談っぽい/整理しすぎ」になりやすい応答を抑えるため、UIに依存しない **コア側の制御**として軽量レイヤを入れています。

- `session_id` 単位でパラメータ（会話の運転/スタイル）を保持
- 1ターンで大ジャンプせずに滑らかに更新
- 強制ルール（許可取りテンプレ抑制、質問は原則1つ、等）を適用

実装:

- `sigmaris_core/persona_core/phase03/naturalness_controller.py`

---

## 本番向け注意

- `SUPABASE_SERVICE_ROLE_KEY` はクライアントに出さない（サーバ側のみ）。
- ストリーミング（SSE）を使う場合、プロキシでバッファリングされない構成にする（初速が遅くなる）。
- ユーザーに近いリージョンで動かすと初回トークンが速くなる。

