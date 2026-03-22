import type { Category } from './classifier.js';

export const GUIDANCE_TEMPLATES: Partial<Record<Category, string>> = {
  spiral_detected: `Your child may be caught in a negative thought spiral. Signs: repeated themes of hopelessness, worthlessness, or isolation across messages.

**How to approach:** Find a calm, private moment. Start with: "I've noticed you seem a bit heavy lately — I'm here if you want to talk." Don't ask yes/no questions. Listen first, problem-solve second. Avoid: "You have so much to be grateful for" — it invalidates their feelings.

**If it persists:** Consider speaking with their school counselor or a therapist who works with adolescents.`,

  self_harm: `This requires immediate, calm attention. Don't react with panic — it may cause your child to shut down or hide more.

**What to say:** "I love you and I want to understand what's going on. Can we talk?" Avoid: "How could you do this to me/yourself?"

**Next steps:**
- Call or text **988** (Suicide & Crisis Lifeline) for guidance on how to help
- Contact their pediatrician or a mental health professional
- Remove obvious means of self-harm from the home temporarily
- Stay connected — check in frequently`,

  suicide: `This is a crisis situation requiring immediate action.

**Immediate steps:**
1. Stay calm and stay with your child
2. Say: "I love you. I'm worried about you. Are you thinking about hurting yourself?"
3. Call **988** (Suicide & Crisis Lifeline) — they guide parents too
4. If there is immediate danger, call 911 or go to the emergency room

**Do NOT:** Leave them alone, minimize their feelings, or make promises to keep secrets.`,

  explicit_sexual: `Your child was exposed to or requested explicit sexual content.

**Stay calm — panic may shut down communication.** This is an opportunity, not a crisis.

**How to approach:** "I noticed something came up in your chat. I'm not angry — I want to talk about it and make sure you have good information." Frame it around safety and healthy relationships, not punishment.

**Conversation starters:** Ask what they already know, what questions they have. Accurate information from you is better than what they find online.`,

  echo_chamber: `The AI may be reinforcing your child's existing beliefs without offering balance or alternative perspectives. This is a known risk — AI systems tend to agree with users.

**What to discuss:** Explain how AI works — it's trained to be helpful and agreeable, which sometimes means it validates ideas instead of challenging them. Encourage them to ask: "What's the strongest argument against my view?" or "What would someone who disagrees say?"

**Broader habit:** Help them seek out primary sources and opposing viewpoints on topics they care about.`,

  sycophantic_amplification: `The AI appears to be validating and amplifying your child's emotions or beliefs in potentially unhealthy ways — agreeing too readily, escalating rather than grounding.

**Discuss:** Healthy relationships (human or AI) should sometimes push back or offer perspective, not just agree. Encourage them to notice when they feel "seen" by the AI vs. when the AI is genuinely helping them think.`,

  identity_crisis: `Your child appears to be exploring or struggling with questions of identity — who they are, where they belong, what they believe.

**This is normal but can be intense.** Adolescent identity exploration is healthy. The risk is finding community only in AI conversations.

**Your role:** Be a non-judgmental sounding board. Avoid defining who they "should" be. Connect them with real-world communities (clubs, groups, events) that match their interests.`,

  emotional_manipulation: `Content detected that may be emotionally manipulative — designed to create urgency, fear, or dependency.

**Discuss with your child:** How do they feel after talking with AI? Do they feel better or worse? Do they feel like they need to keep talking to it? Healthy tools make us more capable and connected, not more dependent.`,

  minor_inappropriate: `Content that is somewhat age-inappropriate was flagged — not an emergency, but worth a check-in.

**Consider:** Whether this content reflects something they're curious about, going through, or encountered elsewhere. A casual, curious conversation is often enough.`,
};

export function getGuidance(category: Category): string {
  return GUIDANCE_TEMPLATES[category] ??
    `Your child's AI conversation was flagged for content related to: ${category}. Consider checking in with them about how they're doing.`;
}
