"""
TrustLens AI - Compensation Anomaly Detection Engine
=====================================================
Trains an Isolation Forest model on synthetic salary data to flag
suspicious / fraudulent compensation submissions.

Pipeline
--------
  CSV  →  Preprocess  →  Encode  →  Scale  →  Train  →  Score  →  Save

Output files (written to models/)
-----------------------------------
  models/isolation_forest.joblib   – trained IsolationForest
  models/preprocessor.joblib       – fitted ColumnTransformer (for inference)
  models/scored_dataset.csv        – original data + anomaly scores & predictions

Usage
-----
  python anomaly_detector.py                        # train + save
  python anomaly_detector.py --csv path/to/file.csv # custom dataset path

Dependencies
------------
  pip install pandas scikit-learn joblib

Python 3.11 compatible.
"""

from __future__ import annotations

import argparse
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, MinMaxScaler, OrdinalEncoder

warnings.filterwarnings("ignore")   # keep hackathon output clean

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR   = Path(__file__).resolve().parent
DATA_DIR   = BASE_DIR.parents[2] / "data"          # backend/../../data
MODELS_DIR = BASE_DIR / "models"

DEFAULT_CSV   = DATA_DIR   / "compensation_dataset.csv"
MODEL_PATH    = MODELS_DIR / "isolation_forest.joblib"
PREPROCESSOR_PATH = MODELS_DIR / "preprocessor.joblib"
SCORED_CSV    = MODELS_DIR / "scored_dataset.csv"

# ---------------------------------------------------------------------------
# Feature Definitions
# ---------------------------------------------------------------------------

# Categorical columns that need to be label-encoded
CATEGORICAL_FEATURES: list[str] = [
    "company",
    "role",
    "location",
    "level",
    "workArrangement",
]

# Numeric columns that will be scaled to [0, 1]
NUMERIC_FEATURES: list[str] = [
    "yearsOfExperience",
    "baseSalary",
    "bonus",
    "stockGrant",
    "totalCompensation",
]

# Columns we'll engineer from existing fields (added in preprocessing)
ENGINEERED_FEATURES: list[str] = [
    "bonus_to_base_ratio",       # flags impossibly high bonus percentages
    "stock_to_base_ratio",       # flags unrealistic RSU grants
    "tc_to_base_ratio",          # should always be ≥ 1; catches broken totals
    "salary_per_year_exp",       # flags interns with senior pay
]

# All features fed into the model
ALL_FEATURES: list[str] = CATEGORICAL_FEATURES + NUMERIC_FEATURES + ENGINEERED_FEATURES

# ---------------------------------------------------------------------------
# Isolation Forest Hyper-parameters
# ---------------------------------------------------------------------------
# contamination: expected fraction of outliers in the training data.
# We know our synthetic dataset is ~5.7% anomalous, so we use 0.06.
# In production you'd tune this via cross-validation or domain knowledge.
CONTAMINATION   = 0.06
N_ESTIMATORS    = 200   # more trees → more stable scores
MAX_SAMPLES     = "auto"
RANDOM_STATE    = 42


# ---------------------------------------------------------------------------
# Step 1 – Load Data
# ---------------------------------------------------------------------------

def load_data(csv_path: str | Path = DEFAULT_CSV) -> pd.DataFrame:
    """
    Read the compensation CSV into a DataFrame.

    Raises FileNotFoundError if the path doesn't exist so the user
    gets a clear error message rather than a cryptic pandas traceback.
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {csv_path}.\n"
            "Run dataset_generator.py first to create it."
        )

    df = pd.read_csv(csv_path)
    print(f"[Load]  {len(df):,} rows loaded from {csv_path.name}")
    print(f"        Columns : {list(df.columns)}")
    print(f"        Anomalies in ground truth: {df['isAnomaly'].sum():,} "
          f"({df['isAnomaly'].mean()*100:.1f}%)\n")
    return df


# ---------------------------------------------------------------------------
# Step 2 – Feature Engineering
# ---------------------------------------------------------------------------

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Derive ratio features that make anomalies easier to detect.

    Rationale
    ---------
    Isolation Forest works best when outliers are actually isolated in
    feature space. Raw dollar amounts alone don't separate an intern
    with $300 k from a legitimate Staff engineer with $300 k — but the
    salary_per_year_exp feature does.
    """
    df = df.copy()

    # Avoid division by zero: replace 0 experience with 0.5 (6 months)
    safe_exp  = df["yearsOfExperience"].replace(0, 0.5)
    safe_base = df["baseSalary"].replace(0, 1)        # avoid /0 for $0 base

    df["bonus_to_base_ratio"]  = df["bonus"]              / safe_base
    df["stock_to_base_ratio"]  = df["stockGrant"]         / safe_base
    df["tc_to_base_ratio"]     = df["totalCompensation"]  / safe_base
    df["salary_per_year_exp"]  = df["baseSalary"]         / safe_exp

    # Cap extreme ratios to 50× so a single outlier can't dominate scaling
    for col in ENGINEERED_FEATURES:
        df[col] = df[col].clip(upper=50)

    print(f"[Engineer] Added {len(ENGINEERED_FEATURES)} ratio features: {ENGINEERED_FEATURES}\n")
    return df


# ---------------------------------------------------------------------------
# Step 3 – Build Preprocessor
# ---------------------------------------------------------------------------

def build_preprocessor() -> ColumnTransformer:
    """
    Create a sklearn ColumnTransformer that:
      • OrdinalEncoder  → converts category strings to integers
      • MinMaxScaler    → scales all numeric/engineered columns to [0, 1]

    We use OrdinalEncoder (instead of OneHotEncoder) because Isolation
    Forest is tree-based and handles ordinal integers naturally. One-hot
    encoding would balloon the feature space unnecessarily.
    """
    categorical_transformer = OrdinalEncoder(
        handle_unknown="use_encoded_value",
        unknown_value=-1,       # unseen categories at inference time → -1
    )

    numeric_transformer = MinMaxScaler()

    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", categorical_transformer, CATEGORICAL_FEATURES),
            ("num", numeric_transformer,     NUMERIC_FEATURES + ENGINEERED_FEATURES),
        ],
        remainder="drop",       # drop uuid, isAnomaly, anomalyType, etc.
    )

    return preprocessor


# ---------------------------------------------------------------------------
# Step 4 – Train
# ---------------------------------------------------------------------------

def train(
    df: pd.DataFrame,
    contamination: float = CONTAMINATION,
) -> tuple[IsolationForest, ColumnTransformer, np.ndarray]:
    """
    Fit the preprocessor and Isolation Forest on the full dataset.

    Parameters
    ----------
    df            : engineered DataFrame (output of engineer_features)
    contamination : expected fraction of outliers

    Returns
    -------
    model         : fitted IsolationForest
    preprocessor  : fitted ColumnTransformer (needed for inference later)
    X_transformed : the scaled feature matrix (used for scoring below)
    """
    print("[Train] Fitting preprocessor …")
    preprocessor = build_preprocessor()
    X_transformed = preprocessor.fit_transform(df[ALL_FEATURES])

    print(f"        Feature matrix shape: {X_transformed.shape}")
    print(f"[Train] Training Isolation Forest  "
          f"(n_estimators={N_ESTIMATORS}, contamination={contamination}) …")

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        max_samples=MAX_SAMPLES,
        contamination=contamination,
        random_state=RANDOM_STATE,
        n_jobs=-1,              # use all available CPU cores
    )
    model.fit(X_transformed)

    print("[Train] ✓ Model trained successfully.\n")
    return model, preprocessor, X_transformed


# ---------------------------------------------------------------------------
# Step 5 – Score & Generate Fraud Probability
# ---------------------------------------------------------------------------

def score(
    model: IsolationForest,
    X_transformed: np.ndarray,
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Attach anomaly scores and a fraud probability estimate to the DataFrame.

    Isolation Forest outputs
    ------------------------
    predict()       → +1 (normal) or -1 (anomaly)
    score_samples() → raw anomaly score; more negative = more anomalous

    Fraud Probability
    -----------------
    sklearn's score_samples() doesn't give a calibrated probability.
    We convert the raw scores to a [0, 1] range with MinMax scaling
    and then invert so that higher values = higher fraud risk.
    This is a pragmatic, hackathon-friendly approximation — in production
    you would calibrate with Platt scaling or isotonic regression.
    """
    df = df.copy()

    # Raw IF predictions: -1 = anomaly, +1 = normal
    raw_predictions = model.predict(X_transformed)

    # Raw anomaly scores (lower = more anomalous)
    raw_scores = model.score_samples(X_transformed)

    # --- Convert raw score to fraud probability -------------------------
    # 1. Shift to [0, 1] with MinMax (0 = least anomalous, 1 = most)
    score_min, score_max = raw_scores.min(), raw_scores.max()
    normalized = (raw_scores - score_min) / (score_max - score_min + 1e-9)

    # 2. Invert: high normalized score = low anomaly, so we flip it
    fraud_probability = 1.0 - normalized

    # --- Attach to DataFrame -------------------------------------------
    df["if_prediction"]    = raw_predictions          # -1 or +1
    df["anomaly_score"]    = raw_scores.round(6)      # raw IF score
    df["fraud_probability"] = fraud_probability.round(4)   # [0, 1]

    # Human-readable flag: True when model predicts anomaly
    df["predicted_anomaly"] = df["if_prediction"] == -1

    return df


# ---------------------------------------------------------------------------
# Step 6 – Evaluate (against ground-truth labels)
# ---------------------------------------------------------------------------

def evaluate(scored_df: pd.DataFrame) -> None:
    """
    Quick precision / recall summary against the ground-truth isAnomaly label.

    This is a sanity check, not a rigorous evaluation. In a real project
    you'd use stratified cross-validation and a held-out test set.
    """
    from sklearn.metrics import classification_report, confusion_matrix

    y_true = scored_df["isAnomaly"].astype(int)
    y_pred = scored_df["predicted_anomaly"].astype(int)

    print("[Evaluate] Classification Report (ground truth vs IF predictions)")
    print("-" * 60)
    print(classification_report(y_true, y_pred, target_names=["Normal", "Anomaly"]))

    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()
    print(f"  Confusion Matrix  TP={tp}  FP={fp}  TN={tn}  FN={fn}\n")


# ---------------------------------------------------------------------------
# Step 7 – Persist Artefacts
# ---------------------------------------------------------------------------

def save_artefacts(
    model: IsolationForest,
    preprocessor: ColumnTransformer,
    scored_df: pd.DataFrame,
) -> None:
    """
    Persist the trained model, preprocessor, and scored dataset to disk.

    Why save the preprocessor separately?
    Because at inference time we need to apply the *same* transformations
    that were fitted on the training data. Saving it alongside the model
    ensures consistent feature encoding for new submissions.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(model,        MODEL_PATH)
    joblib.dump(preprocessor, PREPROCESSOR_PATH)

    # Drop the internal engineered features from the saved CSV to keep it
    # readable, but keep the new score columns.
    output_cols = [c for c in scored_df.columns if c not in ENGINEERED_FEATURES]
    scored_df[output_cols].to_csv(SCORED_CSV, index=False)

    print("[Save]  Artefacts written:")
    print(f"        Model        → {MODEL_PATH}")
    print(f"        Preprocessor → {PREPROCESSOR_PATH}")
    print(f"        Scored CSV   → {SCORED_CSV}\n")


# ---------------------------------------------------------------------------
# Inference Helper (for use by the FastAPI router at prediction time)
# ---------------------------------------------------------------------------

def load_model_and_preprocessor(
    model_path: str | Path = MODEL_PATH,
    preprocessor_path: str | Path = PREPROCESSOR_PATH,
) -> tuple[IsolationForest, ColumnTransformer]:
    """
    Load the persisted model and preprocessor from disk.

    Usage in FastAPI
    ----------------
        model, preprocessor = load_model_and_preprocessor()
        result = predict_single(submission_dict, model, preprocessor)
    """
    model        = joblib.load(model_path)
    preprocessor = joblib.load(preprocessor_path)
    return model, preprocessor


def predict_single(
    submission: dict,
    model: IsolationForest,
    preprocessor: ColumnTransformer,
) -> dict:
    """
    Score a single new salary submission dict at inference time.

    Parameters
    ----------
    submission   : dict with the same keys as ALL_FEATURES
                   (company, role, level, …, baseSalary, bonus, …)
    model        : loaded IsolationForest
    preprocessor : loaded ColumnTransformer

    Returns
    -------
    dict with keys:
        predicted_anomaly  (bool)
        anomaly_score      (float, raw IF score)
        fraud_probability  (float, 0-1)
    """
    # Build a single-row DataFrame and engineer the same ratio features
    row_df = pd.DataFrame([submission])
    row_df = engineer_features(row_df)

    X = preprocessor.transform(row_df[ALL_FEATURES])

    raw_score   = float(model.score_samples(X)[0])
    prediction  = int(model.predict(X)[0])

    # Convert raw score to fraud probability using the same inversion trick.
    # Note: For production, load the training score range from a metadata file
    # so the MinMax inversion is consistent with what was seen during training.
    fraud_prob = float(np.clip(1.0 - (raw_score + 0.5), 0.0, 1.0))

    return {
        "predicted_anomaly": prediction == -1,
        "anomaly_score":     round(raw_score, 6),
        "fraud_probability": round(fraud_prob, 4),
    }


# ---------------------------------------------------------------------------
# Full Training Pipeline
# ---------------------------------------------------------------------------

def run_pipeline(csv_path: str | Path = DEFAULT_CSV) -> pd.DataFrame:
    """
    End-to-end training pipeline:
      load → engineer → train → score → evaluate → save

    Returns the scored DataFrame (useful for notebooks / testing).
    """
    print("\n" + "=" * 60)
    print("  TrustLens AI — Anomaly Detection Training Pipeline")
    print("=" * 60 + "\n")

    # 1. Load
    df = load_data(csv_path)

    # 2. Engineer
    df = engineer_features(df)

    # 3. Train
    model, preprocessor, X_transformed = train(df)

    # 4. Score
    scored_df = score(model, X_transformed, df)

    # 5. Evaluate against ground truth
    evaluate(scored_df)

    # 6. Save
    save_artefacts(model, preprocessor, scored_df)

    # --- Quick summary ------------------------------------------------------
    n_flagged = scored_df["predicted_anomaly"].sum()
    print(f"[Summary] Records flagged as anomalous : {n_flagged:,} "
          f"({n_flagged/len(scored_df)*100:.1f}%)")
    print(f"          Avg fraud probability (flagged) : "
          f"{scored_df[scored_df['predicted_anomaly']]['fraud_probability'].mean():.3f}")
    print(f"          Avg fraud probability (normal)  : "
          f"{scored_df[~scored_df['predicted_anomaly']]['fraud_probability'].mean():.3f}")
    print("\n[Done] Pipeline complete. ✓\n")

    return scored_df


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="TrustLens AI – Train the compensation anomaly detector."
    )
    parser.add_argument(
        "--csv",
        type=str,
        default=str(DEFAULT_CSV),
        help=f"Path to the compensation dataset CSV (default: {DEFAULT_CSV})",
    )
    args = parser.parse_args()

    run_pipeline(csv_path=args.csv)