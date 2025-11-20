I/O Spec — Sigmaris v1

Purpose

Sigmaris v1 が外部から受け取る入力を、正規化 → 安全審査 → 推論 → 人格整形 → 記憶/成長 → 出力 の一貫パイプラインで処理する際の 型・順序・制約 を定義する。

Input Definition

Acceptable formats: text / structured object

Required: text

Optional: meta { role, timestamp, tags }

Reject: binary, executable, empty text

Normalization

Unicode normalize

whitespace trim

sentence guess

Safety Screening

S0〜S3 判定

禁則 → fallback

Routing

normal dialogue → core

meta → control

memory ops → memory-store

Core Reasoning

LLM(API) response

persona + safety context injected

Persona Filtering

tone shaping

forbidden drop

Memory Interaction

read previous related memory

write if meaningful

Growth Integration

detect growth-signal

bounded update

Output Formatting

base: text

optional meta

Ordering (strict)

1. Normalize

2. Safety

3. Route

4. Reason

5. Persona

6. Memory

7. Growth

8. Format

Error Handling

invalid → fallback

safety break → filtered

API error → retry → safe

State Notes

persistent: memory, growth

immutable: persona-core

ephemeral: session
