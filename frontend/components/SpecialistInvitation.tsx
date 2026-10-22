"use client";

import { useState } from "react";
import { api, type User } from "@/lib/api";

export function SpecialistInvitation({ token, user, onClose }: { token: string; user: User | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState(false);
  const accept = async () => {
    setBusy(true); setError("");
    try { await api("/api/specialist-invitations/claim", { method: "POST", body: JSON.stringify({ token }) }); setSent(true); window.history.replaceState(null, "", window.location.pathname + window.location.search); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отправить запрос"); }
    finally { setBusy(false); }
  };
  return <section className="invitation-banner" aria-labelledby="invite-title"><div><span className="kicker">ПРИГЛАШЕНИЕ ОТ СЕМЬИ</span><h2 id="invite-title">{sent ? "Запрос отправлен родителю" : "Присоединиться как специалист"}</h2><p>{sent ? "Родитель подтвердит ваш аккаунт. После подтверждения обновите список детей в кабинете." : !user ? "Войдите в свой аккаунт специалиста ниже, затем отправьте запрос на доступ. Данные ребёнка откроются после подтверждения родителем." : user.role !== "specialist" ? "Вы вошли в аккаунт другой роли. Для принятия приглашения нужен аккаунт специалиста. Выйдите и войдите как специалист." : `Вы отправите запрос от имени «${user.full_name}» (${user.username}). Родитель увидит имя и подтвердит доступ.`}</p>{error && <p role="alert">{error}</p>}</div><div className="cabinet-actions">{user?.role === "specialist" && !sent && <button className="primary-button" disabled={busy} onClick={accept}>{busy ? "Отправляем…" : "Отправить запрос родителю"}</button>}<button className="secondary-button" onClick={onClose}>{sent ? "Перейти в кабинет" : "Закрыть приглашение"}</button></div></section>;
}
