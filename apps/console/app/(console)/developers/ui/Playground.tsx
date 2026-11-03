'use client';

import { Box } from '@ledgerline/core/ui';
import { useActionState, useState } from 'react';
import { runQueryAction, type RunQueryState } from '../actions';

const EXAMPLES: { name: string; query: string; variables: string }[] = [
  {
    name: 'Balances',
    query: `{
  balances {
    account { id name kind }
    ledger
    pending
    available
  }
}`,
    variables: '',
  },
  {
    name: 'Ledger Page',
    query: `query Ledger($from: DateTime, $after: String) {
  ledgerEntries(from: $from, first: 10, after: $after) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges {
      node { id direction amount description occurredAt account { name } }
    }
  }
}`,
    variables: `{ "from": "${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z" }`,
  },
  {
    name: 'Recent Payouts',
    query: `{
  payouts(first: 5) {
    edges { node { id status amount reference account { name } createdAt } }
  }
}`,
    variables: '',
  },
  {
    name: 'Create Payout',
    query: `mutation Pay($input: CreatePayoutInput!) {
  createPayout(input: $input) {
    id status amount method reference
    account { name }
  }
}`,
    variables: `{
  "input": {
    "accountId": "acc_kite_co",
    "amount": 12500,
    "reference": "SELLER-PAYOUT-001"
  }
}`,
  },
  {
    name: 'Cancel Payout',
    query: `mutation Cancel($id: ID!) {
  cancelPayout(id: $id) { id status cancelledAt }
}`,
    variables: '{ "id": "po_…" }',
  },
  {
    name: 'Webhook Log',
    query: `{
  webhookDeliveries(first: 10) {
    edges { node { event status attempts lastError payout { id status } createdAt } }
  }
}`,
    variables: '',
  },
];

const newKey = () => crypto.randomUUID();

export function Playground({ demoKey }: { demoKey: string | null }) {
  const [state, action, pending] = useActionState<RunQueryState, FormData>(runQueryAction, null);
  const [query, setQuery] = useState(EXAMPLES[0]!.query);
  const [variables, setVariables] = useState(EXAMPLES[0]!.variables);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const isMutation = /^\s*mutation\b/.test(query);

  function pick(example: (typeof EXAMPLES)[number]) {
    setQuery(example.query);
    setVariables(example.variables);
    setIdempotencyKey(/^\s*mutation\b/.test(example.query) ? newKey() : '');
  }

  return (
    <div className="tw:grid tw:items-start tw:gap-6 tw:xl:grid-cols-2">
      <Box label="Request">
        <form action={action} className="ll-box__body tw:grid tw:gap-4 tw:p-4">
          <label className="ll-field tw:m-0">
            <span className="ll-label">API Key</span>
            <input
              name="apiKey"
              type="password"
              className="ll-input ll-mono"
              defaultValue={demoKey ?? ''}
              placeholder="llk_test_…"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <span className="ll-field__hint">
              Used for this request only, never stored.{demoKey && ' Prefilled with the local demo key.'}
            </span>
          </label>

          <div className="tw:grid tw:gap-1">
            <span className="ll-label" id="examples-label">
              Examples
            </span>
            <div className="tw:flex tw:flex-wrap tw:gap-1" role="group" aria-labelledby="examples-label">
              {EXAMPLES.map((ex) => (
                <button key={ex.name} type="button" className="ll-button ll-button--small ll-button--ghost" onClick={() => pick(ex)}>
                  {ex.name}
                </button>
              ))}
            </div>
          </div>

          <label className="ll-field tw:m-0">
            <span className="ll-label">Query</span>
            <textarea
              name="query"
              className="ll-textarea ll-mono tw:min-h-64 tw:text-[13px]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </label>

          <label className="ll-field tw:m-0">
            <span className="ll-label">Variables (JSON)</span>
            <textarea
              name="variables"
              className="ll-textarea ll-mono tw:min-h-24 tw:text-[13px]"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              spellCheck={false}
            />
          </label>

          <div className="ll-field tw:m-0">
            <label className="ll-label" htmlFor="idempotency-key">
              Idempotency-Key {isMutation ? '(required for mutations)' : '(mutations only)'}
            </label>
            <span className="tw:flex tw:gap-2">
              <input
                id="idempotency-key"
                name="idempotencyKey"
                className="ll-input ll-mono tw:min-w-0 tw:flex-1"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="ll-button ll-button--small" onClick={() => setIdempotencyKey(newKey())}>
                New Key
              </button>
            </span>
            <span className="ll-field__hint">Run a mutation twice with the same key: the second run replays the first.</span>
          </div>

          <div>
            <button type="submit" className="ll-button ll-button--primary" disabled={pending}>
              {pending ? 'Running…' : 'Run'}
            </button>
          </div>
        </form>
      </Box>

      <Box
        label="Response"
        meta={
          state?.ok ? (
            <span className="ll-mono">
              {state.status} · {state.ms} ms{state.replayed ? ' · replayed' : ''}
            </span>
          ) : undefined
        }
      >
        <div className="ll-box__body tw:grid tw:gap-3 tw:p-4" aria-live="polite">
          {!state && <p className="tw:m-0 ll-muted">Run a query to see the response here.</p>}
          {state && !state.ok && (
            <p className="ll-callout tw:m-0" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <>
              <p className="tw:m-0 ll-muted tw:text-[13px]">
                Token scopes: <span className="ll-mono">{state.scope || 'none'}</span>
                {state.rateLimit && (
                  <>
                    {' '}
                    · RateLimit: <span className="ll-mono">{state.rateLimit}</span>
                  </>
                )}
              </p>
              <pre
                className="ll-mono tw:m-0 tw:max-h-[70vh] tw:overflow-auto tw:border-[1.5px] tw:border-[var(--rule)] tw:bg-[var(--paper-2)] tw:p-3 tw:text-[13px]"
                translate="no"
              >
                {state.body}
              </pre>
            </>
          )}
        </div>
      </Box>
    </div>
  );
}
