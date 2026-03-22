import { getPolicy } from './policy.js';

// PII detection patterns (regex-based, never LLM-based)
const PII_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'credit_card', pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/ },
  { name: 'phone', pattern: /\b\+?1?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/ },
  { name: 'email', pattern: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/ },
  { name: 'address', pattern: /\b\d{1,5}\s+[a-zA-Z0-9\s,]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl)\b/i },
];

export interface PiiDetectionResult {
  hasPii: boolean;
  types: string[];
}

export function detectPii(text: string): PiiDetectionResult {
  const types: string[] = [];
  for (const { name, pattern } of PII_PATTERNS) {
    if (pattern.test(text)) types.push(name);
  }
  return { hasPii: types.length > 0, types };
}

export type InferenceTarget = 'local' | 'cloud';

export function routeInference(content: string): InferenceTarget {
  const policy = getPolicy();
  const router = policy.inference_router ?? 'cloud';

  if (router === 'local') return 'local';
  if (router === 'cloud') return 'cloud';

  // auto: PII/sensitive content → local, general → cloud
  const { hasPii } = detectPii(content);
  return hasPii ? 'local' : 'cloud';
}

export interface LlmClassificationResult {
  category: string;
  confidence: number;
  reason: string;
}

export async function classifyWithLlm(
  content: string,
  target?: InferenceTarget
): Promise<LlmClassificationResult | null> {
  const inferTarget = target ?? routeInference(content);
  if (inferTarget === 'local') {
    return classifyWithOllama(content);
  }
  return classifyWithCloud(content);
}

async function classifyWithOllama(content: string): Promise<LlmClassificationResult | null> {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LOCAL_MODEL ?? 'llama3.2',
        prompt: buildClassificationPrompt(content),
        stream: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = await response.json() as { response: string };
    return parseClassificationResponse(data.response);
  } catch {
    return null;
  }
}

async function classifyWithCloud(content: string): Promise<LlmClassificationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: buildClassificationPrompt(content) }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;
    const data = await response.json() as { content: Array<{ text: string }> };
    return parseClassificationResponse(data.content[0]?.text ?? '');
  } catch {
    return null;
  }
}

function buildClassificationPrompt(content: string): string {
  return `Classify this content for child safety. Respond with JSON only, no other text.

Content: "${content.slice(0, 500).replace(/"/g, '\\"')}"

Valid categories: safe, self_harm, suicide, explicit_sexual, violence, substance_abuse, gambling, extremist_content, spiral_detected, echo_chamber, sycophantic_amplification, minor_inappropriate, pii_extraction

Respond exactly as: {"category": "<category>", "confidence": <0.0-1.0>, "reason": "<brief reason>"}`;
}

function parseClassificationResponse(text: string): LlmClassificationResult | null {
  try {
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { category?: string; confidence?: number; reason?: string };
    if (parsed.category && typeof parsed.confidence === 'number') {
      return {
        category: parsed.category,
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        reason: parsed.reason ?? 'LLM classification',
      };
    }
    return null;
  } catch {
    return null;
  }
}
