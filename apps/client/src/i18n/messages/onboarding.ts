// Onboarding flow (screens/Onboarding.tsx) — welcome, create/confirm the
// recovery phrase, restore, optional at-rest seal, and device unlock.
// The 12 BIP39 words themselves (and the quiz decoys posing as them) are key
// material and are never translated — only the chrome around them.
export const onboarding = {
  'onboarding.tagline': 'A private place to remember.',
  'onboarding.intro':
    'Everything you write is encrypted on this device before it ever leaves it. No account, no email, no password.',
  'onboarding.startNew': 'Start a new journal',
  'onboarding.haveRecovery': 'I have a recovery phrase',
  'onboarding.trustLine': 'End-to-end encrypted · local-first · open source',
  'onboarding.build': 'v{version} · built {built}',

  'onboarding.step': 'Step {current} of {total}',
  'onboarding.step.restore': 'Restore',
  'onboarding.step.last': 'Last step',

  'onboarding.create.title': 'Your recovery phrase',
  'onboarding.create.lead': 'These twelve words are your journal.',
  'onboarding.create.body':
    'Write them down in order and keep them somewhere safe — they’re the only way back in.',
  'onboarding.tapToReveal': 'Tap to reveal',
  'onboarding.noOneWatching': 'Make sure no one is watching',
  'onboarding.reveal': 'Reveal',
  'onboarding.hide': 'Hide',
  'onboarding.create.callout':
    'We can’t reset this for you. There’s no “forgot password” — that’s the point.',
  'onboarding.writtenDown': 'I’ve written it down',

  'onboarding.confirm.title': 'Confirm a few words',
  'onboarding.confirm.body': 'Just to be sure it’s saved. Tap the correct word for each position.',
  'onboarding.confirm.word': 'Word #{num}',
  'onboarding.continue': 'Continue',
  'onboarding.confirm.selectAll': 'Select all three words',

  'onboarding.restore.title': 'Enter your phrase',
  'onboarding.restore.body':
    'Type the twelve words from any device where this journal already lives. Order matters.',
  'onboarding.restore.managerFill': 'Fill the whole phrase from your password manager',
  'onboarding.restore.paste': 'Paste from clipboard',
  'onboarding.restore.callout':
    'Your phrase is never sent anywhere. It only unlocks the encrypted data already on the server.',
  'onboarding.restore.progress#one': '{count} / 12 words',
  'onboarding.restore.progress#other': '{count} / 12 words',
  'onboarding.restore.invalid': 'Phrase not valid',

  'onboarding.seal.title': 'Stay signed in on this device?',
  'onboarding.seal.body':
    'Set a passphrase and your key stays here, encrypted, so opening the app only asks for the passphrase. Skip it and nothing is stored — you’ll enter your twelve words on every cold start.',
  'onboarding.seal.passPlaceholder': 'Passphrase (at least {min} characters)',
  'onboarding.seal.repeatPlaceholder': 'Repeat the passphrase',
  'onboarding.seal.mismatch': 'The two passphrases don’t match yet.',
  'onboarding.seal.callout':
    'The passphrase only guards the copy on this device — it can’t recover your journal and it isn’t your recovery phrase. Anyone with this device gets as many guesses as they like, so pick something long.',
  'onboarding.seal.encrypting': 'Encrypting…',
  'onboarding.seal.encryptStay': 'Encrypt & stay signed in',
  'onboarding.seal.useKey': 'Use a security key instead',
  'onboarding.seal.skip': 'Skip — ask for my phrase each time',
  'onboarding.err.prf':
    'This key doesn’t support the required PRF extension — use a passphrase instead.',
  'onboarding.err.keySetup': 'Security key setup didn’t complete — try again or use a passphrase.',
  'onboarding.err.generic': 'Something went wrong — try again.',

  'onboarding.unlock.welcomeBack': 'Welcome back',
  'onboarding.unlock.keyHint': 'Unlock this device with your security key',
  'onboarding.unlock.passHint': 'Enter the passphrase for this device',
  'onboarding.unlock.passPlaceholder': 'Passphrase',
  'onboarding.err.keyUnlock': 'That security key didn’t unlock this device.',
  'onboarding.err.passUnlock': 'That passphrase didn’t unlock this device.',
  'onboarding.unlock.waitingKey': 'Waiting for your key…',
  'onboarding.unlock.withKey': 'Unlock with security key',
  'onboarding.unlock.unlocking': 'Unlocking…',
  'onboarding.unlock.unlock': 'Unlock',
  'onboarding.unlock.usePhrase': 'Use my recovery phrase instead',

  // Pending-approval screen (ui/PendingApproval.tsx) — shown when the relay runs
  // with operator approval and this vault hasn't been approved yet.
  'pending.title': 'Almost there',
  'pending.lead': 'This server approves new journals by hand. Yours is waiting for the operator to let it in.',
  'pending.hintLabel': 'Your approval code',
  'pending.hintHelp':
    'Give this code to the operator so they can spot your journal. It comes from your recovery phrase — keep the two together.',
  'pending.checkAgain': 'Check again',
  'pending.checking': 'Checking…',
  'pending.startOver': 'Use a different recovery phrase',
} as const;
