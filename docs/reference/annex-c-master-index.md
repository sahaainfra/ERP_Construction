# PART 00 — ANNEX C: MASTER INDEX, DEPENDENCIES & PARALLEL LANES

> Generated from the pack structure (`tools/parts.py`). Execute Parts in number order 00 → 86. A Part starts only when every Part in *Depends on* is APPROVED. *May run in parallel with* lists Parts of the same phase and dependency level that do not depend on each other — use parallel sessions only with separate feature flags and branches, and merge through the Part 04 pipeline.

## C1 Phases
| Phase | Name | Parts | Count |
|---|---|---|---|
| 1 | Governance, Discovery & Architecture | 00–04 | 5 |
| 2 | Platform Foundation | 05–11 | 8 |
| 3 | Experience Platform | 12–15 | 4 |
| 4 | Shared Business Engines | 16–27 | 15 |
| 5 | Pre-Construction & Project Setup | 28–37 | 10 |
| 6 | Planning & Project Controls | 38–43 | 6 |
| 7 | Supply Chain | 44–49 | 6 |
| 8 | Plant, Equipment & Production | 50–53 | 7 |
| 9 | Workforce | 54–58 | 5 |
| 10 | Commercial Operations | 59–63 | 5 |
| 11 | Finance, Treasury & Profitability | 64–68 | 5 |
| 12 | Quality, HSE & Completion | 69–72 | 4 |
| 13 | External Collaboration & Add-ons | 73–74 | 2 |
| 14 | Enterprise Intelligence & AI | 75–79 | 5 |
| 15 | Administration, Assurance & Go-Live | 80–86 | 8 |

## C2 Index
| Part | Title | Code | Phase | Risk | Default mode | Depends on | Consumed by | May run in parallel with |
|---|---|---|---|---|---|---|---|---|
| 00 | Program Constitution & Agent Operating System | `pgm` | 1 | High | ADOPT | — | 01 | — |
| 01 | Existing System Audit, Architecture Fitness Assessment & Golden Baseline | `disc` | 1 | High | VERIFY & EXTEND | 00 | 02, 03, 04, 15 | — |
| 02 | Target Architecture, Technology Stack & Architecture Decision Framework | `arch` | 1 | High | BUILD | 01 | 03, 04, 05 | — |
| 03 | Database Foundation, Schema Evolution & Data Migration Framework | `dbf` | 1 | High | BUILD or EXTEND | 01, 02 | 04, 05 | — |
| 04 | Quality Engineering, CI/CD, Test Automation & Release Management | `cicd` | 1 | High | VERIFY & EXTEND | 01, 02, 03 | 05, 08, 09 | — |
| 05 | Shared Kernel & Core Platform Services | `core` | 2 | High | VERIFY & EXTEND | 02, 03, 04 | 06, 07, 08, 09, 10, 12, 22 | — |
| 06 | Enterprise Structure: Organisation, Company, Project & Site | `org` | 2 | High | VERIFY & EXTEND | 05 | 07, 08A, 16, 17, 21, 32, 54 | — |
| 07 | Identity, Access Control, Segregation of Duties & Zero-Trust | `iam` | 2 | High | VERIFY & EXTEND | 05, 06 | 08, 08A, 10, 11, 12, 14, 16, 17 … | — |
| 08 | Audit Trail, Secure SDLC & Security Governance | `secgov` | 2 | High | VERIFY & EXTEND | 04, 05, 07 | 08A, 09, 10, 11, 16, 19, 79 | — |
| 08A | Secure Login, Admin User Provisioning, Credentials & Session Lifecycle | `auth` | 2 | High | VERIFY & EXTEND | 06, 07, 08 | 25, 25C, 80 | 09, 10 |
| 09 | Observability, Reliability, Performance & Error Handling | `obs` | 2 | High | VERIFY & EXTEND | 04, 05, 08 | — | 08A, 10 |
| 10 | Event Bus, Real-time & Notification Engine | `evbus` | 2 | High | VERIFY & EXTEND | 05, 07, 08 | 11, 13, 14, 16, 18, 25, 75 | 08A, 09 |
| 11 | Integration Platform, API Gateway & Developer Portal | `intg` | 2 | High | VERIFY & EXTEND | 07, 08, 10 | 25, 27 | — |
| 12 | Enterprise Design System, App Shell & Navigation | `ds` | 3 | Medium | VERIFY & EXTEND | 05, 07 | 13, 14, 15, 24, 25A | — |
| 13 | Dashboard Engine, Launchpad, Global Search & Drill-down | `dash` | 3 | Medium | VERIFY & EXTEND | 10, 12 | 15, 25A | 14 |
| 14 | Responsive Field App & Offline-First Engine | `field` | 3 | High | VERIFY & EXTEND | 07, 10, 12 | 15, 25A, 42, 50A, 55 | 13 |
| 15 | Existing Application Redesign & Screen Migration | `uxmig` | 3 | Medium | BUILD or EXTEND | 01, 12, 13, 14 | — | — |
| 16 | Workflow, Business Rules & Delegation of Authority | `wf` | 4 | High | VERIFY & EXTEND | 06, 07, 08, 10 | 17, 18, 19, 21, 25B, 26, 28, 46 … | — |
| 17 | Protocol & Control Engine, RACI, Action Ledger & Policy-to-Protocol | `protocol` | 4 | High | VERIFY & EXTEND | 06, 07, 16 | 18, 21, 25C, 26, 41, 46, 50A, 77 … | 19 |
| 18 | Tasks, Alerts, Escalations, Meetings & Automation | `task` | 4 | Medium | VERIFY & EXTEND | 10, 16, 17 | 25B, 58 | 20, 21, 25 |
| 19 | Document Control, Correspondence & Common Data Environment | `doc` | 4 | Medium | VERIFY & EXTEND | 07, 08, 16 | 20, 25, 25A, 30, 34, 37, 63 | 17 |
| 20 | Document Generation, Templates, e-Signature & Verification | `docgen` | 4 | Medium | VERIFY & EXTEND | 19 | 31, 76 | 18, 21, 25 |
| 21 | Master Data Governance | `mdm` | 4 | High | BUILD or EXTEND | 06, 16, 17 | 22, 23, 24, 26, 27, 28, 44, 54 | 18, 20, 25 |
| 22 | Central Calculation Engine & Formula Registry | `calc` | 4 | High | BUILD or EXTEND | 05, 21 | 23, 26, 27, 29, 75 | 25A |
| 23 | Item Master, Resource Catalogue & Item Selector | `item` | 4 | High | BUILD or EXTEND | 21, 22 | 24, 29, 33, 35, 40, 44, 50 | 26 |
| 24 | Data-Entry Framework & Excel Data Exchange | `dex` | 4 | High | BUILD or EXTEND | 12, 21, 23 | 25B | 27 |
| 25 | Unified Communication Platform: Gateway, WorkChat Architecture, Data Model & Real-time Core | `msg` | 4 | High | VERIFY & EXTEND | 08A, 10, 11, 19 | 25A | 18, 20, 21 |
| 25A | WorkChat Conversations & Messaging Experience: Direct, Groups, Channels, Composer, Attachments, Search, Receipts, Notifications & Unified Inbox | `wchat` | 4 | High | VERIFY & EXTEND | 12, 13, 14, 19, 25 | 25B | 22 |
| 25B | WorkChat ERP Integration: Communication Center, Record Discussions, Instructions, Conversions & Workflow Cards | `wcerp` | 4 | High | BUILD or EXTEND | 16, 18, 24, 25A | 25C | — |
| 25C | WorkChat Security, Privacy & Governance: Licences, Encryption Decision, Calls, Administration, Retention, Legal Hold & Pilot Release | `wcgov` | 4 | High | VERIFY & EXTEND | 08A, 17, 25B | 80A | — |
| 26 | Financial Backbone: Chart of Accounts, General Ledger, Posting Engine & Period Control | `fin` | 4 | High | BUILD or EXTEND | 16, 17, 21, 22 | 27, 39, 47, 52, 56, 59, 61, 64 … | 23 |
| 27 | Tax & e-Compliance Engine: GST, TDS, e-Invoice & e-Way Bill | `tax` | 4 | High | BUILD or EXTEND | 11, 21, 22, 26 | 46, 52A, 56, 61, 64, 74 | 24 |
| 28 | CRM, Business Development & Bid/No-Bid | `crm` | 5 | Medium | BUILD or EXTEND | 16, 21 | 30 | — |
| 29 | Rate Analysis Engine & Schedule-of-Rates Library | `ratean` | 5 | High | BUILD or EXTEND | 22, 23 | 30, 33, 39 | — |
| 30 | Tender Management, Estimation & Bid Pricing | `tnd` | 5 | Medium | BUILD or EXTEND | 19, 28, 29 | 31 | — |
| 31 | Contract Lifecycle Management & Tender-to-Execution Handover | `ctr` | 5 | High | BUILD or EXTEND | 20, 30 | 32, 59, 62 | — |
| 32 | Project Setup, Project 360 & Statutory Approvals Register | `prj` | 5 | Medium | BUILD or EXTEND | 06, 31 | 33, 34, 36, 37, 38, 74 | — |
| 33 | WBS, CBS, BOQ & Work Packages | `boq` | 5 | High | BUILD or EXTEND | 23, 29, 32 | 34, 35, 36, 38, 39, 59, 60, 62 | 37 |
| 34 | Engineering & Design Management: Drawings, Submittals & RFIs | `eng` | 5 | Medium | BUILD or EXTEND | 19, 32, 33 | 35, 69, 73 | 36 |
| 35 | Quantity Take-off (MTO), Bar Bending Schedules & Quantity Derivation | `mto` | 5 | Medium | BUILD or EXTEND | 23, 33, 34 | 45 | — |
| 36 | Risk & Opportunity Management | `risk` | 5 | Medium | BUILD or EXTEND | 32, 33 | 38, 67 | 34 |
| 37 | GIS, Survey, Land / Right-of-Way & Reality Capture | `gis` | 5 | Medium | BUILD or EXTEND | 19, 32 | 55 | 33 |
| 38 | Planning & Scheduling | `plan` | 6 | High | BUILD or EXTEND | 32, 33, 36 | 39, 40, 41, 45, 63 | — |
| 39 | Budgeting & Cost Control | `bud` | 6 | High | BUILD or EXTEND | 26, 29, 33, 38 | 40, 41, 43, 46 | — |
| 40 | Resource & Capacity Planning | `rescap` | 6 | Medium | BUILD or EXTEND | 23, 38, 39 | 41, 45, 50 | — |
| 41 | Work Authorisation & Daily Work Planning | `wa` | 6 | High | BUILD or EXTEND | 17, 38, 39, 40 | 42, 47, 49, 50, 55, 59, 69 | — |
| 42 | Site Execution, DPR, Hindrance & Weather | `site` | 6 | High | BUILD or EXTEND | 14, 41 | 43, 58, 60, 69, 80A | — |
| 43 | Progress Measurement, EVM & Planned-vs-Budgeted-vs-Actual | `prog` | 6 | High | BUILD or EXTEND | 39, 42 | 67 | — |
| 44 | Supplier Management & Material Rate Intelligence | `srm` | 7 | Medium | BUILD or EXTEND | 21, 23 | 46 | — |
| 45 | Material Demand Planning (MRP) | `mrp` | 7 | Medium | BUILD or EXTEND | 35, 38, 40 | 46 | — |
| 46 | Procurement & Purchase Management | `proc` | 7 | High | BUILD or EXTEND | 16, 17, 27, 39, 44, 45 | 47, 48, 64, 67, 73, 80A | — |
| 47 | Stores & Inventory Management | `stores` | 7 | High | BUILD or EXTEND | 26, 41, 46 | 48, 49, 50, 50B, 51, 52, 64, 72 | — |
| 48 | Site Logistics, Gate, Weighbridge & Vehicle Control | `logistics` | 7 | Medium | BUILD or EXTEND | 46, 47 | 57 | 49 |
| 49 | Formwork, Scaffolding, Tools & Returnable Assets | `tools` | 7 | Medium | BUILD or EXTEND | 41, 47 | — | 48 |
| 50 | Plant, Machinery & Fleet Management | `plant` | 8 | High | BUILD or EXTEND | 23, 40, 41, 47 | 50A, 50B, 52, 53, 66, 72 | — |
| 50A | Daily Equipment Logbook, Operator Readings, Photo Evidence & Senior Authorisation | `plog` | 8 | High | BUILD or EXTEND | 14, 16, 17, 50 | 50B, 51, 55 | — |
| 50B | Maintenance, Workshop, Spare Parts & Reliability | `maint` | 8 | High | BUILD or EXTEND | 47, 50, 50A | 51, 52, 52A, 80A | — |
| 51 | Fuel Management, Calibrated Daily Consumption Verification & Anti-Leakage Control | `fuel` | 8 | High | BUILD or EXTEND | 47, 50A, 50B | 80A | 52 |
| 52 | RMC & Batching Plant Operations, Mix Design and Costing | `rmc` | 8 | High | BUILD or EXTEND | 26, 47, 50, 50B | 52A, 53 | 51 |
| 52A | RMC Orders, Production Scheduling, Dispatch, Transit Mixers & Concrete Pumps | `rmcdisp` | 8 | High | BUILD or EXTEND | 27, 50B, 52 | 55, 80A | 53 |
| 53 | Production Units: Crusher, Hot-Mix, Precast & Fabrication Yards | `prod` | 8 | Medium | BUILD | 50, 52 | — | 52A |
| 54 | HR Core & Human Capital Management | `hr` | 9 | High | BUILD or EXTEND | 06, 07, 21 | 55, 57, 70 | — |
| 55 | Labour Management, Geofenced Attendance, Timekeeping & Attendance Approval | `att` | 9 | High | BUILD or EXTEND | 14, 37, 41, 50A, 52A, 54 | 56, 58, 80A | — |
| 56 | Payroll & Labour Statutory Compliance | `pay` | 9 | High | BUILD or EXTEND | 26, 27, 55 | — | 58 |
| 57 | Site Facilities: Labour Camps, Welfare & Security Guards | `fac` | 9 | Medium | BUILD or EXTEND | 48, 54 | — | — |
| 58 | Workforce Productivity & Performance Management | `empperf` | 9 | Medium | BUILD or EXTEND | 18, 42, 55 | — | 56 |
| 59 | Subcontract & Work-Order Management | `subcon` | 10 | High | BUILD or EXTEND | 26, 31, 33, 41 | 60, 64, 73 | — |
| 60 | Quantity Surveying, Measurement Book & Certification | `qs` | 10 | High | BUILD or EXTEND | 33, 42, 59 | 61, 67 | — |
| 61 | Client Billing, Price Variation, Retention & Collections | `bill` | 10 | High | BUILD or EXTEND | 26, 27, 60 | 62, 65, 67, 71, 73 | — |
| 62 | Change & Variation Management | `chg` | 10 | High | BUILD or EXTEND | 31, 33, 61 | 63 | — |
| 63 | Claims, Extension of Time & Dispute Management | `claims` | 10 | Medium | BUILD or EXTEND | 19, 38, 62 | — | — |
| 64 | Accounts Payable, Multi-way Matching, Site Imprest & Expenses | `ap` | 11 | High | BUILD or EXTEND | 26, 27, 46, 47, 59 | 65, 80A | — |
| 65 | Receivables, Cash Flow, Treasury, Bank Guarantees & Banking | `treasury` | 11 | High | BUILD or EXTEND | 61, 64 | 68 | 66, 67 |
| 66 | Fixed Assets, Joint Ventures & Inter-company Accounting | `fa` | 11 | High | BUILD or EXTEND | 26, 50 | — | 65, 67 |
| 67 | Cost Forecasting (EAC/ETC) & Cost-Value Reconciliation | `eac` | 11 | High | BUILD or EXTEND | 36, 43, 46, 60, 61 | 68 | 65, 66 |
| 68 | Project P&L, Profitability & Monthly Close | `pnl` | 11 | High | BUILD or EXTEND | 65, 67 | 75 | — |
| 69 | Quality Management (QA/QC), Inspections & Lab Testing | `qa` | 12 | Medium | BUILD or EXTEND | 34, 41, 42 | 70, 71 | — |
| 70 | HSE Management & Permit-to-Work | `hse` | 12 | Medium | BUILD or EXTEND | 54, 69 | 72, 80A | — |
| 71 | Testing, Commissioning, Handover, Closeout & Defect Liability | `tnc` | 12 | Medium | BUILD or EXTEND | 61, 69 | — | 72 |
| 72 | ESG, Sustainability & Environmental Compliance | `esg` | 12 | Low | BUILD or EXTEND | 47, 50, 70 | — | 71 |
| 73 | External Portals: Supplier, Subcontractor, Client & Consultant | `portal` | 13 | High | BUILD or EXTEND | 34, 46, 59, 61 | 80A | — |
| 74 | Real Estate Sales & Customer Management (optional developer edition) | `resale` | 13 | Medium | BUILD | 26, 27, 32 | — | — |
| 75 | Enterprise Data Platform, Metric Catalogue & Data Lineage | `dwh` | 14 | High | BUILD or EXTEND | 10, 22, 68 | 76, 77, 78, 79 | — |
| 76 | Reporting, MIS & Report Builder | `mis` | 14 | Medium | BUILD or EXTEND | 20, 75 | 77 | — |
| 77 | Control Towers, Early Warning & Wastage/Leakage Detection | `tower` | 14 | High | BUILD or EXTEND | 17, 75, 76 | 78 | — |
| 78 | Analytics, Forecasting, Scenario Simulation & Explainability | `fcst` | 14 | Medium | BUILD or EXTEND | 75, 77 | 79 | — |
| 79 | AI Platform: Copilot, Agents, Document Intelligence, Vision & Governance | `ai` | 14 | High | BUILD or EXTEND | 07, 08, 75, 78 | 80, 80A | — |
| 80 | Super Admin Control Center & Configuration Studio | `admin` | 15 | High | BUILD or EXTEND | 08A, 17, 79 | 80A, 81 | — |
| 80A | WorkChat Enterprise Activation: Cross-Module Coverage, Scale & Resilience Certification and Staged Roll-out | `wcops` | 15 | High | BUILD | 25C, 42, 46, 50B, 51, 52A, 55, 64, 70, 73, 79, 80 | 81 | — |
| 81 | Simulation Sandbox, UAT & Training | `sandbox` | 15 | Medium | BUILD or EXTEND | 80, 80A | 82 | — |
| 82 | End-to-End Integration & Cross-Module Reconciliation Testing | `xint` | 15 | High | BUILD or EXTEND | 81 | 83 | — |
| 83 | Security, Performance & Accessibility Certification | `cert` | 15 | High | BUILD or EXTEND | 82 | 84 | — |
| 84 | Backup, Disaster Recovery, Data Retention & Archival | `dr` | 15 | High | BUILD or EXTEND | 83 | 85 | — |
| 85 | Data Cutover, Go-Live & Hypercare | `golive` | 15 | High | BUILD or EXTEND | 84 | 86 | — |
| 86 | Continuous Improvement, Lessons Learned & Knowledge Management | `kaizen` | 15 | Low | BUILD or EXTEND | 85 | — | — |

## C3 Ordering invariants (checked by `tools/verify_pack.py`)
1. Every dependency has a smaller Part number (no forward dependency).
2. Governance, discovery, architecture, database and quality gates (Parts 01–04) precede every code change.
3. Platform (05–11), experience (12–15) and shared engines (16–27) — including workflow, protocol, documents, masters, calculation, Item Master, data entry, communication, general ledger with posting engine and the tax engine — precede the first business transaction (Part 28 onward).
4. Schedule (38) precedes budget time-phasing (39); budget (39) precedes work authorisation (41) and procurement (46); measurement (60) precedes billing (61); EAC (67) precedes P&L (68).
5. Intelligence (75–80) consumes only certified data from earlier Parts; assurance and go-live (81–86) close the program.
6. High-risk Parts need an independent reviewer for the audit record.
