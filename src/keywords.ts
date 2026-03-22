export const KEYWORDS: Record<string, string[]> = {
  self_harm: [
    'cut myself', 'cutting myself', 'self harm', 'self-harm', 'hurt myself',
    'burn myself', 'hurting myself', 'injure myself', 'self injury',
    'punish myself', 'deserve pain', 'want to bleed'
  ],
  suicide: [
    'kill myself', 'end my life', 'want to die', 'suicidal', 'suicide',
    'not want to live', "don't want to live", 'no reason to live',
    'better off dead', 'goodbye cruel world', 'ending it all',
    'take my own life', 'overdose', '988', 'crisis line'
  ],
  explicit_sexual: [
    'porn', 'pornography', 'nude', 'naked', 'sex video', 'xxx',
    'explicit content', 'adult content', 'nsfw', 'onlyfans',
    'sex scene', 'sexual content', 'erotic'
  ],
  violence: [
    'how to kill', 'how to hurt', 'make a weapon', 'build a bomb',
    'instructions to harm', 'attack people', 'mass shooting',
    'murder someone', 'torture'
  ],
  substance_abuse: [
    'how to get high', 'getting high', 'drug dealer', 'buy weed',
    'buy drugs', 'meth', 'heroin', 'cocaine', 'how to make drugs',
    'drug recipe', 'drug synthesis'
  ],
  age_restricted: [
    'buy alcohol', 'get drunk', 'how to drink', 'fake id',
    'gambling site', 'online casino', 'bet money', 'sports betting'
  ],
  gambling: [
    'gambling', 'casino', 'bet', 'poker', 'sports bet',
    'lottery ticket', 'scratch card', 'online gambling'
  ],
  extremist_content: [
    'white supremacy', 'nazi', 'extremist', 'radicalize',
    'jihad', 'terrorist', 'bomb making', 'attack planning',
    'hate group', 'ethnic cleansing'
  ],
};

export const SPIRAL_PATTERNS = [
  /nobody (loves|likes|cares about) me/i,
  /i('m| am) (worthless|useless|hopeless|pathetic|a failure|broken|damaged)/i,
  /i (hate|despise) (myself|my life|everything)/i,
  /nothing (matters|will ever change|gets better|is worth it)/i,
  /i('m| am) (always|never) (going to|gonna) (be|feel|get)/i,
  /what('s| is) the point (of|in)/i,
  /nobody (understands|gets) me/i,
  /i('m| am) (so alone|completely alone|all alone)/i,
  /everyone (hates|leaves|abandons) me/i,
  /i (can't|cannot) (do|take|handle) (this|anything|it) anymore/i,
  /i give up/i,
  /life is (pointless|meaningless|not worth living)/i,
];

export const ECHO_CHAMBER_PATTERNS = [
  /you('re| are) (right|absolutely right|so right|correct)/i,
  /exactly what i('ve| have) (always|been) (thought|thinking|believed|saying)/i,
  /that('s| is) (exactly|precisely) what i think/i,
  /everyone else is (wrong|stupid|brainwashed|sheep)/i,
  /only (we|i|you) (know|understand|see) the truth/i,
  /the mainstream (media|narrative|story) is (lying|wrong|fake)/i,
];
