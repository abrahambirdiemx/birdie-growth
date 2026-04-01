// ── Stage configuration — single source of truth
export const STAGE_COLORS = {
  'Calificado':    '#3b6ef8',
  'Weekly Hunt':   '#64748b',
  'Active Lead':   '#2563eb',
  'Active lead':   '#2563eb',
  'Discovery':     '#7c3aed',
  'Demo':          '#5b21b6',
  'Propuesta':     '#ea580c',
  'Close 2 close': '#15803d',
  'Cerrado':       '#1d4ed8',
  'Piloto':        '#6d28d9',
  'Cliente':       '#d97706',
  'Cool Off':      '#94a3b8',
  'Churn':         '#dc2626',
};

export const STAGE_ORDER_LIST = [
  'Calificado', 'Weekly Hunt', 'Active Lead', 'Discovery', 'Demo',
  'Propuesta', 'Close 2 close', 'Cerrado', 'Piloto', 'Cliente',
  'Cool Off', 'Churn',
];

export const STAGE_PROB = {
  'Calificado': 10, 'Weekly Hunt': 5,  'Active Lead': 10, 'Active lead': 10,
  'Discovery':  20, 'Demo':        35, 'Propuesta':   50, 'Close 2 close': 70,
  'Cerrado':   100, 'Piloto':      80, 'Cliente':    100, 'Cool Off': 2, 'Churn': 0,
};

export const ACTIVE_STAGES = new Set([
  'Calificado', 'Discovery', 'Demo', 'Propuesta',
  'Close 2 close', 'Piloto', 'Active Lead', 'Active lead', 'Cliente',
]);

export const DATE_TRIGGER = {
  'Discovery':     'discovery_date',
  'Demo':          'demo_date',
  'Propuesta':     'proposal_date',
  'Close 2 close': 'cierre_date',
};

export const DATE_LABELS = {
  discovery_date: 'Discovery',
  demo_date:      'Demo',
  proposal_date:  'Propuesta',
  cierre_date:    'Cierre',
};

export const MONTH_NAMES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export const SELLERS = [
  { name: 'Abraham Lopez', initial: 'A', color: 'linear-gradient(135deg,#3b6ef8,#6c4ef7)' },
  { name: 'Héctor Nícola', initial: 'H', color: 'linear-gradient(135deg,#6c4ef7,#7c3aed)' },
  { name: 'Daniel Luna',   initial: 'D', color: 'linear-gradient(135deg,#16a34a,#15803d)' },
];
