# PART 00 — ANNEX D: LEGACY MAPPING & RUN PLAN

> Maps every prompt of the previous pack (Prompt 00 → Prompt 166, with its former evidence ID `part-NNN`) to the Part that now owns it. Work already done under old numbers stays valid: keep its evidence, link it from the new Part's audit record, and keep its permission keys, events, routes, tables and CP codes (aliases below). Machine-readable copy: `LEGACY_CROSSWALK.csv`.

## D1 Run plan for a repository that already built former Parts 00–32
1. **Part 00 — adopt** (§14): documentation skeleton, legacy mapping, progress register.
2. **Run Parts 01 → 27 in order.** Parts listed in D2 start in **VERIFY & EXTEND** mode (Annex E6): locate the legacy implementation, run the new acceptance scenarios, build only the gaps. Parts not in D2 are **BUILD/EXTEND**.
3. The old *Run next* list (old Prompts 11, 30, 35, 36, 37, 38) is absorbed by Parts 15, 25, 21, 24, 22 and 23 respectively — they run in their new positions.
4. From Part 28 onward no legacy build exists; every Part runs in BUILD/EXTEND mode on top of the verified foundation.
5. Old Prompt 42 (database foundation, not built) is now **Part 03** — run it before any further migration.

## D2 Parts that start in VERIFY & EXTEND mode
| Part | Title | Legacy-built old prompts | Old prompts still to build inside this Part |
|---|---|---|---|
| 01 | Existing System Audit, Architecture Fitness Assessment & Golden Baseline | 01, 00 | — |
| 04 | Quality Engineering, CI/CD, Test Automation & Release Management | 03 | 164 |
| 05 | Shared Kernel & Core Platform Services | 04 | — |
| 06 | Enterprise Structure: Organisation, Company, Project & Site | 05 | — |
| 07 | Identity, Access Control, Segregation of Duties & Zero-Trust | 06, 14, 13 | — |
| 08 | Audit Trail, Secure SDLC & Security Governance | 12, 13 | — |
| 08A | Secure Login, Admin User Provisioning, Credentials & Session Lifecycle | 06 | — |
| 09 | Observability, Reliability, Performance & Error Handling | 15 | 131, 161 |
| 10 | Event Bus, Real-time & Notification Engine | 16, 17 | 157 |
| 11 | Integration Platform, API Gateway & Developer Portal | 18, 19 | — |
| 12 | Enterprise Design System, App Shell & Navigation | 00, 07, 02 | — |
| 13 | Dashboard Engine, Launchpad, Global Search & Drill-down | 08, 09 | 144, 159, 160 |
| 14 | Responsive Field App & Offline-First Engine | 10, 24 | 71 |
| 16 | Workflow, Business Rules & Delegation of Authority | 20, 21 | 146 |
| 17 | Protocol & Control Engine, RACI, Action Ledger & Policy-to-Protocol | 22, 23 | 149 |
| 18 | Tasks, Alerts, Escalations, Meetings & Automation | 26, 33, 34 | 148 |
| 19 | Document Control, Correspondence & Common Data Environment | 25 | 95 |
| 20 | Document Generation, Templates, e-Signature & Verification | 31, 32 | 107, 142 |
| 25 | Unified Communication Platform: Gateway, WorkChat Architecture, Data Model & Real-time Core | 27, 28 | — |
| 25A | WorkChat Conversations & Messaging Experience: Direct, Groups, Channels, Composer, Attachments, Search, Receipts, Notifications & Unified Inbox | 28 | 30 |
| 25C | WorkChat Security, Privacy & Governance: Licences, Encryption Decision, Calls, Administration, Retention, Legal Hold & Pilot Release | 29 | — |

## D3 Consolidations (duplication removed)
| Part | Title | Old prompts merged |
|---|---|---|
| 01 | Existing System Audit, Architecture Fitness Assessment & Golden Baseline | 01, 00 |
| 04 | Quality Engineering, CI/CD, Test Automation & Release Management | 03, 164 |
| 07 | Identity, Access Control, Segregation of Duties & Zero-Trust | 06, 14, 13 |
| 08 | Audit Trail, Secure SDLC & Security Governance | 12, 13 |
| 09 | Observability, Reliability, Performance & Error Handling | 15, 131, 161 |
| 10 | Event Bus, Real-time & Notification Engine | 16, 17, 157 |
| 11 | Integration Platform, API Gateway & Developer Portal | 18, 19 |
| 12 | Enterprise Design System, App Shell & Navigation | 00, 07, 02 |
| 13 | Dashboard Engine, Launchpad, Global Search & Drill-down | 08, 09, 144, 159, 160 |
| 14 | Responsive Field App & Offline-First Engine | 10, 24, 71 |
| 16 | Workflow, Business Rules & Delegation of Authority | 20, 21, 146 |
| 17 | Protocol & Control Engine, RACI, Action Ledger & Policy-to-Protocol | 22, 23, 149 |
| 18 | Tasks, Alerts, Escalations, Meetings & Automation | 26, 33, 34, 148 |
| 19 | Document Control, Correspondence & Common Data Environment | 25, 95 |
| 20 | Document Generation, Templates, e-Signature & Verification | 31, 32, 107, 142 |
| 24 | Data-Entry Framework & Excel Data Exchange | 40, 36, 152 |
| 25 | Unified Communication Platform: Gateway, WorkChat Architecture, Data Model & Real-time Core | 27, 28 |
| 25A | WorkChat Conversations & Messaging Experience: Direct, Groups, Channels, Composer, Attachments, Search, Receipts, Notifications & Unified Inbox | 28, 30 |
| 26 | Financial Backbone: Chart of Accounts, General Ledger, Posting Engine & Period Control | 41, 77, 80 |
| 27 | Tax & e-Compliance Engine: GST, TDS, e-Invoice & e-Way Bill | 81, 153 |
| 30 | Tender Management, Estimation & Bid Pricing | 49, 50 |
| 31 | Contract Lifecycle Management & Tender-to-Execution Handover | 63, 64, 96 |
| 34 | Engineering & Design Management: Drawings, Submittals & RFIs | 90, 91, 92 |
| 40 | Resource & Capacity Planning | 75, 76 |
| 42 | Site Execution, DPR, Hindrance & Weather | 47, 56, 57 |
| 43 | Progress Measurement, EVM & Planned-vs-Budgeted-vs-Actual | 54, 59 |
| 44 | Supplier Management & Material Rate Intelligence | 110, 109, 143 |
| 46 | Procurement & Purchase Management | 60, 101, 108 |
| 47 | Stores & Inventory Management | 61, 108 |
| 50 | Plant, Machinery & Fleet Management | 73, 86 |
| 52 | RMC & Batching Plant Operations, Mix Design and Costing | 99, 111, 112 |
| 54 | HR Core & Human Capital Management | 68, 113 |
| 57 | Site Facilities: Labour Camps, Welfare & Security Guards | 139, 140 |
| 58 | Workforce Productivity & Performance Management | 118, 150 |
| 61 | Client Billing, Price Variation, Retention & Collections | 67, 88 |
| 63 | Claims, Extension of Time & Dispute Management | 93, 141 |
| 65 | Receivables, Cash Flow, Treasury, Bank Guarantees & Banking | 79, 82, 89 |
| 67 | Cost Forecasting (EAC/ETC) & Cost-Value Reconciliation | 84, 66 |
| 68 | Project P&L, Profitability & Monthly Close | 85, 132, 133 |
| 69 | Quality Management (QA/QC), Inspections & Lab Testing | 97, 98, 114 |
| 70 | HSE Management & Permit-to-Work | 100, 138 |
| 71 | Testing, Commissioning, Handover, Closeout & Defect Liability | 103, 115, 116 |
| 73 | External Portals: Supplier, Subcontractor, Client & Consultant | 104, 105, 106 |
| 75 | Enterprise Data Platform, Metric Catalogue & Data Lineage | 135, 136, 158 |
| 76 | Reporting, MIS & Report Builder | 119, 120, 134 |
| 77 | Control Towers, Early Warning & Wastage/Leakage Detection | 121, 122, 126, 127, 117 |
| 78 | Analytics, Forecasting, Scenario Simulation & Explainability | 123, 124, 125 |
| 79 | AI Platform: Copilot, Agents, Document Intelligence, Vision & Governance | 128, 129, 130, 147, 94 |
| 82 | End-to-End Integration & Cross-Module Reconciliation Testing | 156, 157, 164 |
| 83 | Security, Performance & Accessibility Certification | 155, 131 |
| 84 | Backup, Disaster Recovery, Data Retention & Archival | 162, 163 |

## D4 Legacy aliases (never rename built identifiers — map them)
| Part | New module code | Legacy codes kept as aliases |
|---|---|---|
| Part 01 | disc | `audit` |
| Part 04 | cicd | `qa_test` |
| Part 07 | iam | `idsod` |
| Part 08 | secgov | `audit_sec`, `secbase` |
| Part 08A | auth | `login` |
| Part 09 | obs | `perf(P131)`, `err` |
| Part 10 | evbus | `rt`, `rtc` |
| Part 11 | intg | `devapi` |
| Part 12 | ds | `preview` |
| Part 13 | dash | `search`, `ux2`, `timeline`, `drill` |
| Part 14 | field | `rsp`, `offline` |
| Part 16 | wf | `rules`, `decide` |
| Part 17 | protocol | `acc`, `pol` |
| Part 18 | task | `alert`, `esc`, `route` |
| Part 19 | doc | `doc2` |
| Part 20 | docgen | `dsig`, `docfmt`, `bizfmt` |
| Part 24 | dex | `xls`, `xlspack` |
| Part 25 | msg | `commgw`, `chat`, `workchat` |
| Part 25A | wchat | `usm` |
| Part 25B | wcerp | `comc` |
| Part 25C | wcgov | `scom` |
| Part 26 | fin | `finint`, `fin2` |
| Part 27 | tax | `gst`, `ewb` |
| Part 30 | tnd | `est` |
| Part 31 | ctr | `baseline`, `ctr2` |
| Part 34 | eng | `drg`, `epceng`, `rfi` |
| Part 40 | rescap | `capplan` |
| Part 42 | site | `dpr`, `weather` |
| Part 43 | prog | `pce` |
| Part 44 | srm | `vendq`, `rti`, `air` |
| Part 46 | proc | `expedite`, `proc2` |
| Part 47 | stores | `proc2` |
| Part 50 | plant | `plant2` |
| Part 50A | plog | `logbook` |
| Part 52 | rmc | `bplant`, `bpcost` |
| Part 52A | rmcdisp | `rmc(dispatch)` |
| Part 54 | hr | `hcm2` |
| Part 56 | pay | `statpay` |
| Part 57 | fac | `guard`, `camp` |
| Part 58 | empperf | `prodint` |
| Part 61 | bill | `clbill` |
| Part 63 | claims | `claim` |
| Part 64 | ap | `match` |
| Part 65 | treasury | `cash`, `cashfc` |
| Part 66 | fa | `fin2` |
| Part 67 | eac | `comm(commercial)` |
| Part 68 | pnl | `mrec`, `mclose` |
| Part 69 | qa | `insp`, `qms2` |
| Part 70 | hse | `hse2` |
| Part 71 | tnc | `handover`, `dlp` |
| Part 73 | portal | `supportal`, `venportal`, `clientportal` |
| Part 75 | dwh | `metrics`, `trace` |
| Part 76 | mis | `rb`, `anl` |
| Part 77 | tower | `exec`, `detect`, `exectower`, `twin` |
| Part 78 | fcst | `why`, `sim` |
| Part 79 | ai | `aigov`, `cv`, `copilot`, `docai` |
| Part 82 | xint | `xint`, `rtc`, `qa_test` |
| Part 83 | cert | `sec(P155)`, `perf(P131)` |
| Part 84 | dr | `archive` |
| Part 86 | kaizen | `closeout` |

## D5 Full crosswalk — old prompt → new Part
| Old prompt | Old title | Former ID | Legacy-built | New Part(s) |
|---|---|---|---|---|
| 00 | Master Development Directive, Program Baseline & Enterprise Design Foundation | `part-000` | ✔ | Part 00, Part 01, Part 12 |
| 01 | Existing System Audit & Architecture Discovery | `part-001` | ✔ | Part 01 |
| 02 | Live Dashboard Preview & Walking Skeleton (Preview From Day One) | `part-002` | ✔ | Part 12 |
| 03 | Quality Gates, Ci/Cd & Release Engineering | `part-003` | ✔ | Part 04 |
| 04 | Core Enterprise Erp Foundation (Shared Services) | `part-004` | ✔ | Part 05 |
| 05 | Organization, Company, Project & Site Master | `part-005` | ✔ | Part 06 |
| 06 | User, Role & Permission Architecture (Enterprise Rbac) | `part-006` | ✔ | Part 07, Part 08A |
| 07 | Unified Enterprise Ui/Ux — Component Library & Design-System Completion | `part-019` | ✔ | Part 12 |
| 08 | Advanced Responsive Dashboard Architecture | `part-020` | ✔ | Part 13 |
| 09 | Global Search & Command Center | `part-023` | ✔ | Part 13 |
| 10 | Mobile + Tablet + Desktop Experience (Responsive Shell) | `part-021` | ✔ | Part 14 |
| 11 | Existing Application Redesign & Screen Migration | `` |  | Part 15 |
| 12 | Audit, Security & Governance Foundation | `part-007` | ✔ | Part 08 |
| 13 | Secure-By-Design Foundation — Secure Sdlc, Ci/Cd Security Gates, Zero-Trust Request Pipeline & Secrets | `part-008` | ✔ | Part 07, Part 08 |
| 14 | Security, Identity & Segregation Of Duties | `part-009` | ✔ | Part 07 |
| 15 | Observability, Performance & Reliability | `part-010` | ✔ | Part 09 |
| 16 | Real-Time Event Bus & Integration Platform | `part-011` | ✔ | Part 10 |
| 17 | Real-Time Notification & Collaboration Foundation | `part-016` | ✔ | Part 10 |
| 18 | Integration Architecture | `part-017` | ✔ | Part 11 |
| 19 | Api, Integration & Developer Platform | `part-018` | ✔ | Part 11 |
| 20 | Workflow & Approval Engine | `part-012` | ✔ | Part 16 |
| 21 | Workflow, Rules & Approval Engine | `part-013` | ✔ | Part 16 |
| 22 | Protocol & Control Engine (Plan → Verify → Approve → Execute → Record → Monitor → Reconcile → Close) | `part-014` | ✔ | Part 17 |
| 23 | Accountability, Responsibility Assignment & Action Ledger | `part-015` | ✔ | Part 17 |
| 24 | Offline-First Field Mobile Engine | `part-022` | ✔ | Part 14 |
| 25 | Advanced Document Control | `part-024` | ✔ | Part 19 |
| 26 | Task & Action Management | `part-027` | ✔ | Part 18 |
| 27 | Enterprise Communication Gateway (Whatsapp / Email / Sms / Push / Api) | `part-030` | ✔ | Part 25 |
| 28 | Advanced Team Chat / Workchat | `part-031` | ✔ | Part 25, Part 25A |
| 29 | Secure Communication Platform — Signal Open-Source Foundation, License Compliance & End-To-End Security | `part-032` | ✔ | Part 25C |
| 30 | Unified Secure Messaging — Communication Channel & Team Chat Consolidation (Signal-Inspired, Fully Responsive) | `part-032a` |  | Part 25A |
| 31 | Digital Signature & Trust Verification | `part-025` | ✔ | Part 20 |
| 32 | Document Template & Format Management Center | `part-026` | ✔ | Part 20 |
| 33 | Automation & Alert Engine | `part-028` | ✔ | Part 18 |
| 34 | Management Escalation Engine | `part-029` | ✔ | Part 18 |
| 35 | Master Data Governance | `part-033` |  | Part 21 |
| 36 | Enterprise Excel Data Exchange Engine — Templates, Validation & Controlled Import/Export | `part-034` |  | Part 24 |
| 37 | Central Calculation Engine & Authoritative Formula Registry | `part-035` |  | Part 22 |
| 38 | Item Master & Resource Catalogue Engine (With Reusable Item Selector) | `part-036` |  | Part 23 |
| 39 | Rate Analysis Engine (Versioned, Effective-Dated) | `part-037` |  | Part 29 |
| 40 | Advanced Data-Entry Framework (Enter Once, Reuse Everywhere) | `part-038` |  | Part 24 |
| 41 | Advanced Accounting & Finance | `part-039` |  | Part 26 |
| 42 | Database Foundation, Migration Framework & Data Integrity | `` |  | Part 03 |
| 43 | Project Management & Project 360 | `part-040` |  | Part 32 |
| 44 | Crm & Business Development Management | `part-041` |  | Part 28 |
| 45 | Wbs, Boq & Work Package Management | `part-042` |  | Part 33 |
| 46 | Advanced Project Planning & Scheduling | `part-048` |  | Part 38 |
| 47 | Advanced Site Execution | `part-055` |  | Part 42 |
| 48 | Material Take-Off (Mto) & Quantity Derivation Engine | `part-043` |  | Part 35 |
| 49 | Tender Management | `part-044` |  | Part 30 |
| 50 | Advanced Estimation | `part-045` |  | Part 30 |
| 51 | Advanced Qs / Quantity Surveying | `part-046` |  | Part 60 |
| 52 | Advanced Budgeting & Cost Control | `part-049` |  | Part 39 |
| 53 | Project Risk & Opportunity Management | `part-050` |  | Part 36 |
| 54 | Advanced Progress Management | `part-054` |  | Part 43 |
| 55 | Work Authorisation & Plan-Before-Execute Control | `part-056` |  | Part 41 |
| 56 | Dpr / Field Execution | `part-057` |  | Part 42 |
| 57 | Weather & Site Condition Management | `part-058` |  | Part 42 |
| 58 | Gis, Survey & Site Location Intelligence | `part-059` |  | Part 37 |
| 59 | Planned Vs Budgeted Vs Actual Engine (Project Control Engine) | `part-061` |  | Part 43 |
| 60 | Advanced Procurement | `part-062` |  | Part 46 |
| 61 | Advanced Stores & Inventory | `part-063` |  | Part 47 |
| 62 | Material Demand, Mrp & Procurement Forecasting | `part-064` |  | Part 45 |
| 63 | Advanced Contracts Management / Clm | `part-047` |  | Part 31 |
| 64 | Tender-To-Execution Commercial Baseline Handover | `part-051` |  | Part 31 |
| 65 | Change & Variation Management | `part-080` |  | Part 62 |
| 66 | Advanced Commercial Management | `part-081` |  | Part 67 |
| 67 | Advanced Billing & Ra Bill Management | `part-082` |  | Part 61 |
| 68 | Advanced Hr & Human Capital Management | `part-068` |  | Part 54 |
| 69 | Advanced Geo-Attendance | `part-069` |  | Part 55 |
| 70 | Subcontractor Management | `part-083` |  | Part 59 |
| 71 | Mobile Field Erp (Offline-Capable) | `part-111` |  | Part 14 |
| 72 | Tool & Small-Asset Tracking | `part-065` |  | Part 49 |
| 73 | Advanced Plant & Machinery | `part-066` |  | Part 50, Part 50A |
| 74 | Fuel Management & Anti-Leakage Control | `part-067` |  | Part 51 |
| 75 | Resource Planning & Capacity Management | `part-070` |  | Part 40 |
| 76 | Resource Capacity, Workforce & Plant Planning | `part-071` |  | Part 40 |
| 77 | Finance Integration (Posting Rules Across Modules) | `part-084` |  | Part 26 |
| 78 | Three-Way / Multi-Way Matching | `part-085` |  | Part 64 |
| 79 | Cash Flow Management | `part-086` |  | Part 65 |
| 80 | Advanced Accounting & Finance (Financial Backbone Extension) | `part-089` |  | Part 26, Part 66 |
| 81 | Gst Compliance Service — Gst Masters, Gstin Validation, Tax Engine, E-Invoice & Irn Management | `part-090` |  | Part 27 |
| 82 | Treasury & Corporate Cash Management | `part-091` |  | Part 65 |
| 83 | India Construction Statutory Payroll & Labour Compliance | `part-092` |  | Part 56 |
| 84 | Project Cost Forecast, Etc & Eac Engine | `part-093` |  | Part 67 |
| 85 | Project P&L & Profitability Engine | `part-094` |  | Part 68 |
| 86 | Advanced Plant & Machinery Management (Fleet Extension) | `part-122` |  | Part 50 |
| 87 | Equipment, Plant, Fleet Maintenance & Telematics Engine | `part-123` |  | Part 50B |
| 88 | Construction Client Billing, Ra/Mb, Certification & Collections | `part-087` |  | Part 61 |
| 89 | Cashflow, Treasury & Project Finance Forecast | `part-095` |  | Part 65 |
| 90 | Drawing, Design Coordination & Rfi Management | `part-052` |  | Part 34 |
| 91 | Epc Engineering Management — Deliverable Register, Engineering Progress & Vendor Document Review | `part-053` |  | Part 34 |
| 92 | Rfi Management System — Strict Approval, Monitoring & Execution Control | `part-060` |  | Part 34 |
| 93 | Advanced Contract Document & Claim Evidence Control | `part-088` |  | Part 63 |
| 94 | Document Intelligence | `part-108` |  | Part 79 |
| 95 | Advanced Project Documentation & Document Control (Digital Thread) | `part-135` |  | Part 19 |
| 96 | Advanced Construction Contracts Management (Clm Extension) | `part-136` |  | Part 31 |
| 97 | Advanced Quality Management / Qa-Qc | `part-073` |  | Part 69 |
| 98 | Site Inspection & Checklist Engine | `part-074` |  | Part 69 |
| 99 | Rmc Management (Batching Plant To Pour) | `part-075` |  | Part 52, Part 52A |
| 100 | Advanced Hse / Safety Management | `part-076` |  | Part 70 |
| 101 | Procurement Expediting, Vendor Inspection & Long-Lead Logistics | `part-077` |  | Part 46 |
| 102 | Site Logistics, Gate, Material & Vehicle Control | `part-078` |  | Part 48 |
| 103 | Testing, Pre-Commissioning & Commissioning (System Completion) | `part-079` |  | Part 71 |
| 104 | Material Supplier Portal | `part-112` |  | Part 73 |
| 105 | Vendor & Subcontractor Portal | `part-113` |  | Part 73 |
| 106 | Client & Consultant Portal | `part-114` |  | Part 73 |
| 107 | Document Generation, Pdf/Print, Signature, Verification & Delivery Engine | `part-115` |  | Part 20 |
| 108 | Advanced Procurement, Stores & Inventory (Material Lifecycle Extension) | `part-117` |  | Part 46, Part 47 |
| 109 | Construction Material Rate Intelligence — Historical Rate Database, Rate Index & Project Cost Impact | `part-118` |  | Part 44 |
| 110 | Supplier Prequalification, Vendor Scorecards & Procurement Intelligence | `part-119` |  | Part 44 |
| 111 | Batching Plant Operations — Plant Master, Recipes, Production, Consumption, Dispatch, Quality & Maintenance | `part-124` |  | Part 52 |
| 112 | Batching Plant Costing — Cost Per M³, Accounting Posting, Budget Control, Profitability & Management Dashboard | `part-125` |  | Part 52 |
| 113 | Advanced Hr & Human Capital Management (Hcm Extension) | `part-129` |  | Part 54 |
| 114 | Advanced Construction Quality Control & Qms (Qms Extension) | `part-130` |  | Part 69 |
| 115 | Project Handover, Closeout & Asset O&M | `part-138` |  | Part 71 |
| 116 | Defect Liability Period (Dlp) & Warranty Management | `part-139` |  | Part 71 |
| 117 | Digital Twin Foundation | `part-140` |  | Part 77 |
| 118 | Productivity Intelligence | `part-072` |  | Part 58 |
| 119 | Advanced Management Mis & Reporting | `part-096` |  | Part 76 |
| 120 | Advanced Report Builder | `part-097` |  | Part 76 |
| 121 | Enterprise Project Control Tower | `part-098` |  | Part 77 |
| 122 | Daily Execution Intelligence & Work-Done / Wip Valuation | `part-099` |  | Part 77 |
| 123 | "Why?" Explainability Engine | `part-100` |  | Part 78 |
| 124 | Advanced Analytics & Forecasting | `part-102` |  | Part 78 |
| 125 | Enterprise Scenario / What-If Simulation Engine | `part-103` |  | Part 78 |
| 126 | Wastage, Leakage & Duplication Detection + Protocol Control Tower | `part-104` |  | Part 77 |
| 127 | Executive Construction Control Tower & Early Warning | `part-105` |  | Part 77 |
| 128 | Ai & Intelligent Erp | `part-106` |  | Part 79 |
| 129 | Ai Governance | `part-107` |  | Part 79 |
| 130 | Computer Vision (Decision Support) | `part-109` |  | Part 79 |
| 131 | Performance, Scalability & Reliability | `part-116` |  | Part 09, Part 83 |
| 132 | Mandatory Monthly Material Reconciliation & Qs Cost-Control Workspace | `part-120` |  | Part 68 |
| 133 | Monthly Closing Protocol, Project Mis, Budget Master & Management Cost-Control Dashboard | `part-121` |  | Part 68 |
| 134 | Advanced Enterprise Reporting, Ai Analytics & Governance | `part-126` |  | Part 76 |
| 135 | Enterprise Data Warehouse & Historical Analytics | `part-127` |  | Part 75 |
| 136 | Data Warehouse, Bi & Metrics Governance | `part-128` |  | Part 75 |
| 137 | Esg & Sustainability Management | `part-131` |  | Part 72 |
| 138 | Hse Management System Extension — Ppe, Contractor Safety, Inspection Registers, Fire & Environment, Audits & Scorecards | `part-132` |  | Part 70 |
| 139 | Security Guard Management — Deployment, Rosters, Gate Control, Visitors, Patrols & Security Incidents | `part-133` |  | Part 57 |
| 140 | Construction Labour Camp, Welfare & Facilities | `part-134` |  | Part 57 |
| 141 | Claims, Eot, Disputes & Evidence Management | `part-137` |  | Part 63 |
| 142 | Standard Business Format Library & Report Design Engine | `part-142` |  | Part 20 |
| 143 | Ai Material Rate Intelligence, Forecasting & Erp-Wide Ai Management Reporting | `part-144` |  | Part 44 |
| 144 | Advanced Enterprise Dashboard & Responsive Ux System (Consolidation) | `part-145` |  | Part 13 |
| 145 | Advanced Super Admin Enterprise Control Center | `part-146` |  | Part 80 |
| 146 | Decision & Approval Intelligence | `part-101` |  | Part 16 |
| 147 | Ai Copilot & Agent Platform (Governed, Advisory) | `part-110` |  | Part 79 |
| 148 | Senior-Initiated Task Assignment & Automatic Department Routing | `part-147` |  | Part 18 |
| 149 | Company Policy Management & Policy-To-Protocol Engine | `part-148` |  | Part 17 |
| 150 | Employee Performance, Daily Task Productivity & Continuous Development | `part-149` |  | Part 58 |
| 151 | Erp-Native Communication Center — Auto Groups, Record Linking, Task Instructions & Message-To-Action | `part-150` |  | Part 25B |
| 152 | Excel Bulk Data Entry Workspace & Module Template Packs | `part-141` |  | Part 24 |
| 153 | E-Way Bill, Transport Integration, Gst Reconciliation & Compliance Dashboard | `part-143` |  | Part 27 |
| 154 | Enterprise Business-Process Simulation & Demo Sandbox | `part-161` |  | Part 81 |
| 155 | Enterprise Security | `part-156` |  | Part 83 |
| 156 | Enterprise Cross-Module Integration | `part-151` |  | Part 82 |
| 157 | Cross-Module Real-Time Control | `part-152` |  | Part 10, Part 82 |
| 158 | Enterprise Data Traceability | `part-153` |  | Part 75 |
| 159 | Global Activity Timeline | `part-154` |  | Part 13 |
| 160 | Enterprise Search & Drill-Down | `part-155` |  | Part 13 |
| 161 | Error Handling & Resilience | `part-159` |  | Part 09 |
| 162 | Data Backup & Disaster Recovery | `part-157` |  | Part 84 |
| 163 | Enterprise Data Retention & Archival | `part-158` |  | Part 84 |
| 164 | Testing & Quality Assurance | `part-162` |  | Part 04, Part 82 |
| 165 | Construction Closeout, Lessons Learned & Knowledge Base | `part-160` |  | Part 86 |
| 166 | Acceptance & Production Readiness | `part-163` |  | Part 85 |

## D6 Plant & Machinery module integration (uploaded module, Parts 00–33 of that series)
The separate *ERP Plant and Machinery Management* prompt series (build Parts 00–25 and add-on Parts 26–33) is fully absorbed. Its requirements now live in the Parts below; run them in this pack's sequence — never the old series alongside. Machine-readable copy: `PLANT_MODULE_CROSSWALK.csv`.

| Module part | Title | Now in Part(s) | Notes |
|---|---|---|---|
| 00 | Role, objective and standing rules | 00 | Source/status labels, factual deviation wording and no simulated integrations added to the constitution (AC-13, N7) |
| 01 | Repository assessment, gap analysis, roadmap | 01 | Covered by the existing-system audit and fitness assessment |
| 02 | Shared platform foundation | 05, 06, 08, 14, 16, 18, 19, 21 | Numbering, jobs, idempotency, hierarchy, audit/revisions, offline, workflow, alerts, attachments, UOM |
| 03 | Roles, permissions and approval hierarchy | 07, 08A, 16 | Permission engine, assignment wizard, approval matrix and delegation |
| 04 | Asset master register | 50 | Category rules, asset record, documents, meters, import, QR |
| 05 | Asset lifecycle, allocation, operators and drivers | 50 | Lifecycle workflows, allocation calendar, operator validation |
| 06 | Daily equipment logbook | 50A | Logbook, validations, daily coverage register |
| 07 | Mandatory operator readings and photo evidence | 50A | Mobile submission, evidence rules, offline queue, OCR aid |
| 08 | Senior authorisation, validation and audit | 50A | Routing, review screen, SoD, flag registry, amendments, SLA |
| 09 | Fuel procurement, storage, issue, reconciliation | 51 | Storage points, instruments, receipts, issues, tank reconciliation |
| 10 | Daily calibrated fuel consumption verification | 51 | Calibration, benchmarks, daily calculation, sign-off, investigations, worked examples |
| 11 | Maintenance, workshop, spares, reliability | 50B | PM, job cards, safety hold, spares, warranty, MTBF/MTTR |
| 12 | External integration hub | 11 | Canonical events, honest connector status, PLC/SCADA read-only, weighbridge, telematics |
| 13 | RMC plant master and production | 52 | Plant, equipment, production orders, batches, stoppages, KPIs |
| 14 | Mix design management | 52 | Derived parameters, trials, approval, revisions, moisture correction |
| 15 | RMC materials and reconciliation | 52, 52A | Materials, silos, QC holds, consumption in 52; planned→invoiced reconciliation in 52A |
| 16 | Quality assurance and quality control | 69, 52 | Tests, specimens, NCR, traceability; mix-design trial links |
| 17 | RMC orders and production scheduling | 52A | Orders, credit/technical checks, schedule board, reservations |
| 18 | Dispatch, transit mixers and pumps | 52A | Dispatch workflow, challans, driver/site apps, pumps, exceptions |
| 19 | Team Chat core and security | 25, 25A, 25C | WorkChat core, experience and security/governance (see §D7) |
| 20 | ERP-linked chat and notifications | 25B, 50, 50A, 50B, 51, 52A, 55 | EntityRegistry, record threads and cards in 25B; providers and alert templates in the module Parts |
| 21 | Finance, accounting, costing | 26, 27, 50, 52, 52A, 64, 65 | Posting, GST, equipment cost, cost per m³, RMC invoicing, AP/AR |
| 22 | Dashboards: executive, fleet, operator, fuel | 13, 50, 50A, 51, 77 | Framework in 13; module dashboards in their Parts; executive in 77 |
| 23 | RMC, dispatch, financial dashboards; action centre | 18, 52, 52A, 77 | Action centre on the Part 18 alert service |
| 24 | Reports, exports and auditability | 75, 76, 08 | Dashboard–report parity, PDF/.xlsx, evidence packs, audit viewer |
| 25 | Testing, acceptance, deployment | 81, 82, 83, 85 | Added fleet, RMC, attendance and access chains; pilot parallel runs |
| 26 | Add-on assessment and shared foundations | 55, 76, 07 | Geofence service, export check, permission extensions |
| 27 | Website Administrator and platform administration | 08A, 80 | Platform Administrator separation, safeguards, break-glass |
| 28 | Attendance core | 55 | Shifts, calendars, multi-punch daily record, leave, calculations |
| 29 | Geofence check-in and check-out | 55 | Verification results, safeguards, offline, privacy |
| 30 | Attendance approval protocol | 55 | Levels, returns, corrections as revisions, period lock, escalation |
| 31 | Attendance integration with operations, dispatch, finance | 55 | Presence hooks into 50/50A/52A, labour cost, payroll export once |
| 32 | Attendance dashboards and reports | 55, 76 | KPIs, HR dashboard, PDF and .xlsx reports |
| 33 | Add-on verification, regression and release | 82, 83, 85 | Acceptance chains, certification, pilot release |

## D7 WorkChat module integration (uploaded module, Parts 00–25 of that series)
The separate *WorkChat* prompt series (shared operating contract plus Parts 00–25) is fully absorbed into Parts 25, 25A, 25B, 25C and 80A, with hooks in the Parts listed below; run them in this pack's sequence — never the old series alongside. Owner gates from that series map to Part 25 F33 (gates a–h). Its ADR numbers (e.g., ADR-006 licence, ADR-012 encryption) are re-registered in the Part 02 ADR register with the old numbers kept as aliases. Machine-readable copy: `WORKCHAT_MODULE_CROSSWALK.csv`.

| Module part | Title | Now in Part(s) | Notes |
|---|---|---|---|
| SOC | Shared operating contract | 00 | Folded into the constitution: inspect before modifying, additive reversible migrations, server-side authorisation with 404 for unseen records, no placeholders, no unverified encryption/licence/performance claims, i18n and accessibility. The 40K-token session budget and NN.a sessions are superseded by Part budgets and delivery slices; docs/workchat/ evidence maps to docs/erp-program/modules/msg/ |
| 00 | Existing system discovery | 01, 25 | Communication inventory (REQ-DISC-F18) and mode decision; earlier WorkChat builds run VERIFY & EXTEND |
| 01 | Business requirements and functional specification | 25 | SPEC with FR-<AREA>-NNN IDs, NFR numbers, policy defaults, external-party policy, FR-WF-001 (chat is never approval), owner gates |
| 02 | System architecture and integration design | 25, 10 | Placement and real-time transport ADRs on the shared socket, components, outbox send path, UUIDv7 + per-conversation seq, versioned API and events, PermissionAdapter, spike |
| 03 | Signal reference and licensing | 25C, 08 | Reference review at pinned commits, AGPLv3 analysis with counsel questions, OSS register and SBOM, E2E library alternatives, branding rules as tests, CI licence check |
| 04 | Database and backward-compatible migrations | 25, 03 | Additive chat_* schema, direct pairs, watermarks, seq allocation ADR with concurrency test, up/down/up on a production-like copy |
| 05 | Authentication, authorisation and presence | 25, 07, 08A | 60 s single-use connection token, socket revocation ≤ 60 s, PermissionAdapter, 404 rule, presence privacy, authorisation matrix |
| 06 | Real-time messaging infrastructure | 25, 10, 14 | User-room fan-out, transactional outbox, versioned envelope, idempotent submit (409 on reuse), acks, sync cursor, reconnect with jitter, offline outbox, heartbeats, limits |
| 07 | Private messaging | 25A | Direct messages, edit/delete windows with tombstones, forward, history, unread |
| 08 | Group chat | 25A | Roles, membership operations with system messages, last-owner protection, announcement mode, pins, archive, 500-member fan-out |
| 09 | Project and team channels | 25A, 25B, 06 | Channels by project/department/site/unit, visibility, rule engine with dry-run and reconciliation, archive on close, Discuss/Channel entry points |
| 10 | Message composer and interactions | 25A | Safe markdown, emoji, reactions, threads, mentions, drafts, priority, shortcuts, accessibility, typing |
| 11 | Attachments and documents | 25A, 19 | Upload slots, magic bytes, hold-until-clean scanning, signed downloads, previews, EXIF policy, voice notes, camera, document links, gallery |
| 12 | Search and history | 25A, 13 | Permission filtering inside the query, back-fill, saved items, quick switcher, 1 M-message performance |
| 13 | Receipts and synchronisation | 25A | Monotonic watermarks, receipt privacy both ways, multi-device sync, unread model |
| 14 | Notifications and alerts | 25A, 10 | Adapter into the notification engine, decision engine, coalescing, Web Push/FCM/APNs, no body in push by default |
| 15 | Construction ERP integration | 25B + module Parts | EntityRegistry and provider hooks in 32, 34, 42, 46, 47, 50, 50A, 50B, 51, 52A, 54, 55, 59, 64, 69, 70, 73; outbound actions only via module services |
| 16 | Workflow and approvals | 25B, 16, 18 | Workflow event consumer, approval cards via the Part 16 action API with step-up, stale-card rejection, pending actions, reminders |
| 17 | Voice, video and meetings | 25C, 18 | Calls scope gate (A/B/C), voice-note hardening, meeting cards, TURN/SFU only if approved, honest encryption claims |
| 18 | Security and privacy | 25C, 83 | STRIDE threat model, ASVS L2, IDOR suite, abuse limits, headers, client data wipe, privacy policy set |
| 19 | End-to-end encryption | 25C | Impact matrix, decision A/B/C, secure class only if approved, SR-E2E tests, no custom crypto, claims rule |
| 20 | Responsive interface | 25A, 12 | Three/two/single-pane layouts, docked mini-chats, accessibility, bundle and scroll budgets, no Signal branding |
| 21 | Administration and governance | 25C, 80, 84, 63 | Roles without read-all, policies, retention with certificates, legal hold, four-eyes export, moderation, audit viewer |
| 22 | Performance and scalability | 80A, 09 | Targets, load harness, 10 M-message dataset, tuning, scaling, chaos, restore test |
| 23 | Testing and regression | 80A, 04, 82 | Requirement coverage, thresholds, CI stages, device matrix, ERP regression |
| 24 | Deployment and operations | 25C, 80A, 85 | Pilot with feature flag, kill switch and synthetic check in 25C; enterprise waves in 80A; go-live in 85 |
| 25 | Final acceptance and handover | 80A, 83, 85 | Verification table, claims audit, licence compliance, documentation set, residual list |

## D8 Out of scope (unchanged owner decision)
BIM model authoring/viewing/IFC parsing/model-based take-off and Process Mining — see `EXCLUDED/`.
