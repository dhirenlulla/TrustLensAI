from sqlalchemy import Column, Integer, String, Float, Boolean
from app.database.database import Base
from sqlalchemy import DateTime
from datetime import datetime

class SalarySubmissionRecord(Base):
    __tablename__ = "salary_submissions"

    id = Column(Integer, primary_key=True, index=True)

    submission_id = Column(String, unique=True, index=True)

    company = Column(String)
    role = Column(String)
    level = Column(String)
    years_of_experience = Column(Integer)
    location = Column(String)

    base_salary = Column(Integer)
    bonus = Column(Integer)
    stock_grant = Column(Integer)
    total_compensation = Column(Integer)

    work_arrangement = Column(String)

    predicted_anomaly = Column(Boolean)
    anomaly_score = Column(Float)
    fraud_probability = Column(Float)

    trust_score = Column(Integer)
    trust_label = Column(String)

    flags = Column(String)
    
    created_at = Column(DateTime, default=datetime.utcnow)