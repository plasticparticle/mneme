import type { VNode } from 'preact';
import { Wordmark } from './Wordmark';
import { Icon } from './Icon';
import { t } from '../i18n';

// Blocking screen shown when the relay runs REQUIRE_APPROVAL and this vault is
// not yet approved (state/data.tsx pendingApproval). The identity is valid and
// held in memory — we simply can't sync until the operator approves it in /admin.
// The user quotes the derived hint so the operator can pick the right vault.
export function PendingApproval({
  hint,
  checking,
  onRetry,
  onSignOut,
}: {
  hint: string | null;
  /** True while a re-check is in flight (status === 'connecting'). */
  checking: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}): VNode {
  return (
    <div
      style={{
        height: '100%',
        background: 'var(--paper)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ marginBottom: 22 }}>
          <Wordmark size={22} />
        </div>

        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            margin: '0 auto 16px',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--accent-soft)',
            color: 'var(--accent-ink)',
          }}
        >
          <Icon name="clock" size={22} />
        </div>

        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--ink)',
            margin: '0 0 8px',
          }}
        >
          {t('pending.title')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--ui)',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--ink-2)',
            margin: '0 0 20px',
          }}
        >
          {t('pending.lead')}
        </p>

        {hint && (
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: 12,
              background: 'var(--surface)',
              padding: '14px 16px',
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--ui)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 6,
              }}
            >
              {t('pending.hintLabel')}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--accent-ink)',
                userSelect: 'all',
              }}
            >
              {hint}
            </div>
            <div
              style={{
                fontFamily: 'var(--ui)',
                fontSize: 12.5,
                lineHeight: 1.45,
                color: 'var(--ink-3)',
                marginTop: 10,
              }}
            >
              {t('pending.hintHelp')}
            </div>
          </div>
        )}

        <button
          onClick={onRetry}
          disabled={checking}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            cursor: checking ? 'default' : 'pointer',
            padding: '11px 14px',
            borderRadius: 11,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontFamily: 'var(--ui)',
            fontSize: 14,
            fontWeight: 600,
            opacity: checking ? 0.7 : 1,
          }}
        >
          {checking ? t('pending.checking') : t('pending.checkAgain')}
        </button>

        <button
          onClick={onSignOut}
          style={{
            marginTop: 12,
            width: '100%',
            cursor: 'pointer',
            padding: '9px 14px',
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: 'var(--ink-3)',
            fontFamily: 'var(--ui)',
            fontSize: 13,
          }}
        >
          {t('pending.startOver')}
        </button>
      </div>
    </div>
  );
}
