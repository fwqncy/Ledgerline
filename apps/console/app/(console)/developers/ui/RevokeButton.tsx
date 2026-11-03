'use client';

import { toast } from '@ledgerline/core/ui';
import { useEffect, useState, useTransition } from 'react';
import { revokeKeyAction } from '../actions';

/** Like Reject in Risk: the first click arms it, the second revokes. */
export function RevokeButton({ partnerId, keyId, name }: { partnerId: string; keyId: string; name: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  function onClick() {
    if (!armed) return setArmed(true);
    const form = new FormData();
    form.set('partnerId', partnerId);
    form.set('keyId', keyId);
    startTransition(async () => {
      try {
        await revokeKeyAction(form);
        toast.show({ tone: 'success', title: `Revoked “${name}”. Its tokens stop working now.` });
      } catch {
        toast.show({ tone: 'error', title: `Couldn’t revoke “${name}”. Try again.` });
      }
      setArmed(false);
    });
  }

  return (
    <button
      type="button"
      className={`ll-button ll-button--small ${armed ? 'll-button--danger' : 'll-button--ghost'}`}
      onClick={onClick}
      disabled={pending}
      aria-label={armed ? `Confirm: revoke ${name}` : `Revoke ${name}`}
    >
      {pending ? 'Revoking…' : armed ? 'Confirm Revoke' : 'Revoke'}
    </button>
  );
}
