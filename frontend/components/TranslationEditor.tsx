"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t, useLocale } from "@/lib/i18n";
type Detail = { source_version_id: number; source: object; revision: number; status: string; payload: object | null; review_comment: string | null };
export function TranslationEditor({ specialist = false }: { specialist?: boolean }) {
  useLocale();
  const [rows, setRows] = useState<Array<{source_version_id:number; title:string; status:string}>>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<typeof rows>('/api/admin/translations').then(setRows).catch(error => setError(String(error))); }, []);
  async function open(id: number) {
    setBusy(true); setError('');
    try { const data = await api<Detail>(`/api/admin/translations/${id}`); setDetail(data); setText(JSON.stringify(data.payload ?? data.source, null, 2)); }
    catch (error) { setError(String(error)); } finally { setBusy(false); }
  }
  async function save(status: 'draft' | 'needs_review' | 'approved') {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      const data = await api<Detail>(`/api/admin/translations/${detail.source_version_id}${status === 'approved' ? '/approve' : ''}`, {
        method: status === 'approved' ? 'POST' : 'PUT', body: JSON.stringify(status === 'approved' ? {revision:detail.revision,comment} : {revision:detail.revision,payload:JSON.parse(text),status}),
      });
      setDetail(data); setRows(rows => rows.map(row => row.source_version_id === data.source_version_id ? {...row,status:data.status} : row));
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  }
  const statusLabel = (status:string) => status === 'missing' ? t('content.missing') : status === 'approved' ? t('content.approved') : status === 'needs_review' ? t('content.pending') : t('content.draft');
  return <section className="settings-section"><h2>{t('content.translations')}</h2>
    {error && <p role="alert">{error}</p>}
    <select aria-label={t('content.source')} disabled={busy} value={detail?.source_version_id ?? ''} onChange={event => void open(Number(event.target.value))}>
      <option value="" disabled>{t('content.source')}</option>{rows.map(row => <option key={row.source_version_id} value={row.source_version_id}>{row.title} · {row.source_version_id} · {statusLabel(row.status)}</option>)}
    </select>
    {detail && <><p role="status">{statusLabel(detail.status)} · {t("content.revision", {revision:detail.revision})}</p><details><summary>{t('content.source')}</summary><pre lang="ru-RU" style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(detail.source,null,2)}</pre></details>
      <label>{t('content.json')}<textarea lang="kk-KZ" style={{width:'100%',minHeight:320}} value={text} readOnly={specialist} onChange={event => setText(event.target.value)}/></label>
      {specialist ? <><label>{t('content.comment')}<textarea value={comment} onChange={event => setComment(event.target.value)}/></label><button disabled={busy || comment.trim().length < 10 || detail.status !== 'needs_review'} onClick={() => void save('approved')}>{t('content.approve')}</button></> : <><button disabled={busy} onClick={() => void save('draft')}>{t('common.save')}</button><button disabled={busy} onClick={() => void save('needs_review')}>{t('content.submit')}</button></>}
    </>}
  </section>;
}
