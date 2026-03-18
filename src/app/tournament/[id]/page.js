'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase, PACKAGES } from '@/lib/supabase';

const STATUS = {
  upcoming: { label: 'Upcoming', cls: 'badge-lime' },
  live: { label: 'Live', cls: 'badge-green' },
  completed: { label: 'Completed', cls: 'badge-gray' },
};

function fmt(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

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

export default function TournamentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [t, setT] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  // Auth guard — admin only
  useEffect(() => {
    if (sessionStorage.getItem('admin_auth') !== 'true') {
      router.replace('/admin');
    } else {
      setAuthed(true);
    }
  }, [router]);

  useEffect(() => {
    if (!authed) return;
    async function load() {
      const [{ data: tournament }, { data: gamesData }] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', id).single(),
        supabase.from('games').select('*').eq('tournament_id', id).order('start_time', { ascending: true }),
      ]);
      setT(tournament);
      setGames(gamesData ?? []);
      setLoading(false);
    }
    load();
  }, [id, authed]);

  if (!authed) return null;

  if (loading) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 14px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 9 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 18, width: '60%', borderRadius: 6, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 13, width: '40%', borderRadius: 6 }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 14 }} />)}
        </div>
        <div className="skeleton" style={{ height: 100, borderRadius: 14, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 140, borderRadius: 14 }} />
      </div>
    );
  }

  if (!t) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
        <div style={{ fontWeight: 700 }}>Tournament not found</div>
        <button className="btn-ghost" onClick={() => router.push('/')} style={{ marginTop: 16, height: 38, padding: '0 16px' }}>
          Back to Tournaments
        </button>
      </div>
    );
  }

  const status = STATUS[t.status] ?? STATUS.completed;
  const pkg = PACKAGES[t.package_id];

  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center',
        padding: '0 16px', height: 52,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="HiFy" style={{ height: 22, width: 'auto' }} />
        </a>
      </header>
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 14px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="btn-icon" onClick={() => router.push('/')} aria-label="Back">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 className="font-display" style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.name}
            </h1>
            <span className={`badge ${status.cls}`}>{status.label}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {t.sport} · {t.facility_name}
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <StatCard label="Players" value={t.participants ?? '—'} />
        <StatCard label="Arenas" value={t.num_arenas} />
        <StatCard label="Matches" value={games.length} />
      </div>

      {/* Joining link */}
      {t.join_link && (
        <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Player Joining Link
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--pink2)', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>{t.join_link}</span>
            <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(t.join_link)}
              style={{ padding: '5px 10px', height: 'auto', fontSize: 11, flexShrink: 0 }}>Copy</button>
            <button className="btn-ghost" style={{ padding: '5px 10px', height: 'auto', fontSize: 11, flexShrink: 0 }}>Share</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
            Players must register via this link before the event for face recognition to work.
          </p>
        </div>
      )}

      {/* Deliverables */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <SectionTitle>Deliverables</SectionTitle>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{pkg?.label ?? t.package_id}</p>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(pkg?.deliverables ?? ['Photos']).map(d => (
            <span key={d} className="badge badge-gray">{d}</span>
          ))}
        </div>
        {t.add_livestream && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--pink2)' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            Livestream · ₹250/hr per camera
          </div>
        )}
        {t.add_var && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 3H7a2 2 0 00-2 2v14a2 2 0 002 2h8" /><path d="M21 12H9" /><path d="M18 9l3 3-3 3" />
            </svg>
            VAR (Video Assistant Referee)
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Schedule ({games.length} matches)</SectionTitle>
        </div>
        {games.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>No matches scheduled. Cameras record continuously.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {games.map((g, i) => (
              <div key={g.id} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '9px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    Arena {g.arena}{g.label ? ` · ${g.label}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {fmt(g.start_time)} → {fmt(g.end_time)}
                  </div>
                </div>
                <span className="badge badge-gray" style={{ fontSize: 10 }}>Arena {g.arena}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timing */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <SectionTitle>Event Timing</SectionTitle>
        <InfoRow label="Date" value={t.start_date === t.end_date ? formatDate(t.start_date) : `${formatDate(t.start_date)} → ${formatDate(t.end_date)}`} />
        <InfoRow label="Time" value={`${formatTime(t.start_time)} – ${formatTime(t.end_time)}`} />
        {t.notes && <InfoRow label="Notes" value={t.notes} />}
      </div>
    </div>
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
      <div className="font-display" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, ...style }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginBottom: 6 }}>
      <span style={{ color: 'var(--muted)', minWidth: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
