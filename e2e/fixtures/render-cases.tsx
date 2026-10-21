// Renders every template and state to static HTML for the accessibility spec. Run by e2e/design-templates.spec.ts through tsx, so the
// JSX here never passes through Playwright's test transform.
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ObjectPage, ListReport, Wizard, SettingsPage, PublicAuthPage, Launchpad, Worklist, Overview, MobileCapture } from "../../src/design/ui/templates";
import { Banner, AuditTimeline, ApprovalPanel, AttachmentPanel, Skeleton } from "../../src/design/ui/core";
import { ConflictState, IntegrationFailureState, JobFailureState, OfflineState, ValidationSummary, LoadingState } from "../../src/design/ui/states";
import { StatusChip } from "../../src/design/StatusChip";
import { Project360Frame, SiteFrame, ControlTowerFrame, DepartmentFrame, HierarchyBreadcrumb } from "../../src/design/ui/frames";
import { NO_FILTERS } from "../../src/dash/filters";
import { CardList, FilterChips, QuantityField, MasterDetail, CameraCapture, GeoCapture, BarcodeCapture, SignaturePad, VoiceNote } from "../../src/design/ui/field";
import { InstallNotice, UpdateNotice, UpdateRequiredScreen } from "../../src/design/ui/pwa";

const button = (label: string) => h("button", { type: "button" }, label);
const para = (text: string, key?: string) => h("p", { key }, text);
const frag = (...children: ReactNode[]) => h("div", null, ...children);

export const cases: { name: string; markup: () => string; expect: string }[] = [
  {
    name: "object page with tabs",
    markup: () => renderToStaticMarkup(h(ObjectPage, {
      title: "Purchase order PO-0042",
      status: h(StatusChip, { state: "approved" }),
      facts: [{ label: "Vendor", value: "Sahaa Steel" }, { label: "Amount", value: "₹1,25,000" }],
      primaryAction: button("Send"),
      tabs: [
        { id: "details", label: "Details", content: para("Lines and terms") },
        { id: "lines", label: "Lines", content: para("Two lines") },
        { id: "timeline", label: "Timeline", content: null },
      ],
    })),
    expect: "Lines and terms",
  },
  { name: "list report ready", markup: () => renderToStaticMarkup(h(ListReport, { title: "Projects", filters: button("Filter"), state: { kind: "ready" } }, h("table", null, h("caption", null, "Projects"), h("tbody", null, h("tr", null, h("td", null, "P-1")))))), expect: "P-1" },
  { name: "list report loading", markup: () => renderToStaticMarkup(h(ListReport, { title: "Projects", state: { kind: "loading" } })), expect: "Loading" },
  { name: "list report empty", markup: () => renderToStaticMarkup(h(ListReport, { title: "Projects", state: { kind: "empty", title: "No projects yet", next: "Create the first project." } })), expect: "No projects yet" },
  { name: "list report error", markup: () => renderToStaticMarkup(h(ListReport, { title: "Projects", state: { kind: "error", title: "The list did not load", what: "The project list could not be fetched.", why: "The service did not answer in time.", action: "Try again in a minute.", correlationId: "c-123" } })), expect: "c-123" },
  { name: "list report permission", markup: () => renderToStaticMarkup(h(ListReport, { title: "Projects", state: { kind: "permission", resource: "projects", whoToAsk: "your project director" } })), expect: "your project director" },
  { name: "wizard step", markup: () => renderToStaticMarkup(h(Wizard, { title: "New vendor", steps: ["Details", "Bank", "Review"], current: 1, actions: button("Next"), children: para("Bank details") })), expect: "Bank details" },
  { name: "settings", markup: () => renderToStaticMarkup(h(SettingsPage, { title: "Preferences", sections: [{ id: "display", title: "Display", content: para("Theme and density") }] })), expect: "Theme and density" },
  { name: "sign-in page", markup: () => renderToStaticMarkup(h(PublicAuthPage, { variant: "sign-in" }, h("form", null, h("label", null, "User ID ", h("input", { name: "user" }))))), expect: "User ID" },
  { name: "session expired", markup: () => renderToStaticMarkup(h(PublicAuthPage, { variant: "session-expired" })), expect: "Sign in again" },
  { name: "access denied", markup: () => renderToStaticMarkup(h(PublicAuthPage, { variant: "access-denied", whoToAsk: "your administrator" })), expect: "your administrator" },
  { name: "launchpad with tiles", markup: () => renderToStaticMarkup(h(Launchpad, { title: "Home", tiles: [{ id: "a", label: "Projects", href: "/projects" }] })), expect: "Projects" },
  { name: "launchpad empty", markup: () => renderToStaticMarkup(h(Launchpad, { title: "Home", tiles: [] })), expect: "Nothing to open yet" },
  { name: "worklist with items", markup: () => renderToStaticMarkup(h(Worklist, { title: "My work", count: 2 }, h("ul", null, h("li", null, "Approve PO-0042")))), expect: "Approve PO-0042" },
  { name: "worklist empty", markup: () => renderToStaticMarkup(h(Worklist, { title: "My work", count: 0 })), expect: "Nothing waiting for you" },
  { name: "overview", markup: () => renderToStaticMarkup(h(Overview, { title: "Overview", cards: [para("Open POs: 4", "a")] })), expect: "Open POs: 4" },
  { name: "mobile capture offline", markup: () => renderToStaticMarkup(h(MobileCapture, { title: "Capture", offline: true, primary: button("Scan gate pass") })), expect: "saved on this device" },
  { name: "validation summary", markup: () => renderToStaticMarkup(h(ValidationSummary, { errors: [{ field: "amount", message: "must be above zero" }] })), expect: "must be above zero" },
  { name: "sync conflict", markup: () => renderToStaticMarkup(h(ConflictState, { record: "DPR-0107", options: ["Keep my version", "Use the saved version"] })), expect: "Keep my version" },
  { name: "integration failure", markup: () => renderToStaticMarkup(h(IntegrationFailureState, { connector: "Bank file transfer", retryNote: "We will retry in 5 minutes" })), expect: "not responding" },
  { name: "job failure", markup: () => renderToStaticMarkup(h(JobFailureState, { job: "Posting", notified: "Posting failed — Accounts has been notified" })), expect: "Accounts has been notified" },
  { name: "offline state", markup: () => renderToStaticMarkup(h(OfflineState, { savedNote: "Your entry is kept on this device." })), expect: "kept on this device" },
  { name: "banner and loading", markup: () => renderToStaticMarkup(frag(h(Banner, { tone: "warning", children: "Data as of 09:40" }), h(LoadingState), h(Skeleton, { lines: 2 }))), expect: "Data as of 09:40" },
  { name: "timeline, approvals, attachments", markup: () => renderToStaticMarkup(frag(h(AuditTimeline, { items: [{ at: "2026-10-20 09:00", who: "Asha Rao", what: "submitted", reason: "Ready for review" }] }), h(ApprovalPanel, { steps: [{ role: "Project director", state: "waiting" }] }), h(AttachmentPanel, { files: [{ name: "boq.pdf", size: "220 KB" }] }))), expect: "Ready for review" },
  {
    name: "project 360 frame",
    markup: () => renderToStaticMarkup(h(Project360Frame, { code: "P-204", name: "Riverside bridge", status: "active", filters: { ...NO_FILTERS, projectId: 204 }, sections: [{ id: "plan", label: "Plan", content: para("Milestones due in November") }, { id: "labour", label: "Labour", content: null }] })),
    expect: "Milestones due in November",
  },
  {
    name: "site frame",
    markup: () => renderToStaticMarkup(h(SiteFrame, { name: "Batching plant A", projectCode: "P-204", filters: NO_FILTERS, sections: { Plan: para("Site plan for week 44"), Chat: null } })),
    expect: "Site plan for week 44",
  },
  {
    name: "department frame",
    markup: () => renderToStaticMarkup(h(DepartmentFrame, { name: "Stores", filters: NO_FILTERS, sections: [{ id: "stock", label: "Stock", content: para("Cement stock by yard") }] })),
    expect: "Cement stock by yard",
  },
  {
    name: "control tower with every region",
    markup: () => renderToStaticMarkup(h(ControlTowerFrame, { title: "Site control tower", kpiStrip: para("Progress 62%"), exceptions: para("2 open NCRs"), trend: para("Trend over 30 days"), drillTable: para("Activity rows") })),
    expect: "2 open NCRs",
  },
  {
    name: "control tower with only the detail",
    markup: () => renderToStaticMarkup(h(ControlTowerFrame, { title: "Site control tower", drillTable: para("Detail rows only") })),
    expect: "Detail rows only",
  },
  {
    name: "hierarchy breadcrumb",
    markup: () => renderToStaticMarkup(h(HierarchyBreadcrumb, { crumbs: [{ label: "Acme Constructions", route: null }, { label: "P-204", route: "/projects/204" }, { label: "S-20", route: null }] })),
    expect: "P-204",
  },
  {
    name: "field card list and filters",
    markup: () => renderToStaticMarkup(frag(
      h(FilterChips, { label: "Filter deliveries", chips: [{ id: "open", label: "Open", active: true }, { id: "late", label: "Late", active: false }], onToggle: () => undefined }),
      h(CardList, { label: "Deliveries", items: [{ id: "g1", title: "GRN-0042", status: h("span", { className: "erp-count" }, "Posted"), fields: [{ label: "Item", value: "TMT 16 mm" }, { label: "Qty", value: "120 kg" }, { label: "Site", value: "S-20" }] }] }),
    )),
    expect: "GRN-0042",
  },
  {
    name: "field quantity and master detail",
    markup: () => renderToStaticMarkup(frag(h(QuantityField, { id: "qty", label: "Quantity received", unit: "kg", value: "120.5", onChange: () => undefined }), h(MasterDetail, { master: para("List of pours"), detail: null, detailLabel: "Pour details" }))),
    expect: "Choose an item",
  },
  {
    name: "field capture components with fallbacks",
    markup: () => renderToStaticMarkup(frag(
      h(CameraCapture, { label: "Take photos", onFiles: () => undefined }),
      h(GeoCapture, { available: false, onRecord: () => undefined }),
      h(BarcodeCapture, { detectorAvailable: false, onCode: () => undefined }),
      h(SignaturePad, { label: "Sign for the delivery", onChange: () => undefined }),
      h(VoiceNote, { available: false, label: "Record note", onText: () => undefined }),
    )),
    expect: "Scanning is not available",
  },
  {
    name: "install, update and version notices",
    markup: () => renderToStaticMarkup(frag(h(InstallNotice, { onInstall: () => undefined, onDismiss: () => undefined }), h(UpdateNotice, { onUpdate: () => undefined }), h(UpdateRequiredScreen, { current: "1.0.0", minimum: "1.2.0" }))),
    expect: "Update required",
  },
];


console.log(JSON.stringify(cases.map((c) => ({ name: c.name, html: c.markup(), expect: c.expect }))));
