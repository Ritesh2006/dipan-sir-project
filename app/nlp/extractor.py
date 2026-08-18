"""Modular NLP Information Extraction Engine for VIP Executive & Ministerial Meetings."""

import re
from typing import Dict, Any, Optional
from app.nlp.normalizer import TextNormalizer
from app.nlp.rules import ExtractionRules
from app.nlp.schemas import VipMeetingRecord
from app.utils.helpers import get_current_date
from app.utils.logger import logger


class InformationExtractor:
    """Extracts structured entities from speech transcripts into VipMeetingRecord models."""

    def __init__(self):
        self.normalizer = TextNormalizer()
        self.rules = ExtractionRules()

    def extract(self, transcript: str) -> VipMeetingRecord:
        """Process transcript and extract VipMeetingRecord Pydantic model."""
        if not transcript or not transcript.strip():
            return VipMeetingRecord()

        norm_text = self.normalizer.normalize(transcript)

        # 1. Speaker / Dignitary
        speaker = None
        speaker_match = re.search(r'\b(?:minister|secretary|chairman|president|governor|director|chief|dr|mr|mrs|ms)\b\.?\s*([a-zA-Z]+(?:\s+[a-zA-Z]+)?)', norm_text, re.IGNORECASE)
        if speaker_match:
            raw_speaker = speaker_match.group(0).strip()
            action_verbs = r'\b(?:approved|passed|sanctioned|agreed|signed|cleared|rejected|denied|cancelled|disapproved|deferred|postponed|pending|delayed|review|reviewed|discussion)\b'
            cleaned_speaker = re.sub(action_verbs, '', raw_speaker, flags=re.IGNORECASE).strip()
            speaker = cleaned_speaker.title() if cleaned_speaker else raw_speaker.title()
        else:
            first_words = norm_text.split()[:2]
            if len(first_words) > 0 and first_words[0].isalpha():
                speaker = " ".join(first_words).title()

        # 2. Decision / Action
        decision = "Under Discussion"
        if re.search(r'\b(?:approved|passed|sanctioned|agreed|signed|cleared)\b', norm_text, re.IGNORECASE):
            decision = "Approved"
        elif re.search(r'\b(?:rejected|denied|cancelled|disapproved)\b', norm_text, re.IGNORECASE):
            decision = "Rejected"
        elif re.search(r'\b(?:deferred|postponed|pending|delayed)\b', norm_text, re.IGNORECASE):
            decision = "Deferred"
        elif re.search(r'\b(?:review|under review|discussion)\b', norm_text, re.IGNORECASE):
            decision = "Under Review"

        # 3. Amount / Budget
        amount = self.rules.extract_amount(norm_text)
        amount_str = f"${amount:,.2f}" if amount else "N/A"

        # 4. Topic / Agenda
        topic = norm_text.title()

        record = VipMeetingRecord(
            speaker=speaker or "Dignitary / Official",
            topic=topic,
            decision=decision,
            amount=amount_str,
            date=get_current_date()
        )

        logger.info(f"Extracted VIP Meeting Record from transcript '{transcript}': {record.to_excel_row()}")
        return record
