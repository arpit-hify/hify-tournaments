import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Package metadata (id → display info)
export const PACKAGES = {
  full: {
    label: 'Personalized Reels + Shorts – All Players',
    deliverables: ['Personalized Reels', 'Personalized Shorts', 'General Shorts', 'Photos'],
    price: 200,
  },
  semis: {
    label: 'Personalized Reels + Shorts – Semis & Finals',
    deliverables: ['Personalized Reels', 'Personalized Shorts', 'General Shorts', 'Photos'],
    price: 150,
  },
  shorts_all: {
    label: 'Personalized Shorts – All Players',
    deliverables: ['Personalized Shorts', 'General Shorts', 'Photos'],
    price: 150,
  },
  general: {
    label: 'General Shorts – All Players',
    deliverables: ['General Shorts', 'Photos'],
    price: 100,
  },
  photos_only: {
    label: 'Only Photos',
    deliverables: ['Photos'],
    price: 0,
  },
};
