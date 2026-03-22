import { KEYWORDS, SPIRAL_PATTERNS, ECHO_CHAMBER_PATTERNS } from './keywords.js';
import { classifyWithLlm, routeInference } from './privacy-router.js';

export type Decision = 'allow' | 'notify' | 'block' | 'hold_for_approval';

export type Category =
  | 'self_harm' | 'suicide' | 'explicit_sexual' | 'violence' | 'substance_abuse'
  | 'age_restricted' | 'gambling' | 'extremist_content'
  | 'spiral_detected' | 'echo_chamber' | 'sycophantic_amplification'
  | 'emotional_manipulation' | 'identity_crisis'
  | 'minor_inappropriate' | 'pii_extraction' | 'safe';

export interface ClassificationResult {
  decision: Decision;
  category: Category;
  confidence: number;
  reason: string;
  parentGuidance?: string;
  classifiedBy?: 'regex' | 'llm';
}

export interface ConversationContext {
  recentMessages: Array<{ role: string; content: string }>;
  spiralScore?: number;
}

// Confidence tiers
const HIGH_CONFIDENCE = 0.95;  // > 0.8: use regex result directly, no LLM needed
const MEDIUM_CONFIDENCE = 0.75; // 0.4–0.8: escalate to LLM for second pass
const LOW_CONFIDENCE = 0.55;    // 0.4–0.8: escalate to LLM for second pass

function containsKeyword(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

function matchesPattern(text: string, patterns: RegExp[]): RegExp | null {
  for (const pattern of patterns) {
    if (pattern.test(text)) return pattern;
  }
  return null;
}

/**
 * First-pass: regex + keyword classification.
 * Fast, cheap, cannot be prompt-injected by the child model.
 * Classification runs in a separate context from the child's conversation.
 */
function classifyWithRegex(
  content: string,
  context?: ConversationContext
): ClassificationResult {
  const text = content.trim();

  // Critical safety — HIGH confidence, never escalate to LLM
  const suicideKw = containsKeyword(text, KEYWORDS.suicide ?? []);
  if (suicideKw) {
    return {
      decision: 'hold_for_approval',
      category: 'suicide',
      confidence: HIGH_CONFIDENCE,
      reason: `Suicide-related content detected: "${suicideKw}"`,
      classifiedBy: 'regex',
    };
  }

  const selfHarmKw = containsKeyword(text, KEYWORDS.self_harm ?? []);
  if (selfHarmKw) {
    return {
      decision: 'hold_for_approval',
      category: 'self_harm',
      confidence: HIGH_CONFIDENCE,
      reason: `Self-harm content detected: "${selfHarmKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Explicit sexual — HIGH confidence
  const sexualKw = containsKeyword(text, KEYWORDS.explicit_sexual ?? []);
  if (sexualKw) {
    return {
      decision: 'block',
      category: 'explicit_sexual',
      confidence: HIGH_CONFIDENCE,
      reason: `Explicit sexual content detected: "${sexualKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Extremist content — HIGH confidence
  const extremistKw = containsKeyword(text, KEYWORDS.extremist_content ?? []);
  if (extremistKw) {
    return {
      decision: 'block',
      category: 'extremist_content',
      confidence: HIGH_CONFIDENCE,
      reason: `Extremist content detected: "${extremistKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Violence — MEDIUM confidence, escalate to LLM
  const violenceKw = containsKeyword(text, KEYWORDS.violence ?? []);
  if (violenceKw) {
    return {
      decision: 'hold_for_approval',
      category: 'violence',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Violence-related content detected: "${violenceKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Substance abuse — MEDIUM confidence, escalate to LLM
  const substanceKw = containsKeyword(text, KEYWORDS.substance_abuse ?? []);
  if (substanceKw) {
    return {
      decision: 'hold_for_approval',
      category: 'substance_abuse',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Substance abuse content detected: "${substanceKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Gambling — MEDIUM confidence
  const gamblingKw = containsKeyword(text, KEYWORDS.gambling ?? []);
  if (gamblingKw) {
    return {
      decision: 'notify',
      category: 'gambling',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Gambling-related content detected: "${gamblingKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Age restricted — MEDIUM confidence
  const ageKw = containsKeyword(text, KEYWORDS.age_restricted ?? []);
  if (ageKw) {
    return {
      decision: 'notify',
      category: 'age_restricted',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Age-restricted content detected: "${ageKw}"`,
      classifiedBy: 'regex',
    };
  }

  // Spiral detection (stateful — requires context) — LOW confidence
  if (context && context.recentMessages.length > 2) {
    const spiralMatch = matchesPattern(text, SPIRAL_PATTERNS);
    if (spiralMatch) {
      const spiralScore = context.spiralScore ?? 0;
      if (spiralScore > 2) {
        return {
          decision: 'notify',
          category: 'spiral_detected',
          confidence: MEDIUM_CONFIDENCE,
          reason: `Negative thought spiral detected (score: ${spiralScore}). Pattern: ${spiralMatch.source}`,
          classifiedBy: 'regex',
        };
      }
    }

    // Echo chamber detection — LOW confidence
    const echoMatch = matchesPattern(text, ECHO_CHAMBER_PATTERNS);
    if (echoMatch && context.spiralScore && context.spiralScore > 1) {
      return {
        decision: 'notify',
        category: 'echo_chamber',
        confidence: LOW_CONFIDENCE,
        reason: `Echo chamber pattern detected: ${echoMatch.source}`,
        classifiedBy: 'regex',
      };
    }
  } else if (context) {
    const spiralMatch = matchesPattern(text, SPIRAL_PATTERNS);
    if (spiralMatch) {
      return {
        decision: 'notify',
        category: 'spiral_detected',
        confidence: LOW_CONFIDENCE,
        reason: `Potential negative thought pattern: ${spiralMatch.source}`,
        classifiedBy: 'regex',
      };
    }
  }

  return {
    decision: 'allow',
    category: 'safe',
    confidence: 1.0,
    reason: 'No concerning content detected',
    classifiedBy: 'regex',
  };
}

/**
 * Two-pass classifier:
 *   1. Regex/keyword (fast, cannot be prompt-injected — runs out-of-process from child model)
 *   2. LLM second pass ONLY for edge cases (confidence 0.4–0.8)
 *
 * This ensures that even if the child model is compromised/jailbroken,
 * it cannot influence the classification result.
 */
export async function classifyContent(
  content: string,
  context?: ConversationContext
): Promise<ClassificationResult> {
  const regexResult = classifyWithRegex(content, context);

  // HIGH confidence (> 0.8): trust regex, skip LLM
  if (regexResult.confidence > 0.8) {
    return regexResult;
  }

  // MEDIUM/LOW confidence (0.4–0.8): escalate to LLM second pass
  if (regexResult.confidence >= 0.4) {
    try {
      const target = routeInference(content);
      const llmResult = await classifyWithLlm(content, target);
      if (llmResult) {
        return {
          decision: categoryToDecision(llmResult.category as Category) ?? regexResult.decision,
          category: (llmResult.category as Category) ?? regexResult.category,
          confidence: llmResult.confidence,
          reason: `[LLM] ${llmResult.reason}`,
          classifiedBy: 'llm',
        };
      }
    } catch {
      // LLM unavailable — fall through to regex result
    }
    return regexResult;
  }

  // LOW confidence (< 0.4): allow but log (edge case — current regex never produces < 0.4)
  console.error(`[classifier] Low-confidence match logged: ${regexResult.reason}`);
  return {
    decision: 'allow',
    category: 'safe',
    confidence: 1.0,
    reason: 'No concerning content detected (low-confidence match logged)',
    classifiedBy: 'regex',
  };
}

/**
 * Map a category name to its default decision.
 * Used when the LLM returns a category that differs from the regex result.
 */
function categoryToDecision(category: Category): Decision | null {
  const map: Partial<Record<Category, Decision>> = {
    suicide: 'hold_for_approval',
    self_harm: 'hold_for_approval',
    explicit_sexual: 'block',
    extremist_content: 'block',
    violence: 'hold_for_approval',
    substance_abuse: 'hold_for_approval',
    gambling: 'notify',
    age_restricted: 'notify',
    spiral_detected: 'notify',
    echo_chamber: 'notify',
    sycophantic_amplification: 'notify',
    emotional_manipulation: 'notify',
    identity_crisis: 'notify',
    minor_inappropriate: 'notify',
    pii_extraction: 'block',
    safe: 'allow',
  };
  return map[category] ?? null;
}

export function computeSpiralScore(messages: Array<{ role: string; content: string }>): number {
  let score = 0;
  for (const msg of messages) {
    const text = msg.content;
    for (const pattern of SPIRAL_PATTERNS) {
      if (pattern.test(text)) score += 1;
    }
    const negativeWords = ['hopeless', 'worthless', 'useless', 'alone', 'nobody', 'nothing', 'hate myself', 'give up'];
    const lower = text.toLowerCase();
    for (const word of negativeWords) {
      if (lower.includes(word)) score += 0.5;
    }
  }
  return score;
}
