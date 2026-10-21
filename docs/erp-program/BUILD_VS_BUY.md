# BUILD_VS_BUY

Part 02, REQ-ARCH-F14. Commodity capabilities, with the decision, the criteria, and what must be verified before a contract is signed. Licence, price and residency facts are **not verified in this session**; each row lists what to verify.

| Capability | Options | Recommendation | Why | Verify before deciding | Exit strategy |
|---|---|---|---|---|---|
| PDF and report rendering (Part 20) | Headless browser rendering of HTML; PDF library | Build on one engine chosen by ADR (ADR pending in Part 20) | Templates are our own; one engine only (CP-ARCH-01) | Licence of the chosen engine; memory per render at the §10.3 volume | Templates are HTML; the engine can be swapped |
| OCR for documents (Part 79) | Open-source OCR engine; cloud OCR | Evaluate both; prefer an open-source engine for India-resident data | Residency; per-page cost | Accuracy on Indian scans; residency of the cloud option | Output stored as text; engine behind an adapter |
| Maps and GIS (Part 37) | Open map data with a self-hosted tile service; commercial map API | Evaluate; decide by residency and offline needs | Offline field maps need tiles on the device | Licence terms for offline caching; tile hosting cost | Geometry stored in the platform's own schema |
| Electronic signature: Aadhaar eSign and DSC (Part 20) | Licensed eSign service provider; DSC token integration | Buy (licensed provider) | Legal validity requires an accredited provider | Provider accreditation; contract and fees; data flow | Signed documents stored in the document service; provider adapter |
| Messaging: WhatsApp Business, email, SMS (Part 25) | Commercial provider per channel | Buy | Carrier and platform rules; delivery reports | Per-channel template approval rules; SMS sender registration rules in India (verify with counsel); price per message | Adapter per provider; messages logged in our store |
| Search (Part 13, 25A) | PostgreSQL full-text; OpenSearch | Build on PostgreSQL first (ADR-003) | One data engine until volume proves otherwise | Search latency at §10.3 volume | Index rebuildable from the source tables |
| BI and dashboards (Parts 13, 76) | External BI tool; first-party dashboards | Build first-party (ADR-010) | Permission filtering inside the application | Cost of an external BI with row-level permissions | Metric catalogue is ours; export via API |
| Telematics platform (Part 50) | Device vendor cloud; own ingestion from device protocol | Buy the device platform; build ingestion | Devices are the vendor's; our data model is ours | Device protocol support; data-export terms | Telemetry stored in our time-partitioned table |
| Scheduling interop (Part 38) | Primavera P6 and MS Project file import (XER and XML) | Build importers | File formats are documented; no licence needed for our own parser | Format versions supplied by the customer | Import is one-way; exports are our own format |
| Authentication and identity (Part 08A) | OIDC provider (managed or self-hosted) | Buy or self-host a standard OIDC provider (ADR-009) | Security-critical; audited protocols | Residency; MFA methods; SSO connectors; cost | Standard OIDC; provider replaceable |
| Payments and bank connectivity (Part 65) | Bank APIs via aggregator; direct bank connectivity | Decide in Part 65 | Depends on banks engaged | Bank onboarding; security requirements of each bank | Adapter per bank |
