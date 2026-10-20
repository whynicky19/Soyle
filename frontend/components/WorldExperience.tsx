"use client";

import Image from "next/image";
import { ArrowRight, Camera, Check, ImageIcon, MessageCircle, Plus, Trash2, Volume2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api, type WorldPhoto } from "@/lib/api";
import { compressPhoto } from "@/lib/imageUpload";

const categories = [
  { key: "people", label: "Люди" },
  { key: "toys", label: "Игрушки" },
  { key: "food", label: "Еда" },
  { key: "places", label: "Места" },
] as const;

export function WorldExperience({ childId, canManage, onWords }: { childId?: number; canManage: boolean; onWords: () => void }) {
  const fileId = useId();
  const [photos, setPhotos] = useState<WorldPhoto[]>([]);
  const [category, setCategory] = useState<WorldPhoto["category"]>("people");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [legacyPhotos, setLegacyPhotos] = useState<Array<{ id: string; name: string; src: string }>>([]);

  useEffect(() => {
    if (!childId) return;
    let current = true;
    api<WorldPhoto[]>(`/api/world/${childId}`)
      .then((items) => { if (current) setPhotos(items); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Не удалось загрузить фотографии"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; window.speechSynthesis?.cancel(); };
  }, [childId]);

  useEffect(() => {
    if (!childId || !canManage) return;
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(`soyle-world-photos-${childId}`) || "[]");
        setLegacyPhotos(Array.isArray(stored) ? stored.filter((item) => typeof item?.src === "string" && item.src.startsWith("data:image/")) : []);
      } catch { setLegacyPhotos([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [childId, canManage]);

  const importLegacy = async () => {
    if (!childId || !legacyPhotos.length || saving) return;
    setSaving(true); setError(""); setMessage("");
    const remaining: typeof legacyPhotos = [];
    let imported = 0;
    for (const legacy of legacyPhotos) {
      try {
        const blob = await fetch(legacy.src).then((response) => response.blob());
        const image_data = await compressPhoto(new File([blob], `${legacy.name || "photo"}.jpg`, { type: blob.type }));
        const photo = await api<WorldPhoto>(`/api/world/${childId}`, { method: "POST", body: JSON.stringify({ name: legacy.name || "Моя фотография", category, image_data }) });
        setPhotos((items) => [photo, ...items]);
        imported += 1;
      } catch { remaining.push(legacy); }
    }
    window.localStorage.setItem(`soyle-world-photos-${childId}`, JSON.stringify(remaining));
    setLegacyPhotos(remaining);
    setSaving(false);
    setMessage(imported ? `${imported} прежних фото перенесено в профиль ребёнка.` : "");
    if (remaining.length) setError(`${remaining.length} фото не удалось перенести. Они остались на этом устройстве — попробуйте ещё раз.`);
  };

  const upload = async (files: FileList | null) => {
    if (!childId || !files?.length || saving) return;
    setSaving(true); setMessage(""); setError("");
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        const image_data = await compressPhoto(file);
        const photo = await api<WorldPhoto>(`/api/world/${childId}`, {
          method: "POST",
          body: JSON.stringify({ name: name.trim() || file.name.replace(/\.[^.]+$/, "") || "Моя фотография", category, image_data }),
        });
        setPhotos((items) => [photo, ...items]);
      }
      setName("");
      setMessage("Фотографии сохранены в профиле ребёнка и доступны после повторного входа.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Фотография не сохранилась"); }
    finally { setSaving(false); }
  };

  const remove = async (photo: WorldPhoto) => {
    if (!childId || saving || !window.confirm(`Удалить «${photo.name}» из Моего мира?`)) return;
    setSaving(true); setError("");
    try {
      await api(`/api/world/${childId}/${photo.id}`, { method: "DELETE" });
      setPhotos((items) => items.filter((item) => item.id !== photo.id));
      setMessage("Фотография удалена из Моего мира.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить фотографию"); }
    finally { setSaving(false); }
  };

  const addToWords = async (photo: WorldPhoto) => {
    if (!childId || saving) return;
    setSaving(true); setError(""); setMessage("");
    const categoryMap = { people: "people", toys: "play", food: "food", places: "places" } as const;
    try {
      await api("/api/aac/cards", { method: "POST", body: JSON.stringify({ child_id: childId, label: photo.name, speech: photo.name, category: categoryMap[photo.category], image: photo.image_data }) });
      setMessage(`Карточка «${photo.name}» добавлена в «Мои слова».`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить карточку"); }
    finally { setSaving(false); }
  };

  const speakName = (value: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "ru-RU";
    utterance.rate = .82;
    window.speechSynthesis.speak(utterance);
  };

  const visible = photos.filter((photo) => photo.category === category);
  if (!childId) return <div className="v2-screen v2-world-empty" role="status">Сначала открой профиль ребёнка.</div>;
  return <div className="v2-screen v2-world page-enter">
    <section className="v2-world-hero"><div><span className="v2-title-icon"><ImageIcon/></span><h1>Мой мир</h1><h2>Знакомые люди, места и вещи</h2><p>{canManage ? "Добавьте настоящие фотографии из жизни ребёнка. Они останутся в его профиле и могут стать личными карточками AAC." : "Здесь живут знакомые люди, места и любимые вещи. Нажми на фото, чтобы услышать название."}</p>{canManage && <a href="#world-upload" className="v2-upload-button"><Camera/> Добавить фото</a>}</div><Image src="/app-illustrations/world-memory-board.webp" alt="Мальчик рассматривает доску знакомых фотографий" fill priority sizes="(max-width: 900px) 100vw, 80vw"/></section>
    {error && <p className="v2-inline-alert" role="alert">{error}</p>}
    {message && <p className="v2-save-message" role="status"><Check/>{message}</p>}
    <div className="v2-world-tabs" role="group" aria-label="Категории фотографий">{categories.map((item) => <button key={item.key} aria-pressed={category === item.key} className={category === item.key ? "active" : ""} onClick={() => setCategory(item.key)}>{item.label}</button>)}</div>
    {canManage && <div className="v2-world-upload-form" id="world-upload"><label htmlFor="world-name">Как назвать фотографию?</label><input id="world-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Например, Мама или Мой мишка"/><label className="v2-upload-button" htmlFor={fileId}><Plus/>{saving ? "Сохраняем…" : "Выбрать фотографии"}</label><input id={fileId} className="v2-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={saving} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }}/><small>До 4 фотографий за раз. Их увидит ребёнок в своём аккаунте.</small>{legacyPhotos.length > 0 && <button className="v2-legacy-import" onClick={() => void importLegacy()} disabled={saving}>Перенести прежние фото с этого устройства ({legacyPhotos.length})</button>}</div>}
    {loading ? <p className="v2-world-empty" role="status">Загружаем фотографии…</p> : visible.length ? <div className="v2-photo-grid">{visible.map((photo) => <article key={photo.id} className="v2-photo-card"><button className="v2-photo-image-button" onClick={() => speakName(photo.name)} aria-label={`Послушать: ${photo.name}`}><Image src={photo.image_data} alt={photo.name} fill unoptimized sizes="(max-width: 760px) 50vw, 18vw"/></button><footer><strong>{photo.name}</strong><button onClick={() => speakName(photo.name)} aria-label={`Произнести: ${photo.name}`}><Volume2/></button></footer>{canManage && <div className="v2-photo-actions"><button disabled={saving} onClick={() => void addToWords(photo)}><MessageCircle/> В слова</button><button disabled={saving} onClick={() => void remove(photo)} aria-label={`Удалить ${photo.name}`}><Trash2/></button></div>}</article>)}</div> : <div className="v2-world-empty"><ImageIcon/><strong>Пока нет фотографий в разделе «{categories.find((item) => item.key === category)?.label}»</strong><p>{canManage ? "Добавьте знакомый предмет или человека — фото будет доступно ребёнку." : "Попроси взрослого добавить сюда знакомые фотографии."}</p></div>}
    <button className="v2-world-words-link" onClick={onWords}><MessageCircle/><span><strong>Мои слова</strong><small>{canManage ? "Добавляйте знакомые фотографии в AAC-карточки" : "Собери сообщение из карточек"}</small></span><ArrowRight/></button>
  </div>;
}
