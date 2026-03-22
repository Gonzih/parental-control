import type { Category } from './classifier.js';

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  restrictions: {
    blockedCategories: Category[];
    notifyCategories: Category[];
    holdCategories: Category[];
    quietHoursStart?: string;
    quietHoursEnd?: string;
    dailyLimitMinutes?: number;
  };
  notificationChannel: 'telegram' | 'imessage' | 'whatsapp' | 'email';
  parentContact: string;
}

function under13Defaults(): ChildProfile['restrictions'] {
  return {
    blockedCategories: ['explicit_sexual', 'violence', 'extremist_content', 'substance_abuse', 'gambling'],
    holdCategories: ['self_harm', 'suicide', 'age_restricted'],
    notifyCategories: ['spiral_detected', 'echo_chamber', 'sycophantic_amplification', 'emotional_manipulation', 'identity_crisis', 'minor_inappropriate'],
  };
}

function age13to15Defaults(): ChildProfile['restrictions'] {
  return {
    blockedCategories: ['explicit_sexual', 'extremist_content', 'gambling'],
    holdCategories: ['self_harm', 'suicide', 'violence', 'substance_abuse'],
    notifyCategories: ['spiral_detected', 'echo_chamber', 'sycophantic_amplification', 'emotional_manipulation', 'identity_crisis', 'age_restricted', 'minor_inappropriate'],
  };
}

function age16to17Defaults(): ChildProfile['restrictions'] {
  return {
    blockedCategories: ['explicit_sexual', 'extremist_content'],
    holdCategories: ['self_harm', 'suicide'],
    notifyCategories: ['spiral_detected', 'echo_chamber', 'violence', 'substance_abuse', 'gambling', 'sycophantic_amplification', 'emotional_manipulation', 'identity_crisis', 'minor_inappropriate'],
  };
}

export function getDefaultRestrictions(age: number): ChildProfile['restrictions'] {
  if (age < 13) return under13Defaults();
  if (age <= 15) return age13to15Defaults();
  return age16to17Defaults();
}

export function loadProfileFromEnv(): ChildProfile {
  const age = parseInt(process.env.PARENTAL_CONTROL_CHILD_AGE ?? '14', 10);
  const channel = (process.env.NOTIFICATION_CHANNEL ?? 'telegram') as ChildProfile['notificationChannel'];

  let parentContact = '';
  if (channel === 'telegram') parentContact = process.env.TELEGRAM_PARENT_CHAT_ID ?? '';
  else if (channel === 'imessage') parentContact = process.env.IMESSAGE_PARENT_PHONE ?? '';
  else if (channel === 'email') parentContact = process.env.SMTP_PARENT_EMAIL ?? '';
  else if (channel === 'whatsapp') parentContact = process.env.TWILIO_WHATSAPP_TO ?? '';

  const defaultRestrictions = getDefaultRestrictions(age);

  return {
    id: process.env.PARENTAL_CONTROL_PROFILE_ID ?? 'default',
    name: process.env.PARENTAL_CONTROL_CHILD_NAME ?? 'Child',
    age,
    restrictions: defaultRestrictions,
    notificationChannel: channel,
    parentContact,
  };
}

const profiles = new Map<string, ChildProfile>();

export function getProfile(id: string): ChildProfile | undefined {
  return profiles.get(id);
}

export function setProfile(profile: ChildProfile): void {
  profiles.set(profile.id, profile);
}

export function getOrCreateDefaultProfile(): ChildProfile {
  const envProfile = loadProfileFromEnv();
  if (!profiles.has(envProfile.id)) {
    profiles.set(envProfile.id, envProfile);
  }
  return profiles.get(envProfile.id)!;
}
