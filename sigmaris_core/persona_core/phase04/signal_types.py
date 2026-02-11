from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional


SourceType = Literal[
    "user_input",
    "web_search",
    "github_search",
    "file_upload_text",
    "file_upload_code",
    "file_upload_image",
    "system_generated",
    "developer_override",
]


@dataclass
class TrustProfile:
    base_trust: float
    max_impact: float
    consistency_bonus: float = 0.0
    redundancy_bonus: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "base_trust": float(self.base_trust),
            "max_impact": float(self.max_impact),
            "consistency_bonus": float(self.consistency_bonus),
            "redundancy_bonus": float(self.redundancy_bonus),
        }


@dataclass
class ExternalSignal:
    id: str
    source_type: SourceType
    origin_identifier: str
    timestamp: datetime
    raw_payload: Any
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "source_type": str(self.source_type),
            "origin_identifier": str(self.origin_identifier),
            "timestamp": self.timestamp.isoformat(),
            "raw_payload": self.raw_payload,
            "metadata": self.metadata,
        }


@dataclass
class ScoredSignal:
    signal: ExternalSignal
    trust_profile: TrustProfile
    trust_score: float
    relevance_score: float
    novelty_score: float
    recency_score: float
    flags: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "signal": self.signal.to_dict(),
            "trust_profile": self.trust_profile.to_dict(),
            "trust_score": float(self.trust_score),
            "relevance_score": float(self.relevance_score),
            "novelty_score": float(self.novelty_score),
            "recency_score": float(self.recency_score),
            "flags": self.flags,
        }


@dataclass
class CandidateDelta:
    """
    Phase04: a proposal produced by Perception (Layer 3) and evaluated by Governance (Layer 2).
    In MVP, this is informational only; Kernel application is optional/future.
    """

    target_category: str
    key: str
    operation_type: str
    delta_value: Any
    source_reference: str
    confidence: float = 0.0
    reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target_category": str(self.target_category),
            "key": str(self.key),
            "operation_type": str(self.operation_type),
            "delta_value": self.delta_value,
            "source_reference": str(self.source_reference),
            "confidence": float(self.confidence),
            "reasons": list(self.reasons),
        }


@dataclass
class GovernanceDecision:
    outcome: Literal["APPROVE", "REJECT", "DEFER", "REQUEST_VALIDATION", "TRIGGER_ROLLBACK"]
    approved: List[CandidateDelta] = field(default_factory=list)
    rejected: List[Dict[str, Any]] = field(default_factory=list)
    notes: Dict[str, Any] = field(default_factory=dict)
    snapshot_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "outcome": str(self.outcome),
            "approved": [d.to_dict() for d in self.approved],
            "rejected": self.rejected,
            "notes": self.notes,
            "snapshot_id": self.snapshot_id,
        }

