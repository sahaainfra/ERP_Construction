"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/design/icons";
import { visibleGroups } from "@/design/navigation";
import {
  applyTheme,
  DEFAULT_PREFS,
  readPrefs,
  writePrefs,
  type Density,
  type DisplayPrefs,
  type Theme,
} from "@/design/preferences";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<DisplayPrefs>(DEFAULT_PREFS);

  // Load the viewer's saved choices after mount so server and client markup match.
  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  function update(next: Partial<DisplayPrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    applyTheme(merged.theme, merged.density);
    writePrefs(merged);
  }

  const groups = visibleGroups();
  const pathname = usePathname();

  return (
    <div className="erp-app">
      <header className="erp-shellbar">
        <div className="erp-shellbar-brand">
          <Icon name="erp.shell.company" size={20} />
          <span className="erp-shellbar-title">ERP Construction</span>
        </div>

        {/* Context switcher (Company › Project › Site). No company is configured yet, so no scope is selected. */}
        <div className="erp-context" aria-label="Current scope">
          <span>No company selected</span>
        </div>

        <div className="erp-shellbar-controls">
          <label className="erp-control">
            <span className="erp-visually-hidden">Theme</span>
            <select
              value={prefs.theme}
              onChange={(e) => update({ theme: e.target.value as Theme })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="high-contrast">High contrast</option>
            </select>
          </label>
          <label className="erp-control">
            <span className="erp-visually-hidden">Density</span>
            <select
              value={prefs.density}
              onChange={(e) => update({ density: e.target.value as Density })}
            >
              <option value="compact">Compact</option>
              <option value="cozy">Cozy</option>
              <option value="touch">Touch</option>
            </select>
          </label>
        </div>
      </header>

      <div className="erp-body">
        <nav
          className="erp-sidenav"
          data-collapsed={prefs.navCollapsed}
          aria-label="Main navigation"
        >
          <button
            type="button"
            className="erp-sidenav-toggle"
            aria-expanded={!prefs.navCollapsed}
            aria-label={prefs.navCollapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => update({ navCollapsed: !prefs.navCollapsed })}
          >
            <Icon name="erp.shell.nav" size={20} />
          </button>

          {groups.map(({ group, entries }) => (
            <section key={group.id} className="erp-nav-group">
              <h2 className="erp-nav-group-title">
                <Icon name={group.icon} size={20} />
                <span className="erp-nav-label">{group.label}</span>
              </h2>
              <ul>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={entry.route}
                      className="erp-nav-link"
                      title={entry.label}
                      aria-current={pathname === entry.route ? "page" : undefined}
                    >
                      <span className="erp-nav-label">{entry.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <main className="erp-main" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
