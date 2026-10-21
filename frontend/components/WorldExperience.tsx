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

export function WorldExperience({ childId, canManage, onWords, onSpeak }: { childId?: number; canManage: boolean; onWords: () => void; onSpeak: (text: string) => Promise<boolean> }) {
  const fileId = useId();
  const [photos, setPhotos] = useState<WorldPhoto[]>([]);
  const [category, setCategory] = useState<WorldPhoto["category"]>("people");
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ id: string; name: string; image_data: string; category: WorldPhoto["category"] }>>([]);
  const [editingPhoto, setEditingPhoto] = useState<number | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [speakingPhoto, setSpeakingPhoto] = useState<number | null>(null);
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

  const preparePhotos = async (files: File[]) => {
    if (!childId || !files.length || saving) return;
    setSaving(true); setMessage(""); setError("");
    const available = Math.max(0, 4 - pendingPhotos.length);
    const failures: string[] = [];
    if (files.length > available) failures.push("За один раз можно подготовить до 4 фотографий.");
    for (const file of files.slice(0, available)) {
      try {
        const image_data = await compressPhoto(file);
        setPendingPhotos((items) => [...items, { id: crypto.randomUUID(), name: "", image_data, category }]);
      } catch (cause) { failures.push(`${file.name}: ${cause instanceof Error ? cause.message : "Не удалось открыть фото"}`); }
    }
    setError(failures.join(" "));
    setSaving(false);
  };

  const upload = async () => {
    if (!childId || !pendingPhotos.length || saving) return;
    if (pendingPhotos.some((photo) => !photo.name.trim())) { setError("Назовите каждую фотографию: это название услышит ребёнок."); return; }
    setSaving(true); setMessage(""); setError("");
    let saved = 0;
    const failures: string[] = [];
    for (const pending of pendingPhotos) {
      try {
        const photo = await api<WorldPhoto>(`/api/world/${childId}`, {
          method: "POST", body: JSON.stringify({ name: pending.name.trim(), category: pending.category, image_data: pending.image_data }),
        });
        setPhotos((items) => [photo, ...items]);
        setPendingPhotos((items) => items.filter((item) => item.id !== pending.id));
        saved += 1;
      } catch (cause) { failures.push(`${pending.name}: ${cause instanceof Error ? cause.message : "Фотография не сохранилась"}`); }
    }
    if (saved) setMessage(`Сохранено фото: ${saved}. Они доступны ребёнку после повторного входа.`);
    setError(failures.join(" "));
    setSaving(false);
  };

  const rename = async (photo: WorldPhoto) => {
    if (!childId || saving || !photoName.trim()) return;
    setSaving(true); setError("");
    try {
      const updated = await api<WorldPhoto>(`/api/world/${childId}/${photo.id}`, { method: "PATCH", body: JSON.stringify({ name: photoName.trim() }) });
      setPhotos((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditingPhoto(null);
      setMessage("Название сохранено. При нажатии на звук прозвучит это название.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить название"); }
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
      await api("/api/aac/cards", { method: "POST", body: JSON.stringify({ child_id: childId, label: photo.name.slice(0, 40), speech: photo.name, category: categoryMap[photo.category], image: photo.image_data }) });
      setMessage(`Карточка «${photo.name}» добавлена в «Мои слова».`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить карточку"); }
    finally { setSaving(false); }
  };

  const speakName = async (photo: WorldPhoto) => {
    setSpeakingPhoto(photo.id); setError("");
    try {
      if (!await onSpeak(photo.name)) setError("Не удалось озвучить название. Проверьте звук и попробуйте ещё раз.");
    } catch { setError("Не удалось озвучить название. Попробуйте ещё раз."); }
    finally { setSpeakingPhoto((current) => current === photo.id ? null : current); }
  };

  const visible = photos.filter((photo) => photo.category === category);
  if (!childId) return <div className="v2-screen v2-world-empty" role="status">Сначала открой профиль ребёнка.</div>;
  return <div className="v2-screen v2-world page-enter">
    <section className="v2-world-hero"><div><span className="v2-title-icon"><ImageIcon/></span><h1>Мой мир</h1><h2>Знакомые люди, места и вещи</h2><p>{canManage ? "Добавьте настоящие фотографии из жизни ребёнка. Они останутся в его профиле и могут стать личными карточками AAC." : "Здесь живут знакомые люди, места и любимые вещи. Нажми на фото, чтобы услышать название."}</p>{canManage && <a href="#world-upload" className="v2-upload-button"><Camera/> Добавить фото</a>}</div><Image src="/app-illustrations/world-memory-board.webp" alt="Мальчик рассматривает доску знакомых фотографий" fill priority sizes="(max-width: 900px) 100vw, 80vw"/></section>
    {error && <p className="v2-inline-alert" role="alert">{error}</p>}
    {message && <p className="v2-save-message" role="status"><Check/>{message}</p>}
    <div className="v2-world-tabs" role="group" aria-label="Категории фотографий">{categories.map((item) => <button key={item.key} aria-pressed={category === item.key} className={category === item.key ? "active" : ""} onClick={() => setCategory(item.key)}>{item.label}</button>)}</div>
    {canManage && <div className="v2-world-upload-form" id="world-upload">
      <label className="v2-upload-button" htmlFor={fileId}><Plus/>{saving ? "Подождите…" : "Выбрать фотографии"}</label>
      <input id={fileId} className="v2-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={saving || pendingPhotos.length >= 4} onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void preparePhotos(files); }}/>
      <small>До 4 фотографий за раз. Назовите каждое фото: ребёнок услышит именно это название.</small>
      {pendingPhotos.length > 0 && <form className="v2-photo-upload-review" onSubmit={(event) => { event.preventDefault(); void upload(); }}>
        <div className="v2-photo-upload-previews">{pendingPhotos.map((photo, index) => <div className="v2-photo-upload-preview" key={photo.id}>
          <div className="v2-upload-photo-image"><Image src={photo.image_data} alt={`Новое фото ${index + 1}`} fill sizes="(max-width: 480px) 100vw, 40vw" unoptimized/></div>
          <label>Название фото {index + 1}<input required maxLength={60} disabled={saving} value={photo.name} placeholder="Например, Мама или Мой мишка" onChange={(event) => setPendingPhotos((items) => items.map((item) => item.id === photo.id ? { ...item, name: event.target.value } : item))}/></label>
          <label>Раздел<select disabled={saving} value={photo.category} onChange={(event) => setPendingPhotos((items) => items.map((item) => item.id === photo.id ? { ...item, category: event.target.value as WorldPhoto["category"] } : item))}>{categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <button type="button" className="small-button" disabled={saving} onClick={() => setPendingPhotos((items) => items.filter((item) => item.id !== photo.id))}>Убрать фото {index + 1}</button>
        </div>)}</div>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить фотографии"}</button>
      </form>}
      {legacyPhotos.length > 0 && <button className="v2-legacy-import" onClick={() => void importLegacy()} disabled={saving}>Перенести прежние фото с этого устройства ({legacyPhotos.length})</button>}
    </div>}

    {loading ? <p className="v2-world-empty" role="status">Загружаем фотографии…</p> : visible.length ? <div className="v2-photo-grid">{visible.map((photo) => <article key={photo.id} className="v2-photo-card"><button className="v2-photo-image-button" onClick={() => void speakName(photo)} aria-label={`Послушать: ${photo.name}`}><Image src={photo.image_data} alt={photo.name} fill unoptimized sizes="(max-width: 480px) 100vw, (max-width: 760px) 50vw, 30vw"/></button><footer><strong>{photo.name}</strong><button onClick={() => void speakName(photo)} aria-label={`Произнести: ${photo.name}`}><Volume2/>{speakingPhoto === photo.id && <span className="v2-visually-hidden">Озвучиваем</span>}</button></footer>{canManage && editingPhoto === photo.id && <form className="v2-photo-rename" onSubmit={(event) => { event.preventDefault(); void rename(photo); }}><label>Название фотографии<input required maxLength={60} value={photoName} disabled={saving} onChange={(event) => setPhotoName(event.target.value)}/></label><button disabled={saving} type="submit">Сохранить</button><button type="button" disabled={saving} onClick={() => setEditingPhoto(null)}>Отмена</button></form>}{canManage && <div className="v2-photo-actions"><button disabled={saving} onClick={() => { setEditingPhoto(photo.id); setPhotoName(photo.name); }}>Название</button><button disabled={saving} onClick={() => void addToWords(photo)}><MessageCircle/> В слова</button><button disabled={saving} onClick={() => void remove(photo)} aria-label={`Удалить ${photo.name}`}><Trash2/></button></div>}</article>)}</div> : <div className="v2-world-empty"><ImageIcon/><strong>Пока нет фотографий в разделе «{categories.find((item) => item.key === category)?.label}»</strong><p>{canManage ? "Добавьте знакомый предмет или человека — фото будет доступно ребёнку." : "Попроси взрослого добавить сюда знакомые фотографии."}</p></div>}
    <button className="v2-world-words-link" onClick={onWords}><MessageCircle/><span><strong>Мои слова</strong><small>{canManage ? "Добавляйте знакомые фотографии в AAC-карточки" : "Собери сообщение из карточек"}</small></span><ArrowRight/></button>
  </div>;
}
