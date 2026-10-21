// Frames (Part 13 REQ-DASH-F06; DS-18, DS-19). A frame fixes the structure of a dashboard page. The content comes from the owning
// Parts: a frame never invents a section, and a section with no content is left out, so no empty tab is shown.
import type { ReactNode } from "react";
import { ObjectPage, type Fact } from "./templates";
import { Banner } from "./core";
import type { DashFilters } from "../../dash/filters";

/** The site dashboard sections, in the order of Part 13 REQ-DASH-F06. */
export const SITE_SECTIONS = ["Plan", "Execute", "Labour", "Materials", "Plant", "Quality", "HSE", "DPR", "Tasks", "Documents", "Chat"] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];

export interface FrameSection {
  id: string;
  label: string;
  content: ReactNode | null | undefined;
}

/** Keeps only the sections a module supplied content for. */
export function suppliedSections(sections: FrameSection[]): FrameSection[] {
  return sections.filter((s) => s.content !== null && s.content !== undefined);
}

/** A line that says which filters are applied, so a shared view is never mistaken for the whole project. */
export function FilterSummary({ filters }: { filters: DashFilters }) {
  const parts: string[] = [];
  if (filters.projectId !== null) parts.push(`project ${filters.projectId}`);
  if (filters.siteId !== null) parts.push(`site ${filters.siteId}`);
  if (filters.period !== null) parts.push(`period ${filters.period}`);
  if (filters.wbs !== null) parts.push(`WBS ${filters.wbs}`);
  if (parts.length === 0) return null;
  return <Banner tone="info">Showing {parts.join(", ")}.</Banner>;
}

export function Project360Frame({ code, name, status, filters, sections }: { code: string; name: string; status: string; filters: DashFilters; sections: FrameSection[] }) {
  const facts: Fact[] = [{ label: "Project", value: code }, { label: "Status", value: status }];
  return (
    <ObjectPage
      title={name}
      facts={facts}
      tabs={suppliedSections(sections).map((s) => ({ id: s.id, label: s.label, content: s.content }))}
      tabsLabel="Project 360 sections"
      banners={[<FilterSummary key="filters" filters={filters} />]}
    />
  );
}

export function SiteFrame({ name, projectCode, filters, sections }: { name: string; projectCode: string; filters: DashFilters; sections: Partial<Record<SiteSection, ReactNode>> }) {
  const tabs = SITE_SECTIONS.map((s) => ({ id: s.toLowerCase(), label: s, content: sections[s] ?? null }));
  return (
    <ObjectPage
      title={name}
      facts={[{ label: "Project", value: projectCode }]}
      tabs={tabs}
      tabsLabel="Site sections"
      banners={[<FilterSummary key="filters" filters={filters} />]}
    />
  );
}

export function DepartmentFrame({ name, filters, sections }: { name: string; filters: DashFilters; sections: FrameSection[] }) {
  return (
    <ObjectPage
      title={name}
      facts={[]}
      tabs={suppliedSections(sections).map((s) => ({ id: s.id, label: s.label, content: s.content }))}
      tabsLabel="Department sections"
      banners={[<FilterSummary key="filters" filters={filters} />]}
    />
  );
}

/**
 * Control tower layout standard (DS, Part 13 REQ-DASH-F06): key numbers first, then exceptions, then the trend, then the drill table.
 * A region with no content is not drawn.
 */
export function ControlTowerFrame({ title, kpiStrip, exceptions, trend, drillTable }: { title: string; kpiStrip?: ReactNode; exceptions?: ReactNode; trend?: ReactNode; drillTable?: ReactNode }) {
  const regions: { id: string; heading: string; content: ReactNode | null | undefined }[] = [
    { id: "kpis", heading: "Key numbers", content: kpiStrip },
    { id: "exceptions", heading: "Exceptions", content: exceptions },
    { id: "trend", heading: "Trend", content: trend },
    { id: "detail", heading: "Detail", content: drillTable },
  ];
  return (
    <section className="erp-page erp-tower">
      <h1 className="erp-page-title">{title}</h1>
      {regions
        .filter((r) => r.content !== null && r.content !== undefined)
        .map((r) => (
          <section key={r.id} aria-labelledby={`tower-${r.id}`} className="erp-tower-region">
            <h2 id={`tower-${r.id}`}>{r.heading}</h2>
            {r.content}
          </section>
        ))}
    </section>
  );
}

/** The hierarchy breadcrumb (REQ-DASH-F12). Levels not built yet are shown as text, with no link. */
export function HierarchyBreadcrumb({ crumbs }: { crumbs: { label: string; route: string | null }[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="erp-breadcrumb">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`}>
              {c.route && !last ? <a href={c.route}>{c.label}</a> : <span aria-current={last ? "page" : undefined}>{c.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
