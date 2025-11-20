logging.md

1. Purpose

記録・追跡・デバッグのため、アプリ全体のログ要件を定義する。

2. Logging Scopes

System Runtime Logs

Conversation Logs

Safety Layer Logs

Model Config Logs

Error / Exception Logs

3. Log Levels

INFO

WARN

ERROR

4. Required Fields

timestamp (ISO8601)

level

source (module/service)

message

metadata (optional)

5. Storage

Local: /logs/\*.log

Optional: SQLite / S3

6. Rotation

Daily rotation

Max file size: TBD

7. Privacy & Safety

個人情報は記録しない

会話データは匿名化

8. Example

2025-11-02T09:00:01Z INFO conversation "user message received" {msgId: "abc"}
