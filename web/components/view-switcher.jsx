"use client";

// Segmented control for switching database-style views (Board / List / Calendar).
export default function ViewSwitcher({ views, active, onChange }) {
  return (
    <div className="afview-tabs" role="tablist">
      {views.map((view) => (
        <button
          key={view.key}
          type="button"
          role="tab"
          aria-selected={active === view.key}
          className={`afview-tab ${active === view.key ? "active" : ""}`}
          onClick={() => onChange(view.key)}
        >
          {view.icon ? <span className="afview-tab-icon">{view.icon}</span> : null}
          {view.label}
        </button>
      ))}
    </div>
  );
}
