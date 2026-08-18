"""Pydantic schemas for VIP Executive & Ministerial Meeting records."""

import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel, Field, field_validator
from app.utils.helpers import get_current_date
from app.utils.validators import sanitize_excel_value


class VipMeetingRecord(BaseModel):
    """Schema for VIP & Executive Meeting Transcripts."""

    speaker: Optional[str] = Field("Speaker / Dignitary", description="Minister, Official or Speaker Name")
    topic: Optional[str] = Field(None, description="Agenda or Topic Discussed")
    decision: Optional[str] = Field("Under Discussion", description="Action/Decision (Approved/Passed/Deferred/Under Discussion)")
    amount: Optional[str] = Field(None, description="Budget / Financial Allocation")
    date: str = Field(default_factory=get_current_date, description="Meeting Date")

    @field_validator("speaker", "topic", "decision", "amount", mode="after")
    @classmethod
    def sanitize_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return sanitize_excel_value(v.strip())
        return v

    def to_excel_row(self) -> Dict[str, Any]:
        """Convert record fields to clean dictionary formatted for Excel output."""
        return {
            "Speaker / Dignitary": sanitize_excel_value(self.speaker or "Dignitary"),
            "Topic / Agenda": sanitize_excel_value(self.topic or "General Discussion"),
            "Decision / Action": sanitize_excel_value(self.decision or "Under Discussion"),
            "Amount / Budget": sanitize_excel_value(self.amount or "N/A"),
            "Date": self.date,
        }
