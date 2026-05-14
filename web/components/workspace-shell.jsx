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
    { href: "/timeclock", label: "Timeclock" },
    { href: "/mojos-kitchen", label: "Mojo's Kitchen" },
  ];

  if (role === "ADMIN") {
    navItems.push({ href: "/timesheets", label: "Timesheets" });
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
          <div className="ws-user-name">{user?.name || "Loading..."}</div>
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
