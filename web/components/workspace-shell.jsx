"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function isActive(pathname, href) {
  if (href === "/timeclock" && pathname === "/dashboard") {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function WorkspaceShell({ user, onLogout, children }) {
  const pathname = usePathname();
  const role = user?.role;

  const navItems = [
    { href: "/projects", label: "Projects" },
    { href: "/my-tasks", label: "My Tasks" },
    { href: "/mojos-kitchen", label: "Mojo's Kitchen" },
  ];

  if (role !== "ADMIN") {
    navItems.splice(2, 0, { href: "/timeclock", label: "Timeclock" });
  }

  if (role === "ADMIN") {
    navItems.push({ href: "/timesheets", label: "Timesheets" });
    navItems.push({ href: "/users", label: "Users" });
  }

  return (
    <div className="ws-shell">
      <aside className="ws-sidebar">
        <div className="ws-brand">
          <p className="ws-brand-kicker">Citryn</p>
          <h1 className="ws-brand-title">Workspace</h1>
        </div>

        <nav className="ws-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={classNames("ws-nav-item", isActive(pathname, item.href) && "active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ws-user-block">
          <div className="ws-user-row">
            <div className="ws-user-name">{user?.name || "Loading..."}</div>
            <Link href="/settings" className="ws-settings-link" aria-label="Profile settings" title="Profile settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.24.1.51.01.64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z" />
              </svg>
            </Link>
          </div>
          <div className="ws-user-email">{user?.email || ""}</div>
          <button className="ws-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="ws-content">{children}</main>
    </div>
  );
}
