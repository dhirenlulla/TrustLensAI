"""
TrustLens AI - Synthetic Compensation Dataset Generator
========================================================
Generates a labelled CSV dataset of realistic + anomalous salary submissions.

Output
------
  data/compensation_dataset.csv   (5 000 normal + 300 anomalous rows)

Usage
-----
  python -m backend.app.ml.dataset_generator
  # or just:
  python dataset_generator.py

Dependencies
------------
  pip install faker pandas numpy

Python 3.11 compatible.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------
RANDOM_SEED = 42
rng = np.random.default_rng(RANDOM_SEED)   # numpy's modern RNG
fake = Faker()
Faker.seed(RANDOM_SEED)

# ---------------------------------------------------------------------------
# Dataset Size
# ---------------------------------------------------------------------------
N_NORMAL    = 5_000   # realistic compensation records
N_ANOMALOUS = 300     # suspicious / fraudulent records

# ---------------------------------------------------------------------------
# Domain Data
# ---------------------------------------------------------------------------

COMPANIES: list[str] = [
    "Google",
    "Microsoft",
    "Amazon",
    "ServiceNow",
    "Uber",
    "Meta",
    "Netflix",
]

# Each role maps to a (level → salary_band_usd) dictionary.
# Salary bands are (min, max) base salary in USD, reflecting rough market data.
ROLE_LEVEL_SALARY: dict[str, dict[str, tuple[int, int]]] = {
    "Software Engineer": {
        "Intern":       (40_000,   80_000),
        "Junior":       (90_000,  130_000),
        "Mid":          (130_000, 180_000),
        "Senior":       (175_000, 240_000),
        "Staff":        (230_000, 320_000),
        "Principal":    (300_000, 420_000),
    },
    "Data Scientist": {
        "Intern":       (35_000,   75_000),
        "Junior":       (85_000,  125_000),
        "Mid":          (120_000, 170_000),
        "Senior":       (160_000, 220_000),
        "Staff":        (210_000, 300_000),
        "Principal":    (280_000, 400_000),
    },
    "Product Manager": {
        "Intern":       (45_000,   85_000),
        "Junior":       (95_000,  135_000),
        "Mid":          (135_000, 185_000),
        "Senior":       (180_000, 250_000),
        "Staff":        (240_000, 330_000),
        "Principal":    (310_000, 430_000),
    },
    "ML Engineer": {
        "Intern":       (45_000,   85_000),
        "Junior":       (100_000, 145_000),
        "Mid":          (145_000, 195_000),
        "Senior":       (190_000, 260_000),
        "Staff":        (250_000, 340_000),
        "Principal":    (320_000, 450_000),
    },
    "DevOps Engineer": {
        "Intern":       (35_000,   70_000),
        "Junior":       (80_000,  115_000),
        "Mid":          (115_000, 160_000),
        "Senior":       (155_000, 210_000),
        "Staff":        (200_000, 280_000),
        "Principal":    (265_000, 370_000),
    },
    "Engineering Manager": {
        "Intern":       (50_000,   90_000),   # unusual but keep for edge cases
        "Junior":       (110_000, 155_000),
        "Mid":          (155_000, 210_000),
        "Senior":       (205_000, 280_000),
        "Staff":        (270_000, 360_000),
        "Principal":    (340_000, 480_000),
    },
}

ROLES:  list[str] = list(ROLE_LEVEL_SALARY.keys())
LEVELS: list[str] = ["Intern", "Junior", "Mid", "Senior", "Staff", "Principal"]

# Experience ranges that make sense for each level (years)
LEVEL_EXPERIENCE: dict[str, tuple[int, int]] = {
    "Intern":    (0,  1),
    "Junior":    (1,  3),
    "Mid":       (3,  6),
    "Senior":    (6, 12),
    "Staff":     (10, 18),
    "Principal": (15, 25),
}

LOCATIONS: list[str] = [
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

# Location cost-of-living multiplier applied to base salary
LOCATION_MULTIPLIER: dict[str, float] = {
    "San Francisco, CA": 1.25,
    "Seattle, WA":       1.15,
    "New York, NY":      1.20,
    "Austin, TX":        1.00,
    "Boston, MA":        1.10,
    "Chicago, IL":       1.05,
    "Remote":            1.00,
    "Bangalore, India":  0.40,
    "London, UK":        0.95,
    "Toronto, Canada":   0.80,
}

WORK_ARRANGEMENTS: list[str] = ["Remote", "Hybrid", "On-site"]

# Bonus as a % of base salary (min %, max %)
LEVEL_BONUS_PCT: dict[str, tuple[float, float]] = {
    "Intern":    (0.00, 0.05),
    "Junior":    (0.05, 0.10),
    "Mid":       (0.08, 0.15),
    "Senior":    (0.10, 0.20),
    "Staff":     (0.15, 0.25),
    "Principal": (0.20, 0.35),
}

# Annual stock grant as a % of base salary (min %, max %)
LEVEL_STOCK_PCT: dict[str, tuple[float, float]] = {
    "Intern":    (0.00, 0.05),
    "Junior":    (0.05, 0.15),
    "Mid":       (0.10, 0.25),
    "Senior":    (0.20, 0.50),
    "Staff":     (0.40, 0.80),
    "Principal": (0.60, 1.20),
}


# ---------------------------------------------------------------------------
# Helper – round to nearest 1 000 (makes salaries look realistic)
# ---------------------------------------------------------------------------

def _round_k(value: float) -> int:
    """Round a float to the nearest 1 000."""
    return int(round(value / 1_000) * 1_000)


# ---------------------------------------------------------------------------
# Normal Record Generator
# ---------------------------------------------------------------------------

def _generate_normal_record() -> dict:
    """
    Build one realistic compensation record.

    Strategy
    --------
    1. Pick a random role and level.
    2. Look up the salary band for that (role, level) pair.
    3. Sample a base salary from a truncated normal distribution within the band.
    4. Apply a location cost-of-living multiplier.
    5. Compute bonus and stock grant as percentages of the adjusted base.
    6. Sum everything into totalCompensation.
    """

    role  = rng.choice(ROLES)
    level = rng.choice(LEVELS)

    # --- Base salary --------------------------------------------------------
    lo, hi = ROLE_LEVEL_SALARY[role][level]
    # Use a normal distribution centred on the midpoint so most salaries
    # cluster in the middle of the band rather than at the edges.
    midpoint = (lo + hi) / 2
    std_dev  = (hi - lo) / 6          # ±3 σ covers ~99.7% of the band
    raw_base = rng.normal(midpoint, std_dev)
    raw_base = float(np.clip(raw_base, lo, hi))   # hard clamp within band

    # --- Location multiplier ------------------------------------------------
    location = rng.choice(LOCATIONS)
    base_salary = _round_k(raw_base * LOCATION_MULTIPLIER[location])

    # --- Bonus --------------------------------------------------------------
    b_lo, b_hi = LEVEL_BONUS_PCT[level]
    bonus_pct   = rng.uniform(b_lo, b_hi)
    bonus       = _round_k(base_salary * bonus_pct)

    # --- Stock grant --------------------------------------------------------
    s_lo, s_hi  = LEVEL_STOCK_PCT[level]
    stock_pct   = rng.uniform(s_lo, s_hi)
    stock_grant = _round_k(base_salary * stock_pct)

    # --- Experience (correlated with level) ---------------------------------
    exp_lo, exp_hi = LEVEL_EXPERIENCE[level]
    years_exp = int(rng.integers(exp_lo, exp_hi + 1))

    return {
        "uuid":               str(uuid.uuid4()),
        "company":            rng.choice(COMPANIES),
        "role":               role,
        "level":              level,
        "yearsOfExperience":  years_exp,
        "location":           location,
        "baseSalary":         base_salary,
        "bonus":              bonus,
        "stockGrant":         stock_grant,
        "totalCompensation":  base_salary + bonus + stock_grant,
        "workArrangement":    rng.choice(WORK_ARRANGEMENTS),
        "isAnomaly":          False,
        "anomalyType":        "none",
    }


# ---------------------------------------------------------------------------
# Anomaly Record Generators
# ---------------------------------------------------------------------------

def _anomaly_intern_high_salary() -> dict:
    """
    Intern with a salary that looks like a Senior / Staff engineer.
    Classic data-entry mistake or deliberate fraud to inflate averages.
    """
    record = _generate_normal_record()
    record["level"]             = "Intern"
    record["yearsOfExperience"] = int(rng.integers(0, 2))
    # Assign a Senior-level base, ignoring the intern band
    record["baseSalary"]        = _round_k(rng.uniform(200_000, 350_000))
    record["bonus"]             = _round_k(record["baseSalary"] * rng.uniform(0.15, 0.30))
    record["stockGrant"]        = _round_k(record["baseSalary"] * rng.uniform(0.20, 0.50))
    record["totalCompensation"] = (
        record["baseSalary"] + record["bonus"] + record["stockGrant"]
    )
    record["isAnomaly"]   = True
    record["anomalyType"] = "intern_high_salary"
    return record


def _anomaly_senior_low_salary() -> dict:
    """
    Senior / Staff engineer with a salary that looks like an intern.
    Could indicate a misclassification or someone gaming the platform
    to lower reported averages for negotiation purposes.
    """
    record = _generate_normal_record()
    record["level"]             = rng.choice(["Senior", "Staff", "Principal"])
    record["yearsOfExperience"] = int(rng.integers(8, 20))
    record["baseSalary"]        = _round_k(rng.uniform(20_000, 55_000))
    record["bonus"]             = _round_k(record["baseSalary"] * rng.uniform(0.00, 0.03))
    record["stockGrant"]        = _round_k(record["baseSalary"] * rng.uniform(0.00, 0.05))
    record["totalCompensation"] = (
        record["baseSalary"] + record["bonus"] + record["stockGrant"]
    )
    record["isAnomaly"]   = True
    record["anomalyType"] = "senior_low_salary"
    return record


def _anomaly_unrealistic_stock() -> dict:
    """
    Stock grant that dwarfs the base salary by an impossible multiple.
    Typical for someone who inflated their RSU vesting or misunderstood
    cliff vs. annual vesting.
    """
    record = _generate_normal_record()
    # Stock is 5 – 20× the base salary (real maximum is ~1.2×)
    multiplier = rng.uniform(5, 20)
    record["stockGrant"]        = _round_k(record["baseSalary"] * multiplier)
    record["totalCompensation"] = (
        record["baseSalary"] + record["bonus"] + record["stockGrant"]
    )
    record["isAnomaly"]   = True
    record["anomalyType"] = "unrealistic_stock_grant"
    return record


def _anomaly_impossible_combination() -> dict:
    """
    Total compensation that is internally inconsistent:
    bonus + stock alone exceed a reasonable TC ceiling, OR
    base is 0 / negative while TC is still positive.
    """
    record = _generate_normal_record()
    choice = rng.integers(0, 3)

    if choice == 0:
        # Base salary of $0 – someone forgot to fill in the field
        record["baseSalary"]        = 0
        record["totalCompensation"] = record["bonus"] + record["stockGrant"]

    elif choice == 1:
        # Bonus > 200% of base (physically impossible for most comp plans)
        record["bonus"]             = _round_k(record["baseSalary"] * rng.uniform(2.5, 5.0))
        record["totalCompensation"] = (
            record["baseSalary"] + record["bonus"] + record["stockGrant"]
        )

    else:
        # Total comp hand-typed to a suspiciously round, enormous number
        record["totalCompensation"] = int(rng.choice([1_000_000, 2_000_000, 5_000_000]))
        record["baseSalary"]        = _round_k(record["totalCompensation"] * 0.10)
        record["bonus"]             = _round_k(record["totalCompensation"] * 0.10)
        record["stockGrant"]        = record["totalCompensation"] - record["baseSalary"] - record["bonus"]

    record["isAnomaly"]   = True
    record["anomalyType"] = "impossible_combination"
    return record


def _anomaly_experience_mismatch() -> dict:
    """
    Years of experience is wildly inconsistent with the stated level.
    E.g. a 'Junior' with 18 years of experience, or a 'Principal'
    with 0 years — suggesting copy-paste errors or intentional gaming.
    """
    record = _generate_normal_record()
    if rng.random() > 0.5:
        # Junior but highly experienced
        record["level"]            = "Junior"
        record["yearsOfExperience"] = int(rng.integers(15, 30))
    else:
        # Principal but fresh out of school
        record["level"]            = "Principal"
        record["yearsOfExperience"] = int(rng.integers(0, 2))

    record["isAnomaly"]   = True
    record["anomalyType"] = "experience_level_mismatch"
    return record


# Map each anomaly type to its generator function.
# We distribute the 300 anomalous rows proportionally across all types.
ANOMALY_GENERATORS = [
    _anomaly_intern_high_salary,
    _anomaly_senior_low_salary,
    _anomaly_unrealistic_stock,
    _anomaly_impossible_combination,
    _anomaly_experience_mismatch,
]


# ---------------------------------------------------------------------------
# Main Dataset Builder
# ---------------------------------------------------------------------------

def build_dataset(
    n_normal: int = N_NORMAL,
    n_anomalous: int = N_ANOMALOUS,
    output_path: str | Path = "data/compensation_dataset.csv",
) -> pd.DataFrame:
    """
    Generate the full synthetic compensation dataset and save it as a CSV.

    Parameters
    ----------
    n_normal : int
        Number of realistic (non-anomalous) records to generate.
    n_anomalous : int
        Number of suspicious / fraudulent records to generate.
    output_path : str | Path
        Destination path for the exported CSV file.

    Returns
    -------
    pd.DataFrame
        The combined, shuffled dataset (useful for downstream ML training).
    """

    print(f"[TrustLens] Generating {n_normal:,} normal records …")
    normal_records: list[dict] = [_generate_normal_record() for _ in range(n_normal)]

    print(f"[TrustLens] Generating {n_anomalous:,} anomalous records …")
    # Round-robin across anomaly types so every type is well represented
    anomalous_records: list[dict] = [
        ANOMALY_GENERATORS[i % len(ANOMALY_GENERATORS)]()
        for i in range(n_anomalous)
    ]

    # --- Combine & shuffle --------------------------------------------------
    all_records = normal_records + anomalous_records
    df = pd.DataFrame(all_records)

    # Shuffle rows so anomalies aren't all at the end (matters for training)
    df = df.sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

    # --- Column ordering ----------------------------------------------------
    ordered_columns = [
        "uuid",
        "company",
        "role",
        "level",
        "yearsOfExperience",
        "location",
        "baseSalary",
        "bonus",
        "stockGrant",
        "totalCompensation",
        "workArrangement",
        "isAnomaly",
        "anomalyType",
    ]
    df = df[ordered_columns]

    # --- Type enforcement ---------------------------------------------------
    # Ensure integer columns don't get written as floats (e.g. "120000.0")
    int_cols = ["yearsOfExperience", "baseSalary", "bonus", "stockGrant", "totalCompensation"]
    df[int_cols] = df[int_cols].astype(int)

    # --- Export to CSV ------------------------------------------------------
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)   # create data/ if needed
    df.to_csv(output_path, index=False)

    # --- Summary stats -------------------------------------------------------
    total   = len(df)
    n_anom  = df["isAnomaly"].sum()
    n_norm  = total - n_anom

    print("\n" + "=" * 55)
    print("  TrustLens AI — Dataset Generation Complete")
    print("=" * 55)
    print(f"  Total records   : {total:,}")
    print(f"  Normal          : {n_norm:,}  ({n_norm/total*100:.1f}%)")
    print(f"  Anomalous       : {n_anom:,}   ({n_anom/total*100:.1f}%)")
    print(f"\n  Anomaly breakdown:")
    for atype, count in df[df["isAnomaly"]]["anomalyType"].value_counts().items():
        print(f"    {atype:<35} {count:>4}")
    print(f"\n  Saved → {output_path.resolve()}")
    print("=" * 55 + "\n")

    return df


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    build_dataset()