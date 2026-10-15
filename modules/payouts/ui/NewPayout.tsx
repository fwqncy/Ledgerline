'use client';

import { formatMoney, parseMoneyInput } from '@ledgerline/core/format';
import { CITIES, METHOD_LABELS, methodFor } from '@ledgerline/core/geo';
import { Dialog, Spinner, toast } from '@ledgerline/core/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTRPC } from '../client';
import { CreatePayoutInput } from '../schema';

const CITY_NAMES = Object.keys(CITIES).sort((a, b) => a.localeCompare(b));
const FIELD_ORDER = ['beneficiary', 'amount', 'reference', 'city', 'accountLast4'] as const;
type Field = (typeof FIELD_ORDER)[number];

export function NewPayoutDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const dirty = useRef(false);
  const canClose = () =>
    !dirty.current || window.confirm('Discard this payout? What you’ve entered will be lost.');

  return (
    <Dialog
      open={open}
      onClose={() => {
        dirty.current = false;
        onClose();
      }}
      canClose={canClose}
      title="New Payout"
      description="It joins the payout book as pending. Approving it is a separate step."
    >
      <NewPayoutForm
        onDirty={(value) => (dirty.current = value)}
        onCancel={() => {
          if (canClose()) {
            dirty.current = false;
            onClose();
          }
        }}
        onCreated={(id) => {
          dirty.current = false;
          onCreated(id);
        }}
      />
    </Dialog>
  );
}

function NewPayoutForm({
  onDirty,
  onCancel,
  onCreated,
}: {
  onDirty: (dirty: boolean) => void;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const trpc = useTRPC();
  const formRef = useRef<HTMLFormElement>(null);
  const beneficiaries = useQuery(trpc.beneficiaries.queryOptions());
  // One key per form: a double-submit or retry can't create the payout twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [preview, setPreview] = useState({ city: 'London', amount: 0 });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    onDirty(isDirty);
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, onDirty]);

  const create = useMutation(
    trpc.create.mutationOptions({
      onSuccess: (payout) => {
        setIsDirty(false);
        toast.show({
          tone: 'success',
          title: `Payout ${payout.id} created`,
          body: `${payout.beneficiary} · ${formatMoney(payout.amount)} is waiting for approval.`,
        });
        onCreated(payout.id);
      },
      onError: (error) => toast.show({ tone: 'error', title: `It wasn’t created: ${error.message}` }),
    }),
  );

  function read() {
    const data = new FormData(formRef.current!);
    const text = (name: Field) => String(data.get(name) ?? '').trim();
    return {
      beneficiary: text('beneficiary'),
      amountText: text('amount'),
      reference: text('reference'),
      city: text('city'),
      accountLast4: text('accountLast4'),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const values = read();
    const amount = parseMoneyInput(values.amountText);
    const parsed = CreatePayoutInput.safeParse({ ...values, amount: amount ?? Number.NaN, idempotencyKey });

    const next: Partial<Record<Field, string>> = {};
    if (amount === null) next.amount = values.amountText ? 'Enter pounds & pence, like 1,250.00.' : 'Enter an amount, like 1,250.00.';
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        if (FIELD_ORDER.includes(field) && !next[field]) next[field] = issue.message;
      }
    }
    setErrors(next);

    const first = FIELD_ORDER.find((f) => next[f]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (parsed.success) create.mutate(parsed.data);
  }

  function onChange() {
    if (!isDirty) setIsDirty(true);
    const values = read();
    setPreview({ city: values.city || 'London', amount: parseMoneyInput(values.amountText) ?? 0 });
  }

  /** Picking a known beneficiary fills in where they're paid. */
  function onBeneficiary(name: string) {
    const known = beneficiaries.data?.find((b) => b.name.toLowerCase() === name.trim().toLowerCase());
    const form = formRef.current;
    if (!known || !form) return;
    const city = form.elements.namedItem('city') as HTMLSelectElement;
    const account = form.elements.namedItem('accountLast4') as HTMLInputElement;
    city.value = known.city;
    if (!account.value) account.value = known.accountLast4;
    onChange();
  }

  const field = (name: Field) => ({
    name,
    id: `np-${name}`,
    'aria-invalid': Boolean(errors[name]) || undefined,
    'aria-describedby': errors[name] ? `np-${name}-error` : `np-${name}-hint`,
  });

  const country = CITIES[preview.city]?.country ?? 'GB';

  return (
    <form ref={formRef} onSubmit={submit} onChange={onChange} noValidate className="ll-form-grid">
      <div className="ll-field ll-field--wide">
        <label className="ll-label" htmlFor="np-beneficiary">
          Beneficiary
        </label>
        <input
          {...field('beneficiary')}
          className="ll-input"
          list="np-known"
          autoComplete="organization"
          placeholder="Northwind Ltd…"
          onBlur={(e) => onBeneficiary(e.target.value)}
          autoFocus
        />
        <datalist id="np-known">
          {beneficiaries.data?.map((b) => <option key={b.name} value={b.name} />)}
        </datalist>
        <FieldMessage name="beneficiary" error={errors.beneficiary} hint="Pick a known beneficiary to fill in their details." />
      </div>

      <div className="ll-field">
        <label className="ll-label" htmlFor="np-amount">
          Amount (GBP)
        </label>
        <input {...field('amount')} className="ll-input ll-input--money" inputMode="decimal" autoComplete="off" placeholder="1,250.00…" />
        <FieldMessage name="amount" error={errors.amount} hint={preview.amount ? formatMoney(preview.amount) : 'Pounds & pence.'} />
      </div>

      <div className="ll-field">
        <label className="ll-label" htmlFor="np-reference">
          Reference
        </label>
        <input
          {...field('reference')}
          className="ll-input ll-mono"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="INV-2291…"
        />
        <FieldMessage name="reference" error={errors.reference} hint="Shows on their bank statement." />
      </div>

      <div className="ll-field">
        <label className="ll-label" htmlFor="np-city">
          Destination
        </label>
        <select {...field('city')} className="ll-select" defaultValue="London">
          {CITY_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}, {CITIES[name]!.country}
            </option>
          ))}
        </select>
        <FieldMessage name="city" error={errors.city} hint={`Sends via ${METHOD_LABELS[methodFor(country, preview.amount)]}.`} />
      </div>

      <div className="ll-field">
        <label className="ll-label" htmlFor="np-accountLast4">
          Account, Last 4 Digits
        </label>
        <input
          {...field('accountLast4')}
          className="ll-input ll-mono"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          spellCheck={false}
          placeholder="0123…"
        />
        <FieldMessage name="accountLast4" error={errors.accountLast4} hint="The full number stays with Treasury." />
      </div>

      <div className="ll-form-actions ll-field--wide">
        <button type="button" className="ll-button ll-button--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="ll-button ll-button--primary" disabled={create.isPending} aria-busy={create.isPending}>
          {create.isPending && <Spinner />}
          Create Payout
        </button>
      </div>
    </form>
  );
}

function FieldMessage({ name, error, hint }: { name: Field; error?: string; hint: string }) {
  return error ? (
    <p id={`np-${name}-error`} className="ll-field__error">
      {error}
    </p>
  ) : (
    <p id={`np-${name}-hint`} className="ll-field__hint">
      {hint}
    </p>
  );
}
