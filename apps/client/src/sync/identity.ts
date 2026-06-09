// Bootstrap a device session from a mnemonic: derive identity locally, then
// register + challenge-response authenticate against the relay.
import { deriveIdentity, signWithDevice, type Identity } from '../crypto/keys';
import { mnemonicToSeed } from '../crypto/mnemonic';
import { toBase64, fromBase64 } from '../crypto/base64';
import { concat, utf8 } from '../crypto/bytes';
import type { RelayClient } from './relay';

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
  const { device_id } = await relay.register(
    toBase64(identity.ownerPub),
    toBase64(identity.devicePub),
    toBase64(regSig),
  );

  const { challenge } = await relay.challenge(device_id);
  const challengeSig = signWithDevice(identity.devicePriv, fromBase64(challenge));
  const { token, owner_id } = await relay.verify(device_id, challenge, toBase64(challengeSig));

  return { token, ownerId: owner_id, deviceId: device_id, identity };
}
