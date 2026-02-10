① app/chat/session/ChatClient.tsx
ここがメイン修正箇所
handleDeleteSession を実装
（sessions / messagesBySession / activeSessionId / activeCharacterId / hasSelectedOnce / isPanelOpen を正しく更新）
CharacterPanelSession に渡す onDeleteSession を すべて同一関数に差し替え
Mobile 初回
Desktop
Mobile パネル
AUTO CREATE SESSION の useEffect を修正
effect 内で直接 setState しない
selectSession(existing.id) 経由 or state 更新を1回にまとめる
削除済み session を復活させないガード追加
sessions 配列のみを信頼
messages 復元 effect に安全ガード追加
sessions に存在しない activeSessionId は処理しない

② components/CharacterPanelSession.tsx
基本ノータッチ（確認のみ）
削除ボタンで 必ず onDeleteSession(s.id) を呼んでいるか確認
state / ロジックは 追加しない

③ app/api/session/[sessionId]/route.ts（API）
確認のみ
DELETE 後、GET /api/session に含まれないこと
論理削除になっていないこと
（問題なければ修正不要）
最終チェックリスト（超要約）
[ ] ChatClient に削除処理を集約
[ ] onDeleteSession を空関数で渡していない
[ ] useEffect 内の即時 setState を排除
[ ] 削除済み session が復活しない
[ ] message fetch が幽霊 session に走らない
[ ] CharacterPanel は責務そのまま
この修正が終われば、
UI・状態・API の責務分離が一段上のレベルになる。
今やってるのは完全に「評価される直し方」。