'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FACILITIES, FACILITY_ARENAS } from '@/lib/facilities';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS = ['Pickleball', 'Padel', 'Football', 'Cricket', 'Badminton'];

const STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];

const PACKAGES = [
  {
    id: 'full',
    label: 'Personalized Reels + Shorts – All Players',
    description: 'Every registered player gets personalized reel & short highlights.',
    deliverables: ['Personalized Reels', 'Personalized Shorts', 'General Shorts', 'Photos'],
  },
  {
    id: 'semis',
    label: 'Personalized Reels + Shorts – Semis & Finals',
    description: 'Personalized content for semifinal and final stage players only.',
    deliverables: ['Personalized Reels', 'Personalized Shorts', 'General Shorts', 'Photos'],
  },
  {
    id: 'shorts_all',
    label: 'Personalized Shorts – All Players',
    description: 'Short-form highlights for all players plus general event shorts.',
    deliverables: ['Personalized Shorts', 'General Shorts', 'Photos'],
  },
  {
    id: 'general',
    label: 'General Shorts – All Players',
    description: 'Event-level short clips for the tournament (not player-specific).',
    deliverables: ['General Shorts', 'Photos'],
  },
  {
    id: 'photos_only',
    label: 'Only Photos',
    description: 'Professional event photography for all games — no video content.',
    deliverables: ['Photos'],
  },
];

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'review', label: 'Review' },
];

// ─── Time picker (12-hr dropdown + AM/PM toggle) ─────────────────────────────

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

function TimePicker({ value, onChange, error }) {
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
        style={{ flex: 1, borderColor: error ? 'var(--red)' : undefined }}
        value={h12}
        onChange={e => onChange(build(e.target.value, ampm))}
      >
        <option value="" disabled />
        {TIME_12H.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--surface2)',
        border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
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

// Convert a UTC Date object to a local "YYYY-MM-DDTHH:mm" string (for form inputs)
function toLocalDT(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ─── Main Edit Page ───────────────────────────────────────────────────────────

export default function EditTournamentPage() {
  const router = useRouter();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [slowUpload, setSlowUpload] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load tournament + games from DB
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setLoadError(null);

      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (tErr || !t) {
        setLoadError(tErr?.message || 'Tournament not found');
        setLoading(false);
        return;
      }

      const { data: games } = await supabase
        .from('games')
        .select('*')
        .eq('tournament_id', id)
        .order('start_time', { ascending: true });

      // Convert DB games to form format
      // DB timestamps are UTC — convert to local IST "YYYY-MM-DDTHH:mm" for form pickers
      const formGames = (games || []).map(g => ({
        id: g.id,
        arena: g.arena || '',
        label: g.label || '',
        startTime: g.start_time ? toLocalDT(new Date(g.start_time)) : '',
        endTime: g.end_time ? toLocalDT(new Date(g.end_time)) : '',
      }));

      setForm({
        // Basics
        name: t.name || '',
        sport: t.sport || '',
        facilityId: t.facility_id || null,
        facilityName: t.facility_name || '',
        startDate: t.start_date || '',
        startTime: t.start_time || '',
        endDate: t.end_date || '',
        endTime: t.end_time || '',
        numArenas: t.num_arenas || null,
        participants: t.participants ? String(t.participants) : '',
        notes: t.notes || '',
        // Admin-only
        status: t.status || 'upcoming',
        joinLink: t.join_link || '',
        // Deliverables
        packageId: t.package_id || 'full',
        addLivestream: t.add_livestream || false,
        addVAR: t.add_var || false,
        // Schedule
        games: formGames,
        // Banners
        existingBannerUrls: t.banner_urls?.length
          ? t.banner_urls
          : (t.banner_url ? [t.banner_url] : []),
        bannerFiles: [],
        bannerPreviews: [],
      });
      setLoading(false);
    })();
  }, [id]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSlowUpload(false);
    const slowTimer = setTimeout(() => setSlowUpload(true), 5000);

    // Upload new banner files
    const newUrls = [];
    for (const file of form.bannerFiles) {
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
    const allUrls = [...form.existingBannerUrls, ...newUrls];

    const allFacilityArenas = FACILITY_ARENAS[form.facilityId] || [];
    const numArenas = form.numArenas
      ? Math.min(form.numArenas, allFacilityArenas.length)
      : allFacilityArenas.length;

    const { error } = await supabase
      .from('tournaments')
      .update({
        name: form.name,
        sport: form.sport,
        facility_id: form.facilityId,
        facility_name: FACILITIES.find(f => f.id === form.facilityId)?.name ?? form.facilityName,
        start_date: form.startDate,
        start_time: form.startTime,
        end_date: form.endDate,
        end_time: form.endTime,
        num_arenas: numArenas,
        participants: form.participants || null,
        notes: form.notes || null,
        package_id: form.packageId,
        add_livestream: form.addLivestream,
        add_var: form.addVAR,
        status: form.status,
        join_link: form.joinLink || null,
        banner_url: allUrls[0] || null,
        banner_urls: allUrls,
      })
      .eq('id', id);

    if (error) {
      clearTimeout(slowTimer);
      setSlowUpload(false);
      setSaveError(error.message);
      setSaving(false);
      return;
    }

    // Delete all existing games, then re-insert
    await supabase.from('games').delete().eq('tournament_id', id);
    if (form.games.length > 0) {
      await supabase.from('games').insert(
        form.games.map(g => ({
          tournament_id: id,
          arena: g.arena,
          label: g.label || null,
          start_time: g.startTime ? new Date(g.startTime).toISOString() : null,
          end_time: g.endTime ? new Date(g.endTime).toISOString() : null,
        }))
      );
    }

    clearTimeout(slowTimer);
    setSlowUpload(false);
    setSaving(false);
    setSaved(true);
    // Redirect back to admin after a brief moment
    setTimeout(() => router.push('/admin'), 1200);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="HiFy" style={{ height: 28, width: 'auto', opacity: 0.4 }} />
        <Spinner />
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading tournament…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--red)', marginBottom: 16 }}>{loadError}</div>
        <button className="btn-ghost" onClick={() => router.push('/admin')}>← Back to Admin</button>
      </div>
    );
  }

  if (saving) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 20, padding: 32, zIndex: 100,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="HiFy" style={{ height: 28, width: 'auto', marginBottom: 12, opacity: 0.5 }} />
        <Spinner />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Saving changes…
          </div>
          <div style={{
            fontSize: 13, color: 'var(--muted)', maxWidth: 260,
            opacity: slowUpload ? 1 : 0, transition: 'opacity 0.6s ease',
          }}>
            Uploading banners — please keep this page open.
          </div>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'rgba(18,183,106,0.15)', border: '1.5px solid rgba(50,213,131,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" fill="none" stroke="var(--green2)" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Saved!</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Returning to admin…</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 14px 80px' }}>

      {/* Sticky header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        height: 64, display: 'flex', alignItems: 'center', gap: 10,
        margin: '0 -14px', padding: '0 14px', marginBottom: 24,
      }}>
        <button
          className="btn-icon"
          onClick={() => step === 0 ? router.push('/admin') : goBack()}
          aria-label="Back"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <a href="/admin" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="HiFy" style={{ height: 32, width: 'auto' }} />
        </a>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>Edit Tournament</span>
      </header>

      {/* Step progress */}
      <StepBar step={step} />

      {/* Step content */}
      <div className="slide-up" key={step} style={{ marginTop: 20 }}>
        {step === 0 && <StepBasics form={form} set={set} setForm={setForm} />}
        {step === 1 && <StepDeliverables form={form} set={set} />}
        {step === 2 && <StepSchedule form={form} set={set} />}
        {step === 3 && <StepReview form={form} />}
      </div>

      {/* Navigation */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
        padding: '12px 16px', display: 'flex', gap: 10, zIndex: 40,
      }}>
        {step > 0 && (
          <button className="btn-ghost" onClick={goBack} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            className="btn-primary"
            onClick={goNext}
            disabled={!isStepValid(step, form)}
            style={{ flex: 1, height: 44, justifyContent: 'center' }}
          >
            Continue
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <>
            {saveError && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8, textAlign: 'center', width: '100%' }}>
                {saveError}
              </div>
            )}
            <button className="btn-primary" onClick={handleSave}
              style={{ flex: 1, height: 44, justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Save Changes
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Facility typeahead ───────────────────────────────────────────────────────

function FacilityAutocomplete({ facilityId, facilityName, onChange }) {
  const [query, setQuery] = useState(facilityName || '');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(facilityName || '');
  }, [facilityName]);

  const filtered = query.length >= 3
    ? FACILITIES.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.city.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const handleSelect = (f) => {
    setQuery(f.name);
    setOpen(false);
    onChange(f.id, f.name);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (facilityId && val !== facilityName) onChange(null, '');
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (!facilityId) setQuery('');
      }
    }, 150);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="Type to search…"
        value={query}
        onChange={handleChange}
        onFocus={() => { if (query.length >= 3) setOpen(true); }}
        onBlur={handleBlur}
        autoComplete="off"
        style={facilityId ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px #ff6b3533' } : {}}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(f => (
            <div
              key={f.id}
              onMouseDown={() => handleSelect(f)}
              style={{
                padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                borderBottom: '1px solid var(--border)',
                background: f.id === facilityId ? 'rgba(255,107,53,0.08)' : 'transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (f.id !== facilityId) e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = f.id === facilityId ? 'rgba(255,107,53,0.08)' : 'transparent'; }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{f.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{f.city}</span>
            </div>
          ))}
        </div>
      )}
      {open && query.length >= 3 && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
          fontSize: 12, color: 'var(--muted)',
        }}>
          No facilities found
        </div>
      )}
    </div>
  );
}

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
        style={{
          position: 'absolute', inset: 0, opacity: 0,
          cursor: 'pointer', width: '100%', height: '100%',
        }}
      />
    </div>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: i < step ? 'var(--green)' : i === step ? 'var(--accent)' : 'var(--surface2)',
              border: `2px solid ${i < step ? 'var(--green)' : i === step ? 'var(--accent)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: i <= step ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s',
              boxShadow: i === step ? '0 0 0 4px #ff6b3533' : 'none',
            }}>
              {i < step ? (
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : i + 1}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: i === step ? 'var(--accent)' : 'var(--muted)', letterSpacing: '0.04em' }}>
              {s.label.toUpperCase()}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2, marginBottom: 16,
              background: i < step ? 'var(--green)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Basics ───────────────────────────────────────────────────────────

function StepBasics({ form, set, setForm }) {
  const fileRef = useRef(null);

  const handleBanner = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const previews = await Promise.all(files.map(file => new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => res(ev.target.result);
      reader.readAsDataURL(file);
    })));
    setForm(f => ({
      ...f,
      bannerFiles: [...f.bannerFiles, ...files],
      bannerPreviews: [...f.bannerPreviews, ...previews],
    }));
    e.target.value = '';
  };

  const removeNewBanner = (idx) => {
    setForm(f => ({
      ...f,
      bannerFiles: f.bannerFiles.filter((_, i) => i !== idx),
      bannerPreviews: f.bannerPreviews.filter((_, i) => i !== idx),
    }));
  };

  const removeExistingBanner = (idx) => {
    setForm(f => ({
      ...f,
      existingBannerUrls: f.existingBannerUrls.filter((_, i) => i !== idx),
    }));
  };

  const endDateError = form.startDate && form.endDate && form.endDate < form.startDate
    ? 'End date cannot be before start date'
    : null;
  const endTimeError = !endDateError
    && form.startDate && form.endDate && form.startDate === form.endDate
    && form.startTime && form.endTime && form.endTime <= form.startTime
    ? 'End time must be after start time'
    : null;

  const hasAnyBanner = form.existingBannerUrls.length > 0 || form.bannerPreviews.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Tournament Details">
        <Field label="Tournament Name" required>
          <input
            className="input"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Sport" required>
            <select className="input" value={form.sport} onChange={e => set('sport', e.target.value)}>
              <option value="" disabled />
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Facility" required>
            <FacilityAutocomplete
              facilityId={form.facilityId}
              facilityName={form.facilityName}
              onChange={(id, name) => { set('facilityId', id); set('facilityName', name); set('numArenas', null); }}
            />
          </Field>
        </div>
      </Section>

      <Section title="Date & Time">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Start Date" required>
            <DateInput value={form.startDate} onChange={v => set('startDate', v)} />
          </Field>
          <Field label="Start Time">
            <TimePicker value={form.startTime} onChange={v => set('startTime', v)} />
          </Field>
          <Field label="End Date" required>
            <DateInput value={form.endDate} onChange={v => set('endDate', v)} error={!!endDateError} />
            {endDateError && <FieldError>{endDateError}</FieldError>}
          </Field>
          <Field label="End Time">
            <TimePicker value={form.endTime} onChange={v => set('endTime', v)} error={!!endTimeError} />
            {endTimeError && <FieldError>{endTimeError}</FieldError>}
          </Field>
        </div>
      </Section>

      <Section title="Scope">
        {form.facilityId && (() => {
          const maxArenas = (FACILITY_ARENAS[form.facilityId] || []).length;
          const current = Math.min(form.numArenas ?? 1, maxArenas);
          return (
            <Field label="Arenas used for this tournament">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CounterInput
                  value={current}
                  min={1}
                  max={maxArenas}
                  onChange={v => set('numArenas', v)}
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  of {maxArenas} available at this facility
                </span>
              </div>
            </Field>
          );
        })()}
        <Field label="Expected Participants">
          <input
            className="input"
            placeholder="e.g. 64 or 100–150"
            value={form.participants}
            onChange={e => set('participants', e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            className="input"
            placeholder="e.g. this is a Dupr Night"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            style={{ minHeight: 70 }}
          />
        </Field>
      </Section>

      <Section title="Admin">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Status">
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Join Link">
            <input
              className="input"
              placeholder="https://…"
              value={form.joinLink}
              onChange={e => set('joinLink', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Tournament Banner">
        <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/*" multiple style={{ display: 'none' }} onChange={handleBanner} />

        {hasAnyBanner ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Existing banners from DB */}
            {form.existingBannerUrls.map((url, idx) => (
              <div key={`existing-${idx}`} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Banner ${idx + 1}`} style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 180, objectFit: 'cover' }} />
                <button
                  onClick={() => removeExistingBanner(idx)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 8,
                    color: '#fff', padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                  }}
                >Remove</button>
              </div>
            ))}
            {/* New uploads (preview) */}
            {form.bannerPreviews.map((preview, idx) => (
              <div key={`new-${idx}`} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={`New banner ${idx + 1}`} style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 180, objectFit: 'cover' }} />
                <button
                  onClick={() => removeNewBanner(idx)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 8,
                    color: '#fff', padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                  }}
                >Remove</button>
              </div>
            ))}
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}
              style={{ height: 38, justifyContent: 'center', fontSize: 13 }}>
              + Add another image
            </button>
          </div>
        ) : (
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Upload a banner image</div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Step 2: Deliverables ─────────────────────────────────────────────────────

function StepDeliverables({ form, set }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Highlights Package">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PACKAGES.map(p => (
            <div
              key={p.id}
              className={`option-card ${form.packageId === p.id ? 'selected' : ''}`}
              onClick={() => set('packageId', p.id)}
            >
              <div className="option-radio">
                <div className="option-radio-dot" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}>{p.label}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                  {p.deliverables.map(d => (
                    <span key={d} className="badge badge-gray" style={{ fontSize: 10 }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Add-ons">
        <AddOnRow
          icon={<LiveStreamIcon />}
          label="Livestream"
          description="Live YouTube stream from each camera."
          checked={form.addLivestream}
          onChange={() => set('addLivestream', !form.addLivestream)}
        />
        <div className="divider" style={{ margin: '10px 0' }} />
        <AddOnRow
          icon={<VARIcon />}
          label="VAR (Video Assistant Referee)"
          description="Video review for disputed calls. For semis & finals."
          checked={form.addVAR}
          onChange={() => set('addVAR', !form.addVAR)}
        />
      </Section>
    </div>
  );
}

function AddOnRow({ icon, label, description, checked, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--muted)', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{description}</p>
      </div>
      <div className={`toggle ${checked ? 'on' : ''}`} onClick={onChange} style={{ marginTop: 2 }}>
        <div className="toggle-thumb" />
      </div>
    </div>
  );
}

// ─── Step 3: Schedule ─────────────────────────────────────────────────────────

const splitDT = (dt) => ({ date: dt ? dt.slice(0, 10) : '', time: dt ? dt.slice(11, 16) : '' });
const joinDT = (date, time) => (date && time) ? `${date}T${time}` : '';

function fmt12(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

function StepSchedule({ form, set }) {
  const allArenas = (FACILITY_ARENAS[form.facilityId] || []).slice(0, form.numArenas || undefined);
  const [newGame, setNewGame] = useState({
    arena: '',
    startDate: '',
    startTime: form.startTime || '',
    endDate: '',
    endTime: form.endTime || '',
    label: '',
  });

  const startDT = newGame.startDate && newGame.startTime ? `${newGame.startDate}T${newGame.startTime}` : '';
  const endDT = newGame.endDate && newGame.endTime ? `${newGame.endDate}T${newGame.endTime}` : '';

  const matchTimeError = startDT && endDT && endDT <= startDT
    ? 'End time must be after start time'
    : null;

  const isDuplicate = !!(newGame.arena && startDT && endDT &&
    form.games.some(g =>
      g.arena === newGame.arena &&
      g.startTime === startDT &&
      g.endTime === endDT
    ));

  const addGame = () => {
    if (!startDT || !endDT || !newGame.arena || matchTimeError || isDuplicate) return;
    set('games', [...form.games, { arena: newGame.arena, startTime: startDT, endTime: endDT, label: newGame.label, id: Date.now() }]);
    setNewGame(g => ({ ...g, arena: '', startDate: '', endDate: '' }));
  };

  const removeGame = (id) => set('games', form.games.filter(g => g.id !== id));

  const dateRange = form.startDate
    ? (form.startDate === form.endDate
        ? fmtDateDisplay(form.startDate)
        : `${fmtDateDisplay(form.startDate)} → ${fmtDateDisplay(form.endDate)}`)
    : '—';
  const timeRange = form.startTime ? `${fmt12(form.startTime)} – ${fmt12(form.endTime)}` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{form.name || '—'}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: 13, color: 'var(--muted)' }}>
          <span>{allArenas.length} arena{allArenas.length !== 1 ? 's' : ''}</span>
          <span>{dateRange}</span>
          <span>{timeRange}</span>
        </div>
      </div>
      <Section title="Add Game">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Arena" required>
            <select
              className="input"
              value={newGame.arena}
              onChange={e => setNewGame(g => ({ ...g, arena: e.target.value }))}
            >
              <option value="" disabled />
              {allArenas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start Date" required>
              <DateInput
                value={newGame.startDate}
                onChange={v => setNewGame(g => ({ ...g, startDate: v, endDate: g.endDate || v }))}
              />
            </Field>
            <Field label="Start Time" required>
              <TimePicker
                value={newGame.startTime}
                onChange={v => setNewGame(g => ({ ...g, startTime: v }))}
              />
            </Field>
            <Field label="End Date" required>
              <DateInput
                value={newGame.endDate}
                onChange={v => setNewGame(g => ({ ...g, endDate: v }))}
              />
            </Field>
            <Field label="End Time" required>
              <TimePicker
                value={newGame.endTime}
                onChange={v => setNewGame(g => ({ ...g, endTime: v }))}
                error={!!matchTimeError}
              />
              {matchTimeError && <FieldError>{matchTimeError}</FieldError>}
            </Field>
          </div>

          <button
            className="btn-primary"
            onClick={addGame}
            disabled={!startDT || !endDT || !newGame.arena || !!matchTimeError || isDuplicate}
            style={{ width: '100%', justifyContent: 'center', height: 38 }}
          >
            Add Game
          </button>
          {isDuplicate && <FieldError>A game for this arena already exists at the same time</FieldError>}
        </div>
      </Section>

      {form.games.length > 0 && (
        <Section title={`Games (${form.games.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.games.map((g, i) => (
              <div key={g.id} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {g.arena}{g.label ? ` · ${g.label}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {fmtGameTime(g.startTime)} → {fmtGameTime(g.endTime)}
                  </div>
                </div>
                <button
                  onClick={() => removeGame(g.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {form.games.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--muted)' }}>
          No games yet — add one above, or continue without games.
        </div>
      )}
    </div>
  );
}

// Format a local "YYYY-MM-DDTHH:mm" string for display in DD/Mon/YYYY 12-hr IST
function fmtGameTime(s) {
  if (!s) return '—';
  const d = new Date(s); // parse as local (IST)
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  return `${dd}/${mon}/${d.getFullYear()} ${time}`;
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${dd}/${mon}/${d.getFullYear()}`;
}

function StepReview({ form }) {
  const pkg = PACKAGES.find(p => p.id === form.packageId);
  const allBanners = [...form.existingBannerUrls, ...form.bannerPreviews];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ReviewSection title="Tournament Basics">
        <ReviewRow label="Name" value={form.name} />
        <ReviewRow label="Sport" value={form.sport} />
        <ReviewRow label="Facility" value={form.facilityName} />
        <ReviewRow label="Date" value={form.startDate ? (form.startDate === form.endDate ? fmtDate(form.startDate) : `${fmtDate(form.startDate)} → ${fmtDate(form.endDate || form.startDate)}`) : '—'} />
        <ReviewRow label="Time" value={`${form.startTime || '—'} – ${form.endTime || '—'}`} />
        <ReviewRow label="Participants" value={form.participants ? `~${form.participants} players` : null} />
        {form.notes && <ReviewRow label="Notes" value={form.notes} />}
        <ReviewRow label="Status" value={form.status ? form.status.charAt(0).toUpperCase() + form.status.slice(1) : null} />
        {form.joinLink && <ReviewRow label="Join Link" value={form.joinLink} />}
      </ReviewSection>

      <ReviewSection title="Deliverables">
        <ReviewRow label="Package" value={pkg?.label} />
        <ReviewRow label="Includes" value={pkg?.deliverables.join(', ')} />
        {form.addLivestream && <ReviewRow label="Livestream" value="Yes" />}
        {form.addVAR && <ReviewRow label="VAR" value="Yes" />}
      </ReviewSection>

      {form.games.length > 0 && (
        <ReviewSection title={`Schedule (${form.games.length} games)`}>
          {form.games.map((g, i) => (
            <ReviewRow key={g.id} label={`Game ${i + 1}`}
              value={`${g.arena}${g.label ? ` · ${g.label}` : ''} · ${fmtGameTime(g.startTime)} → ${fmtGameTime(g.endTime)}`} />
          ))}
        </ReviewSection>
      )}

      {allBanners.length > 0 && (
        <ReviewSection title={`Banner${allBanners.length > 1 ? 's' : ''} (${allBanners.length})`}>
          {allBanners.map((src, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={idx} src={src} alt={`Banner ${idx + 1}`} style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', maxHeight: 160, objectFit: 'cover' }} />
          ))}
        </ReviewSection>
      )}

      <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(18,183,106,0.06)', borderColor: 'rgba(18,183,106,0.2)' }}>
        <svg width="16" height="16" fill="none" stroke="var(--green2)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Saving will update the tournament record and replace all existing games.
        </p>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{String(value)}</span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="label">
        {label}{required && <span style={{ color: 'var(--accent)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function CounterInput({ value, onChange, min = 1, max = 20 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden', height: 42, width: 120,
    }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        style={{
          width: 42, height: '100%', border: 'none', background: 'none',
          fontSize: 18, color: value <= min ? 'var(--border)' : 'var(--text)',
          cursor: value <= min ? 'default' : 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >−</button>
      <div style={{
        flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15,
        color: 'var(--text)', userSelect: 'none',
      }}>{value}</div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={{
          width: 42, height: '100%', border: 'none', background: 'none',
          fontSize: 18, color: value >= max ? 'var(--border)' : 'var(--text)',
          cursor: value >= max ? 'default' : 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >+</button>
    </div>
  );
}

function FieldError({ children }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  );
}

function isStepValid(step, form) {
  if (!form) return false;
  if (step === 0) {
    if (!form.name || !form.sport || !form.facilityId || !form.startDate || !form.endDate) return false;
    if (form.endDate < form.startDate) return false;
    if (form.startDate === form.endDate && form.startTime && form.endTime && form.endTime <= form.startTime) return false;
    return true;
  }
  // Schedule step is optional in edit mode — always valid
  return true;
}

function LiveStreamIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function VARIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M15 3H7a2 2 0 00-2 2v14a2 2 0 002 2h8" />
      <path d="M21 12H9" /><path d="M18 9l3 3-3 3" />
    </svg>
  );
}
