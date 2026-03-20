'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [locked, setLocked] = useState(true);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  const [activeTab, setActiveTab] = useState('tournaments');

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
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
    if (selected) router.push(`/admin/edit/${selected.id}`);
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
        <div style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
          {[{ id: 'tournaments', label: 'Tournaments' }, { id: 'discount_codes', label: 'Discount Codes' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              height: 30, padding: '0 14px', borderRadius: 100, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: activeTab === tab.id ? 'var(--accent)' : 'var(--surface2)',
              color: activeTab === tab.id ? '#fff' : 'var(--text)', transition: 'all 0.15s',
            }}>{tab.label}</button>
          ))}
        </div>
      </header>
      {activeTab === 'discount_codes' && <DiscountCodesPanel />}
    <div style={{ display: activeTab === 'tournaments' ? 'flex' : 'none', height: 'calc(100vh - 52px)', overflow: 'hidden', background: 'var(--bg)' }}>

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
        <DetailRow label="Livestream" value={t.add_livestream ? (t.livestream_channel === 'own' ? `${t.facility_name} YouTube Channel` : 'HiFy YouTube Channel') : 'No'} />
        <DetailRow label="VAR" value={t.add_var ? 'Yes' : 'No'} />
        {t.discount_code && <DetailRow label="Discount Code" value={t.discount_code} accent />}
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
                    {new Date(g.start_time).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                    {g.end_time && ` → ${new Date(g.end_time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}`}
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


function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  );
}

// ─── Discount Codes Panel ─────────────────────────────────────────────────────

const EMPTY_FORM = { code: '', description: '', discount_type: 'percent', discount_value: '', max_uses: '', unlimited: true, expires_at: '' };

function DiscountCodesPanel() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedUses, setExpandedUses] = useState(null); // code id
  const [uses, setUses] = useState({}); // { [codeId]: [...] }
  const [loadingUses, setLoadingUses] = useState({});

  useEffect(() => { loadCodes(); }, []);

  async function loadCodes() {
    setLoading(true);
    const { data } = await supabase.from('discount_codes').select('*').order('created_at', { ascending: false });
    setCodes(data ?? []);
    setLoading(false);
  }

  async function loadUses(codeId) {
    setLoadingUses(prev => ({ ...prev, [codeId]: true }));
    const { data } = await supabase
      .from('discount_code_uses')
      .select('*')
      .eq('code_id', codeId)
      .order('used_at', { ascending: false });
    setUses(prev => ({ ...prev, [codeId]: data ?? [] }));
    setLoadingUses(prev => ({ ...prev, [codeId]: false }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const val = parseFloat(form.discount_value);
    if (!code || isNaN(val) || val <= 0) return;
    if (form.discount_type === 'percent' && val > 100) { setError('Percentage cannot exceed 100.'); return; }
    setError('');
    setSaving(true);
    const { error: err } = await supabase.from('discount_codes').insert({
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: val,
      max_uses: form.unlimited ? null : (parseInt(form.max_uses) || null),
      expires_at: form.expires_at ? `${form.expires_at}T23:59:59+05:30` : null,
    });
    if (err) {
      setError(err.message.includes('unique') ? 'Code already exists.' : err.message);
    } else {
      setForm(EMPTY_FORM);
      await loadCodes();
    }
    setSaving(false);
  }

  async function toggleActive(id, current) {
    await supabase.from('discount_codes').update({ active: !current }).eq('id', id);
    setCodes(prev => prev.map(c => c.id === id ? { ...c, active: !current } : c));
  }

  async function deleteCode(id) {
    await supabase.from('discount_codes').delete().eq('id', id);
    setCodes(prev => prev.filter(c => c.id !== id));
    setExpandedUses(v => v === id ? null : v);
  }

  function toggleUses(id) {
    if (expandedUses === id) { setExpandedUses(null); return; }
    setExpandedUses(id);
    if (!uses[id]) loadUses(id);
  }

  function fmtDiscount(c) {
    return c.discount_type === 'percent' ? `${c.discount_value}% off` : `₹${c.discount_value} off`;
  }

  function fmtExpiry(d) {
    if (!d) return 'No expiry';
    return fmtDateDisplay(d.slice(0, 10));
  }

  function fmtUseTime(d) {
    const dt = new Date(d);
    return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <h2 className="font-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>Discount Codes</h2>

      {/* ── Add new code ── */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          New Code
        </div>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <label className="label">Code</label>
              <input className="input" placeholder="e.g. EARLY20" value={form.code}
                onChange={e => { setForm(f => ({ ...f, code: e.target.value })); setError(''); }}
                style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }} />
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <input className="input" placeholder="e.g. Early bird discount" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Discount Type</label>
              <div style={{ display: 'flex', gap: 6, height: 40 }}>
                {[{ v: 'percent', l: '% Off' }, { v: 'flat', l: '₹ Flat' }].map(opt => (
                  <button key={opt.v} type="button"
                    onClick={() => setForm(f => ({ ...f, discount_type: opt.v }))}
                    style={{
                      flex: 1, border: `1.5px solid ${form.discount_type === opt.v ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: form.discount_type === opt.v ? 'rgba(255,107,53,0.08)' : 'var(--surface2)',
                      color: form.discount_type === opt.v ? 'var(--accent)' : 'var(--text)',
                    }}>{opt.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Value</label>
              <input className="input" type="number" min="1" max={form.discount_type === 'percent' ? 100 : undefined}
                placeholder={form.discount_type === 'percent' ? '20' : '500'}
                value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
            </div>
            <div>
              <label className="label">Expires On (optional)</label>
              <DateInput value={form.expires_at}
                onChange={v => setForm(f => ({ ...f, expires_at: v }))} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.unlimited}
                onChange={e => setForm(f => ({ ...f, unlimited: e.target.checked, max_uses: '' }))}
                style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
              Unlimited uses
            </label>
            {!form.unlimited && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="label" style={{ margin: 0 }}>Max uses</label>
                <input className="input" type="number" min="1" placeholder="e.g. 50"
                  value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                  style={{ width: 100 }} />
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

          <button type="submit" className="btn-primary"
            disabled={saving || !form.code.trim() || !form.discount_value}
            style={{ height: 40, justifyContent: 'center', alignSelf: 'flex-start', padding: '0 24px' }}>
            {saving ? <Spinner /> : 'Create Code'}
          </button>
        </form>
      </div>

      {/* ── Code list ── */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          {codes.length} Code{codes.length !== 1 ? 's' : ''}
        </div>

        {loading && [1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10, marginBottom: 8 }} />
        ))}
        {!loading && codes.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No codes yet.</div>
        )}

        {codes.map((c, i) => {
          const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
          const isMaxed = c.max_uses !== null && c.uses_count >= c.max_uses;
          const isEffectivelyActive = c.active && !isExpired && !isMaxed;
          const showUses = expandedUses === c.id;

          return (
            <div key={c.id} style={{ borderBottom: i < codes.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontWeight: 700, fontSize: 13, letterSpacing: '0.05em',
                      color: isEffectivelyActive ? 'var(--text)' : 'var(--muted)',
                      textDecoration: isEffectivelyActive ? 'none' : 'line-through',
                    }}>{c.code}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{fmtDiscount(c)}</span>
                    {!c.active && <Badge label="Inactive" />}
                    {isExpired && <Badge label="Expired" />}
                    {isMaxed && <Badge label="Limit reached" />}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 10 }}>
                    <span>{c.uses_count}{c.max_uses !== null ? `/${c.max_uses}` : ''} use{c.uses_count !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{fmtExpiry(c.expires_at)}</span>
                    {c.description && <><span>·</span><span>{c.description}</span></>}
                  </div>
                </div>
                <button onClick={() => toggleUses(c.id)}
                  style={{ height: 28, padding: '0 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--border)', background: showUses ? 'var(--surface)' : 'var(--surface2)',
                    color: 'var(--text)', cursor: 'pointer' }}>
                  {showUses ? 'Hide' : 'Uses'}
                </button>
                <button onClick={() => toggleActive(c.id, c.active)}
                  style={{ height: 28, padding: '0 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    color: 'var(--text)', cursor: 'pointer' }}>
                  {c.active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => deleteCode(c.id)}
                  style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: 'var(--red)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>

              {/* Usage log */}
              {showUses && (
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
                  {loadingUses[c.id] && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>}
                  {!loadingUses[c.id] && uses[c.id]?.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>No uses yet.</div>
                  )}
                  {!loadingUses[c.id] && uses[c.id]?.map((u, j) => (
                    <div key={u.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 12, padding: '5px 0',
                      borderBottom: j < uses[c.id].length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.tournament_name || '—'}</span>
                      <span style={{ color: 'var(--muted)' }}>{fmtUseTime(u.used_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ label }) {
  return (
    <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 100, border: '1px solid var(--border)', fontWeight: 600 }}>
      {label}
    </span>
  );
}
