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
    price: 200,
  },
  {
    id: 'semis',
    label: 'Personalized Reels + Shorts – Semis & Finals',
    description: 'Personalized content for semifinal and final stage players only.',
    deliverables: ['Personalized Reels', 'Personalized Shorts', 'General Shorts', 'Photos'],
    price: 200,
  },
  {
    id: 'shorts_all',
    label: 'Personalized Shorts – All Players',
    description: 'Short-form highlights for all players plus general event shorts.',
    deliverables: ['Personalized Shorts', 'General Shorts', 'Photos'],
    price: 150,
  },
  {
    id: 'general',
    label: 'General Shorts – All Players',
    description: 'Event-level short clips for the tournament (not player-specific).',
    deliverables: ['General Shorts', 'Photos'],
    price: 100,
  },
  {
    id: 'photos_only',
    label: 'Only Photos',
    description: 'Professional event photography for all games — no video content.',
    deliverables: ['Photos'],
    price: 0,
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
  bannerFiles: [],
  bannerPreviews: [],
  notes: '',

  // Step 2
  packageId: 'full',
  addLivestream: false,
  livestreamChannel: 'hify',
  addVAR: false,
  discountCode: '',

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
  const [slowUpload, setSlowUpload] = useState(false);
  const [discountStatus, setDiscountStatus] = useState(null); // null | 'checking' | 'valid' | 'invalid'
  const [discountData, setDiscountData] = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validateDiscountCode = async (code) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setDiscountStatus(null); setDiscountData(null); return; }
    setDiscountStatus('checking');
    const { data } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', trimmed)
      .eq('active', true)
      .single();
    if (!data) { setDiscountStatus('invalid'); setDiscountData(null); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setDiscountStatus('invalid'); setDiscountData(null); return; }
    if (data.max_uses !== null && data.uses_count >= data.max_uses) { setDiscountStatus('invalid'); setDiscountData(null); return; }
    setDiscountStatus('valid');
    setDiscountData(data);
  };

  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSlowUpload(false);
    const slowTimer = setTimeout(() => setSlowUpload(true), 5000);

    // Upload banners to Supabase Storage (original quality)
    let bannerUrl = null;
    const bannerUrls = [];
    for (const file of form.bannerFiles) {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tournament-banners')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('tournament-banners').getPublicUrl(fileName);
        bannerUrls.push(urlData.publicUrl);
      }
    }
    if (bannerUrls.length > 0) bannerUrl = bannerUrls[0];

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
        livestream_channel: form.addLivestream ? form.livestreamChannel : null,
        add_var: form.addVAR,
        discount_code: discountData ? discountData.code : (form.discountCode || null),
        discount_code_id: discountData?.id ?? null,
        status: 'upcoming',
        banner_url: bannerUrl,
        banner_urls: bannerUrls,
      })
      .select()
      .single();

    if (tError) {
      clearTimeout(slowTimer);
      setSlowUpload(false);
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
          start_time: g.startTime ? new Date(g.startTime).toISOString() : null,
          end_time: g.endTime ? new Date(g.endTime).toISOString() : null,
        }))
      );
    }

    // Log discount code usage
    if (discountData) {
      await supabase.from('discount_code_uses').insert({
        code_id: discountData.id,
        code: discountData.code,
        tournament_id: tournament.id,
        tournament_name: tournament.name,
      });
      await supabase.from('discount_codes')
        .update({ uses_count: discountData.uses_count + 1 })
        .eq('id', discountData.id);
    }

    clearTimeout(slowTimer);
    setSlowUpload(false);
    setCreatedTournament(tournament);
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitting) return <SubmittingScreen slowUpload={slowUpload} />;
  if (submitted) return <SuccessScreen form={form} onBack={() => { setForm(INITIAL); setStep(0); setSubmitted(false); setCreatedTournament(null); }} />;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 14px 80px' }}>

      {/* Sticky header: back + logo */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '0 -14px',
        padding: '0 14px',
        marginBottom: 24,
      }}>
        <button
          className="btn-icon"
          onClick={() => step === 0 ? router.push('/') : goBack()}
          aria-label="Back"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="HiFy" style={{ height: 32, width: 'auto' }} />
        </a>
      </header>

      {/* Step progress */}
      <StepBar step={step} />

      {/* Step content */}
      <div className="slide-up" key={step} style={{ marginTop: 20 }}>
        {step === 0 && <StepBasics form={form} set={set} setForm={setForm} />}
        {step === 1 && <StepDeliverables form={form} set={set} discountStatus={discountStatus} discountData={discountData} onValidateCode={validateDiscountCode} onClearDiscount={() => { setDiscountStatus(null); setDiscountData(null); }} />}
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
            <button className="btn-primary" onClick={handleSubmit}
              style={{ flex: 1, height: 44, justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Submit Tournament
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmtDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${dd}/${mon}/${d.getFullYear()}`;
}

// Wraps <input type="date"> with a formatted DD/Mon/YYYY overlay
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

// ─── Compact step dots (for header) ──────────────────────────────────────────

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: i < step ? 'var(--green)' : i === step ? 'var(--accent)' : 'var(--surface2)',
            border: `2px solid ${i < step ? 'var(--green)' : i === step ? 'var(--accent)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: i <= step ? '#fff' : 'var(--muted)',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}>
            {i < step ? (
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              width: 18, height: 2,
              background: i < step ? 'var(--green)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          )}
        </div>
      ))}
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

  const removeBanner = (idx) => {
    setForm(f => ({
      ...f,
      bannerFiles: f.bannerFiles.filter((_, i) => i !== idx),
      bannerPreviews: f.bannerPreviews.filter((_, i) => i !== idx),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Tournament Details">
        <Field label="Tournament Name" required>
          <input
            className="input"
            placeholder=""
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
          <Field label="Start Time" required>
            <TimePicker value={form.startTime} onChange={v => set('startTime', v)} />
          </Field>
          <Field label="End Date" required>
            <DateInput value={form.endDate} onChange={v => set('endDate', v)} error={!!endDateError} />
            {endDateError && <FieldError>{endDateError}</FieldError>}
          </Field>
          <Field label="End Time" required>
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

      <Section title={<>Tournament Banner <span style={{ color: 'var(--accent)' }}>*</span></>}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/*" multiple style={{ display: 'none' }} onChange={handleBanner} />
        {form.bannerPreviews.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.bannerPreviews.map((preview, idx) => (
              <div key={idx} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={`Banner ${idx + 1}`} style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 180, objectFit: 'cover' }} />
                <button
                  onClick={() => removeBanner(idx)}
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
              + Add more images
            </button>
          </div>
        ) : (
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: 'var(--muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Upload banner images</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>You can select multiple images at once</div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Step 2: Deliverables ─────────────────────────────────────────────────────

function StepDeliverables({ form, set, discountStatus, discountData, onValidateCode, onClearDiscount }) {
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3 }}>{p.label}</div>
                  {p.price > 0 ? (
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>₹{p.price}/player</div>
                  ) : (
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--green2)', flexShrink: 0 }}>Free</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                  {p.deliverables.map(d => (
                    <span key={d} className="badge badge-gray" style={{ fontSize: 10 }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Field label="Discount Code (optional)">
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="input"
                placeholder="Enter code"
                value={form.discountCode}
                style={{ paddingRight: discountStatus ? 32 : undefined, textTransform: 'uppercase', letterSpacing: '0.04em', width: '100%' }}
                onChange={e => { set('discountCode', e.target.value); onClearDiscount(); }}
                onKeyDown={e => e.key === 'Enter' && onValidateCode(form.discountCode)}
              />
              {discountStatus === 'checking' && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Spinner />
                </div>
              )}
              {discountStatus === 'valid' && (
                <svg width="14" height="14" fill="none" stroke="var(--green2)" strokeWidth="2.5" viewBox="0 0 24 24"
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {discountStatus === 'invalid' && (
                <svg width="14" height="14" fill="none" stroke="var(--red)" strokeWidth="2.5" viewBox="0 0 24 24"
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onValidateCode(form.discountCode)}
              disabled={!form.discountCode.trim()}
              style={{ height: 40, padding: '0 16px', fontSize: 13, flexShrink: 0 }}
            >
              {discountStatus === 'checking' ? 'Applying…' : discountStatus === 'valid' ? 'Applied' : 'Apply'}
            </button>
          </div>
          {discountStatus === 'valid' && discountData && (
            <div style={{ fontSize: 12, color: 'var(--green2)', marginTop: 4, fontWeight: 600 }}>
              {discountData.discount_type === 'percent'
                ? `${discountData.discount_value}% off`
                : `₹${discountData.discount_value} off`}
              {discountData.description ? ` · ${discountData.description}` : ''}
            </div>
          )}
          {discountStatus === 'invalid' && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>Invalid or expired code</div>
          )}
        </Field>
      </Section>

      <Section title="Add-ons">
        <AddOnRow
          icon={<LiveStreamIcon />}
          label="Livestream"
          description={`Live YouTube stream from each camera. ${form.addLivestream && form.livestreamChannel === 'own' ? '₹300/hr per camera.' : '₹250/hr per camera.'}`}
          checked={form.addLivestream}
          onChange={() => set('addLivestream', !form.addLivestream)}
        />
        {form.addLivestream && (
          <div style={{ marginLeft: 48, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { value: 'hify', label: 'HiFy YouTube Channel' },
              { value: 'own', label: `${form.facilityName || 'Facility'} YouTube Channel` },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="livestreamChannel"
                  value={opt.value}
                  checked={form.livestreamChannel === opt.value}
                  onChange={() => set('livestreamChannel', opt.value)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                />
                <span style={{ color: 'var(--text)' }}>{opt.label}</span>
              </label>
            ))}
          </div>
        )}
        <div className="divider" style={{ margin: '10px 0' }} />
        <AddOnRow
          icon={<VARIcon />}
          label="VAR (Video Assistant Referee)"
          description="Video review for disputed calls. For semis & finals. ₹4,000/day."
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
  const allArenas = FACILITY_ARENAS[form.facilityId] || [];
  const arenaOptions = allArenas;
  const [newGame, setNewGame] = useState({
    arena: '',
    startDate: '',
    startTime: form.startTime || '',
    endDate: '',
    endTime: form.endTime || '',
  });

  const startDT = joinDT(newGame.startDate, newGame.startTime);
  const endDT = joinDT(newGame.endDate, newGame.endTime);

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
    set('games', [...form.games, { arena: newGame.arena, startTime: startDT, endTime: endDT, id: Date.now() }]);
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
          <span>{form.numArenas ?? allArenas.length} arena{(form.numArenas ?? allArenas.length) !== 1 ? 's' : ''}</span>
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
              {arenaOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start Date" required>
              <DateInput
                value={newGame.startDate}
                onChange={v => setNewGame(g => ({ ...g, startDate: v, endDate: v }))}
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
            Create Game
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
                    {g.arena}
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
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ReviewSection title="Tournament Basics">
        <ReviewRow label="Name" value={form.name} />
        <ReviewRow label="Sport" value={form.sport} />
        <ReviewRow label="Facility" value={form.facilityName} />
        <ReviewRow label="Date" value={form.startDate ? (form.startDate === form.endDate ? fmtDate(form.startDate) : `${fmtDate(form.startDate)} → ${fmtDate(form.endDate || form.startDate)}`) : '—'} />
        <ReviewRow label="Time" value={`${form.startTime} – ${form.endTime}`} />
        <ReviewRow label="Participants" value={form.participants ? `~${form.participants} players` : '—'} />
        {form.notes && <ReviewRow label="Notes" value={form.notes} />}
      </ReviewSection>

      <ReviewSection title="Deliverables">
        <ReviewRow label="Package" value={pkg?.label} />
        <ReviewRow label="Includes" value={pkg?.deliverables.join(', ')} />
        {form.addLivestream && <ReviewRow label="Livestream" value={form.livestreamChannel === 'own' ? `Yes – ${form.facilityName} YouTube Channel` : 'Yes – HiFy YouTube Channel'} />}
        {form.addVAR && <ReviewRow label="VAR" value="Yes" />}
        {form.discountCode && <ReviewRow label="Discount Code" value={form.discountCode.toUpperCase()} />}
      </ReviewSection>

      {form.games.length > 0 && (
        <ReviewSection title={`Schedule (${form.games.length} games)`}>
          {form.games.map((g, i) => (
            <ReviewRow key={g.id} label={`Game ${i + 1}`}
              value={`${g.arena} · ${fmt(g.startTime)} → ${fmt(g.endTime)}`} />
          ))}
        </ReviewSection>
      )}

      {/* Banner preview */}
      {form.bannerPreviews.length > 0 && (
        <ReviewSection title={`Banner${form.bannerPreviews.length > 1 ? 's' : ''} (${form.bannerPreviews.length})`}>
          {form.bannerPreviews.map((preview, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={idx} src={preview} alt={`Banner ${idx + 1}`} style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', maxHeight: 160, objectFit: 'cover' }} />
          ))}
        </ReviewSection>
      )}

      <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(18,183,106,0.06)', borderColor: 'rgba(18,183,106,0.2)' }}>
        <svg width="16" height="16" fill="none" stroke="var(--green2)" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Submitting will notify the HiFy team. They will confirm the setup and reach out to you.
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

function SubmittingScreen({ slowUpload }) {
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
      <Spinner style={{ width: 40, height: 40 }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Submitting your request…
        </div>
        <div style={{
          fontSize: 13, color: 'var(--muted)',
          maxWidth: 260,
          opacity: slowUpload ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }}>
          Uploading your banner — may take a moment. Please keep this page open.
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({ form, onBack }) {
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

      <h2 className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Request Sent!</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 28 }}>
        Your tournament request for <strong style={{ color: 'var(--text)' }}>{form.name}</strong> has been sent to the HiFy team. We&apos;ll reach out to confirm the setup.
      </p>

      <button className="btn-primary" onClick={onBack} style={{ width: '100%', height: 44, justifyContent: 'center' }}>
        Submit Another Tournament
      </button>
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
    if (!form.startTime || !form.endTime) return false;
    if (form.bannerFiles.length === 0) return false;
    if (form.endDate < form.startDate) return false;
    if (form.startDate === form.endDate && form.startTime && form.endTime && form.endTime <= form.startTime) return false;
    return true;
  }
  if (step === 2) {
    return form.games.length > 0;
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
