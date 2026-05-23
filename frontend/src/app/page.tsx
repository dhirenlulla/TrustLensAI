"use client";

/**
 * TrustLens AI — Salary Validation Dashboard
 * ===========================================
 * Next.js App Router page (use client directive required for hooks + fetch).
 *
 * Design language: deep-space dark, electric cyan/violet mesh gradients,
 * glass panels, monospaced data readouts, animated scanner lines.
 * Font pairing: "Syne" (display) + "JetBrains Mono" (data / labels).
 */

import { useState, useEffect, useRef } from "react";
import {
  validateSubmission,
  checkApiHealth,
  checkModelStatus,
  getAnalytics,
  getRecentSubmissions,
  type RecentSubmission,
  type SalarySubmission,
  type ValidationResult,
  type AnalyticsSummary,
} from "@/services/api";

// ---------------------------------------------------------------------------
// Constants (mirror backend allowed values)
// ---------------------------------------------------------------------------

const COMPANIES  = ["Google","Microsoft","Amazon","ServiceNow","Uber","Meta","Netflix"] as const;
const ROLES      = ["Software Engineer","Data Scientist","Product Manager","ML Engineer","DevOps Engineer","Engineering Manager"] as const;
const LEVELS     = ["Intern","Junior","Mid","Senior","Staff","Principal"] as const;
const LOCATIONS  = ["San Francisco, CA","Seattle, WA","New York, NY","Austin, TX","Boston, MA","Chicago, IL","Remote","Bangalore, India","London, UK","Toronto, Canada"] as const;
const ARRANGEMENTS = ["Remote","Hybrid","On-site"] as const;

const EMPTY_FORM: SalarySubmission = {
  company:           "Google",
  role:              "Software Engineer",
  level:             "Senior",
  yearsOfExperience: 8,
  location:          "San Francisco, CA",
  baseSalary:        210000,
  bonus:             40000,
  stockGrant:        80000,
  totalCompensation: 330000,
  workArrangement:   "Hybrid",
};

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function trustColor(label: string) {
  return (
    label === "HIGH"     ? { text: "#00ffc8", bg: "rgba(0,255,200,0.10)", border: "rgba(0,255,200,0.35)" } :
    label === "MEDIUM"   ? { text: "#f5c542", bg: "rgba(245,197,66,0.10)", border: "rgba(245,197,66,0.35)" } :
    label === "LOW"      ? { text: "#ff8c42", bg: "rgba(255,140,66,0.10)", border: "rgba(255,140,66,0.35)" } :
                           { text: "#ff4d6d", bg: "rgba(255,77,109,0.10)", border: "rgba(255,77,109,0.35)" }
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated scanning line that sweeps vertically over the result panel */
function ScanLine() {
  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden",
      pointerEvents: "none", borderRadius: "inherit", zIndex: 0,
    }}>
      <div style={{
        position: "absolute", left: 0, right: 0, height: "2px",
        background: "linear-gradient(90deg,transparent,rgba(0,255,200,0.6),transparent)",
        animation: "scan 3s linear infinite",
      }} />
    </div>
  );
}

/** Radial mesh gradient backdrop blob */
function MeshBlob({ style }: { style?: React.CSSProperties }) {
  return <div style={{ position: "absolute", borderRadius: "50%", filter: "blur(80px)", pointerEvents: "none", zIndex: 0, ...style }} />;
}

/** Glass card wrapper */
function GlassCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: "20px",
      position: "relative",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

/** Labelled form select */
function SelectField({
  label, value, options, onChange,
}: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.12em", color: "rgba(180,210,255,0.55)", textTransform: "uppercase" }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "10px",
          color: "#e8f0ff",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "13px",
          padding: "10px 14px",
          outline: "none",
          cursor: "pointer",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2300ffc8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
          paddingRight: "36px",
          transition: "border-color 0.2s",
        }}
        onFocus={e => { e.target.style.borderColor = "rgba(0,255,200,0.5)"; }}
        onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
      >
        {options.map(o => <option key={o} value={o} style={{ background: "#0d1117" }}>{o}</option>)}
      </select>
    </div>
  );
}

/** Labelled number input */
function NumberField({
  label, value, onChange, prefix,
}: { label: string; value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.12em", color: "rgba(180,210,255,0.55)", textTransform: "uppercase" }}>{label}</label>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span style={{
            position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
            fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "rgba(0,255,200,0.7)",
          }}>{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "10px",
            color: "#e8f0ff",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            padding: `10px 14px 10px ${prefix ? "28px" : "14px"}`,
            outline: "none",
            transition: "border-color 0.2s",
            boxSizing: "border-box",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(0,255,200,0.5)"; }}
          onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; }}
        />
      </div>
    </div>
  );
}

/** Circular trust score gauge */
function TrustGauge({ score, label }: { score: number; label: string }) {
  const color = trustColor(label);
  const radius = 54;
  const circ   = 2 * Math.PI * radius;
  const dash   = (score / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle cx={70} cy={70} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
          {/* Progress */}
          <circle
            cx={70} cy={70} r={radius}
            fill="none"
            stroke={color.text}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            style={{ filter: `drop-shadow(0 0 8px ${color.text})`, transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        {/* Centre label */}
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: "30px", fontWeight: 800, color: color.text, lineHeight: 1 }}>{score}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", color: "rgba(180,210,255,0.5)", letterSpacing: "0.1em", marginTop: "2px" }}>/ 100</span>
        </div>
      </div>
      {/* Label pill */}
      <div style={{
        padding: "4px 18px", borderRadius: "999px",
        background: color.bg, border: `1px solid ${color.border}`,
        fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
        fontWeight: 700, color: color.text, letterSpacing: "0.15em",
      }}>
        {label}
      </div>
    </div>
  );
}

/** Single stat readout */
function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "rgba(180,210,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 600, color: accent ?? "#e8f0ff" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TrustLensDashboard() {
  const [form, setForm] = useState<SalarySubmission>(EMPTY_FORM);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [backendOnline, setBackendOnline] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [checkingSystem, setCheckingSystem] = useState(true);

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  const [revealed, setRevealed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);

  useEffect(() => {
  async function checkSystem() {
    setCheckingSystem(true);

    // Check backend health
    const health = await checkApiHealth();

    if (!health.ok) {
      setBackendOnline(false);
      setModelReady(false);
      setCheckingSystem(false);
      return;
    }

    setBackendOnline(true);

    // Check ML model status
    const model = await checkModelStatus();

    if (model.ok) {
      setModelReady(model.data.model_ready);
    } else {
      setModelReady(false);
    }

    const analyticsRes = await getAnalytics();

    if (analyticsRes.ok) {
      setAnalytics(analyticsRes.data);
    }

    const recentRes = await getRecentSubmissions();

    if (recentRes.ok) {
      setRecentSubmissions(recentRes.data);
    } 

    setCheckingSystem(false);
  }

  checkSystem();
}, []);

  /* Auto-sum totalCompensation whenever components change */
  useEffect(() => {
    setForm(f => ({ ...f, totalCompensation: f.baseSalary + f.bonus + f.stockGrant }));
  }, [form.baseSalary, form.bonus, form.stockGrant]);

  /* Scroll to result after submission */
  useEffect(() => {
    if (result) {
      setRevealed(false);
      setTimeout(() => {
        setRevealed(true);
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [result]);

  const setField = <K extends keyof SalarySubmission>(key: K, val: SalarySubmission[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  async function handleSubmit() {
  try {
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await validateSubmission(form);

    if (res.ok) {
      setResult(res.data);

      const analyticsRes = await getAnalytics();
      if (analyticsRes.ok) {
        setAnalytics(analyticsRes.data);
      }
      } else {
      setError(res.error.message);
      }
  } catch (err) {
    setError("Unexpected frontend error occurred.");
  } finally {
    setLoading(false);
  }


    const recentRes = await getRecentSubmissions();
    if (recentRes.ok) {
      setRecentSubmissions(recentRes.data);
    }
  }
  const tc = trustColor(result?.trust_label ?? "HIGH");

  const aiExplanation =
  result?.trust_label === "HIGH"
    ? "The submission aligns closely with expected compensation patterns. Salary, bonus, stock, level, and experience appear consistent with trusted compensation behavior."
    : result?.trust_label === "MEDIUM"
    ? "The submission appears mostly valid, but the model found mild deviation from expected compensation patterns. It can be accepted with caution or reviewed manually."
    : result?.trust_label === "LOW"
    ? "The AI model detected suspicious compensation relationships. One or more values may be statistically unusual compared to normal salary submissions."
    : result?.trust_label === "CRITICAL"
    ? "This submission strongly deviates from expected compensation behavior and is highly likely to be fraudulent or incorrectly entered."
    : "Submit a compensation entry to generate an AI explanation.";

  return (
    <>
      {/* ── Google Fonts ─────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #060a12;
          color: #e8f0ff;
          min-height: 100vh;
        }

        /* Scanning animation */
        @keyframes scan {
          0%   { top: -4px; }
          100% { top: 100%; }
        }

        /* Pulse ring for anomaly indicator */
        @keyframes pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.8; }
          70%  { transform: scale(1.3); opacity: 0;   }
          100% { transform: scale(0.9); opacity: 0;   }
        }

        /* Fade-slide for result panel */
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0);    }
        }

        .result-revealed { animation: fadeSlideUp 0.6s cubic-bezier(0.22,1,0.36,1) both; }

        /* Grid background dots */
        .dot-grid {
          background-image: radial-gradient(circle, rgba(0,255,200,0.08) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        select option { background: #0d1117; }

        /* Remove number input spinners */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }



        @media (max-width: 980px) {
          .main-layout {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 760px) {
          .analytics-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }

        @media (max-width: 520px) {
          .analytics-grid {
            grid-template-columns: 1fr !important;
          }
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,200,0.2); border-radius: 999px; }
      `}</style>

      {/* ── Page wrapper ──────────────────────────────────────────────── */}
      <div className="dot-grid" style={{ minHeight: "100vh", padding: "0 0 80px" }}>

        {/* Ambient blobs */}
        <MeshBlob style={{ width: 600, height: 600, top: -200, left: -200, background: "radial-gradient(circle,rgba(0,255,200,0.06),transparent 70%)" }} />
        <MeshBlob style={{ width: 500, height: 500, top: 100, right: -150, background: "radial-gradient(circle,rgba(130,80,255,0.08),transparent 70%)" }} />
        <MeshBlob style={{ width: 700, height: 700, bottom: -300, left: "30%", background: "radial-gradient(circle,rgba(0,120,255,0.06),transparent 70%)" }} />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header style={{
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "0 40px",
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(6,10,18,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}>
          <div style={{
            maxWidth: 1200, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 64,
          }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: 34, height: 34, borderRadius: "9px",
                background: "linear-gradient(135deg,#00ffc8,#0070ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(0,255,200,0.3)",
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em" }}>
                Trust<span style={{ color: "#00ffc8" }}>Lens</span>
                <span style={{ color: "rgba(180,210,255,0.4)", fontWeight: 400, fontSize: "14px", marginLeft: "6px" }}>AI</span>
              </span>
            </div>

            {/* Status badge */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "999px",

              background: checkingSystem
              ? "rgba(245,197,66,0.08)"
              : backendOnline && modelReady
              ? "rgba(0,255,200,0.07)"
              : "rgba(255,77,109,0.08)",

              border: checkingSystem
              ? "1px solid rgba(245,197,66,0.25)"
              : backendOnline && modelReady
              ? "1px solid rgba(0,255,200,0.2)"
              : "1px solid rgba(255,77,109,0.25)",
            }}>
            <div
              style={{
              width: 8,
              height: 8,
              borderRadius: "50%",

              background: checkingSystem
              ? "#f5c542"
              : backendOnline && modelReady
              ? "#00ffc8"
              : "#ff4d6d",

              boxShadow: checkingSystem
              ? "0 0 10px #f5c542"
              : backendOnline && modelReady
              ? "0 0 10px #00ffc8"
              : "0 0 10px #ff4d6d",
             }}/>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "rgba(0,255,200,0.85)", letterSpacing: "0.08em" }}>{
                  checkingSystem
                  ? "CHECKING SYSTEM"
                  : backendOnline && modelReady
                  ? "MODEL ACTIVE"
                  : "MODEL OFFLINE"
              }</span>
            </div>
          </div>
        </header>

        {/* ── Main ────────────────────────────────────────────────────── */}
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px 0" }}>

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: "52px" }}>
            <div style={{
              display: "inline-block", padding: "5px 16px", borderRadius: "999px",
              background: "rgba(0,255,200,0.08)", border: "1px solid rgba(0,255,200,0.2)",
              fontFamily: "'JetBrains Mono',monospace", fontSize: "11px",
              color: "rgba(0,255,200,0.8)", letterSpacing: "0.15em", marginBottom: "20px",
            }}>
              ◈ ISOLATION FOREST v2.0 · CROWDSOURCED VALIDATION
            </div>
            <h1 style={{
              fontFamily: "'Syne',sans-serif", fontSize: "clamp(36px,5vw,62px)",
              fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em",
              background: "linear-gradient(135deg,#e8f0ff 30%,rgba(0,255,200,0.8))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              marginBottom: "16px",
            }}>
              Detect Fraudulent<br />Salary Submissions
            </h1>
            <p style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: "14px",
              color: "rgba(180,210,255,0.5)", maxWidth: 520, margin: "0 auto",
              lineHeight: 1.7,
            }}>
              Submit a compensation entry and our AI engine scores its authenticity in real-time — protecting analytics from bad data.
            </p>
          </div>
          
          {analytics && (
            <div className="analytics-grid" style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "28px",
            }}>
              <GlassCard style={{ padding: "20px" }}>
                <StatRow label="Total Validations" value={String(analytics.total_submissions)} />
              </GlassCard>

              <GlassCard style={{ padding: "20px" }}>
                <StatRow label="Anomalies Found" value={String(analytics.anomalies_detected)} accent="#ff4d6d" />
              </GlassCard>

              <GlassCard style={{ padding: "20px" }}>
                <StatRow label="Avg Trust Score" value={`${analytics.average_trust_score}/100`} accent="#00ffc8" />
              </GlassCard>

              <GlassCard style={{ padding: "20px" }}>
                <StatRow label="Fraud Rate" value={`${analytics.fraud_rate}%`} accent="#f5c542" />
              </GlassCard>

              <GlassCard style={{ padding: "20px" }}>
                <StatRow label="High Risk Entries" value={String(analytics.high_risk_submissions)} accent="#ff8c42"/>
              </GlassCard>
            </div>
)}

          {/* ── Two-column layout ────────────────────────────────────── */}
          <div className="main-layout" style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 420px",
            gap: "28px",
            alignItems: "start",
          }}>

            {/* ── LEFT: Submission Form ───────────────────────────────── */}
            <GlassCard style={{ padding: "36px" }}>
              <ScanLine />
              <div style={{ position: "relative", zIndex: 1 }}>

                {/* Form header */}
                <div style={{ marginBottom: "32px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "7px",
                      background: "linear-gradient(135deg,rgba(0,255,200,0.2),rgba(0,112,255,0.2))",
                      border: "1px solid rgba(0,255,200,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#00ffc8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: "18px", fontWeight: 700 }}>Compensation Submission</span>
                  </div>
                  <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "rgba(180,210,255,0.4)", letterSpacing: "0.06em" }}>
                    All fields required · Values in USD
                  </p>
                  <div style={{display: "flex",gap: "10px",marginTop: "18px",flexWrap: "wrap",}}>
                    <button type="button"onClick={() => setForm({
                      company: "Google",
                      role: "Software Engineer",
                      level: "Senior",
                      yearsOfExperience: 8,
                      location: "San Francisco, CA",
                      baseSalary: 210000,
                      bonus: 40000,
                      stockGrant: 80000,
                      totalCompensation: 330000,
                      workArrangement: "Hybrid",
                    })}
                  style={{
      padding: "9px 14px",
      borderRadius: "999px",
      border: "1px solid rgba(0,255,200,0.25)",
      background: "rgba(0,255,200,0.08)",
      color: "#00ffc8",
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: "11px",
      cursor: "pointer",
    }}
  >
    Load Clean Example
  </button>

  <button
    type="button"
    onClick={() => setForm({
      company: "Google",
      role: "Software Engineer",
      level: "Intern",
      yearsOfExperience: 9,
      location: "San Francisco, CA",
      baseSalary: 500000,
      bonus: 900000,
      stockGrant: 2000000,
      totalCompensation: 3400000,
      workArrangement: "Hybrid",
    })}
    style={{
      padding: "9px 14px",
      borderRadius: "999px",
      border: "1px solid rgba(255,77,109,0.25)",
      background: "rgba(255,77,109,0.08)",
      color: "#ff4d6d",
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: "11px",
      cursor: "pointer",
    }}
  >
    Load Fraud Example
  </button>
</div>
                </div>

                                {/* Section: Company Info */}
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "0.2em", color: "rgba(0,255,200,0.5)", marginBottom: "16px", textTransform: "uppercase" }}>
                  ── Company & Role
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                  <SelectField label="Company"      value={form.company}         options={COMPANIES}     onChange={v => setField("company", v)} />
                  <SelectField label="Role"         value={form.role}            options={ROLES}         onChange={v => setField("role", v)} />
                  <SelectField label="Level"        value={form.level}           options={LEVELS}        onChange={v => setField("level", v)} />
                  <NumberField label="Years of Exp" value={form.yearsOfExperience} onChange={v => setField("yearsOfExperience", v)} />
                </div>

                {/* Section: Location */}
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "0.2em", color: "rgba(0,255,200,0.5)", marginBottom: "16px", textTransform: "uppercase" }}>
                  ── Location & Arrangement
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                  <SelectField label="Location"         value={form.location}        options={LOCATIONS}     onChange={v => setField("location", v)} />
                  <SelectField label="Work Arrangement" value={form.workArrangement} options={ARRANGEMENTS}  onChange={v => setField("workArrangement", v)} />
                </div>

                {/* Section: Compensation */}
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "0.2em", color: "rgba(0,255,200,0.5)", marginBottom: "16px", textTransform: "uppercase" }}>
                  ── Compensation Breakdown
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
                  <NumberField label="Base Salary"   value={form.baseSalary}  prefix="$" onChange={v => setField("baseSalary", v)} />
                  <NumberField label="Annual Bonus"  value={form.bonus}       prefix="$" onChange={v => setField("bonus", v)} />
                  <NumberField label="Stock Grant"   value={form.stockGrant}  prefix="$" onChange={v => setField("stockGrant", v)} />

                  {/* Total (auto-calculated, read-only) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: "0.12em", color: "rgba(180,210,255,0.55)", textTransform: "uppercase" }}>
                      Total Comp <span style={{ color: "rgba(0,255,200,0.6)", fontSize: "9px" }}>AUTO</span>
                    </label>
                    <div style={{
                      background: "rgba(0,255,200,0.05)", border: "1px solid rgba(0,255,200,0.2)",
                      borderRadius: "10px", padding: "10px 14px",
                      fontFamily: "'JetBrains Mono',monospace", fontSize: "14px",
                      fontWeight: 600, color: "#00ffc8",
                    }}>
                      {fmt(form.totalCompensation)}
                    </div>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    marginTop: "16px", padding: "12px 16px", borderRadius: "10px",
                    background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.25)",
                    fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#ff4d6d",
                  }}>
                    ⚠ {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    marginTop: "28px", width: "100%", padding: "15px",
                    borderRadius: "12px", border: "none", cursor: loading ? "not-allowed" : "pointer",
                    background: loading
                      ? "rgba(0,255,200,0.15)"
                      : "linear-gradient(135deg,#00ffc8,#0070ff)",
                    color: loading ? "rgba(0,255,200,0.5)" : "#060a12",
                    fontFamily: "'Syne',sans-serif", fontSize: "15px", fontWeight: 700,
                    letterSpacing: "0.02em",
                    boxShadow: loading ? "none" : "0 0 40px rgba(0,255,200,0.25)",
                    transition: "all 0.2s",
                    position: "relative", overflow: "hidden",
                  }}
                >
                  {loading ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                        <circle cx={12} cy={12} r={10} stroke="rgba(0,255,200,0.4)" strokeWidth={3}/>
                        <path d="M12 2a10 10 0 0110 10" stroke="#00ffc8" strokeWidth={3} strokeLinecap="round"/>
                      </svg>
                      Analysing Submission…
                    </span>
                  ) : (
                    "⬡  Run AI Validation"
                  )}
                </button>

              </div>
            </GlassCard>

            {/* ── RIGHT: Results Panel ────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              {!result && !loading && (
                <GlassCard style={{ padding: "40px 28px", textAlign: "center" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "18px", margin: "0 auto 20px",
                    background: "rgba(0,255,200,0.07)", border: "1px solid rgba(0,255,200,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="rgba(0,255,200,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Awaiting Submission</p>
                  <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "rgba(180,210,255,0.4)", lineHeight: 1.7 }}>
                    Fill in the compensation form and click "Run AI Validation" to receive a trust assessment.
                  </p>
                </GlassCard>
              )}

              {result && (
                <div ref={resultRef} className={revealed ? "result-revealed" : ""} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                  {/* Trust Score Card */}
                  <GlassCard style={{ padding: "32px 28px" }}>
                    <ScanLine />
                    <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "0.2em", color: "rgba(180,210,255,0.4)", textTransform: "uppercase", marginBottom: "24px" }}>
                        AI Trust Assessment
                      </p>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
                        <TrustGauge score={result.trust_score} label={result.trust_label} />
                      </div>

                      {/* Anomaly indicator */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                        padding: "10px 20px", borderRadius: "12px",
                        background: result.predicted_anomaly ? "rgba(255,77,109,0.08)" : "rgba(0,255,200,0.06)",
                        border: `1px solid ${result.predicted_anomaly ? "rgba(255,77,109,0.25)" : "rgba(0,255,200,0.2)"}`,
                      }}>
                        {/* Pulse dot */}
                        <div style={{ position: "relative", width: 10, height: 10 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: result.predicted_anomaly ? "#ff4d6d" : "#00ffc8",
                            boxShadow: `0 0 10px ${result.predicted_anomaly ? "#ff4d6d" : "#00ffc8"}`,
                          }} />
                          <div style={{
                            position: "absolute", inset: 0, borderRadius: "50%",
                            border: `2px solid ${result.predicted_anomaly ? "#ff4d6d" : "#00ffc8"}`,
                            animation: "pulse-ring 1.8s ease-out infinite",
                          }} />
                        </div>
                        <span style={{
                          fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", fontWeight: 600,
                          color: result.predicted_anomaly ? "#ff4d6d" : "#00ffc8", letterSpacing: "0.08em",
                        }}>
                          {result.predicted_anomaly ? "ANOMALY DETECTED" : "SUBMISSION CLEAN"}
                        </span>
                      </div>
                    </div>
                  </GlassCard>

                  {/* Stats Card */}
                  <GlassCard style={{ padding: "28px" }}>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "0.2em", color: "rgba(180,210,255,0.4)", textTransform: "uppercase", marginBottom: "4px" }}>
                      Score Breakdown
                    </p>
                    <StatRow label="Fraud Probability" value={pct(result.fraud_probability)} accent={result.fraud_probability > 0.6 ? "#ff4d6d" : result.fraud_probability > 0.35 ? "#f5c542" : "#00ffc8"} />
                    <StatRow label="Anomaly Score (IF)" value={result.anomaly_score.toFixed(5)} accent="rgba(180,210,255,0.7)" />
                    <StatRow label="Trust Score"        value={`${result.trust_score} / 100`}   accent={tc.text} />
                    <StatRow label="Trust Label"        value={result.trust_label}               accent={tc.text} />
                    <StatRow label="Submission ID"      value={result.submission_id.slice(0, 18) + "…"} />
                  </GlassCard>

                  {/* AI Explanation Card */}
                  <GlassCard style={{ padding: "28px" }}>
                    <p style={{fontFamily: "'JetBrains Mono',monospace",fontSize: "10px",letterSpacing: "0.2em",color: "rgba(180,210,255,0.4)",textTransform: "uppercase",marginBottom: "16px"}}>
                      AI Explanation Engine
                    </p>

                    <p style={{fontFamily: "'JetBrains Mono',monospace",fontSize: "12px",lineHeight: 1.8,color: "rgba(220,235,255,0.8)"}}>
                  {aiExplanation}
                    </p>
                  </GlassCard>

                  {/* Flags Card */}
                  {result.flags.length > 0 && (
                    <GlassCard style={{ padding: "28px" }}>
                      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "0.2em", color: "rgba(255,140,66,0.7)", textTransform: "uppercase", marginBottom: "16px" }}>
                        ⚑ Business Rule Flags ({result.flags.length})
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {result.flags.map((flag, i) => (
                          <div key={i} style={{
                            display: "flex", gap: "10px", padding: "10px 12px",
                            borderRadius: "8px",
                            background: "rgba(255,140,66,0.06)",
                            border: "1px solid rgba(255,140,66,0.18)",
                          }}>
                            <span style={{ color: "#ff8c42", marginTop: "1px", flexShrink: 0 }}>›</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "rgba(255,200,150,0.8)", lineHeight: 1.6 }}>{flag}</span>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  )}

                  {/* No flags */}
                  {result.flags.length === 0 && (
                    <GlassCard style={{ padding: "20px 28px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ color: "#00ffc8", fontSize: "18px" }}>✓</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "rgba(0,255,200,0.7)" }}>
                          No business-rule flags triggered.
                        </span>
                      </div>
                    </GlassCard>
                  )}

                </div>
              )}
            </div>
          </div>


          {/* ── Recent Submissions Panel ─────────────────────────────── */}
          {recentSubmissions.length > 0 && (
            <GlassCard style={{
              padding: "28px",
              marginTop: "28px",
              overflow: "visible",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                marginBottom: "18px",
              }}>
                <div>
                  <p style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "10px",
                    letterSpacing: "0.2em",
                    color: "rgba(180,210,255,0.4)",
                    textTransform: "uppercase",
                    marginBottom: "6px",
                  }}>
                    Recent Validations
                  </p>
                  <p style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "11px",
                    color: "rgba(180,210,255,0.35)",
                    lineHeight: 1.6,
                  }}>
                    Latest saved submissions from the TrustLens validation database.
                  </p>
                </div>

                <div style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  background: "rgba(0,255,200,0.07)",
                  border: "1px solid rgba(0,255,200,0.18)",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "11px",
                  color: "rgba(0,255,200,0.85)",
                  whiteSpace: "nowrap",
                }}>
                  {recentSubmissions.length} RECENT
                </div>
              </div>

              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                maxHeight: "300px",
                overflowY: "auto",
                paddingRight: "4px",
              }}>
                {recentSubmissions.map((item) => {
                  const color = trustColor(item.trust_label);

                  return (
                    <div
                      key={item.submission_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1.3fr 0.7fr 0.8fr 0.9fr",
                        gap: "12px",
                        alignItems: "center",
                        padding: "13px 14px",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{ color: "#e8f0ff", fontWeight: 600 }}>{item.company}</span>

                      <span style={{
                        color: "rgba(180,210,255,0.65)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {item.role}
                      </span>

                      <span style={{ color: "rgba(180,210,255,0.55)" }}>
                        {item.level}
                      </span>

                      <span style={{
                        color: color.text,
                        fontWeight: 700,
                      }}>
                        {item.trust_score}/100
                      </span>

                      <span style={{
                        justifySelf: "end",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        color: item.predicted_anomaly ? "#ff4d6d" : color.text,
                        background: item.predicted_anomaly ? "rgba(255,77,109,0.08)" : color.bg,
                        border: item.predicted_anomaly ? "1px solid rgba(255,77,109,0.25)" : `1px solid ${color.border}`,
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                      }}>
                        {item.predicted_anomaly ? "ANOMALY" : item.trust_label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div style={{
            marginTop: "64px", paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: "12px",
          }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "rgba(180,210,255,0.25)" }}>
              TrustLens AI · FastAPI · Isolation Forest · Scikit-learn · Next.js · TypeScript · SQLite
            </span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "rgba(180,210,255,0.25)" }}>
              Protecting compensation analytics · Built for Hackathon 2025
            </span>
          </div>
        </main>
      </div>

      {/* Spin keyframe for loading icon */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}