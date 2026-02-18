from __future__ import annotations

import re
from typing import Literal

IntentType = Literal["weather", "comparison", "realtime_fact", "general"]


_URL_RE = re.compile(r"https?://[^\s<>\"]+")


def classify_intent(user_text: str) -> IntentType:
    t = (user_text or "").strip()
    if not t:
        return "general"

    # If the user includes URLs, treat as realtime fact retrieval.
    try:
        if _URL_RE.search(t):
            return "realtime_fact"
    except Exception:
        pass

    # Weather: city + 天気 + time hint.
    weather_keywords = ("天気", "気温", "降水", "降水確率", "湿度", "風", "予報")
    weather_time = ("今日", "明日", "明後日", "今週", "週間", "週末", "いま", "現在")
    if any(k in t for k in weather_keywords) and any(k in t for k in weather_time):
        return "weather"

    # Comparison: compare keywords + A/B separator.
    compare_keywords = ("比較", "違い", "どっち", "どちら", "vs", "VS", "対", "選ぶなら")
    if any(k in t for k in compare_keywords):
        if "と" in t or " vs " in t.lower() or "VS" in t or "vs" in t:
            return "comparison"

    # Realtime fact: time-sensitive / news / outage / cite/search words.
    realtime_keywords = (
        "最新",
        "今日",
        "昨日",
        "今週",
        "今月",
        "ニュース",
        "速報",
        "いま",
        "現状",
        "障害",
        "不具合",
        "落ちて",
        "重い",
        "遅い",
        "繋がらない",
        "つながらない",
        "ステータス",
        "料金",
        "価格",
        "リリース",
        "バージョン",
        "検索",
        "調べて",
        "ソース",
        "出典",
        "引用元",
        "一次ソース",
        "リンク",
        "URL",
        "news",
        "headline",
        "article",
        "outage",
        "status",
        "source",
        "citation",
        "browse",
        "web search",
    )
    if any(k in t for k in realtime_keywords):
        return "realtime_fact"

    return "general"

