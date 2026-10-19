# PART 00 — ANNEX B: CONSTRUCTION DOMAIN REFERENCE

> Reference data, roles, formulas and conventions used across Parts 28–86. Everything statutory or commercial here is **seed configuration**: effective-dated, owned by a named business role, and confirmed against the source in force before go-live (N16, AC-7). Load only the sections a Part cites (B1…B12).

---

## B1 Expert panel — what each senior role needs from the ERP

| Role | Accountable for | Decisions the ERP must support | Non-negotiable controls they expect |
|---|---|---|---|
| **Project Director** | Delivery of the portfolio/project on time, cost, quality, safety | Baseline approval, EOT strategy, resource re-allocation, escalation response, client relationship | Single Project 360; early-warning on SPI/CPI/EAC/cash; no surprises at month-end; every red KPI drillable to cause and owner |
| **CFO** | Cash, margins, books, compliance, funding | Payment prioritisation, working capital, BG/LC limits, project P&L sign-off, provisioning | Posting only via rules; period locks; sub-ledger = GL; P&L ≠ cash; 13-week cash forecast; maker-checker on payments and bank masters; statutory filings on time |
| **Procurement In-charge** | Right material/service, right price, right time | Vendor selection, negotiation, rate contracts, expediting, split awards | ≥ 3 quotes above threshold; L1 or justified; budget check; benchmark rates; no split POs; vendor performance |
| **Store In-charge** | Custody and accuracy of stock at site | Receipt acceptance, issue against authorisation, transfer, physical verification, write-off proposals | No issue without WA/indent; GRN with evidence; FIFO/batch; cycle counts; theoretical vs actual consumption; custody segregation from procurement |
| **Quantity Surveyor** | Measurement, certification, billing quantities, subcontract bills, variations | MB entry, check measurement, rate for extra items, deviation statements | Quantity chain integrity; MB ↔ drawing ↔ DPR; billed ≤ certified; deviation limits; reconciliation of material vs work done |
| **Planning Manager** | Baseline, updates, look-ahead, resource loading, delay analysis | Baseline approval, recovery plans, constraint removal, EOT time-impact | Versioned baselines; status date discipline; critical path and float tracking; productivity norms; plan-before-execute |
| **Commercial Manager** | Contract value, recoveries, claims, CVR, margin | Variation pricing, claim strategy, CVR approval, subcontract terms | CVR monthly; variation register; notices within contractual time bars; retention/advance ledgers; LD exposure |
| **HR In-charge** | People supply, compliance, payroll, welfare | Hiring, deployment, wage revisions, statutory filings, labour contractor compliance | Statutory compliance calendar; minimum wages by state/skill; contractor workers' PF/ESI proof before contractor payment; attendance → payroll lock; data privacy |
| Plant Manager | Fleet availability, utilisation, maintenance, hire | Allocation, hire/de-hire, repair vs replace | Log books vs WA, fuel norms, PM schedule, hired-plant idle alerts |
| QA/QC Manager | Conformance, testing, NCR closure | Hold points, material acceptance, NCR disposition | ITP before work; test before use; no billing of non-conforming work |
| HSE Manager | Zero harm, statutory safety | Permit approval, stop-work, incident investigation | PTW for hazardous work; competence validity; incident reporting within statutory time |

## B2 Contract and procurement models
Item-rate / BOQ · Percentage rate (above/below SOR) · Lump sum · EPC / turnkey · HAM (hybrid annuity) · BOT/TOT · Cost-plus (fee) · Rate contract (framework) · Work order · Labour-only · Supply-only · Supply-and-install · Plant hire (with/without operator, dry/wet) · Design-build · Back-to-back subcontract · Nominated subcontract · JV/consortium (integrated or non-integrated).
Standard conditions referenced as configuration templates: CPWD GCC, state PWD GCC, MoRTH/NHAI EPC & HAM model agreements, FIDIC (Red/Yellow/Silver), private client forms. Clause library entries carry obligation type, time bar, notice requirement and financial effect.

## B3 Commercial terms and their formulas (seed — every value configurable per contract)
| Term | Mechanism | Formula / rule |
|---|---|---|
| Mobilisation advance | Paid against BG; interest-bearing or free per contract | Recovery starts when cumulative work done ≥ S % of contract value and completes by E %; recovery in a bill = advance × (value of work in bill ÷ ((E − S) % × contract value)); interest on outstanding per contract |
| Machinery / plant advance | Against hypothecation + BG | Recovered pro-rata per contract schedule |
| Secured advance on materials | Non-perishable materials brought to site, not yet incorporated | Advance ≤ P % (seed 75 %) of material value at lower of invoice/SOR rate; recovered as materials are consumed per MB quantities × consumption norm |
| Retention money | Deducted from each bill | Retention = R % (seed 5 %) of bill value, until cap C % of contract value; release per contract (e.g., 50 % at completion, 50 % after DLP) or against BG |
| Performance security / security deposit | BG or deduction | Amount and validity per contract (validity ≥ DLP + claim period); expiry tracked (DR-32) |
| Price variation / escalation | Index-linked | Adjustment = V × Σ kᵢ × (Iᵢ,current − Iᵢ,base) ÷ Iᵢ,base, where V = value of work done in the period subject to PV, kᵢ = component share (labour, cement, steel, bitumen, fuel, other materials, plant), I = notified indices (WPI/CPI/RBI/ministry) for the applicable months; or the contract's own formula (e.g., CPWD clause 10CC, 10CA for cement/steel; FIDIC 13.8). Indices and base dates are versioned data |
| Liquidated damages | Delay-based | LD = rate (% of contract value per week/day of delay) × delay, capped at cap %; EOT granted reduces delay |
| Bonus for early completion | Per contract | Rate × days early, capped |
| Variation / deviation | Quantities beyond deviation limit (e.g., ±25 % of item, or contract-specific) | Within limit: BOQ rate; beyond: derived rate (rate analysis on market/SOR rates with contractor's percentage) or agreed rate |
| Extra / substituted items | Not in BOQ | Rate by derivation from similar items, SOR + percentage, or market rate analysis; approval before execution (or recorded instruction) |
| Withheld amounts | Disputed/incomplete work | Withheld per item, released on rectification |
| Statutory deductions on client bills | TDS (income tax), GST-TDS, labour welfare cess | Rates/thresholds per B5 configuration |

## B4 Measurement and quantity standards
- Measurement: IS 1200 (method of measurement of building and civil engineering works, all parts), MoRTH specifications (roads/bridges), CPWD specifications; client-specific measurement rules attach to the contract.
- Schedules of rates: CPWD DSR, state SORs, MES, railway USSOR, NHAI/MoRTH SOR — versioned libraries (Part 29) with region and effective date.
- Reinforcement: unit weight (kg/m) = d² ÷ 162.2 (d in mm); cut length = Σ straight segments + hooks − bend deductions; seed bend deductions 45° = 1d, 90° = 2d, 135° = 3d, 180° = 4d; hooks and laps per IS 2502 / IS 456 / IS 13920 and drawing notes — all configurable per project.
- Concrete: quantities in m³ by element; cube/cylinder sampling frequency and acceptance per IS 456 (current amendment) configured as rules; wastage allowances per PC-4.
- Earthwork: cross-section/levels method (average end area, prismoidal), lead and lift; mass-haul for roads.
- Brickwork/blockwork, plaster, flooring, painting: deductions for openings per IS 1200 rules.
- Survey: chainage, offset, level; coordinate system and datum per project (WGS84/UTM or local grid).

## B5 Indian statutory and tax reference (seed; confirm with tax/HR owners; effective-dated)
| Area | What the ERP must support (configuration, not code) |
|---|---|
| GST | GSTIN validation; place of supply (CGST+SGST vs IGST); works contract service rates and concessional rates by project/client type; RCM (e.g., GTA, security services, legal); ITC eligibility and blocked credits (e.g., works contract for immovable property owned by the taxpayer); e-invoice (IRN, signed QR) above notified turnover; e-way bill (value threshold, distance-based validity, Part-B vehicle update, extension, cancellation window); returns reconciliation (GSTR-1, GSTR-3B, GSTR-2B/IMS); GST-TDS on specified government contracts |
| Income tax TDS/TCS | **Income-tax Act, 2025 in force from 1-Apr-2026** consolidates TDS provisions (unified section 393 with tables) — configure both legacy references (194C contractors, 194J professional/technical, 194I rent of plant/land/building, 194Q purchase of goods, 194H commission) for historical periods and the new references for current periods; rates, thresholds (single and aggregate), PAN-unavailable rates, lower-deduction certificates; quarterly returns and certificates |
| Labour law | **Four Labour Codes in force from 21-Nov-2025** (Code on Wages; Industrial Relations Code; Code on Social Security; Occupational Safety, Health & Working Conditions Code) subsume earlier Acts (Minimum Wages, Payment of Wages, Bonus, EPF, ESI, BOCW, CLRA, Inter-State Migrant Workmen, etc.) — central and state rules are being notified; configure by state and effective date: minimum wages by state/zone/skill and VDA revisions, wage definition (50 % rule for allowances), PF and ESI contributions and wage ceilings, professional tax slabs, labour welfare fund, building & other construction workers' cess (seed 1 % of construction cost) and worker registration, contractor licensing/registration, registers and returns, working hours/overtime rate, leave, gratuity, bonus |
| Other | MSME payment timeline (45 days) tracking for MSME-registered vendors; TDS on rent/lease of plant; stamp duty on contracts/BGs (state); environmental consents (CTE/CTO), explosives licences, labour licences, fire NOC, height clearance, tree-felling, mining/royalty for borrowed earth/aggregates (royalty challans, transit passes) |

## B6 Wastage, norms and productivity seeds (project-overridable)
Material wastage (PC-4): cement 2 %, steel 3 %, bricks/blocks 5 %, aggregates 5 %, sand 5 %, RMC 1.5 %, tiles 5 %, paint 5 %, timber 10 %, bitumen 2 %.
Consumption norms come from approved rate analyses (Part 29) per item version — not from this table.
Labour productivity norms (output per man-day) and plant output norms (per machine-hour) are versioned norm libraries per company and region; seeds from the company's historical actuals (Part 86 knowledge base) once available.
Formwork: repetitions per system (plywood 6–10, steel 50–100, aluminium 150–250) — wear allowance per use drives write-off (Part 49).

## B7 KPI dictionary (formulas live in Part 22; definitions in the metric catalogue, Part 75)
| KPI | Definition |
|---|---|
| Physical progress % | Σ(weight × activity % complete) by WBS level (weights by budget value or contract value — configured) |
| PV / EV / AC | Planned value (budgeted cost of work scheduled) · Earned value (budgeted cost of work performed) · Actual cost |
| SPI / CPI | EV ÷ PV · EV ÷ AC |
| SV / CV | EV − PV · EV − AC |
| EAC (CPI method) / ETC / VAC / TCPI | BAC ÷ CPI · EAC − AC · BAC − EAC · (BAC − EV) ÷ (BAC − AC) — the ERP's primary EAC is the bottom-up component method SE-5; index methods are comparisons |
| Gross margin % | (Revenue − direct cost) ÷ revenue |
| CVR margin | Value (certified + work done not certified + agreed variations + probability-weighted pending) − cost (actual + accruals + provisions) |
| Under/over-billing | Revenue earned (by method) − billed |
| Material consumption variance | Actual consumption − theoretical (executed qty × norm × (1 + wastage allowance)) |
| Plant utilisation % | Working hours ÷ available hours (available = calendar − planned maintenance) |
| Plant availability % | (Scheduled hours − breakdown hours) ÷ scheduled hours |
| MTBF / MTTR | Operating hours ÷ failures · repair hours ÷ failures |
| Labour productivity index | Actual output per man-day ÷ norm |
| DSO / DPO | Receivables ÷ revenue × days · payables ÷ purchases × days |
| Certification lag | Bill certified date − bill submitted date |
| RFI turnaround | Response date − raised date (working days) |
| LTIFR / TRIFR | Lost-time injuries × 1,000,000 ÷ man-hours · total recordable injuries × 1,000,000 ÷ man-hours |
| First-time inspection pass % | Inspections passed at first attempt ÷ total |
| Cost of quality | Rework + NCR + testing + inspection cost |
| Vendor OTIF | Lines delivered on time in full ÷ lines due |
| Procurement cycle time | PO date − PR approval date |

## B8 Document types and numbering seeds (AC-6)
Tender `TND/{CO}/{FY}/{SEQ}` · Estimate `EST/{TND}/{REV}` · Contract `CTR/{PRJ}/{SEQ}` · BOQ version `BOQ/{PRJ}/{VER}` · Budget `BUD/{PRJ}/{TYPE}/{VER}` · Material request `MR/{PRJ}/{FY}/{SEQ}` · PR `PR/{PRJ}/{FY}/{SEQ}` · RFQ `RFQ/{PRJ}/{FY}/{SEQ}` · CS `CS/{PRJ}/{FY}/{SEQ}` · PO `PO/{PRJ}/{FY}/{SEQ:5}` · WO `WO/{PRJ}/{FY}/{SEQ}` · GRN `GRN/{STORE}/{FY}/{SEQ}` · Issue `ISS/{STORE}/{FY}/{SEQ}` · Transfer `STO/{FY}/{SEQ}` · Gate pass `GP/{SITE}/{FY}/{SEQ}` · WA `WA/{PRJ}/{DATE}/{SEQ}` · DPR `DPR/{PRJ}/{DATE}` · MB `MB/{PRJ}/{BOOK}/{PAGE}` · RA bill `RA/{CTR}/{NN}` · Sub bill `SB/{WO}/{NN}` · Tax invoice `INV/{GSTIN-STATE}/{FY}/{SEQ}` (gap-free) · Credit/debit note gap-free series · Journal `JV/{CO}/{FY}/{SEQ}` · Payment `PAY/{CO}/{FY}/{SEQ}` · NCR `NCR/{PRJ}/{SEQ}` · RFI `RFI/{PRJ}/{DISC}/{SEQ}` · Permit `PTW/{SITE}/{DATE}/{SEQ}` · Variation `VO/{CTR}/{SEQ}` · Claim `CLM/{CTR}/{SEQ}` · Transmittal `TRN/{PRJ}/{SEQ}` · Letter out/in `OUT|IN/{PRJ}/{FY}/{SEQ}`.

## B9 Units of measure (seed)
nos, set, pair, kg, MT (tonne), quintal, m, RMT (running metre), km, m², sqft, m³, cft, brass (100 cft — regional), litre, kL, hour, day, month, trip, km-run, m³-km (lead), bag (cement 50 kg), LS (lump sum). Conversions only via the UOM master; item-specific conversions (bag ↔ kg, m³ ↔ MT by density) are item attributes with versions.

## B10 Personas and default role catalogue (Part 07 seeds; all configurable)
Management: Chairman/MD, COO, Project Director, CFO, Head–Commercial, Head–Procurement, Head–HR, Head–QHSE. Project: Project Manager, Planning Engineer, QS, Billing Engineer, Site In-charge, Section Engineer, Supervisor/Foreman, Surveyor, Design Coordinator, Document Controller, QA/QC Engineer, Lab Technician, HSE Officer, Store In-charge, Store Keeper, Plant In-charge, Fleet Manager, Fleet Supervisor, Equipment Operator, Driver, Fuel In-charge/Fuel Attendant, Calibration Officer, Maintenance Manager, Mechanic/Technician, Batching Plant In-charge (RMC Plant Manager), Plant Operator, Dispatch Manager, Logistics Staff, Laboratory Staff, Production Unit In-charge, Time Keeper, Security In-charge, Camp In-charge. Corporate: Estimator, Tender Manager, Contracts Manager, Buyer, Vendor Development, Accountant, AP/AR Officer, Treasury Officer, Tax Officer, Payroll Officer, HR Manager, HR Executive, Internal Auditor, Protocol/Compliance Officer, Cost Controller, MIS Analyst. Technical: Platform (Website) Administrator — user lifecycle and platform settings only, no business-record rights (Part 08A), User Administrator, Super Admin (break-glass/JIT only), Module Admin, TECH_ADMIN, QA_LEAD, RELEASE_MANAGER, Integration Admin, Data Steward. External: Client, Consultant/PMC, Supplier, Subcontractor, Labour Contractor, Plant Hirer, Transporter, Auditor (read-only), Lender's engineer.

## B11 Typical project structures
- **Building:** Project → Tower/Block → Floor → Zone/Flat → Element (footing, column, beam, slab, wall) → Activity.
- **Road/highway:** Project → Package → Stretch (chainage from–to) → Layer (embankment, subgrade, GSB, WMM, DBM, BC) / Structure (culvert, minor bridge, ROB, VUP) → Activity; LHS/RHS/median.
- **Bridge/metro viaduct:** Project → Pier/Span/Segment → Element → Activity; casting yard as production unit.
- **Industrial/EPC:** Project → Area/Unit → System → Sub-system → Equipment/Tag → Activity; engineering deliverables and vendor data requirements.
- **Water/pipeline:** Project → Zone → Network/Line (chainage) → Node/Chamber → Activity; hydro-test sections.
Location breakdown structure (LBS) is separate from WBS and CBS; transactions carry the most specific location available.

## B12 Glossary (selected)
**BOQ** bill of quantities · **CBS** cost breakdown structure · **WBS** work breakdown structure · **LBS** location breakdown structure · **MB** measurement book · **RA bill** running account bill · **DPR** daily progress report · **WA** work authorisation · **MTO** material take-off · **BBS** bar bending schedule · **CS** comparative statement · **GRN** goods receipt note · **MRN** material return note · **STO** stock transfer order · **IR / RFI (inspection)** inspection request · **ITP** inspection and test plan · **NCR** non-conformance report · **CAPA** corrective and preventive action · **PTW** permit to work · **JSA/HIRA** job safety analysis / hazard identification and risk assessment · **TBT** toolbox talk · **EOT** extension of time · **LD** liquidated damages · **DLP** defect liability period · **CVR** cost-value reconciliation · **EAC/ETC** estimate at/to complete · **PV/EV/AC** planned/earned/actual value · **SOR/DSR** schedule of rates / Delhi schedule of rates · **PMC** project management consultant · **IFC** issued for construction · **VDR** vendor data requirements · **IRN** invoice reference number (e-invoice) — *also* inspection release note in expediting; context decides · **ROW** right of way · **RMC** ready-mix concrete · **HMP** hot-mix plant · **WMM** wet mix macadam · **TM** transit mixer · **BG/LC** bank guarantee / letter of credit.
