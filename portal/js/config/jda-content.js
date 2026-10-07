// Per-JDA content for the report page. The two blocks below are copied verbatim from the JDA3
// reference file: its starter dataset and its nine solution detail pages.
const starterData = {
  weekLabel: "Week of September 8, 2026 — Execution week 6",
  overallStatus: "green",
  projects: [
    {name:"Project 2a — SAP Master Data Revitalisation", owner:"Hj M Azrul Adha & Nurul Aini Bt M Faudzi", pct:15, status:"green", taiPct:18, ibmPct:12, description:"End-to-end SAP PM/EAM data remediation — asset master data, BOMs, maintenance plans and Safety Critical Element data — building a clean, governed data foundation across 26 assets. 6-person team."},
    {name:"Project 2b — Vision Analytics for Asset Integrity", owner:"Seng Heng Leng", pct:9, status:"green", description:"AI-driven vision analytics for asset integrity — automated anomaly detection from inspection imagery, starting with the BOKOR pilot. 6-person team."},
    {name:"Project 3a — AI-Driven Asset Integrity (Predictive LOPC & Sand Monitoring)", owner:"Seng Heng Leng", pct:0, status:"green", description:"Predictive LOPC and integrated sand monitoring linked to erosion risk. Targeting 50% faster inspection cycles and 30% fewer LOPC events. 6-person team."},
    {name:"Project 4a — Maintenance & Reliability", owner:"Belal Magdy Fathallah", pct:12, status:"amber", description:"Shifts maintenance from reactive to predictive and prescriptive — UPD analytics, condition monitoring and spare-parts optimisation. Targeting 20% UPD reduction and 50% lower spare-parts inventory value. 8-person team."},
    {name:"Project 6 — Production Optimisation & Planning", owner:"Ts. Dahnaraj Lachemykanden", pct:18, status:"green", description:"Automates WPB planning, production reporting and deferment tracking, with AI-assisted surveillance and optimisation. Targeting a 4% production increase and 50% faster planning cycles. 6-person team."},
    {name:"Project 7/TA — Work Process Efficiency & Turnaround", owner:"M Azrul Adha", pct:8, status:"amber", description:"Work process efficiency improvement across the business, applied to all domains, plus turnaround and non-PPM job library consolidation. 8-person team."},
    {name:"Project CDF — Contextual Data Fusion", owner:"Ir. Gan Denson", pct:25, status:"green", description:"The shared Contextual Data Fusion layer that unifies SAP, PEDMS, PI, ECM and other systems of record feeding every other JDA3 solution. 8-person team."},
  ],
  tasks: [
    {task:"Complete asset master data assessment for Wave 1 assets", project:"Project 2a — SAP Master Data Revitalisation", owner:"T.AI", due:"2026-09-12", status:"In progress"},
    {task:"Deploy pilot anomaly detection model on Static Equipment", project:"Project 2b — Vision Analytics for Asset Integrity", owner:"T.AI", due:"2026-09-20", status:"Not started"},
    {task:"Baseline UPD Level 1–4 deep-dive analysis", project:"Project 4a — Maintenance & Reliability", owner:"T.AI / IBM", due:"2026-09-15", status:"Not started"},
    {task:"Automate daily production reporting pilot", project:"Project 6 — Production Optimisation & Planning", owner:"IBM", due:"2026-09-18", status:"In progress"},
  ],
  updates: [
    {date:"2026-09-08", text:"Entered execution week 6 of the JDA3 programme."},
    {date:"2026-09-05", text:"Completed historian data extraction for 3 of 5 pilot wells."},
    {date:"2026-09-03", text:"Tridiagonal.ai delivered the v0.1 physics-informed model for internal review."},
    {date:"2026-09-01", text:"IBM Malaysia kicked off the decision intelligence layer's API contract workshop with Petronas Carigali engineering."},
    {date:"2026-08-28", text:"Digital twin UAT environment for the compressor unit went live for field engineer walkthroughs."},
    {date:"2026-08-25", text:"Asset integrity dashboard requirements flagged as too broad; re-baseline scheduled for early September."},
  ],
  challenges: [
    {severity:"high", title:"Inconsistent sensor tagging", description:"Legacy wellhead sensors use non-standard tag naming, slowing pipeline integration.", mitigation:"Standardising tag dictionary jointly with field ops."},
    {severity:"medium", title:"SCADA integration lag", description:"Historian export cadence is slower than the model's data requirements.", mitigation:"Dedicated integration sprint with IBM Malaysia team."},
    {severity:"medium", title:"Limited cold-start validation data", description:"Newly instrumented assets lack enough history to validate the model confidently.", mitigation:"Piloting synthetic data generation to bridge the gap."},
    {severity:"low", title:"Three-way sign-off cadence", description:"Cross-company review adds latency to change approvals.", mitigation:"Proposing a standing weekly joint review call."},
  ],
  scurve: {
    startMonth: "2026-07",
    months: ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"],
    planned: [2,8,18,30,44,58,70,80,88,94,98,100],
    actual: [2,9,null,null,null,null,null,null,null,null,null,null]
  }
};

const SOLUTIONS_DETAIL = {
  gai: {
    title: "Infrastructure with Generative AI", tier: "Tier 1",
    icon: '<path d="M6.5 19a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1.8A4 4 0 0 1 17 19H6.5Z"/>',
    lead: "IBM Malaysia",
    vision: "An enterprise-grade cloud platform that serves as a secure, scalable, standardised foundation for AI solutions within PCSB — empowering partners to rapidly design, develop and deploy AI solutions while giving PCSB a robust, compliant hosting environment.",
    scope: ["Cloud-native infrastructure with Infrastructure as Code and automated governance", "Enterprise identity, role-based access and privileged access controls", "Container application hosting, API delivery and web application firewall services", "Managed databases, caching and AI model hosting services", "Security baseline aligned to ISO/IEC 27001, IEC 62443, ISO/IEC 42001 and the NIST AI RMF"],
  },
  sap: {
    title: "AI-Driven SAP Master Data Revitalisation", tier: "Tier 1",
    icon: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    lead: "Tridiagonal.ai",
    vision: "An end-to-end SAP PM/EAM data remediation programme ensuring a clean, reliable and well-structured data foundation that accurately reflects all assets and maintenance information — covering asset master data, maintenance plans, BOMs, transactional data and Safety Critical Element data.",
    scope: ["Assess, cleanse, validate and govern SAP PM/EAM data using wave-based execution", "Detect and rationalise duplicate, inconsistent and obsolete equipment records", "Reconstruct missing technical attributes from drawings, OEM manuals and site walkdowns", "Validate Bills of Materials and standardise maintenance planning data", "Structure long-text records into governed checklists and job libraries", "Establish long-term data quality governance, SOPs and KPI dashboards"],
  },
  vision: {
    title: "AI-Driven Vision Analytics for Asset Integrity", tier: "Tier 1",
    icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    lead: "Tridiagonal.ai",
    vision: "AI-enabled analytics and decision-support that fully operationalise the asset integrity & vision analytics framework, ensuring inspection data is consistently translated into prioritised, executable and traceable maintenance actions.",
    scope: ["Automatically detect corrosion, coating degradation, cracks and leaks from inspection images and video", "Support drones, 360° cameras and handheld inspection devices", "Classify anomalies against PETRONAS inspection guidelines and international standards", "Auto-generate standardised inspection reports and maintain a central inspection record repository", "Offline data capture and AI pre-processing for remote or offshore environments", "Phased rollout: starts with Static Equipment, Piping, Structures and Pipelines, then extends to Rotating Equipment, Electrical Systems, Instrumentation and Metering", "Integrates 10+ existing systems — including PETRONAS Risk Based Inspection (PRBI), IPIMS, SICS, CORIMS, P-EDMS, SAP S/4HANA and LOPC history — into a single coherent view"],
  },
  agentic: {
    title: "Multi-Tier Agentic AI Platform", tier: "Competitive Edge",
    icon: '<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M12 7.5v3M12 10.5 6 16.5M12 10.5l6 6"/>',
    lead: "IBM Malaysia (platform) with Tridiagonal.ai domain input",
    vision: "The tiered agentic AI backbone of the whole programme — see System Architecture above for how the Tier 3 Super Agent and Tier 2 domain agents work together to turn a production question into a root-cause analysis and intervention advisory.",
    scope: ["Tier 3: Agentic Super Agent — interprets and routes production questions", "Tier 2: Production Optimization Agent & Proactive Downtime Management Agent", "Built on AI.SEEK's agnostic, centralised AI platform and visualisation layer", "Grounded in the systems of record — SAP, PEDMS, PI, ECM — via the Contextual Data Fusion (CDF) layer"],
  },
  integrity: {
    title: "AI-Driven Asset Integrity", tier: "Competitive Edge",
    icon: '<path d="M12 3 20 6.5v5c0 5-3.4 8.7-8 9.5-4.6-.8-8-4.5-8-9.5v-5Z"/><path d="m9 12 2 2 4-4"/>',
    lead: "Joint — Tridiagonal.ai leads analytics (RCA, RBI, LOPC); IBM Malaysia automates workflow and closure",
    vision: "Improve asset integrity decision-making and inspection effectiveness by reducing inspection cycle time, improving coverage and standardisation, and enabling risk-based, data-driven management of loss-of-containment threats.",
    scope: ["Digital inspection workflows from planning through closure", "Standardised assessment based on the Asset Integrity Framework (AIF)", "Integration with Risk-Based Inspection (RBI) and rectification tracking", "Predictive LOPC risk analytics from condition data, alarms and inspection history", "Integrated sand monitoring linked to erosion risk and dynamic RBI intervals", "Risk-based inspection deployment to reduce repeated mobilisation and site dependency"],
    targets: ["≥50% improvement in inspection process efficiency", "≥30% reduction in LOPC events or risk exposure"],
  },
  maintenance: {
    title: "AI-Driven Maintenance & Reliability", tier: "Competitive Edge",
    icon: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z"/>',
    lead: "Joint — Tridiagonal.ai leads reliability intelligence; IBM Malaysia automates execution",
    vision: "Improve asset availability and reliability by shifting from reactive, manual analysis to predictive, prescriptive, standardised and optimised maintenance decision-making at the system level rather than isolated equipment.",
    scope: ["Integrated asset performance, reliability and RAM modelling", "Automated Unplanned Deferment (UPD) analytics and bad-actor identification", "AI-based condition monitoring for valves, rotating equipment and balance of plant", "Digital Equipment Criticality Assessment and Reliability Strategy generation", "Predictive & prescriptive maintenance analytics and spare-parts optimisation", "Digital Root Cause Failure Analysis and a centralised failure/trip knowledge base"],
    targets: ["≥20% reduction in Unplanned Deferment (UPD)", "≥50% reduction in spare parts inventory value"],
  },
  hse: {
    title: "AI-Driven HSE & PSM", tier: "Competitive Edge",
    icon: '<path d="M12 3 22 20H2Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
    lead: "IBM Malaysia leads workflow & automation; Tridiagonal.ai consulted for technical indicators",
    vision: "Enhance Process Safety Management and HSE performance by shifting from reactive, compliance-driven practices to predictive, risk-based management and prevention.",
    scope: ["Integrated HSE & PSM data foundation across incidents, UAUC, inspections and operations", "Digital workflows for Risk Assessment, SISO, HAZID and HAZOP studies", "Predictive process safety & weak-signal analytics", "Wastewater and environmental monitoring analytics", "Centralised lessons-learned repository with action-effectiveness tracking", "AI-driven Human Behaviour Categorisation & Constructive Reinforcement"],
    targets: ["≥30% reduction in process safety near-misses / high-potential incidents", "≥50% reduction in RA / SISO / HAZID / HAZOP cycle time"],
  },
  production: {
    title: "AI-Driven Production Optimisation & Planning", tier: "Competitive Edge",
    icon: '<path d="M3 17l5-6 4 4 7-9"/><path d="M14 6h6v6"/>',
    lead: "Joint — Tridiagonal.ai and IBM Malaysia",
    vision: "Improve production forecast accuracy, reduce reporting effort, and enable faster, data-driven optimisation and recovery decisions during the production phase.",
    scope: ["Automated Work Programme & Budget (WPB) planning inputs", "Automated daily and monthly production reporting, replacing manual spreadsheets", "Deferment tracking with standardised coding and performance trending", "AI-assisted production surveillance, prediction and optimisation", "Automated production allocation and metering-anomaly analytics", "Integrated Activity Planning (IAP) with logistics optimisation, including gas supply-demand simulation", "Business Continuity Plan advisory for critical equipment downtime"],
    targets: ["≥4% increase in overall production output", "≥50% reduction in planning & reporting cycle time"],
  },
  workprocess: {
    title: "Work Process Efficiency Improvement", tier: "Competitive Edge",
    icon: '<rect x="3" y="4" width="6" height="6" rx="1.2"/><path d="m4.3 7 1 1 2-2"/><rect x="3" y="14" width="6" height="6" rx="1.2"/><path d="m4.3 17 1 1 2-2"/><path d="M12 7h9M12 17h9"/>',
    lead: "IBM Malaysia leads BPW redesign, workflow automation and the integrated enterprise platform; Tridiagonal.ai provides domain-specific Agentic AI agents",
    vision: "Transforms end-to-end work process efficiency across the production phase — reviewing and redesigning Business Process Workflows across Asset Integrity, Maintenance & Reliability, Production, HSE and Management Reporting, then automating them through an integrated enterprise platform and a Multi-Tier Agentic AI architecture.",
    scope: ["Review existing Business Process Workflows to identify inefficiencies, duplication and manual handoffs", "Automate optimised workflows using AI, analytics and digital orchestration", "Centralised data ingestion and quality checks across inspection, maintenance, production and PI/historian data", "Common UI framework and enterprise dashboards, replacing Excel-based reporting", "Integrated enterprise platform orchestrating end-to-end processes across surface facilities", "Multi-Tier Agentic AI platform with domain-specific Agentic AI Agents, access control, audit trail and governance"],
    targets: ["≥50% improvement in work process efficiency"],
  },
};

// Card order and tags for the "AI technology solutions" grid; everything else about a solution
// (title, tier, icon, detail page) comes from SOLUTIONS_DETAIL above. A tag is [text, accent?].
const JDA3_SOLUTION_GROUPS = [
  { label: 'Tier 1 · Foundation solutions', cards: [
    { key: 'gai', tags: [['Platform & Infrastructure', true], ['IBM Malaysia']] },
    { key: 'sap', tags: [['Data Foundation', true], ['Tridiagonal.ai']] },
    { key: 'vision', tags: [['Asset Integrity', true], ['Tridiagonal.ai']] }
  ] },
  { label: 'Competitive edge solutions', cards: [
    { key: 'agentic', tags: [['Orchestration', true], ['IBM Malaysia + Tridiagonal.ai']] },
    { key: 'integrity', tags: [['50% faster inspections', true], ['↓30% LOPC events', true], ['Joint delivery']] },
    { key: 'maintenance', tags: [['↓20% UPD', true], ['↓50% spares inventory', true], ['Joint delivery']] },
    { key: 'hse', tags: [['↓30% near-misses', true], ['↓50% study cycle time', true], ['IBM Malaysia + Tridiagonal.ai']] },
    { key: 'production', tags: [['+4% production', true], ['↓50% planning cycle', true], ['Joint delivery']] },
    { key: 'workprocess', tags: [['↓50% work process cycle time', true], ['IBM Malaysia + Tridiagonal.ai']] }
  ] }
];

// Everything written specifically about one JDA lives here. A JDA with no entry gets the same page
// with those sections left empty - never another JDA's content.
const OVERRIDES = {
  jda3: {
    short: 'JDA3', mark: 'TriCipta AI', reportTitle: 'JDA3 Report', docTitle: 'JDA3 — Weekly Management Report',
    eyebrow: 'TriCipta AI · Third Joint Development Agreement',
    tagline: 'Surface Equipment Optimisation with AI',
    sub: "JDA3 is the Production Phase of TriCipta AI — Petronas Carigali's AI delivery arm for Upstream, built through a strategic partnership with IBM Malaysia and Tridiagonal.ai.",
    more: 'It moves Upstream from reactive surveillance to proactive, system-level AI across three pillars — Production Optimisation, Proactive Physical Asset Management, and Lean Workforce & AI-Driven Operations — deployed across 26 assets over a two-year programme to push Unit Production Cost below USD 6/BOE, cut carbon intensity to 17 kgCO₂e/BOE, and lift delivery attainability from 70% to 90%.',
    aspirationIntro: 'The transformation JDA3 is aiming for.',
    aspiration: [
      { value: '<$6/BOE & CI 17kg', label: 'Cost & carbon per barrel' },
      { value: 'Lean workforce', label: 'AI-driven operations' },
      { value: '70% → 90%', label: 'Delivery attainability' },
      { value: '30% NPV', label: 'Programme-wide ambition', highlight: true }
    ],
    solutionsIntroHtml: 'The solution portfolio being delivered across <strong>26 assets over a two-year programme</strong>.',
    solutionGroups: JDA3_SOLUTION_GROUPS, solutions: SOLUTIONS_DETAIL,
    archIntro: 'The overall solution architecture, from source systems through to the Control Tower.',
    architecture: true,
    collabIntro: 'The three organisations behind JDA3, and what each contributes.',
    collaborators: [
      { logo: 'assets/carigali-logo.png', alt: 'Petronas Carigali', name: 'Petronas Carigali',
        role: 'Asset owner & primary beneficiary',
        text: 'Gives production & maintenance data, business workflows, and investment to co-develop.',
        more: 'Gets competitive edge through bespoke AI, product exclusivity, and IP — 100% PETRONAS-owned for in-house work, shared IP for co-developed AI.' },
      { logo: 'assets/ibm-logo.jpg', alt: 'IBM Malaysia', name: 'IBM Malaysia',
        role: 'AI Technology for Lean Workforce & AI-Driven Operations',
        text: 'Leads AI/ML algorithm development, digital infrastructure design, and end-to-end product adoption.',
        more: 'Brings agentic AI, digital twins, scalable cloud/on-prem architecture, real-time optimisation, and Integrated Activity Planning (IAP) workflow transformation.' },
      { logo: 'assets/tridiagonal-logo-cropped.png', alt: 'Tridiagonal Group', name: 'Tridiagonal.ai',
        role: 'Domain Engineering for Production, Reliability & Maintenance',
        text: 'Provides operational credibility and production/asset-management domain strength.',
        more: 'Contributes Integrated Surface Equipment Modelling and Advanced Time-Series Analytics & Anomaly Detection — the engineering logic that validates every model.' }
    ],
    pressIntro: 'The official announcement of JDA3.',
    press: {
      img: 'assets/press.jpg', alt: 'PETRONAS Carigali, IBM Malaysia and Tridiagonal.ai signing ceremony for the JDA3 agreement',
      text: 'On 8 July 2026, Petronas Carigali signed the third Joint Development Agreement with IBM Malaysia and Tridiagonal.ai, extending TriCipta AI into Surface Equipment Optimisation with AI.',
      more: 'At the signing, Petronas Carigali CEO Hazli Sham Kassim said the company is "embedding it to drive bottom-line performance, asset reliability, and speed-to-value."',
      href: 'https://www.petronas.com/media/media-releases/petronas-advances-tricipta-ai-through-third-joint-development-agreement-ibm',
      linkText: 'Read the full release on petronas.com →'
    },
    progressIntro: 'Cumulative completion against the JDA3 baseline plan.',
    tasksIntro: "This week's active items across all three partners.",
    footBrand: 'JDA3 · TriCipta AI',
    footNote: 'A joint programme of Petronas Carigali, IBM Malaysia and Tridiagonal.ai — Surface Equipment Optimisation with AI.',
    starter: starterData, defaultStartMonth: '2026-07'
  }
};

export function contentFor(jda) {
  const n = jda.name;
  return {
    short: n, mark: 'JDA Programme Portal', reportTitle: `${n} Report`, docTitle: `${n} — Weekly Management Report`,
    eyebrow: 'Joint Development Agreement', tagline: '', sub: '', more: '',
    aspirationIntro: `The transformation ${n} is aiming for.`, aspiration: [],
    solutionsIntroHtml: 'The solution portfolio being delivered.', solutionGroups: [], solutions: {},
    archIntro: 'The overall solution architecture.', architecture: false,
    collabIntro: `The organisations behind ${n}, and what each contributes.`, collaborators: [],
    pressIntro: `The official announcement of ${n}.`, press: null,
    progressIntro: `Cumulative completion against the ${n} baseline plan.`,
    tasksIntro: "This week's active items.",
    footBrand: n, footNote: 'Part of the JDA Programme Portal.',
    starter: null, defaultStartMonth: '',
    ...OVERRIDES[jda.id]
  };
}

// Stock solution artwork by key: icon paths here, images at assets/sol-<key>.jpg. Home page content
// that arrives from Drive names one of these keys per solution instead of carrying its own artwork.
export const SOLUTION_ICONS = Object.fromEntries(Object.entries(SOLUTIONS_DETAIL).map(([key, s]) => [key, s.icon]));
