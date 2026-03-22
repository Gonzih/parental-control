import fs from 'fs';
import path from 'path';
import os from 'os';
import { load as yamlLoad } from 'js-yaml';

export type ContentAction = 'block' | 'notify' | 'hold_for_approval' | 'allow';
export type InferenceRouter = 'local' | 'cloud' | 'auto';

export interface Policy {
  version: number;
  child: {
    name: string;
    age_group: 'under-13' | 'teen-13-17' | 'adult';
  };
  content_rules: Record<string, ContentAction>;
  time_limits: {
    daily_minutes: number;
    sessions_per_day: number;
    curfew_start: string;
    curfew_end: string;
  };
  notifications: {
    telegram_chat_id: string;
    telegram_bot_token: string;
    email: string;
  };
  approval_timeout_minutes: number;
  inference_router: InferenceRouter;
}

const DEFAULT_POLICY: Policy = {
  version: 1,
  child: { name: 'default', age_group: 'under-13' },
  content_rules: {
    violence: 'block',
    adult: 'block',
    profanity: 'notify',
    spiral_detected: 'hold_for_approval',
    echo_chamber: 'notify',
    sycophancy_amplification: 'notify',
    self_harm: 'block',
    substance_abuse: 'block',
    pii_extraction: 'block',
    suicide: 'hold_for_approval',
    explicit_sexual: 'block',
    extremist_content: 'block',
    gambling: 'notify',
    age_restricted: 'notify',
  },
  time_limits: {
    daily_minutes: 120,
    sessions_per_day: 3,
    curfew_start: '21:00',
    curfew_end: '08:00',
  },
  notifications: {
    telegram_chat_id: '',
    telegram_bot_token: '',
    email: '',
  },
  approval_timeout_minutes: 30,
  inference_router: 'cloud',
};

let currentPolicy: Policy = { ...DEFAULT_POLICY };

export function getPolicyDir(): string {
  return path.join(os.homedir(), '.parental-control');
}

export function getPolicyPath(): string {
  return path.join(getPolicyDir(), 'policy.yaml');
}

function ensurePolicyDir(): void {
  const dir = getPolicyDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadPolicy(): Policy {
  ensurePolicyDir();
  const policyPath = getPolicyPath();

  if (!fs.existsSync(policyPath)) {
    console.error(`[policy] No policy.yaml found at ${policyPath}, using defaults`);
    currentPolicy = { ...DEFAULT_POLICY };
    return currentPolicy;
  }

  try {
    const raw = fs.readFileSync(policyPath, 'utf-8');
    const parsed = yamlLoad(raw) as Partial<Policy>;
    currentPolicy = {
      ...DEFAULT_POLICY,
      ...parsed,
      child: { ...DEFAULT_POLICY.child, ...(parsed.child ?? {}) },
      content_rules: { ...DEFAULT_POLICY.content_rules, ...(parsed.content_rules ?? {}) },
      time_limits: { ...DEFAULT_POLICY.time_limits, ...(parsed.time_limits ?? {}) },
      notifications: { ...DEFAULT_POLICY.notifications, ...(parsed.notifications ?? {}) },
    };
    console.error(`[policy] Loaded policy from ${policyPath}`);
    return currentPolicy;
  } catch (err) {
    console.error('[policy] Failed to parse policy.yaml:', err);
    return currentPolicy;
  }
}

export function getPolicy(): Policy {
  return currentPolicy;
}

export function watchPolicy(): void {
  const policyPath = getPolicyPath();
  ensurePolicyDir();

  import('chokidar').then(({ default: chokidar }) => {
    chokidar.watch(policyPath, { ignoreInitial: true }).on('change', () => {
      console.error('[policy] policy.yaml changed, reloading...');
      loadPolicy();
    });
    console.error(`[policy] Watching ${policyPath} for changes`);
  }).catch(() => {
    // Fallback: use fs.watchFile (polling, no native deps required)
    fs.watchFile(policyPath, { interval: 5000 }, () => {
      console.error('[policy] policy.yaml changed, reloading...');
      loadPolicy();
    });
  });
}
