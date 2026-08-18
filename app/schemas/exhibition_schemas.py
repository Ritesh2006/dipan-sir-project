"""Data schemas for National Exhibition 2026 – Byte & Reporting System."""

import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from app.utils.helpers import get_current_date
from app.utils.validators import sanitize_excel_value


class StallSubmission(BaseModel):
    """Schema for Stall Tab submissions."""

    submission_id: str = Field(..., description="Unique ID e.g. STALL-001")
    timestamp: str = Field(default_factory=get_current_date)
    stall_name: str
    stall_no: str
    organization: str
    category: str
    person: str
    designation: str
    audio_link: str = "Processing..."
    image_link: str = "N/A"
    brochure_link: str = "N/A"
    transcript: str = "Processing..."
    summary: str = "Processing..."
    verification_status: str = "Submitted"

    def to_row_dict(self) -> Dict[str, Any]:
        return {
            "Submission ID": sanitize_excel_value(self.submission_id),
            "Timestamp": self.timestamp,
            "Stall Name": sanitize_excel_value(self.stall_name),
            "Stall No.": sanitize_excel_value(self.stall_no),
            "Organization": sanitize_excel_value(self.organization),
            "Category": sanitize_excel_value(self.category),
            "Person": sanitize_excel_value(self.person),
            "Designation": sanitize_excel_value(self.designation),
            "Audio Drive Link": self.audio_link,
            "Image Drive Link": self.image_link,
            "Brochure Drive Link": self.brochure_link,
            "Transcript": sanitize_excel_value(self.transcript),
            "Summary": sanitize_excel_value(self.summary),
            "Verification Status": self.verification_status,
        }


class ScienceSubmission(BaseModel):
    """Schema for Science Exhibition Tab submissions."""

    submission_id: str = Field(..., description="Unique ID e.g. SCI-001")
    timestamp: str = Field(default_factory=get_current_date)
    exhibit_name: str
    stall_no: str
    organization: str
    category: str
    presenter: str
    designation_class: str
    audio_link: str = "Processing..."
    image_link: str = "N/A"
    brochure_link: str = "N/A"
    transcript: str = "Processing..."
    summary: str = "Processing..."
    verification_status: str = "Submitted"

    def to_row_dict(self) -> Dict[str, Any]:
        return {
            "Submission ID": sanitize_excel_value(self.submission_id),
            "Timestamp": self.timestamp,
            "Exhibit/Project Name": sanitize_excel_value(self.exhibit_name),
            "Stall No.": sanitize_excel_value(self.stall_no),
            "Organization/Institution": sanitize_excel_value(self.organization),
            "Category": sanitize_excel_value(self.category),
            "Presenter": sanitize_excel_value(self.presenter),
            "Designation/Class": sanitize_excel_value(self.designation_class),
            "Audio Drive Link": self.audio_link,
            "Image Drive Link": self.image_link,
            "Brochure Drive Link": self.brochure_link,
            "Transcript": sanitize_excel_value(self.transcript),
            "Summary": sanitize_excel_value(self.summary),
            "Verification Status": self.verification_status,
        }


class LectureSubmission(BaseModel):
    """Schema for Live Lecture Tab submissions."""

    submission_id: str = Field(..., description="Unique ID e.g. LEC-001")
    timestamp: str = Field(default_factory=get_current_date)
    lecture_title: str
    speaker: str
    designation: str
    organization: str
    topic_category: str
    date_time: str
    audio_link: str = "Processing..."
    image_link: str = "N/A"
    brochure_link: str = "N/A"
    transcript: str = "Processing..."
    summary: str = "Processing..."
    verification_status: str = "Submitted"

    def to_row_dict(self) -> Dict[str, Any]:
        return {
            "Submission ID": sanitize_excel_value(self.submission_id),
            "Timestamp": self.timestamp,
            "Lecture Title": sanitize_excel_value(self.lecture_title),
            "Speaker": sanitize_excel_value(self.speaker),
            "Designation": sanitize_excel_value(self.designation),
            "Organization": sanitize_excel_value(self.organization),
            "Topic/Category": sanitize_excel_value(self.topic_category),
            "Date/Time": sanitize_excel_value(self.date_time),
            "Audio Drive Link": self.audio_link,
            "Image Drive Link": self.image_link,
            "Brochure Drive Link": self.brochure_link,
            "Transcript": sanitize_excel_value(self.transcript),
            "Summary": sanitize_excel_value(self.summary),
            "Verification Status": self.verification_status,
        }
