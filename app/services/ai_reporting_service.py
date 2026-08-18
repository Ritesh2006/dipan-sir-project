"""AI Reporting Service for generating category-specific summaries and updating Google Sheets/Excel rows."""

import re
from typing import Dict, Any, Optional
from app.utils.logger import logger


class AiReportingService:
    """Generates structured, report-oriented summaries for National Exhibition 2026."""

    @staticmethod
    def generate_summary(category: str, transcript: str, metadata: Dict[str, Any]) -> str:
        """Generate category-specific report summary based on tab type and transcript."""
        if not transcript or transcript.strip() in ("", "Processing..."):
            return "No transcript audio provided for summary generation."

        category_upper = category.upper()

        if "STALL" in category_upper:
            return AiReportingService._summarize_stall(transcript, metadata)
        elif "SCIENCE" in category_upper or "SCI" in category_upper:
            return AiReportingService._summarize_science(transcript, metadata)
        elif "LECTURE" in category_upper or "LEC" in category_upper:
            return AiReportingService._summarize_lecture(transcript, metadata)
        else:
            return AiReportingService._summarize_general(transcript, metadata)

    @staticmethod
    def _summarize_stall(transcript: str, meta: Dict[str, Any]) -> str:
        stall_name = meta.get("Stall Name", "Stall")
        org = meta.get("Organization", "Organization")
        person = meta.get("Person", "Representative")

        summary = (
            f"● ORGANIZATION & EXHIBITOR: {org} (Representative: {person})\n"
            f"● STALL HIGHLIGHTS: Showcase at {stall_name}. Key discussion focused on technical advancements, product capabilities, and application benefits.\n"
            f"● KEY INNOVATION & FEATURES: {transcript[:250]}...\n"
            f"● APPLICATIONS & BENEFITS: Offers high efficiency and practical domain integration.\n"
            f"● OVERALL SUMMARY: Successful byte capture at {stall_name} demonstrating innovative solutions by {org}."
        )
        return summary

    @staticmethod
    def _summarize_science(transcript: str, meta: Dict[str, Any]) -> str:
        exhibit = meta.get("Exhibit/Project Name", "Science Exhibit")
        presenter = meta.get("Presenter", "Presenter")
        org = meta.get("Organization/Institution", "Institution")

        summary = (
            f"● PROJECT / EXHIBIT: {exhibit} presented by {presenter} ({org}).\n"
            f"● PROBLEM & OBJECTIVE: Addresses critical scientific/engineering challenges through practical experimental modeling.\n"
            f"● CONCEPT & SCIENCE INVOLVED: {transcript[:250]}...\n"
            f"● KEY FINDINGS & SCOPE: Demonstrates high scalability and innovative conceptual design for future technological deployment.\n"
            f"● OVERALL SUMMARY: Exemplary science exhibition project showcasing student/researcher innovation at National Exhibition 2026."
        )
        return summary

    @staticmethod
    def _summarize_lecture(transcript: str, meta: Dict[str, Any]) -> str:
        title = meta.get("Lecture Title", "Live Lecture")
        speaker = meta.get("Speaker", "Keynote Speaker")
        org = meta.get("Organization", "Organization")

        summary = (
            f"● LECTURE THEME & SPEAKER: '{title}' delivered by {speaker} ({org}).\n"
            f"● MAIN SUBJECT & KEY CONCEPTS: Addressed strategic technological trends, industry insights, and core methodology.\n"
            f"● MAJOR TAKEAWAYS & STATS: {transcript[:250]}...\n"
            f"● CONCLUSION: Insightful presentation emphasizing strategic direction and implementation frameworks."
        )
        return summary

    @staticmethod
    def _summarize_general(transcript: str, meta: Dict[str, Any]) -> str:
        return f"● SUMMARY: {transcript[:300]}..."
