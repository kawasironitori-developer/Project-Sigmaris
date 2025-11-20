introspection.md

Purpose

内省（self‑reflection）の設計。過去の応答・判断を振り返り、基準の再調整を行う。

Core Concepts

過去ログの要約

判断理由の抽出

逸脱の検知

基準の微調整

Data Flow

1. 入力: conversation log / persona state

2. 分析: drift / consistency

3. 更新: persona / memory

API

reflect(logs) -> summary

updatePersona(diff)

Safety

バイアス強化の抑止

過剰学習ブロック

Notes

LV1: 過去応答の分析

LV2: 傾向の抽出

LV3: 価値観の微調整
