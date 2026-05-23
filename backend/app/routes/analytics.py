from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import SalarySubmissionRecord

router = APIRouter()


@router.get("/analytics", summary="Get TrustLens analytics")
async def get_analytics(db: Session = Depends(get_db)) -> dict[str, Any]:
    total_submissions = db.query(SalarySubmissionRecord).count()

    if total_submissions == 0:
        return {
            "total_submissions": 0,
            "anomalies_detected": 0,
            "average_trust_score": 0,
            "fraud_rate": 0,
            "high_risk_submissions": 0,
        }

    anomalies_detected = (
        db.query(SalarySubmissionRecord)
        .filter(SalarySubmissionRecord.predicted_anomaly == True)
        .count()
    )

    high_risk_submissions = (
        db.query(SalarySubmissionRecord)
        .filter(SalarySubmissionRecord.trust_label.in_(["LOW", "CRITICAL"]))
        .count()
    )

    average_trust_score = (
        db.query(func.avg(SalarySubmissionRecord.trust_score)).scalar() or 0
    )

    fraud_rate = (anomalies_detected / total_submissions) * 100

    return {
        "total_submissions": total_submissions,
        "anomalies_detected": anomalies_detected,
        "average_trust_score": round(float(average_trust_score), 2),
        "fraud_rate": round(fraud_rate, 2),
        "high_risk_submissions": high_risk_submissions,
    }


@router.get("/recent-submissions", summary="Get recent salary validations")
async def recent_submissions(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    records = (
        db.query(SalarySubmissionRecord)
        .order_by(SalarySubmissionRecord.id.desc())
        .limit(10)
        .all()
    )

    return [
        {
            "submission_id": r.submission_id,
            "company": r.company,
            "role": r.role,
            "level": r.level,
            "trust_score": r.trust_score,
            "trust_label": r.trust_label,
            "predicted_anomaly": r.predicted_anomaly,
            "fraud_probability": r.fraud_probability,
        }
        for r in records
    ]