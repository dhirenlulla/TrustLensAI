"""
TrustLens AI - Salary Validation API Route
"""

from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import SalarySubmissionRecord

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import joblib
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import IsolationForest

    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False


_ROUTES_DIR = Path(__file__).resolve().parent
_ML_DIR = _ROUTES_DIR.parent / "ml" / "models"

MODEL_PATH = _ML_DIR / "isolation_forest.joblib"
PREP_PATH = _ML_DIR / "preprocessor.joblib"
MODEL_VERSION = "v1.0.0"


CATEGORICAL_FEATURES = [
    "company",
    "role",
    "location",
    "level",
    "workArrangement",
]

NUMERIC_FEATURES = [
    "yearsOfExperience",
    "baseSalary",
    "bonus",
    "stockGrant",
    "totalCompensation",
]

ENGINEERED_FEATURES = [
    "bonus_to_base_ratio",
    "stock_to_base_ratio",
    "tc_to_base_ratio",
    "salary_per_year_exp",
]

ALL_FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES + ENGINEERED_FEATURES


VALID_COMPANIES = [
    "Google", "Microsoft", "Amazon", "ServiceNow", "Uber", "Meta", "Netflix",
]

VALID_ROLES = [
    "Software Engineer",
    "Data Scientist",
    "Product Manager",
    "ML Engineer",
    "DevOps Engineer",
    "Engineering Manager",
]

VALID_LEVELS = [
    "Intern", "Junior", "Mid", "Senior", "Staff", "Principal",
]

VALID_LOCATIONS = [
    "San Francisco, CA",
    "Seattle, WA",
    "New York, NY",
    "Austin, TX",
    "Boston, MA",
    "Chicago, IL",
    "Remote",
    "Bangalore, India",
    "London, UK",
    "Toronto, Canada",
]

VALID_WORK_ARRANGEMENTS = ["Remote", "Hybrid", "On-site"]


class SalarySubmission(BaseModel):
    company: str = Field(..., description="Employer name")
    role: str = Field(..., description="Job title / function")
    level: str = Field(..., description="Seniority level")
    yearsOfExperience: int = Field(..., ge=0, le=50)
    location: str = Field(..., description="Work location")
    baseSalary: int = Field(..., ge=0)
    bonus: int = Field(..., ge=0)
    stockGrant: int = Field(..., ge=0)
    totalCompensation: int = Field(..., ge=0)
    workArrangement: str = Field(..., description="Remote / Hybrid / On-site")

    @model_validator(mode="after")
    def check_enum_values(self) -> "SalarySubmission":
        errors = []

        if self.company not in VALID_COMPANIES:
            errors.append(f"company '{self.company}' not in {VALID_COMPANIES}")

        if self.role not in VALID_ROLES:
            errors.append(f"role '{self.role}' not in {VALID_ROLES}")

        if self.level not in VALID_LEVELS:
            errors.append(f"level '{self.level}' not in {VALID_LEVELS}")

        if self.location not in VALID_LOCATIONS:
            errors.append(f"location '{self.location}' not in {VALID_LOCATIONS}")

        if self.workArrangement not in VALID_WORK_ARRANGEMENTS:
            errors.append(
                f"workArrangement '{self.workArrangement}' not in {VALID_WORK_ARRANGEMENTS}"
            )

        if errors:
            raise ValueError("; ".join(errors))

        return self


class ValidationResponse(BaseModel):
    submission_id: str
    predicted_anomaly: bool
    anomaly_score: float
    fraud_probability: float
    trust_score: int
    trust_label: str
    flags: list[str]
    model_version: str


@lru_cache(maxsize=1)
def _load_model() -> "IsolationForest":
    if not ML_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML dependencies are not installed.",
        )

    if not MODEL_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model not found at {MODEL_PATH}",
        )

    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def _load_preprocessor() -> "ColumnTransformer":
    if not ML_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML dependencies are not installed.",
        )

    if not PREP_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Preprocessor not found at {PREP_PATH}",
        )

    return joblib.load(PREP_PATH)


def get_model() -> "IsolationForest":
    return _load_model()


def get_preprocessor() -> "ColumnTransformer":
    return _load_preprocessor()


def _engineer_features(row: dict[str, Any]) -> dict[str, Any]:
    safe_base = max(row["baseSalary"], 1)
    safe_exp = max(row["yearsOfExperience"], 1)

    row["bonus_to_base_ratio"] = min(row["bonus"] / safe_base, 50)
    row["stock_to_base_ratio"] = min(row["stockGrant"] / safe_base, 50)
    row["tc_to_base_ratio"] = min(row["totalCompensation"] / safe_base, 50)
    row["salary_per_year_exp"] = min(row["baseSalary"] / safe_exp, 50)

    return row


def _generate_flags(submission: SalarySubmission) -> list[str]:
    flags = []
    safe_base = max(submission.baseSalary, 1)

    if submission.level == "Intern" and submission.baseSalary > 120_000:
        flags.append(
            f"Intern base salary ${submission.baseSalary:,} exceeds the typical ceiling of $120k."
        )

    if submission.level in ("Senior", "Staff", "Principal") and submission.baseSalary < 60_000:
        flags.append(
            f"{submission.level} base salary ${submission.baseSalary:,} is below the market floor."
        )

    bonus_ratio = submission.bonus / safe_base
    if bonus_ratio > 2.0:
        flags.append(
            f"Bonus ${submission.bonus:,} is {bonus_ratio:.1f}x the base salary."
        )

    stock_ratio = submission.stockGrant / safe_base
    if stock_ratio > 4.0:
        flags.append(
            f"Stock grant ${submission.stockGrant:,} is {stock_ratio:.1f}x the base salary."
        )

    expected_tc = submission.baseSalary + submission.bonus + submission.stockGrant
    delta = abs(submission.totalCompensation - expected_tc)

    if delta > 10_000:
        flags.append(
            f"Total compensation ${submission.totalCompensation:,} does not match base + bonus + stock = ${expected_tc:,}."
        )

    if submission.baseSalary == 0:
        flags.append("Base salary is $0.")

    if submission.level == "Junior" and submission.yearsOfExperience > 12:
        flags.append(
            f"Junior level claimed with {submission.yearsOfExperience} years of experience."
        )

    if submission.level == "Principal" and submission.yearsOfExperience < 3:
        flags.append(
            f"Principal level claimed with only {submission.yearsOfExperience} years of experience."
        )

    return flags


def _compute_trust_score(fraud_probability: float, flags: list[str]) -> int:
    model_penalty = int(fraud_probability * 50)
    rule_penalty = min(len(flags) * 7, 35)

    return max(100 - model_penalty - rule_penalty, 0)


def _trust_label(trust_score: int) -> str:
    if trust_score >= 80:
        return "HIGH"
    if trust_score >= 55:
        return "MEDIUM"
    if trust_score >= 30:
        return "LOW"
    return "CRITICAL"


router = APIRouter()


@router.post(
    "/validate",
    response_model=ValidationResponse,
    summary="Validate a salary submission",
    status_code=status.HTTP_200_OK,
)
async def validate_submission(
    submission: SalarySubmission,
    db: Session = Depends(get_db),
    model: "IsolationForest" = Depends(get_model),
    preprocessor: "ColumnTransformer" = Depends(get_preprocessor),
) -> ValidationResponse:

    row = submission.model_dump()
    row = _engineer_features(row)

    df_row = pd.DataFrame([row])

    try:
        X = preprocessor.transform(df_row[ALL_FEATURES])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Preprocessing failed: {exc}",
        ) from exc

    raw_prediction = int(model.predict(X)[0])
    anomaly_score = float(model.score_samples(X)[0])

    # Isolation Forest gives lower scores to more suspicious records.
    # We convert the raw anomaly score into a demo-friendly risk value.

    if raw_prediction == -1:
    # If the model itself says anomaly, show high fraud risk.
        fraud_probability = 0.85
    else:
    # If model says normal, keep fraud risk lower.
    # Business rules can still reduce trust score later.
        fraud_probability = 0.15

    # If score is extremely low, slightly increase risk.
    if anomaly_score < -0.55:
        fraud_probability = max(fraud_probability, 0.9)

    fraud_probability = round(float(fraud_probability), 4)

    flags = _generate_flags(submission)

    trust_score = _compute_trust_score(fraud_probability, flags)
    label = _trust_label(trust_score)

    submission_uuid = str(uuid.uuid4())

    db_record = SalarySubmissionRecord(
        submission_id=submission_uuid,
        company=submission.company,
        role=submission.role,
        level=submission.level,
        years_of_experience=submission.yearsOfExperience,
        location=submission.location,
        base_salary=submission.baseSalary,
        bonus=submission.bonus,
        stock_grant=submission.stockGrant,
        total_compensation=submission.totalCompensation,
        work_arrangement=submission.workArrangement,
        predicted_anomaly=raw_prediction == -1,
        anomaly_score=round(anomaly_score, 6),
        fraud_probability=fraud_probability,
        trust_score=trust_score,
        trust_label=label,
        flags=", ".join(flags),
    )

    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    logger.info(
        f"Submission stored | ID={submission_uuid} | "
        f"Anomaly={raw_prediction == -1} | "
        f"TrustScore={trust_score}"
    )

    return ValidationResponse(
        submission_id=submission_uuid,
        predicted_anomaly=raw_prediction == -1,
        anomaly_score=round(anomaly_score, 6),
        fraud_probability=fraud_probability,
        trust_score=trust_score,
        trust_label=label,
        flags=flags,
        model_version=MODEL_VERSION,
    )


@router.get(
    "/validate/status",
    summary="Model readiness check",
    status_code=status.HTTP_200_OK,
)
async def model_status() -> dict[str, Any]:
    model_exists = MODEL_PATH.exists()
    prep_exists = PREP_PATH.exists()

    if not model_exists or not prep_exists:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "model_ready": model_exists,
                "preprocessor_ready": prep_exists,
                "message": "Run anomaly_detector.py first.",
            },
        )

    return {
        "status": "ready",
        "model_path": str(MODEL_PATH),
        "preprocessor_path": str(PREP_PATH),
        "model_ready": True,
        "preprocessor_ready": True,
    }