// Bootstrap a device session from a mnemonic: derive identity locally, then
// register + challenge-response authenticate against the relay.
import { deriveIdentity, signWithDevice, type Identity } from '../crypto/keys';
import { mnemonicToSeed } from '../crypto/mnemonic';
import { toBase64, fromBase64 } from '../crypto/base64';
import { concat, utf8 } from '../crypto/bytes';
import { RelayError, type RelayClient } from './relay';

/**
 * The relay accepted the device but the operator has not approved this vault
 * (REQUIRE_APPROVAL). The identity is valid — the caller should show the
 * "pending approval" state (quoting identity.approvalHint) and retry later,
 * NOT treat this as a plain network failure.
 */
export class PendingApprovalError extends Error {
  constructor() {
    super('vault pending operator approval');
    this.name = 'PendingApprovalError';
  }
}

export interface Session {
  token: string;
  ownerId: string;
  deviceId: string;
  identity: Identity;
}

/** Local-only step: derive the full identity from the phrase. Never hits the network. */
export function identityFromMnemonic(mnemonic: string): Identity {
  return deriveIdentity(mnemonicToSeed(mnemonic));
}

const REGISTER_PREFIX = utf8('mneme:register:');

/** Network step: register the device (TOFU) and exchange a signed challenge for a token. */
export async function authenticate(relay: RelayClient, identity: Identity): Promise<Session> {
  const regMsg = concat(REGISTER_PREFIX, identity.ownerPub, identity.devicePub);
  const regSig = signWithDevice(identity.devicePriv, regMsg);
  const { device_id, status } = await relay.register(
    toBase64(identity.ownerPub),
    toBase64(identity.devicePub),
    toBase64(regSig),
    identity.approvalHint,
  );

  // Approval-gated relay: don't bother exchanging a challenge we can't complete —
  // surface pending straight away so the UI can show the approval screen.
  if (status && status !== 'approved') {
    throw new PendingApprovalError();
  }

  const { challenge } = await relay.challenge(device_id);
  const challengeSig = signWithDevice(identity.devicePriv, fromBase64(challenge));
  let verified;
  try {
    verified = await relay.verify(device_id, challenge, toBase64(challengeSig));
  } catch (e) {
    // A 403 here means the same thing (older relay without the register status
    // field, or an owner rejected between register and verify).
    if (e instanceof RelayError && e.status === 403) throw new PendingApprovalError();
    throw e;
  }

  return { token: verified.token, ownerId: verified.owner_id, deviceId: device_id, identity };
}
