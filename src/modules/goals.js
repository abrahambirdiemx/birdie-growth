// ── Goals Module
// Manages quarterly sales goals in Supabase (replaces localStorage GOALS_KEY).
// Goals are shared across all browsers and readable by Claude agents.

import { sbFetch } from '../api/supabase.js';
import { showToast } from './utils.js';

// ── State ────────────────────────────────────────────────────────────────────
let _goals = {};           // { mrr_cerrado: 5000, new_clients: 2, ... }
let _quarter = '';         // current quarter, e.g. '2026-Q2'

// Default fallback values (used if Supabase is unreachable)
const GOAL_DEFAULTS = {
  mrr_cerrado: 5000,
  new_clients:    2,
  impl_total:  3000,
  new_leads:     40,
};

// ── Quarter helpers ───────────────────────────────────────────────────────────
export function currentQuarter() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

// ── Load goals from Supabase ─────────────────────────────────────────────────
export async function goalsLoad(quarter) {
  _quarter = quarter || currentQuarter();
  try {
    const data = await sbFetch(
      'GET',
      `goals?select=goal_key,goal_value&quarter=eq.${encodeURIComponent(_quarter)}`,
    );
    if (Array.isArray(data) && data.length > 0) {
      _goals = {};
      data.forEach(({ goal_key, goal_value }) => { _goals[goal_key] = goal_value; });
    } else {
      // No goals in DB yet — try migrating from localStorage, else use defaults
      await _migrateFromLocalStorage(_quarter);
    }
  } catch (e) {
    console.warn('[goals] Supabase unreachable, using localStorage fallback:', e.message);
    _loadFromLocalStorage();
  }
  return _goals;
}

// ── Get a single goal value ───────────────────────────────────────────────────
export function getGoal(key) {
  return _goals[key] ?? GOAL_DEFAULTS[key] ?? 0;
}

// ── Get all goals ─────────────────────────────────────────────────────────────
export function getAllGoals() {
  return { ...GOAL_DEFAULTS, ..._goals };
}

// ── Save goals to Supabase ────────────────────────────────────────────────────
export async function goalsSave(newGoals, updatedBy) {
  const quarter = _quarter || currentQuarter();
  const rows = Object.entries(newGoals).map(([goal_key, goal_value]) => ({
    quarter,
    goal_key,
    goal_value: parseFloat(goal_value) || 0,
    updated_by: updatedBy || window._sbUserEmail || 'dashboard',
    updated_at: new Date().toISOString(),
  }));

  try {
    // Upsert all goals in one request
    await sbFetch('POST', 'goals?on_conflict=quarter,goal_key', rows);
    _goals = { ..._goals, ...newGoals };
    // Also update localStorage as a local cache/fallback
    _saveToLocalStorage();
    showToast('✅ Metas guardadas', 'ok');
  } catch (e) {
    // Fallback: save only to localStorage if Supabase is down
    _goals = { ..._goals, ...newGoals };
    _saveToLocalStorage();
    showToast('⚠ Metas guardadas localmente (sin conexión a Supabase)', 'err');
    throw e;
  }
}

// ── Handle realtime update from Supabase ──────────────────────────────────────
export function goalsHandleRealtimeChange({ eventType, record }) {
  if (!record || record.quarter !== _quarter) return;
  if (eventType === 'DELETE') {
    delete _goals[record.goal_key];
  } else {
    _goals[record.goal_key] = record.goal_value;
  }
  _saveToLocalStorage();
}

// ── Internal: localStorage helpers ───────────────────────────────────────────
const LS_KEY = 'birdie_goals_v2';

function _loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    _goals = { ...GOAL_DEFAULTS, ...stored };
  } catch {
    _goals = { ...GOAL_DEFAULTS };
  }
}

function _saveToLocalStorage() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(_goals)); } catch (_) {}
}

async function _migrateFromLocalStorage(quarter) {
  // If Supabase has no goals yet, try to migrate whatever is in localStorage
  _loadFromLocalStorage();
  if (Object.keys(_goals).length > 0) {
    try {
      await goalsSave(_goals, 'localStorage-migration');
      console.log('[goals] migrated localStorage goals to Supabase for quarter', quarter);
    } catch {
      // Migration failed — keep using localStorage values, will retry next session
    }
  }
}
