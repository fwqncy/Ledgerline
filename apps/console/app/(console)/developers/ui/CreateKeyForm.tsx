'use client';

import { CopyButton } from '@ledgerline/core/ui';
import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { createKeyAction, type CreateKeyState } from '../actions';

export function CreateKeyForm({ partnerId, scopes }: { partnerId: string; scopes: { name: string; description: string }[] }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createKeyAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      revealRef.current?.focus();
    }
  }, [state]);

  return (
    <div className="ll-box__body tw:grid tw:gap-4 tw:p-4">
      {state?.ok && (
        <div ref={revealRef} tabIndex={-1} role="status" className="tw:grid tw:gap-2 tw:border-[1.5px] tw:border-[var(--ink)] tw:bg-[var(--paper-2)] tw:p-3">
          <p className="tw:m-0 tw:font-semibold">“{state.key.name}” is ready. Copy it now: it won’t be shown again.</p>
          <span className="tw:flex tw:items-center tw:gap-1">
            <code className="ll-mono tw:min-w-0 tw:break-all tw:text-[13px]" translate="no">
              {state.key.key}
            </code>
            <CopyButton value={state.key.key} label="Copy key" />
          </span>
          <p className="tw:m-0 ll-muted tw:text-[13px]">
            Try it in the <Link href="/developers/playground" className="ll-link">Playground</Link>.
          </p>
        </div>
      )}

      <form ref={formRef} action={action} className="tw:grid tw:gap-4">
        <input type="hidden" name="partnerId" value={partnerId} />
        <label className="ll-field tw:m-0">
          <span className="ll-label">Name</span>
          <input name="name" className="ll-input" placeholder="e.g. Seller payouts (production)" maxLength={80} required autoComplete="off" />
        </label>

        <fieldset className="ll-fieldset tw:m-0 tw:grid tw:gap-2">
          <legend className="ll-label">Scopes</legend>
          {scopes.map((s) => (
            <label key={s.name} className="tw:flex tw:cursor-pointer tw:items-start tw:gap-2">
              <input type="checkbox" name="scopes" value={s.name} defaultChecked={s.name === 'ledger:read'} className="ll-check tw:mt-1" />
              <span>
                <span className="ll-mono tw:block">{s.name}</span>
                <span className="ll-muted tw:text-[13px]">{s.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {state && !state.ok && (
          <p className="ll-field__error tw:m-0" role="alert">
            {state.error}
          </p>
        )}

        <div>
          <button type="submit" className="ll-button ll-button--primary" disabled={pending}>
            {pending ? 'Creating…' : 'Create Key'}
          </button>
        </div>
      </form>
    </div>
  );
}
