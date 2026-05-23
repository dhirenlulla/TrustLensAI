🚀 TrustLens AI

> AI-Powered Compensation Validation & Fraud Detection Platform

TrustLens AI is a full-stack machine learning platform designed to detect suspicious, fraudulent, or unrealistic salary submissions before they corrupt crowdsourced compensation analytics.

Built for Hackathon 2025 using FastAPI, Next.js, Scikit-learn, Isolation Forest, SQLAlchemy, and SQLite.

---

# 📌 Problem Statement

Modern salary intelligence platforms heavily depend on crowdsourced compensation submissions.

However, fake or unrealistic salary entries can:

- Distort salary benchmarks
- Mislead job seekers
- Corrupt compensation analytics
- Reduce trust in the platform
- Produce inaccurate market insights

TrustLens AI solves this problem using a hybrid approach combining:

- Machine Learning Anomaly Detection
- Business Rule Validation
- Statistical Compensation Analysis
- Real-Time Trust Scoring

---

# ✨ Features

## 🔍 AI Salary Validation
Real-time validation engine powered by Isolation Forest anomaly detection.

## 🧠 Fraud Probability Detection
Detects suspicious salary submissions using machine learning confidence scoring.

## 📊 Trust Score Engine
Generates a human-friendly trust score between 0–100.

## 🚨 Business Rule Flagging
Flags unrealistic compensation relationships such as:
- Interns with unrealistic salaries
- Impossible bonus ratios
- Invalid experience-level mappings
- Unrealistic stock grants

## 💡 AI Explanation Engine
Explains WHY a submission was flagged using interpretable AI insights.

## 📈 Live Analytics Dashboard
Tracks:
- Total submissions
- Fraud rate
- Average trust score
- High-risk entries
- Recent validations

## 🗄️ Database Persistence
All submissions are stored using SQLite + SQLAlchemy ORM.

## 🎨 Futuristic UI
Modern glassmorphism dashboard with:
- Dynamic status indicators
- Real-time analytics
- Animated validation engine
- AI trust visualization

---

# 🧠 Machine Learning Pipeline

TrustLens AI uses an Isolation Forest anomaly detection model trained on synthetic compensation intelligence datasets.

## Model Workflow

1. Salary submission received
2. Feature engineering performed
3. Compensation ratios generated
4. Data preprocessing pipeline applied
5. Isolation Forest predicts anomaly score
6. Fraud probability calculated
7. Business rules evaluated
8. Final trust score generated

---

# 🏗️ System Architecture

```text
Frontend (Next.js + TypeScript)
        ↓
FastAPI Backend
        ↓
ML Validation Engine
(Isolation Forest + Rule Engine)
        ↓
SQLite Database
        ↓
Analytics Dashboard
```

---

# 🛠️ Tech Stack

## Frontend
- Next.js
- React
- TypeScript
- Modern CSS
- Glassmorphism UI

## Backend
- FastAPI
- Python 3.11
- SQLAlchemy
- Pydantic
- SQLite

## Machine Learning
- Scikit-learn
- Isolation Forest
- NumPy
- Pandas

## Deployment
- Vercel (Frontend)
- Railway / Render (Backend)

---

# 🌐 Live Demo

## Frontend
👉 https://trust-lens-ai-3csq.vercel.app/

## Backend API Docs
👉 https://trustlensai-vipg.onrender.com/docs

---

# 📸 Screenshots

## Dashboard
<img width="1919" height="576" alt="dashboard-trustlens" src="https://github.com/user-attachments/assets/a42660e8-c108-4738-a307-9ea9c8e1d040" />
<img width="1906" height="826" alt="image" src="https://github.com/user-attachments/assets/6bfed194-19da-45a5-af05-1a96b7ab580c" />


## Fraud Detection
<img width="1917" height="905" alt="image" src="https://github.com/user-attachments/assets/0f4c15a2-d000-4ee6-850b-afe170ccb712" />
<img width="1907" height="875" alt="image" src="https://github.com/user-attachments/assets/b118855e-5cea-4f2f-91bc-cf18737abd43" />


## Analytics Panel
<img width="1517" height="252" alt="image" src="https://github.com/user-attachments/assets/3ff3c64e-856d-48c9-ac2f-2cd87d56a74e" />

<img width="1899" height="679" alt="image" src="https://github.com/user-attachments/assets/fabd3308-a85f-44a8-af92-5ac91a38de21" />


## FastAPI Docs
<img width="1901" height="872" alt="image" src="https://github.com/user-attachments/assets/be7a9b83-5da1-47bf-a013-c005beadfed5" />
<img width="1897" height="475" alt="image" src="https://github.com/user-attachments/assets/92c03696-a340-47f0-9393-a823625b486a" />


---

# ⚙️ Local Setup

# 1️⃣ Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/TrustLensAI.git
```

---

# 2️⃣ Backend Setup

```bash
cd backend
```

## Create Virtual Environment

```bash
python -m venv venv
```

## Activate Virtual Environment

### Windows

```bash
venv\Scripts\activate
```

### Mac/Linux

```bash
source venv/bin/activate
```

## Install Dependencies

```bash
pip install -r requirements.txt
```

## Run Backend

```bash
uvicorn app.main:app --reload
```

Backend runs on:

```text
http://127.0.0.1:8000
```

---

# 3️⃣ Frontend Setup

```bash
cd frontend
```

## Install Dependencies

```bash
npm install
```

## Run Frontend

```bash
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

---

# 📡 API Endpoints

## Health Check

```http
GET /health
```

## Validate Salary Submission

```http
POST /api/v1/validate
```

## Model Status

```http
GET /api/v1/validate/status
```

## Analytics Dashboard

```http
GET /api/v1/analytics
```

## Recent Validations

```http
GET /api/v1/recent-submissions
```

---

# 🧪 Example Fraudulent Submission

```json
{
  "company": "Google",
  "role": "Software Engineer",
  "level": "Intern",
  "yearsOfExperience": 9,
  "location": "San Francisco, CA",
  "baseSalary": 500000,
  "bonus": 900000,
  "stockGrant": 2000000,
  "totalCompensation": 3400000,
  "workArrangement": "Hybrid"
}
```

---

# 📊 Example Detection Output

```json
{
  "predicted_anomaly": true,
  "fraud_probability": 0.97,
  "trust_score": 18,
  "trust_label": "CRITICAL"
}
```

---

# 🔮 Future Improvements

- PostgreSQL migration
- User authentication
- Admin moderation panel
- Real-time charts
- Advanced ensemble ML models
- Cloud-based scalable infrastructure
- Role-based analytics
- Historical anomaly tracking

---

# 👨‍💻 Author

Built for Hackathon 2026.

Developed with ❤️ using AI + Full Stack Engineering + Machine Learning.

---

# ⭐ Final Note

TrustLens AI demonstrates how machine learning can improve trust, integrity, and reliability in crowdsourced data ecosystems by detecting suspicious compensation behavior before it impacts real-world analytics.
