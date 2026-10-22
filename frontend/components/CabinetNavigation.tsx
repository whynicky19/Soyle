"use client";

import { useEffect, useState } from "react";

export function useCabinetSection(cabinet: string, sections: ReadonlyArray<{ id: string; label: string }>) {
  const read = () => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("cabinet") === cabinet ? params.get("section") : null;
    return sections.some(item => item.id === candidate) ? candidate! : sections[0].id;
  };
  const [section, setSection] = useState(read);
  useEffect(() => {
    const update = () => setSection(read());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
    // The section definitions are static constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinet]);
  const navigate = (next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("cabinet", cabinet); url.searchParams.set("section", next);
    window.history.pushState(null, "", url);
    setSection(next);
  };
  return [section, navigate] as const;
}

export function CabinetNavigation({ cabinet, sections, active, onNavigate }: { cabinet: string; sections: ReadonlyArray<{id: string; label: string}>; active: string; onNavigate: (next: string) => void }) {
  return <nav className="cabinet-sections" aria-label="Разделы кабинета">{sections.map(item => <a key={item.id} href={(() => { const params = new URLSearchParams(window.location.search); params.set("cabinet", cabinet); params.set("section", item.id); return `?${params}`; })()} aria-current={active === item.id ? "page" : undefined} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(item.id); }}>{item.label}</a>)}</nav>;
}
