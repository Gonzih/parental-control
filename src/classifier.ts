import { KEYWORDS, SPIRAL_PATTERNS, ECHO_CHAMBER_PATTERNS } from './keywords.js';

export type Decision = 'allow' | 'notify' | 'block' | 'hold_for_approval';

export type Category =
  | 'self_harm' | 'suicide' | 'explicit_sexual' | 'violence' | 'substance_abuse'
  | 'age_restricted' | 'gambling' | 'extremist_content'
  | 'spiral_detected' | 'echo_chamber' | 'sycophantic_amplification'
  | 'emotional_manipulation' | 'identity_crisis'
  | 'minor_inappropriate' | 'safe';

export interface ClassificationResult {
  decision: Decision;
  category: Category;
  confidence: number;
  reason: string;
  parentGuidance?: string;
}

export interface ConversationContext {
  recentMessages: Array<{ role: string; content: string }>;
  spiralScore?: number;
}

const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.75;
const LOW_CONFIDENCE = 0.55;

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

export function classifyContent(
  content: string,
  context?: ConversationContext
): ClassificationResult {
  const text = content.trim();

  // Critical safety checks first
  const suicideKw = containsKeyword(text, KEYWORDS.suicide ?? []);
  if (suicideKw) {
    return {
      decision: 'hold_for_approval',
      category: 'suicide',
      confidence: HIGH_CONFIDENCE,
      reason: `Suicide-related content detected: "${suicideKw}"`,
    };
  }

  const selfHarmKw = containsKeyword(text, KEYWORDS.self_harm ?? []);
  if (selfHarmKw) {
    return {
      decision: 'hold_for_approval',
      category: 'self_harm',
      confidence: HIGH_CONFIDENCE,
      reason: `Self-harm content detected: "${selfHarmKw}"`,
    };
  }

  // Explicit sexual
  const sexualKw = containsKeyword(text, KEYWORDS.explicit_sexual ?? []);
  if (sexualKw) {
    return {
      decision: 'block',
      category: 'explicit_sexual',
      confidence: HIGH_CONFIDENCE,
      reason: `Explicit sexual content detected: "${sexualKw}"`,
    };
  }

  // Extremist content
  const extremistKw = containsKeyword(text, KEYWORDS.extremist_content ?? []);
  if (extremistKw) {
    return {
      decision: 'block',
      category: 'extremist_content',
      confidence: HIGH_CONFIDENCE,
      reason: `Extremist content detected: "${extremistKw}"`,
    };
  }

  // Violence
  const violenceKw = containsKeyword(text, KEYWORDS.violence ?? []);
  if (violenceKw) {
    return {
      decision: 'hold_for_approval',
      category: 'violence',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Violence-related content detected: "${violenceKw}"`,
    };
  }

  // Substance abuse
  const substanceKw = containsKeyword(text, KEYWORDS.substance_abuse ?? []);
  if (substanceKw) {
    return {
      decision: 'hold_for_approval',
      category: 'substance_abuse',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Substance abuse content detected: "${substanceKw}"`,
    };
  }

  // Gambling
  const gamblingKw = containsKeyword(text, KEYWORDS.gambling ?? []);
  if (gamblingKw) {
    return {
      decision: 'notify',
      category: 'gambling',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Gambling-related content detected: "${gamblingKw}"`,
    };
  }

  // Age restricted
  const ageKw = containsKeyword(text, KEYWORDS.age_restricted ?? []);
  if (ageKw) {
    return {
      decision: 'notify',
      category: 'age_restricted',
      confidence: MEDIUM_CONFIDENCE,
      reason: `Age-restricted content detected: "${ageKw}"`,
    };
  }

  // Spiral detection (stateful — requires context)
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
        };
      }
    }

    // Echo chamber detection
    const echoMatch = matchesPattern(text, ECHO_CHAMBER_PATTERNS);
    if (echoMatch && context.spiralScore && context.spiralScore > 1) {
      return {
        decision: 'notify',
        category: 'echo_chamber',
        confidence: LOW_CONFIDENCE,
        reason: `Echo chamber pattern detected: ${echoMatch.source}`,
      };
    }
  } else if (context) {
    // Single-message spiral check (less confident)
    const spiralMatch = matchesPattern(text, SPIRAL_PATTERNS);
    if (spiralMatch) {
      return {
        decision: 'notify',
        category: 'spiral_detected',
        confidence: LOW_CONFIDENCE,
        reason: `Potential negative thought pattern: ${spiralMatch.source}`,
      };
    }
  }

  return {
    decision: 'allow',
    category: 'safe',
    confidence: 1.0,
    reason: 'No concerning content detected',
  };
}

export function computeSpiralScore(messages: Array<{ role: string; content: string }>): number {
  let score = 0;
  for (const msg of messages) {
    const text = msg.content;
    for (const pattern of SPIRAL_PATTERNS) {
      if (pattern.test(text)) score += 1;
    }
    // Check for negative sentiment keywords in bulk
    const negativeWords = ['hopeless', 'worthless', 'useless', 'alone', 'nobody', 'nothing', 'hate myself', 'give up'];
    const lower = text.toLowerCase();
    for (const word of negativeWords) {
      if (lower.includes(word)) score += 0.5;
    }
  }
  return score;
}
