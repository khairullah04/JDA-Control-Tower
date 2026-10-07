export const EMPTY_REPORT = {
  weekLabel: '', projects: [], tasks: [], updates: [], challenges: [],
  scurve: { startMonth: '', months: [], planned: [], actual: [] }
};

// The real, verbatim JDA3 data from the reference file - offered as a one-click seed only when
// viewing jda3, and only if no report exists there yet.
export const JDA3_REAL_REPORT = {
  weekLabel: "Week of September 8, 2026 — Execution week 6",
  projects: [
    { name: "Project 2a — SAP Master Data Revitalisation", owner: "Hj M Azrul Adha & Nurul Aini Bt M Faudzi", pct: 15, status: "green", description: "End-to-end SAP PM/EAM data remediation — asset master data, BOMs, maintenance plans and Safety Critical Element data — building a clean, governed data foundation across 26 assets. 6-person team." },
    { name: "Project 2b — Vision Analytics for Asset Integrity", owner: "Seng Heng Leng", pct: 9, status: "green", description: "AI-driven vision analytics for asset integrity — automated anomaly detection from inspection imagery, starting with the BOKOR pilot. 6-person team." },
    { name: "Project 3a — AI-Driven Asset Integrity (Predictive LOPC & Sand Monitoring)", owner: "Seng Heng Leng", pct: 0, status: "green", description: "Predictive LOPC and integrated sand monitoring linked to erosion risk. Targeting 50% faster inspection cycles and 30% fewer LOPC events. 6-person team." },
    { name: "Project 4a — Maintenance & Reliability", owner: "Belal Magdy Fathallah", pct: 12, status: "amber", description: "Shifts maintenance from reactive to predictive and prescriptive — UPD analytics, condition monitoring and spare-parts optimisation. Targeting 20% UPD reduction and 50% lower spare-parts inventory value. 8-person team." },
    { name: "Project 6 — Production Optimisation & Planning", owner: "Ts. Dahnaraj Lachemykanden", pct: 18, status: "green", description: "Automates WPB planning, production reporting and deferment tracking, with AI-assisted surveillance and optimisation. Targeting a 4% production increase and 50% faster planning cycles. 6-person team." },
    { name: "Project 7/TA — Work Process Efficiency & Turnaround", owner: "M Azrul Adha", pct: 8, status: "amber", description: "Work process efficiency improvement across the business, applied to all domains, plus turnaround and non-PPM job library consolidation. 8-person team." },
    { name: "Project CDF — Contextual Data Fusion", owner: "Ir. Gan Denson", pct: 25, status: "green", description: "The shared Contextual Data Fusion layer that unifies SAP, PEDMS, PI, ECM and other systems of record feeding every other JDA3 solution. 8-person team." }
  ],
  tasks: [
    { task: "Complete asset master data assessment for Wave 1 assets", project: "Project 2a — SAP Master Data Revitalisation", owner: "T.AI", due: "2026-09-12", status: "In progress" },
    { task: "Deploy pilot anomaly detection model on Static Equipment", project: "Project 2b — Vision Analytics for Asset Integrity", owner: "T.AI", due: "2026-09-20", status: "Not started" },
    { task: "Baseline UPD Level 1–4 deep-dive analysis", project: "Project 4a — Maintenance & Reliability", owner: "T.AI / IBM", due: "2026-09-15", status: "Not started" },
    { task: "Automate daily production reporting pilot", project: "Project 6 — Production Optimisation & Planning", owner: "IBM", due: "2026-09-18", status: "In progress" }
  ],
  updates: [
    { date: "2026-09-08", text: "Entered execution week 6 of the JDA3 programme." },
    { date: "2026-09-05", text: "Completed historian data extraction for 3 of 5 pilot wells." },
    { date: "2026-09-03", text: "Tridiagonal.ai delivered the v0.1 physics-informed model for internal review." },
    { date: "2026-09-01", text: "IBM Malaysia kicked off the decision intelligence layer's API contract workshop with Petronas Carigali engineering." },
    { date: "2026-08-28", text: "Digital twin UAT environment for the compressor unit went live for field engineer walkthroughs." },
    { date: "2026-08-25", text: "Asset integrity dashboard requirements flagged as too broad; re-baseline scheduled for early September." }
  ],
  challenges: [
    { severity: "high", title: "Inconsistent sensor tagging", description: "Legacy wellhead sensors use non-standard tag naming, slowing pipeline integration.", mitigation: "Standardising tag dictionary jointly with field ops." },
    { severity: "medium", title: "SCADA integration lag", description: "Historian export cadence is slower than the model's data requirements.", mitigation: "Dedicated integration sprint with IBM Malaysia team." },
    { severity: "medium", title: "Limited cold-start validation data", description: "Newly instrumented assets lack enough history to validate the model confidently.", mitigation: "Piloting synthetic data generation to bridge the gap." },
    { severity: "low", title: "Three-way sign-off cadence", description: "Cross-company review adds latency to change approvals.", mitigation: "Proposing a standing weekly joint review call." }
  ],
  scurve: {
    startMonth: "2026-07",
    months: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    planned: [2, 8, 18, 30, 44, 58, 70, 80, 88, 94, 98, 100],
    actual: [2, 9, null, null, null, null, null, null, null, null, null, null]
  }
};
