'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { FACILITIES, FACILITY_ARENAS } from '@/lib/facilities';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS = ['Pickleball', 'Padel', 'Football', 'Cricket', 'Badminton'];

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
];

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'review', label: 'Review' },
];

// ─── Initial form state ───────────────────────────────────────────────────────

const INITIAL = {
  // Step 1
  name: '',
  sport: '',
  facilityId: null,
  facilityName: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  numArenas: null,   // how many of the facility's arenas will be used
  participants: '',
  bannerFile: null,
  bannerPreview: null,
  notes: '',

  // Step 2
  packageId: 'full',
  addLivestream: false,
  addVAR: false,

  // Step 3
  games: [],
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreateTournamentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdTournament, setCreatedTournament] = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    const joinLink = `hify.club/join/T${Date.now().toString(36).toUpperCase()}`;

    // Upload banner to Supabase Storage if present
    let bannerUrl = null;
    if (form.bannerFile) {
      const ext = form.bannerFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tournament-banners')
        .upload(fileName, form.bannerFile, { cacheControl: '3600', upsert: false });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('tournament-banners').getPublicUrl(fileName);
        bannerUrl = urlData.publicUrl;
      }
    }

    const allFacilityArenas = FACILITY_ARENAS[form.facilityId] || [];
    const arenas = form.numArenas ? allFacilityArenas.slice(0, form.numArenas) : allFacilityArenas;

    const { data: tournament, error: tError } = await supabase
      .from('tournaments')
      .insert({
        name: form.name,
        sport: form.sport,
        facility_id: form.facilityId,
        facility_name: form.facilityName,
        start_date: form.startDate,
        start_time: form.startTime,
        end_date: form.endDate,
        end_time: form.endTime,
        num_arenas: arenas.length,
        participants: form.participants || null,
        notes: form.notes || null,
        package_id: form.packageId,
        add_livestream: form.addLivestream,
        add_var: form.addVAR,
        status: 'upcoming',
        join_link: joinLink,
        banner_url: bannerUrl,
      })
      .select()
      .single();

    if (tError) {
      setSubmitError(tError.message);
      setSubmitting(false);
      return;
    }

    // Insert games if any
    if (form.games.length > 0) {
      await supabase.from('games').insert(
        form.games.map(g => ({
          tournament_id: tournament.id,
          arena: g.arena,
          label: g.label || null,
          start_time: g.startTime || null,
          end_time: g.endTime || null,
        }))
      );
    }

    setCreatedTournament(tournament);
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) return <SuccessScreen form={form} tournament={createdTournament} onBack={() => router.push('/')} />;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 14px 80px' }}>

      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          className="btn-icon"
          onClick={() => step === 0 ? router.push('/') : goBack()}
          aria-label="Back"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="font-display" style={{ fontSize: 18, fontWeight: 700 }}>New Tournament</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            Step {step + 1} of {STEPS.length} · {STEPS[step].label}
          </p>
        </div>
      </div>

      {/* Step progress */}
      <StepBar step={step} />

      {/* Step content */}
      <div className="slide-up" key={step} style={{ marginTop: 20 }}>
        {step === 0 && <StepBasics form={form} set={set} />}
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
            {submitError && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8, textAlign: 'center', width: '100%' }}>
                {submitError}
              </div>
            )}
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}
              style={{ flex: 1, height: 44, justifyContent: 'center' }}>
              {submitting ? (
                <>
                  <Spinner /> Creating…
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Create Tournament
                </>
              )}
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

  // Keep display text in sync if parent resets the form
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
    // If user clears or changes away from selected name, reset selection
    if (facilityId && val !== facilityName) onChange(null, '');
  };

  const handleBlur = (e) => {
    // Delay so click on dropdown option fires first
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        // If nothing selected, clear the query
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

function StepBasics({ form, set }) {
  const fileRef = useRef(null);

  const handleBanner = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    set('bannerFile', file);
    const reader = new FileReader();
    reader.onload = ev => set('bannerPreview', ev.target.result);
    reader.readAsDataURL(file);
  };

  const endDateError = form.startDate && form.endDate && form.endDate < form.startDate
    ? 'End date cannot be before start date'
    : null;
  const endTimeError = !endDateError
    && form.startDate && form.endDate && form.startDate === form.endDate
    && form.startTime && form.endTime && form.endTime <= form.startTime
    ? 'End time must be after start time'
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Tournament Details">
        <Field label="Tournament Name" required>
          <input
            className="input"
            placeholder="Tournament name"
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
            <input className="input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={{ color: form.startDate ? 'var(--text)' : 'transparent' }} />
          </Field>
          <Field label="Start Time">
            <input className="input" type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} style={{ color: form.startTime ? 'var(--text)' : 'transparent' }} />
          </Field>
          <Field label="End Date" required>
            <input
              className="input" type="date" value={form.endDate}
              onChange={e => set('endDate', e.target.value)}
              style={{ color: form.endDate ? 'var(--text)' : 'transparent', borderColor: endDateError ? 'var(--red)' : undefined }}
            />
            {endDateError && <FieldError>{endDateError}</FieldError>}
          </Field>
          <Field label="End Time">
            <input
              className="input" type="time" value={form.endTime}
              onChange={e => set('endTime', e.target.value)}
              style={{ color: form.endTime ? 'var(--text)' : 'transparent', borderColor: endTimeError ? 'var(--red)' : undefined }}
            />
            {endTimeError && <FieldError>{endTimeError}</FieldError>}
          </Field>
        </div>
      </Section>

      <Section title="Scope">
        {form.facilityId && (() => {
          const maxArenas = (FACILITY_ARENAS[form.facilityId] || []).length;
          const current = form.numArenas ?? 1;
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
            placeholder="Any special requirements or notes for the HiFy team…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            style={{ minHeight: 70 }}
          />
        </Field>
      </Section>

      <Section title="Tournament Banner">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBanner} />
        {form.bannerPreview ? (
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.bannerPreview} alt="Banner preview" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 180, objectFit: 'cover' }} />
            <button
              onClick={() => { set('bannerFile', null); set('bannerPreview', null); }}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 8,
                color: '#fff', padding: '4px 8px', fontSize: 11, cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Upload banner or logo</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>PNG, JPG up to 10MB</div>
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

function toDatetimeLocal(date, time) {
  return date ? `${date}T${time || '00:00'}` : '';
}

function StepSchedule({ form, set }) {
  const allArenas = FACILITY_ARENAS[form.facilityId] || [];
  const arenaOptions = form.numArenas ? allArenas.slice(0, form.numArenas) : allArenas;
  const [newGame, setNewGame] = useState({
    arena: '',
    startTime: toDatetimeLocal(form.startDate, form.startTime),
    endTime: toDatetimeLocal(form.endDate, form.endTime),
    label: '',
  });

  const matchTimeError = newGame.startTime && newGame.endTime && newGame.endTime <= newGame.startTime
    ? 'End time must be after start time'
    : null;

  const addGame = () => {
    if (!newGame.startTime || !newGame.endTime || !newGame.arena || matchTimeError) return;
    set('games', [...form.games, { ...newGame, id: Date.now() }]);
    setNewGame(g => ({ ...g, arena: '' }));
  };

  const removeGame = (id) => set('games', form.games.filter(g => g.id !== id));

  const covered = form.games.length;
  const needed = arenaOptions.length;
  const allCovered = needed > 0 && covered >= needed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Add Match">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Arena" required>
              <select
                className="input"
                value={newGame.arena}
                onChange={e => setNewGame(g => ({ ...g, arena: e.target.value }))}
              >
                <option value="" disabled />
                {arenaOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Match Label (optional)">
              <input
                className="input"
                placeholder="QF1, Semi-Final A…"
                value={newGame.label}
                onChange={e => setNewGame(g => ({ ...g, label: e.target.value }))}
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start Time">
              <input
                className="input"
                type="datetime-local"
                value={newGame.startTime}
                onChange={e => setNewGame(g => ({ ...g, startTime: e.target.value }))}
              />
            </Field>
            <Field label="End Time">
              <input
                className="input"
                type="datetime-local"
                value={newGame.endTime}
                onChange={e => setNewGame(g => ({ ...g, endTime: e.target.value }))}
                style={{ borderColor: matchTimeError ? 'var(--red)' : undefined }}
              />
              {matchTimeError && <FieldError>{matchTimeError}</FieldError>}
            </Field>
          </div>

          {/* Arena coverage hint */}
          {needed > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600,
              color: allCovered ? 'var(--green)' : '#f79009',
            }}>
              {allCovered ? (
                <>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                  All {needed} arena{needed > 1 ? 's' : ''} covered
                </>
              ) : (
                <>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {needed} arena{needed > 1 ? 's' : ''} · {covered} match{covered !== 1 ? 'es' : ''} added{covered < needed ? ` · need ${needed - covered} more` : ''}
                </>
              )}
            </div>
          )}

          <button
            className="btn-ghost"
            onClick={addGame}
            disabled={!newGame.startTime || !newGame.endTime || !newGame.arena || !!matchTimeError}
            style={{ width: '100%', justifyContent: 'center', height: 38 }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Match
          </button>
        </div>
      </Section>

      {form.games.length > 0 && (
        <Section title={`Matches (${form.games.length})`}>
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
                    {fmt(g.startTime)} → {fmt(g.endTime)}
                  </div>
                </div>
                {/* Remove button */}
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
    </div>
  );
}

function fmt(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function StepReview({ form }) {
  const pkg = PACKAGES.find(p => p.id === form.packageId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ReviewSection title="Tournament Basics">
        <ReviewRow label="Name" value={form.name} />
        <ReviewRow label="Sport" value={form.sport} />
        <ReviewRow label="Facility" value={form.facilityName} />
        <ReviewRow label="Date" value={form.startDate ? `${form.startDate} → ${form.endDate || form.startDate}` : '—'} />
        <ReviewRow label="Time" value={`${form.startTime} – ${form.endTime}`} />
        <ReviewRow label="Participants" value={form.participants ? `~${form.participants} players` : '—'} />
        {form.notes && <ReviewRow label="Notes" value={form.notes} />}
      </ReviewSection>

      <ReviewSection title="Deliverables">
        <ReviewRow label="Package" value={pkg?.label} />
        <ReviewRow label="Includes" value={pkg?.deliverables.join(', ')} />
        {form.addLivestream && <ReviewRow label="Livestream" value="₹250/hr per camera" accent />}
        {form.addVAR && <ReviewRow label="VAR" value="Pricing TBD" />}
      </ReviewSection>

      {form.games.length > 0 && (
        <ReviewSection title={`Schedule (${form.games.length} matches)`}>
          {form.games.map((g, i) => (
            <ReviewRow key={g.id} label={`Match ${i + 1}`}
              value={`${g.arena}${g.label ? ` · ${g.label}` : ''} · ${fmt(g.startTime)} → ${fmt(g.endTime)}`} />
          ))}
        </ReviewSection>
      )}

      {/* Banner preview */}
      {form.bannerPreview && (
        <ReviewSection title="Banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.bannerPreview} alt="Banner" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', maxHeight: 160, objectFit: 'cover' }} />
        </ReviewSection>
      )}

      <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(18,183,106,0.06)', borderColor: 'rgba(18,183,106,0.2)' }}>
        <svg width="16" height="16" fill="none" stroke="var(--green2)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Submitting will notify the HiFy team. A joining link will be generated for player registration once the setup is confirmed.
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

function ReviewRow({ label, value, accent }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ color: accent ? 'var(--pink2)' : 'var(--text)', fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{String(value)}</span>
    </div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  );
}

function SuccessScreen({ form, tournament, onBack }) {
  const joinLink = tournament?.join_link ?? `hify.club/join/T${Date.now().toString(36).toUpperCase()}`;

  return (
    <div style={{
      maxWidth: 480, margin: '0 auto', padding: '48px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 24, marginBottom: 20,
        background: 'rgba(18,183,106,0.15)', border: '1.5px solid rgba(50,213,131,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="32" height="32" fill="none" stroke="var(--green2)" strokeWidth="2.5" viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Tournament Created!</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
        <strong style={{ color: 'var(--text)' }}>{form.name}</strong> has been submitted to HiFy. The team will confirm the setup and send a player joining link.
      </p>

      {/* Join link preview */}
      <div style={{
        width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 24, textAlign: 'left',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Player Joining Link (Preview)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--pink2)', fontWeight: 600, flex: 1 }}>
            {joinLink}
          </span>
          <button className="btn-ghost" style={{ padding: '6px 10px', height: 'auto', fontSize: 11 }}
            onClick={() => navigator.clipboard?.writeText(joinLink)}>
            Copy
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
          Share this with players to register and enable face recognition before the event.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <button className="btn-ghost" onClick={onBack} style={{ flex: 1, height: 44, justifyContent: 'center' }}>
          Back to Tournaments
        </button>
        <button className="btn-primary" style={{ flex: 1, height: 44, justifyContent: 'center' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share Link
        </button>
      </div>
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

function isStepValid(step, form) {
  if (step === 0) {
    if (!form.name || !form.sport || !form.facilityId || !form.startDate || !form.endDate) return false;
    if (form.endDate < form.startDate) return false;
    if (form.startDate === form.endDate && form.startTime && form.endTime && form.endTime <= form.startTime) return false;
    return true;
  }
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
