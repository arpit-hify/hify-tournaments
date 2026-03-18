'use client';

import { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { supabase, PACKAGES } from '@/lib/supabase';
import { FACILITIES, FACILITY_ARENAS } from '@/lib/facilities';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmtDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${dd}/${mon}/${d.getFullYear()}`;
}

function DateInput({ value, onChange, error }) {
  const ref = useRef(null);
  return (
    <div
      className="input"
      style={{
        position: 'relative', cursor: 'pointer',
        color: value ? 'var(--text)' : 'var(--muted)',
        borderColor: error ? 'var(--red)' : undefined,
      }}
      onClick={() => ref.current?.showPicker?.()}
    >
      {value ? fmtDateDisplay(value) : <span style={{ visibility: 'hidden' }}>00/Jan/0000</span>}
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
      />
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = 'hify2026';

const TIME_12H = (() => {
  const slots = [];
  for (let h = 0; h < 12; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots.push({ value: `${hh}:${mm}`, label: `${h === 0 ? 12 : h}:${mm}` });
    }
  }
  return slots;
})();

function TimePicker({ value, onChange }) {
  const parse = (v) => {
    if (!v) return { h12: '', ampm: 'AM' };
    const [h, m] = v.split(':').map(Number);
    return {
      h12: `${String(h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      ampm: h < 12 ? 'AM' : 'PM',
    };
  };
  const build = (h12, ampm) => {
    if (!h12) return '';
    const [h, m] = h12.split(':').map(Number);
    const h24 = ampm === 'AM' ? h : h + 12;
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const { h12, ampm } = parse(value);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
      <select
        className="input"
        style={{ flex: 1 }}
        value={h12}
        onChange={e => onChange(build(e.target.value, ampm))}
      >
        <option value="" disabled />
        {TIME_12H.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10, padding: 3, gap: 2, flexShrink: 0,
      }}>
        {['AM', 'PM'].map(p => (
          <button key={p} type="button"
            onClick={() => onChange(build(h12 || '00:00', p))}
            style={{
              padding: '5px 11px', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, borderRadius: 7, lineHeight: 1,
              background: ampm === p ? 'var(--accent)' : 'transparent',
              color: ampm === p ? '#fff' : 'var(--muted)',
              boxShadow: ampm === p ? '0 1px 4px rgba(255,107,53,0.3)' : 'none',
              transition: 'all 0.15s',
            }}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}

const SPORTS = ['Pickleball', 'Padel', 'Football', 'Cricket', 'Badminton'];

const PACKAGES_LIST = [
  { id: 'full', label: 'Personalized Reels + Shorts – All Players' },
  { id: 'semis', label: 'Personalized Reels + Shorts – Semis & Finals' },
  { id: 'shorts_all', label: 'Personalized Shorts – All Players' },
  { id: 'general', label: 'General Shorts – All Players' },
  { id: 'photos_only', label: 'Only Photos' },
];

const SPORT_EMOJI = {
  Pickleball: '🏓', Padel: '🎾', Football: '⚽', Cricket: '🏏', Badminton: '🏸',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${dd}/${mon}/${d.getFullYear()}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(parseInt(h), parseInt(m));
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [locked, setLocked] = useState(true);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('admin_auth') === 'true') {
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    if (!locked) loadTournaments();
  }, [locked]);

  function handleUnlock(e) {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_auth', 'true');
      setLocked(false);
      setPwError(false);
    } else {
      setPwError(true);
      setPwInput('');
    }
  }

  if (locked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: 24,
      }}>
        <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="HiFy" style={{ height: 32, marginBottom: 28 }} />
          <div className="card" style={{ padding: '28px 24px' }}>
            <h2 className="font-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Admin Access</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Enter password to continue</p>
            <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                autoFocus
              />
              {pwError && (
                <p style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>Incorrect password</p>
              )}
              <button type="submit" className="btn-primary" style={{ height: 44, justifyContent: 'center' }}>
                Unlock
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  async function loadTournaments() {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setTournaments(data ?? []);
    setLoading(false);
  }

  async function selectTournament(t) {
    setEditing(false);
    setLoadingDetail(true);
    setSelected({ ...t, games: [] });
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('tournament_id', t.id)
      .order('start_time', { ascending: true });
    setSelected({ ...t, games: games ?? [] });
    setLoadingDetail(false);
  }

  function startEdit() {
    setEditForm({
      ...selected,
      games: selected.games ?? [],
      _newBannerFiles: [],
      _newBannerPreviews: [],
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editForm) return;
    setSaving(true);

    // Upload any new banner files
    const newUrls = [];
    for (const file of (editForm._newBannerFiles || [])) {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tournament-banners')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('tournament-banners').getPublicUrl(fileName);
        newUrls.push(urlData.publicUrl);
      }
    }
    const existingUrls = editForm.banner_urls?.length
      ? editForm.banner_urls
      : (editForm.banner_url ? [editForm.banner_url] : []);
    const allUrls = [...existingUrls, ...newUrls];

    const { error } = await supabase
      .from('tournaments')
      .update({
        name: editForm.name,
        sport: editForm.sport,
        facility_id: editForm.facility_id,
        facility_name: FACILITIES.find(f => f.id === editForm.facility_id)?.name ?? editForm.facility_name,
        start_date: editForm.start_date,
        start_time: editForm.start_time,
        end_date: editForm.end_date,
        end_time: editForm.end_time,
        num_arenas: editForm.num_arenas,
        participants: editForm.participants ? parseInt(editForm.participants) : null,
        notes: editForm.notes || null,
        package_id: editForm.package_id,
        add_livestream: editForm.add_livestream,
        add_var: editForm.add_var,
        status: editForm.status,
        join_link: editForm.join_link,
        banner_url: allUrls[0] || null,
        banner_urls: allUrls,
      })
      .eq('id', editForm.id);

    if (!error) {
      // Save games: delete all existing, re-insert
      await supabase.from('games').delete().eq('tournament_id', editForm.id);
      if ((editForm.games || []).length > 0) {
        await supabase.from('games').insert(
          editForm.games.map(g => ({
            tournament_id: editForm.id,
            arena: g.arena,
            label: g.label || null,
            start_time: g.start_time || null,
            end_time: g.end_time || null,
          }))
        );
      }

      const updatedGames = editForm.games || [];
      const updated = {
        ...selected,
        ...editForm,
        games: updatedGames,
        banner_url: allUrls[0] || null,
        banner_urls: allUrls,
        facility_name: FACILITIES.find(f => f.id === editForm.facility_id)?.name ?? editForm.facility_name,
      };
      setSelected(updated);
      setTournaments(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
      setEditing(false);
      setEditForm(null);
    }
    setSaving(false);
  }

  async function changeStatus(newStatus) {
    if (!selected || selected.status === newStatus) return;
    setChangingStatus(true);
    await supabase.from('tournaments').update({ status: newStatus }).eq('id', selected.id);
    const updated = { ...selected, status: newStatus };
    setSelected(updated);
    setTournaments(prev => prev.map(t => t.id === updated.id ? { ...t, status: newStatus } : t));
    setChangingStatus(false);
  }

  async function verifyAndDownload() {
    if (!selected) return;
    setVerifying(true);

    // Mark as verified in DB
    await supabase
      .from('tournaments')
      .update({ verified: true })
      .eq('id', selected.id);

    const verified = { ...selected, verified: true };
    setSelected(verified);
    setTournaments(prev => prev.map(t => t.id === verified.id ? { ...t, verified: true } : t));

    // Build JSON — all datetimes as UTC ISO strings
    const toUTC = (date, time) =>
      date && time ? new Date(`${date}T${time}`).toISOString() : null;

    const bannerUrls = verified.banner_urls?.length
      ? verified.banner_urls
      : (verified.banner_url ? [verified.banner_url] : []);

    const exportData = {
      id: verified.id,
      name: verified.name,
      sport: verified.sport,
      facility_name: verified.facility_name,
      facility_id: verified.facility_id,
      start_datetime: toUTC(verified.start_date, verified.start_time),
      end_datetime: toUTC(verified.end_date, verified.end_time),
      num_arenas: verified.num_arenas,
      participants: verified.participants,
      package_id: verified.package_id,
      package_label: PACKAGES[verified.package_id]?.label ?? verified.package_id,
      add_livestream: verified.add_livestream,
      add_var: verified.add_var,
      notes: verified.notes,
      join_link: verified.join_link,
      banner_urls: bannerUrls,
      status: verified.status,
      verified: true,
      created_at: new Date(verified.created_at).toISOString(),
      games: (verified.games ?? []).map(g => ({
        arena: g.arena,
        label: g.label,
        start_time: g.start_time ? new Date(g.start_time).toISOString() : null,
        end_time: g.end_time ? new Date(g.end_time).toISOString() : null,
      })),
    };

    // Build ZIP with JSON + all banner images
    const zip = new JSZip();
    zip.file(`tournament-${verified.id}.json`, JSON.stringify(exportData, null, 2));
    await Promise.all(bannerUrls.map(async (url, idx) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const ext = url.split('.').pop().split('?')[0] || 'jpg';
        zip.file(`banner-${idx + 1}.${ext}`, blob);
      } catch { /* skip failed images */ }
    }));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `tournament-${verified.id}.zip`;
    a.click();
    URL.revokeObjectURL(zipUrl);

    setVerifying(false);
  }

  const filtered = tournaments.filter(t => {
    const matchFilter = filter === 'all' || t.status === filter;
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.facility_name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center',
        padding: '0 16px', height: 52,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="HiFy" style={{ height: 32, width: 'auto' }} />
        </a>
      </header>
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Left panel: list ── */}
      <div style={{
        width: 340, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 className="font-display" style={{ fontSize: 17, fontWeight: 700 }}>Admin</h1>
            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 100, border: '1px solid var(--border)' }}>
              {tournaments.length} submissions
            </span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input className="input" placeholder="Search…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, height: 34, fontSize: 13 }} />
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {['all', 'upcoming', 'live', 'completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                height: 24, padding: '0 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                background: filter === f ? 'var(--accent)' : 'var(--surface2)',
                color: filter === f ? '#fff' : 'var(--text)', transition: 'all 0.15s',
              }}>{f === 'all' ? 'All' : f}</button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
          {loading && [1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12, marginBottom: 8 }} />
          ))}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>No tournaments</div>
            </div>
          )}
          {filtered.map(t => (
            <ListRow
              key={t.id}
              tournament={t}
              isSelected={selected?.id === t.id}
              onClick={() => selectTournament(t)}
              formatDate={formatDate}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel: detail ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Select a tournament to review</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Click any submission on the left</div>
          </div>
        ) : loadingDetail ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 12 }} />)}
          </div>
        ) : editing ? (
          <EditPanel
            form={editForm}
            setForm={setEditForm}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={saving}
          />
        ) : (
          <DetailPanel
            tournament={selected}
            onEdit={startEdit}
            onVerifyDownload={verifyAndDownload}
            verifying={verifying}
            onChangeStatus={changeStatus}
            changingStatus={changingStatus}
            formatDate={formatDate}
            formatTime={formatTime}
          />
        )}
      </div>
    </div>
    </>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({ tournament: t, isSelected, onClick, formatDate }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', borderRadius: 12, marginBottom: 6, cursor: 'pointer',
        background: isSelected ? 'rgba(255,107,53,0.08)' : 'transparent',
        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, background: 'var(--surface2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
        }}>{SPORT_EMOJI[t.sport] ?? '🏆'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', flex: 1 }}>
              {t.name}
            </div>
            {t.verified && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'rgba(18,183,106,0.12)', padding: '1px 6px', borderRadius: 100, flexShrink: 0 }}>
                ✓
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.facility_name} · {formatDate(t.start_date)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  upcoming: { color: '#b45309', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)' },
  live:     { color: 'var(--green)', bg: 'rgba(18,183,106,0.12)', border: 'rgba(18,183,106,0.35)' },
  completed:{ color: 'var(--muted)', bg: 'var(--surface2)', border: 'var(--border)' },
};

function DetailPanel({ tournament: t, onEdit, onVerifyDownload, verifying, onChangeStatus, changingStatus, formatDate, formatTime }) {
  const pkg = PACKAGES[t.package_id];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 24px 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
          }}>{SPORT_EMOJI[t.sport] ?? '🏆'}</div>
          <div>
            <h2 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>{t.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.facility_name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {t.verified && (
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'rgba(18,183,106,0.12)',
              border: '1px solid rgba(18,183,106,0.25)', padding: '6px 12px', borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified
            </span>
          )}
        </div>
      </div>

      {/* Banners */}
      {(() => {
        const urls = t.banner_urls?.length ? t.banner_urls : (t.banner_url ? [t.banner_url] : []);
        return urls.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {urls.map((url, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={idx} src={url} alt={`Banner ${idx + 1}`}
                style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 200, objectFit: 'cover' }} />
            ))}
          </div>
        );
      })()}

      {/* Details grid */}
      <DetailCard title="Tournament Details">
        <DetailRow label="Name" value={t.name} />
        <DetailRow label="Sport" value={t.sport} />
        <DetailRow label="Facility" value={t.facility_name} />
        <DetailRow label="Start" value={`${formatDate(t.start_date)} at ${formatTime(t.start_time)}`} />
        <DetailRow label="End" value={`${formatDate(t.end_date)} at ${formatTime(t.end_time)}`} />
        <DetailRow label="Arenas" value={t.num_arenas} />
        {t.participants && <DetailRow label="Participants" value={`${t.participants} players`} />}
        {t.notes && <DetailRow label="Notes" value={t.notes} />}
        <DetailRow label="Join Link" value={t.join_link} accent />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--muted)', minWidth: 100, flexShrink: 0 }}>Status</span>
          {t.verified ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {['upcoming', 'live', 'completed'].map(s => {
                const st = STATUS_STYLE[s];
                const active = t.status === s;
                return (
                  <button key={s} type="button"
                    onClick={() => onChangeStatus(s)}
                    disabled={active || changingStatus}
                    style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${active ? st.border : 'var(--border)'}`,
                      background: active ? st.bg : 'transparent',
                      color: active ? st.color : 'var(--muted)',
                      cursor: active ? 'default' : 'pointer',
                      textTransform: 'capitalize', transition: 'all 0.15s',
                      opacity: changingStatus && !active ? 0.5 : 1,
                    }}
                  >{s}</button>
                );
              })}
            </div>
          ) : (
            <span style={{ color: 'var(--text)', fontWeight: 500, textTransform: 'capitalize' }}>{t.status}</span>
          )}
        </div>
        <DetailRow label="Submitted" value={(() => { const d = new Date(t.created_at); const dd = String(d.getDate()).padStart(2,'0'); const mon = d.toLocaleString('en-US',{month:'short'}); const time = d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}); return `${dd}/${mon}/${d.getFullYear()} at ${time}`; })()} />
      </DetailCard>

      <DetailCard title="Deliverables">
        <DetailRow label="Package" value={pkg?.label ?? t.package_id} />
        {pkg?.deliverables && <DetailRow label="Includes" value={pkg.deliverables.join(', ')} />}
        <DetailRow label="Livestream" value={t.add_livestream ? 'Yes' : 'No'} />
        <DetailRow label="VAR" value={t.add_var ? 'Yes' : 'No'} />
      </DetailCard>

      {t.games?.length > 0 && (
        <DetailCard title={`Game Schedule (${t.games.length} games)`}>
          {t.games.map((g, i) => (
            <div key={g.id ?? i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: i < t.games.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7, background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
              }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {g.arena}{g.label ? ` · ${g.label}` : ''}
                </div>
                {g.start_time && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {new Date(g.start_time).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' })}
                    {g.end_time && ` → ${new Date(g.end_time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' })}`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </DetailCard>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn-ghost" onClick={onEdit} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit Details
        </button>
        <button
          className="btn-primary"
          onClick={onVerifyDownload}
          disabled={verifying}
          style={{ flex: 1, height: 44, justifyContent: 'center' }}
        >
          {verifying ? (
            <><Spinner /> Downloading…</>
          ) : t.verified ? (
            <>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Again
            </>
          ) : (
            <>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verify & Download
            </>
          )}
        </button>
      </div>
      {!t.verified && (
        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
          Downloads a ZIP with JSON + all banner images
        </p>
      )}
    </div>
  );
}

// ─── Edit Panel ───────────────────────────────────────────────────────────────

const splitGameTime = (iso) => {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  // Use UTC values — game times are stored as plain "YYYY-MM-DDTHH:mm"
  // without timezone so Postgres treats them as UTC; read them back as-is
  const date = d.toISOString().slice(0, 10);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return { date, time: `${h}:${m}` };
};
const joinGameTime = (date, time) => (date && time) ? `${date}T${time}` : null;

// For new-game form state (plain strings, no DB conversion needed)
const splitDT = (dt) => ({ date: dt ? dt.slice(0, 10) : '', time: dt ? dt.slice(11, 16) : '' });
const joinDT = (date, time) => (date && time) ? `${date}T${time}` : '';

function EditPanel({ form, setForm, onSave, onCancel, saving }) {
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const fileRef = useRef(null);
  const [newGame, setNewGame] = useState({ arena: '', startTime: '', endTime: '', label: '' });

  const matchTimeError = newGame.startTime && newGame.endTime && newGame.endTime <= newGame.startTime
    ? 'End time must be after start time' : null;
  const isDuplicate = !!(newGame.arena && newGame.startTime && newGame.endTime &&
    (form.games || []).some(g => g.arena === newGame.arena && g.start_time === newGame.startTime && g.end_time === newGame.endTime));

  const addNewGame = () => {
    if (!newGame.arena || !newGame.startTime || !newGame.endTime || matchTimeError || isDuplicate) return;
    setForm(f => ({
      ...f,
      games: [...(f.games || []), { arena: newGame.arena, label: newGame.label, start_time: newGame.startTime, end_time: newGame.endTime }],
    }));
    setNewGame(g => ({ ...g, arena: '', label: '' }));
  };

  const handleBannerAdd = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const previews = await Promise.all(files.map(file => new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => res(ev.target.result);
      reader.readAsDataURL(file);
    })));
    setForm(f => ({
      ...f,
      _newBannerFiles: [...(f._newBannerFiles || []), ...files],
      _newBannerPreviews: [...(f._newBannerPreviews || []), ...previews],
    }));
    e.target.value = '';
  };

  const removeExistingBanner = (idx) => {
    setForm(f => ({
      ...f,
      banner_urls: (f.banner_urls || []).filter((_, i) => i !== idx),
    }));
  };

  const removeNewBanner = (idx) => {
    setForm(f => ({
      ...f,
      _newBannerFiles: (f._newBannerFiles || []).filter((_, i) => i !== idx),
      _newBannerPreviews: (f._newBannerPreviews || []).filter((_, i) => i !== idx),
    }));
  };

  const setGame = (idx, key, val) => {
    setForm(f => ({
      ...f,
      games: f.games.map((g, i) => i === idx ? { ...g, [key]: val } : g),
    }));
  };

  const removeGame = (idx) => {
    setForm(f => ({ ...f, games: f.games.filter((_, i) => i !== idx) }));
  };

  const existingBannerUrls = form.banner_urls?.length
    ? form.banner_urls
    : (form.banner_url ? [form.banner_url] : []);
  const arenas = FACILITY_ARENAS[form.facility_id] || [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 24px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn-icon" onClick={onCancel}>
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h2 className="font-display" style={{ fontSize: 17, fontWeight: 700 }}>Edit Tournament</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>Changes save directly to the database</p>
        </div>
      </div>

      <EditCard title="Tournament Details">
        <EditField label="Tournament Name">
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
        </EditField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <EditField label="Sport">
            <select className="input" value={form.sport} onChange={e => set('sport', e.target.value)}>
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </EditField>
          <EditField label="Facility">
            <select className="input" value={form.facility_id} onChange={e => set('facility_id', e.target.value)}>
              {FACILITIES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </EditField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <EditField label="Start Date">
            <DateInput value={form.start_date ?? ''} onChange={v => set('start_date', v)} />
          </EditField>
          <EditField label="Start Time">
            <TimePicker value={form.start_time ?? ''} onChange={v => set('start_time', v)} />
          </EditField>
          <EditField label="End Date">
            <DateInput value={form.end_date ?? ''} onChange={v => set('end_date', v)} />
          </EditField>
          <EditField label="End Time">
            <TimePicker value={form.end_time ?? ''} onChange={v => set('end_time', v)} />
          </EditField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <EditField label="Arenas">
            <input className="input" type="number" min={1} max={20} value={form.num_arenas} onChange={e => set('num_arenas', parseInt(e.target.value) || 1)} />
          </EditField>
          <EditField label="Participants">
            <input className="input" type="number" min={1} value={form.participants ?? ''} onChange={e => set('participants', e.target.value)} />
          </EditField>
        </div>
        <EditField label="Notes">
          <textarea className="input" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} style={{ minHeight: 70 }} />
        </EditField>
        <EditField label="Join Link">
          <input className="input" value={form.join_link ?? ''} onChange={e => set('join_link', e.target.value)} />
        </EditField>
      </EditCard>

      <EditCard title="Deliverables">
        <EditField label="Package">
          <select className="input" value={form.package_id} onChange={e => set('package_id', e.target.value)}>
            {PACKAGES_LIST.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </EditField>
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <div className={`toggle ${form.add_livestream ? 'on' : ''}`} onClick={() => set('add_livestream', !form.add_livestream)}>
              <div className="toggle-thumb" />
            </div>
            Livestream
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <div className={`toggle ${form.add_var ? 'on' : ''}`} onClick={() => set('add_var', !form.add_var)}>
              <div className="toggle-thumb" />
            </div>
            VAR
          </label>
        </div>
        <EditField label="Status">
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
          </select>
        </EditField>
      </EditCard>

      {/* Game Schedule */}
      <EditCard title={`Game Schedule (${(form.games || []).length} games)`}>
        {/* Add game form — same pattern as create page */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 12px 14px', background: 'var(--surface2)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Add Game</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label className="label">Arena *</label>
              <select className="input" value={newGame.arena} onChange={e => setNewGame(g => ({ ...g, arena: e.target.value }))}>
                <option value="" disabled />
                {arenas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Label (optional)</label>
              <input className="input" value={newGame.label} onChange={e => setNewGame(g => ({ ...g, label: e.target.value }))} placeholder="QF1, Semi-Final A…" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div>
              <label className="label">Start Date *</label>
              <DateInput value={splitDT(newGame.startTime).date} onChange={v => setNewGame(g => ({ ...g, startTime: joinDT(v, splitDT(g.startTime).time) }))} />
            </div>
            <div>
              <label className="label">Start Time *</label>
              <TimePicker value={splitDT(newGame.startTime).time} onChange={v => setNewGame(g => ({ ...g, startTime: joinDT(splitDT(g.startTime).date, v) }))} />
            </div>
            <div>
              <label className="label">End Date *</label>
              <DateInput value={splitDT(newGame.endTime).date} onChange={v => setNewGame(g => ({ ...g, endTime: joinDT(v, splitDT(g.endTime).time) }))} />
            </div>
            <div>
              <label className="label">End Time *</label>
              <TimePicker value={splitDT(newGame.endTime).time} onChange={v => setNewGame(g => ({ ...g, endTime: joinDT(splitDT(g.endTime).date, v) }))} error={!!matchTimeError} />
              {matchTimeError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{matchTimeError}</div>}
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={addNewGame}
            disabled={!newGame.arena || !newGame.startTime || !newGame.endTime || !!matchTimeError || isDuplicate}
            style={{ width: '100%', justifyContent: 'center', height: 38, marginTop: 10 }}
          >
            + Add Game
          </button>
          {isDuplicate && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>A game for this arena already exists at the same time</div>}
        </div>

        {/* Existing games list */}
        {(form.games || []).map((g, idx) => {
          const st = splitGameTime(g.start_time);
          const et = splitGameTime(g.end_time);
          return (
            <div key={idx} style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Game {idx + 1}</span>
                <button type="button" onClick={() => removeGame(idx)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontWeight: 600,
                }}>Remove</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="label">Arena</label>
                  <select className="input" value={g.arena} onChange={e => setGame(idx, 'arena', e.target.value)}>
                    {arenas.map(a => <option key={a} value={a}>{a}</option>)}
                    {!arenas.includes(g.arena) && g.arena && <option value={g.arena}>{g.arena}</option>}
                  </select>
                </div>
                <div>
                  <label className="label">Label (optional)</label>
                  <input className="input" value={g.label || ''} onChange={e => setGame(idx, 'label', e.target.value)} placeholder="e.g. Semi Final" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="label">Start Date</label>
                  <DateInput value={st.date} onChange={v => setGame(idx, 'start_time', joinGameTime(v, st.time))} />
                </div>
                <div>
                  <label className="label">Start Time</label>
                  <TimePicker value={st.time} onChange={v => setGame(idx, 'start_time', joinGameTime(st.date, v))} />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <DateInput value={et.date} onChange={v => setGame(idx, 'end_time', joinGameTime(v, et.time))} />
                </div>
                <div>
                  <label className="label">End Time</label>
                  <TimePicker value={et.time} onChange={v => setGame(idx, 'end_time', joinGameTime(et.date, v))} />
                </div>
              </div>
            </div>
          );
        })}
      </EditCard>

      {/* Banners */}
      <EditCard title={`Banners (${existingBannerUrls.length + (form._newBannerPreviews?.length || 0)})`}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/*" multiple style={{ display: 'none' }} onChange={handleBannerAdd} />
        {existingBannerUrls.map((url, idx) => (
          <div key={idx} style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Banner ${idx + 1}`} style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', maxHeight: 160, objectFit: 'cover' }} />
            <button onClick={() => removeExistingBanner(idx)} style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 8,
              color: '#fff', padding: '4px 8px', fontSize: 11, cursor: 'pointer',
            }}>Remove</button>
          </div>
        ))}
        {(form._newBannerPreviews || []).map((preview, idx) => (
          <div key={`new-${idx}`} style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`New banner ${idx + 1}`} style={{ width: '100%', borderRadius: 10, border: '1px solid var(--accent)', maxHeight: 160, objectFit: 'cover' }} />
            <button onClick={() => removeNewBanner(idx)} style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 8,
              color: '#fff', padding: '4px 8px', fontSize: 11, cursor: 'pointer',
            }}>Remove</button>
            <span style={{ position: 'absolute', top: 8, left: 8, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>New</span>
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}
          style={{ height: 38, justifyContent: 'center', fontSize: 13 }}>
          + Add image
        </button>
      </EditCard>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-ghost" onClick={onCancel} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
          Cancel
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saving} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
          {saving ? <><Spinner /> Saving…</> : <>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Save Changes
          </>}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DetailCard({ title, children }) {
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ color: accent ? 'var(--pink2)' : 'var(--text)', fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{String(value)}</span>
    </div>
  );
}

function EditCard({ title, children }) {
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function EditField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  );
}
