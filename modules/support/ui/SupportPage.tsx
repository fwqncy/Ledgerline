'use client';

import { useNotifyDataChanged } from '@ledgerline/core/client';
import {
  Box,
  Code,
  Empty,
  FilterLinks,
  Money,
  PageHeader,
  RelativeTime,
  SkeletonRows,
  Spinner,
  StatusPill,
  SubmitShortcut,
  toast,
  useHotkeys,
  useHrefWith,
} from '@ledgerline/core/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ModuleProvider, useTRPC } from '../client';
import { MACROS } from '../macros';

const TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
type Filter = (typeof TICKET_STATUSES)[number] | undefined;

export function SupportPage() {
  return (
    <ModuleProvider>
      <Support />
    </ModuleProvider>
  );
}

function Support() {
  const trpc = useTRPC();
  const hrefWith = useHrefWith();
  const searchParams = useSearchParams();
  const status: Filter = TICKET_STATUSES.find((s) => s === searchParams.get('status'));

  const list = useQuery({ ...trpc.list.queryOptions({ status }), refetchInterval: 15_000 });
  const tickets = list.data ?? [];
  const idParam = searchParams.get('id');
  const selectedId = idParam ?? tickets[0]?.id ?? null;

  return (
    <div className="ll-page">
      <PageHeader
        kicker="Section E · Correspondence"
        title="Support"
        deck="Letters from merchants, each with the payout they’re asking about pinned alongside."
      />

      <div className="ll-split ll-split--support">
        <Box label="The Inbox" meta={list.data ? `${tickets.length} shown` : undefined}>
          <div className="ll-box__toolbar">
            <FilterLinks
              label="Filter by status"
              param="status"
              reset={['id']}
              value={status}
              options={[
                { label: 'All', value: undefined },
                { label: 'Open', value: 'open' },
                { label: 'Waiting', value: 'waiting' },
                { label: 'Resolved', value: 'resolved' },
              ]}
            />
          </div>
          {list.isPending ? (
            <SkeletonRows rows={4} />
          ) : list.isError ? (
            <Empty>
              Couldn’t load tickets. Check your connection & try again.
              <button type="button" className="ll-button" onClick={() => list.refetch()}>
                Retry
              </button>
            </Empty>
          ) : tickets.length === 0 ? (
            <Empty>
              No {status} tickets. You’re all caught up.
              <Link href={hrefWith({ status: undefined, id: undefined })} className="ll-link" scroll={false}>
                View All Tickets
              </Link>
            </Empty>
          ) : (
            <ul className="ll-list">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={hrefWith({ id: ticket.id })}
                    scroll={false}
                    replace
                    aria-current={ticket.id === selectedId ? 'true' : undefined}
                    className="ll-row"
                  >
                    <span className="ll-row__main">
                      <span className="ll-row__title">{ticket.subject}</span>
                      <span className="ll-row__meta">
                        <span className="ll-mono" translate="no">
                          {ticket.id}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{ticket.merchant}</span>
                        <span aria-hidden>·</span>
                        <span>{ticket.assignee ?? 'Unassigned'}</span>
                      </span>
                    </span>
                    <Sla due={ticket.slaDueAt} status={ticket.status} />
                    <StatusPill status={ticket.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Box>

        <section className="ll-box ll-detail" aria-label="Conversation">
          {selectedId ? (
            <Thread key={selectedId} id={selectedId} />
          ) : (
            <Empty>{list.isPending ? null : 'Select a ticket to read the conversation.'}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

/** Time left to first response; turns into an overdue warning once the target passes. */
function Sla({ due, status }: { due: string; status: string }) {
  if (status !== 'open') return null;
  const overdue = Date.parse(due) < Date.now();
  return (
    <span className={`ll-pill ll-pill--${overdue ? 'rejected' : 'neutral'}`}>
      {overdue ? 'Overdue' : 'Due'}&nbsp;
      <RelativeTime iso={due} />
    </span>
  );
}

function Thread({ id }: { id: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const notifyDataChanged = useNotifyDataChanged();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const detailOptions = trpc.get.queryOptions({ id });
  const detail = useQuery(detailOptions);

  const onError = (e: { message: string }) => toast.show({ tone: 'error', title: e.message });

  const reply = useMutation(
    trpc.reply.mutationOptions({
      // Show the reply straight away; roll back if the server rejects it.
      onMutate: async ({ body }) => {
        await queryClient.cancelQueries({ queryKey: detailOptions.queryKey });
        const previous = queryClient.getQueryData(detailOptions.queryKey);
        queryClient.setQueryData(detailOptions.queryKey, (old) =>
          old && {
            ...old,
            ticket: {
              ...old.ticket,
              status: 'waiting' as const,
              messages: [
                ...old.ticket.messages,
                { id: 'optimistic', author: 'You', from: 'operator' as const, body, at: new Date().toISOString() },
              ],
            },
          },
        );
        if (textareaRef.current) textareaRef.current.value = '';
        return { previous, body };
      },
      onSuccess: () => toast.show({ tone: 'success', title: 'Reply sent' }),
      onError: (error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(detailOptions.queryKey, context.previous);
        if (textareaRef.current && context) textareaRef.current.value = context.body;
        toast.show({ tone: 'error', title: 'Your reply wasn’t sent', body: `${error.message} Your text is back in the box; try sending it again.` });
      },
      onSettled: notifyDataChanged,
    }),
  );
  const resolve = useMutation(
    trpc.resolve.mutationOptions({
      onSuccess: (t) => toast.show({ tone: 'success', title: `Resolved ${t.id}` }),
      onError,
      onSettled: notifyDataChanged,
    }),
  );
  const reopen = useMutation(trpc.reopen.mutationOptions({ onError, onSettled: notifyDataChanged }));
  const assign = useMutation(
    trpc.assign.mutationOptions({
      onSuccess: (t) => toast.show({ tone: 'success', title: `${t.id} is yours` }),
      onError,
      onSettled: notifyDataChanged,
    }),
  );

  useHotkeys({
    r: () => textareaRef.current?.focus(),
    m: () => assign.mutate({ id }),
  });

  if (detail.isError) {
    return <Empty>That ticket couldn’t be found. Pick another from the inbox.</Empty>;
  }
  if (!detail.data) return <SkeletonRows rows={3} />;
  const { ticket, payout, hold, me } = detail.data;

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = textareaRef.current?.value.trim() ?? '';
    if (!body) {
      setFieldError(`Write a reply to ${ticket.merchant} first, or insert a macro.`);
      textareaRef.current?.focus();
      return;
    }
    setFieldError(null);
    reply.mutate({ id, body });
  }

  function insertMacro(macroId: string) {
    const macro = MACROS.find((m) => m.id === macroId);
    const box = textareaRef.current;
    if (!macro || !box) return;
    const text = macro.body.replace('{merchant}', ticket.merchant);
    box.value = box.value.trim() ? `${box.value.trimEnd()}\n\n${text}` : text;
    setFieldError(null);
    box.focus();
  }

  return (
    <div className="ll-detail__body ll-thread">
      <div className="ll-detail__head">
        <div>
          <h2 className="ll-detail__title">{ticket.subject}</h2>
          <span className="ll-row__meta">
            <Code copy>{ticket.id}</Code>
            <span aria-hidden>·</span>
            <span>{ticket.merchant}</span>
            <span aria-hidden>·</span>
            <span>{ticket.assignee ? `With ${ticket.assignee}` : 'Unassigned'}</span>
          </span>
        </div>
        <span className="ll-actions">
          {ticket.assignee !== me && ticket.status !== 'resolved' && (
            <button
              type="button"
              className="ll-button ll-button--small ll-button--ghost"
              disabled={assign.isPending}
              aria-busy={assign.isPending}
              onClick={() => assign.mutate({ id })}
            >
              {assign.isPending && <Spinner />}
              Assign to Me
            </button>
          )}
          {ticket.status === 'resolved' ? (
            <button
              type="button"
              className="ll-button ll-button--small"
              disabled={reopen.isPending}
              aria-busy={reopen.isPending}
              onClick={() => reopen.mutate({ id })}
            >
              {reopen.isPending && <Spinner />}
              Reopen
            </button>
          ) : (
            <button
              type="button"
              className="ll-button ll-button--small ll-button--primary"
              disabled={resolve.isPending}
              aria-busy={resolve.isPending}
              onClick={() => resolve.mutate({ id })}
            >
              {resolve.isPending && <Spinner />}
              Resolve
            </button>
          )}
        </span>
      </div>

      {payout && (
        <div className="ll-linked">
          <h3 className="ll-section-title">Linked Payout</h3>
          <span className="ll-linked__row">
            <Link href={`/payouts?id=${payout.id}`} className="ll-link ll-mono" translate="no">
              {payout.id}
            </Link>
            <Money amount={payout.amount} />
            <StatusPill status={payout.status} />
          </span>
          {hold && (
            <span className="ll-linked__hold">
              Held by Risk: {hold.reason}.{' '}
              <Link href="/risk" className="ll-link">
                Review in Risk
              </Link>
            </span>
          )}
        </div>
      )}

      <ol className="ll-messages" aria-label="Messages">
        {ticket.messages.map((message) => (
          <li key={message.id} className={`ll-message ll-message--${message.from}`}>
            <span className="ll-message__meta">
              {message.author} · <RelativeTime iso={message.at} />
            </span>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>

      <form className="ll-composer" onSubmit={submit} noValidate>
        <label htmlFor="reply" className="ll-visually-hidden">
          Reply to {ticket.merchant}
        </label>
        <textarea
          ref={textareaRef}
          id="reply"
          name="reply"
          placeholder={`Reply to ${ticket.merchant}…`}
          rows={4}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? 'reply-error' : undefined}
          onInput={() => fieldError && setFieldError(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <div className="ll-composer__bar">
          <label htmlFor="macro" className="ll-visually-hidden">
            Insert a macro
          </label>
          <select
            id="macro"
            className="ll-select"
            style={{ width: 'auto', minHeight: 32, fontSize: 14 }}
            value=""
            onChange={(e) => insertMacro(e.target.value)}
          >
            <option value="" disabled>
              Insert Macro…
            </option>
            {MACROS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="ll-muted">
            <SubmitShortcut /> to send
          </span>
          <button type="submit" className="ll-button ll-button--primary ll-button--small" disabled={reply.isPending} aria-busy={reply.isPending}>
            {reply.isPending && <Spinner />}
            Send Reply
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {fieldError && (
          <p id="reply-error" className="ll-field__error">
            {fieldError}
          </p>
        )}
      </div>
    </div>
  );
}
