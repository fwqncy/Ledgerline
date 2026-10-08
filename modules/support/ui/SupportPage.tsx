'use client';

import {
  Code,
  Empty,
  FilterLinks,
  Money,
  Notice,
  RelativeTime,
  SkeletonRows,
  Spinner,
  StatusPill,
  SubmitShortcut,
  useHrefWith,
} from '@ledgerline/core/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { ModuleProvider, useTRPC } from '../client';

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

  const list = useQuery(trpc.list.queryOptions({ status }));
  const tickets = list.data ?? [];
  const selectedId = tickets.find((t) => t.id === searchParams.get('id'))?.id ?? tickets[0]?.id ?? null;

  return (
    <div className="ll-page">
      <header className="ll-page__header">
        <div>
          <h1 className="ll-page__title">Support</h1>
          <p className="ll-page__subtitle">Merchant tickets, with the payout they’re about alongside.</p>
        </div>
      </header>

      <div className="ll-split ll-split--support">
        <section className="ll-card ll-card--flush" aria-labelledby="tickets-title">
          <h2 id="tickets-title" className="ll-visually-hidden">
            Tickets
          </h2>
          <div className="ll-card__toolbar">
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
              <button type="button" className="ll-button ll-button--ghost" onClick={() => list.refetch()}>
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
                        <Code>{ticket.id}</Code> · {ticket.merchant} · <RelativeTime iso={ticket.updatedAt} />
                      </span>
                    </span>
                    {ticket.priority === 'high' && <StatusPill status="high" />}
                    <StatusPill status={ticket.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ll-card ll-detail" aria-label="Conversation">
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

function Thread({ id }: { id: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const detailOptions = trpc.get.queryOptions({ id });
  const detail = useQuery(detailOptions);

  const refresh = async () => {
    await queryClient.invalidateQueries();
    router.refresh();
  };
  const onError = (e: { message: string }) => setNotice({ tone: 'error', text: e.message });

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
      onError: (error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(detailOptions.queryKey, context.previous);
        if (textareaRef.current && context) textareaRef.current.value = context.body;
        setNotice({ tone: 'error', text: `Your reply wasn’t sent: ${error.message} Try sending it again.` });
      },
      onSettled: refresh,
    }),
  );
  const resolve = useMutation(trpc.resolve.mutationOptions({ onError, onSettled: refresh }));
  const reopen = useMutation(trpc.reopen.mutationOptions({ onError, onSettled: refresh }));

  if (!detail.data) return <SkeletonRows rows={3} />;
  const { ticket, payout, hold } = detail.data;

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = textareaRef.current?.value.trim() ?? '';
    if (!body) {
      setFieldError(`Write a reply to ${ticket.merchant} first.`);
      textareaRef.current?.focus();
      return;
    }
    setFieldError(null);
    setNotice(null);
    reply.mutate({ id, body });
  }

  return (
    <div className="ll-detail__body ll-thread">
      <div className="ll-detail__head">
        <div>
          <h2 className="ll-detail__title">{ticket.subject}</h2>
          <span className="ll-row__meta">
            <Code>{ticket.id}</Code> · {ticket.merchant}
          </span>
        </div>
        {ticket.status === 'resolved' ? (
          <button
            type="button"
            className="ll-button ll-button--ghost"
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
            className="ll-button ll-button--primary"
            disabled={resolve.isPending}
            aria-busy={resolve.isPending}
            onClick={() => resolve.mutate({ id })}
          >
            {resolve.isPending && <Spinner />}
            Resolve
          </button>
        )}
      </div>

      {payout && (
        <div className="ll-linked">
          <h3 className="ll-section-title">Linked Payout</h3>
          <span className="ll-linked__row">
            <Link href={`/payouts?id=${payout.id}`} className="ll-link">
              <Code>{payout.id}</Code>
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

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <form className="ll-composer" onSubmit={submit} noValidate>
        <label htmlFor="reply" className="ll-visually-hidden">
          Reply to {ticket.merchant}
        </label>
        <textarea
          ref={textareaRef}
          id="reply"
          name="reply"
          placeholder={`Reply to ${ticket.merchant}…`}
          rows={3}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? 'reply-error' : undefined}
          onInput={() => fieldError && setFieldError(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <div className="ll-composer__bar">
          <span className="ll-muted">
            <SubmitShortcut /> to send
          </span>
          <button type="submit" className="ll-button ll-button--primary" disabled={reply.isPending} aria-busy={reply.isPending}>
            {reply.isPending && <Spinner />}
            Send Reply
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {fieldError && (
          <p id="reply-error" className="ll-field-error">
            {fieldError}
          </p>
        )}
      </div>
    </div>
  );
}
