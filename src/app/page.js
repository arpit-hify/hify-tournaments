'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase, PACKAGES } from '@/lib/supabase';

const STATUS_BADGE = {
  upcoming: { label: 'Upcoming', cls: 'badge-lime' },
  live: { label: 'Live', cls: 'badge-green' },
  completed: { label: 'Completed', cls: 'badge-gray' },
};

const SPORT_EMOJI = {
  Pickleball: '🏓',
  Padel: '🎾',
  Football: '⚽',
  Cricket: '🏏',
  Badminton: '🏸',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(parseInt(h), parseInt(m));
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function DashboardPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) setTournaments(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = tournaments.filter(t => {
    const matchFilter = filter === 'all' || t.status === filter;
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.facility_name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const activeCount = tournaments.filter(t => t.status === 'upcoming' || t.status === 'live').length;

  return (
    <>
      <SiteHeader />
    <div className="slide-up" style={{ padding: '14px 14px 80px' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 20, fontWeight: 700 }}>Tournaments</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {loading ? '…' : `${tournaments.length} total · ${activeCount} active`}
          </p>
        </div>
        <Link href="/create">
          <button className="btn-primary" style={{ height: 36, padding: '0 14px', fontSize: 13 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Tournament
          </button>
        </Link>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input className="input" placeholder="Search tournaments or facilities…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'upcoming', 'live', 'completed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            height: 28, padding: '0 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
            border: 'none', cursor: 'pointer', textTransform: 'capitalize',
            background: filter === f ? 'var(--accent)' : 'var(--surface2)',
            color: filter === f ? '#fff' : 'var(--text)', transition: 'all 0.15s',
          }}>{f === 'all' ? 'All' : f}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && [1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 120, borderRadius: 14 }} />
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No tournaments found</div>
            <div style={{ fontSize: 12 }}>Try adjusting your filters or create one</div>
          </div>
        )}
        {filtered.map(t => (
          <TournamentCard key={t.id} tournament={t} formatDate={formatDate} formatTime={formatTime} />
        ))}
      </div>

      {/* FAB */}
      <div style={{ position: 'fixed', bottom: 20, right: 16, zIndex: 40 }}>
        <Link href="/create">
          <button className="btn-primary" style={{
            width: 52, height: 52, borderRadius: 16, padding: 0, justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(255,107,53,0.4)',
          }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </Link>
      </div>
    </div>
    </>
  );
}

function SiteHeader() {
  return (
    <header style={{
      display: 'flex', alignItems: 'center',
      padding: '0 16px', height: 52,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.png" alt="HiFy" style={{ height: 30, width: 'auto' }} />
    </header>
  );
}

function TournamentCard({ tournament: t, formatDate, formatTime }) {
  const status = STATUS_BADGE[t.status] ?? STATUS_BADGE.completed;
  const pkg = PACKAGES[t.package_id];
  const deliverables = pkg?.deliverables ?? ['Photos'];

  return (
    <Link href={`/tournament/${t.id}`} style={{ textDecoration: 'none' }}>
      <div className="card" style={{ padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,107,53,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
            }}>{SPORT_EMOJI[t.sport] ?? '🏆'}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                {t.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.facility_name}
              </div>
            </div>
          </div>
          <span className={`badge ${status.cls}`} style={{ flexShrink: 0, marginTop: 2 }}>
            {t.status === 'live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green2)', display: 'inline-block' }} />}
            {status.label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <MetaItem icon={<CalIcon />} label={formatDate(t.start_date)} />
          <MetaItem icon={<ClockIcon />} label={`${formatTime(t.start_time)} – ${formatTime(t.end_time)}`} />
          {t.participants && <MetaItem icon={<PeopleIcon />} label={`${t.participants} players`} />}
          {t.add_livestream && <MetaItem icon={<LiveIcon />} label="Livestream" accent />}
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {deliverables.map(d => (
            <span key={d} className="badge badge-gray" style={{ fontSize: 10 }}>{d}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function MetaItem({ icon, label, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: accent ? 'var(--pink2)' : 'var(--muted)' }}>
      {icon}{label}
    </div>
  );
}

function CalIcon() {
  return <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
}
function ClockIcon() {
  return <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function PeopleIcon() {
  return <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
}
function LiveIcon() {
  return <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>;
}
