// Friendly wordlists for the operator approval hint (crypto/keys.ts
// deriveApprovalHint). The hint is a memorable, non-secret code like
// "amber-otter-07" that a vault DERIVES one-way from its seed, so the operator
// approving it in /admin can tell which pending vault belongs to whom. It does
// not need to be unique — it is only a hint. Words are short, lowercase, and
// [a-z]-only so the composed hint always matches the relay's [a-z0-9-]{0,32}.
// 64 entries each: an index needs exactly 6 bits, so a byte % 64 is unbiased.

export const HINT_ADJECTIVES = [
  'amber', 'azure', 'brave', 'bright', 'calm', 'clever', 'cosmic', 'crisp',
  'daring', 'dusky', 'eager', 'early', 'easy', 'fair', 'fancy', 'fleet',
  'fond', 'gentle', 'glad', 'golden', 'grand', 'happy', 'hazel', 'humble',
  'ivory', 'jolly', 'keen', 'kind', 'lively', 'lucky', 'lunar', 'mellow',
  'merry', 'mighty', 'misty', 'noble', 'nimble', 'olive', 'plucky', 'proud',
  'quick', 'quiet', 'rapid', 'ready', 'royal', 'ruby', 'rustic', 'sandy',
  'sharp', 'shiny', 'silent', 'silver', 'snappy', 'solar', 'spry', 'stellar',
  'sunny', 'swift', 'tidy', 'vivid', 'warm', 'witty', 'zesty', 'zippy',
] as const;

export const HINT_NOUNS = [
  'otter', 'robin', 'fox', 'lynx', 'heron', 'finch', 'koala', 'panda',
  'tiger', 'zebra', 'moose', 'bison', 'crane', 'egret', 'gecko', 'ibis',
  'jay', 'kiwi', 'lark', 'mole', 'newt', 'owl', 'quail', 'raven',
  'seal', 'swan', 'toad', 'wren', 'yak', 'cedar', 'birch', 'maple',
  'aspen', 'willow', 'fern', 'moss', 'reed', 'clover', 'dahlia', 'lily',
  'poppy', 'tulip', 'aster', 'sage', 'thyme', 'basil', 'comet', 'nebula',
  'meteor', 'pulsar', 'harbor', 'meadow', 'canyon', 'delta', 'fjord', 'glade',
  'grove', 'marsh', 'ridge', 'brook', 'cove', 'dune', 'cliff', 'reef',
] as const;
