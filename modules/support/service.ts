import { newId, type TicketStatus } from '@ledgerline/core/db';
import { TRPCError, type BaseContext } from '@ledgerline/core/server';

export function createSupportService({ db, operator }: BaseContext) {
  async function find(id: string) {
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: `Ticket ${id} not found. It may have been merged.` });
    return ticket;
  }

  return {
    async get(id: string) {
      const ticket = await find(id);
      // Support reads payout and risk state so agents can answer "where is my money?" without switching modules.
      const payout = ticket.payoutId ? await db.payout.findUnique({ where: { id: ticket.payoutId } }) : null;
      const hold = ticket.payoutId
        ? await db.riskFlag.findFirst({ where: { payoutId: ticket.payoutId, status: 'open' } })
        : null;
      return { ticket, payout, hold, me: operator?.name ?? null };
    },

    async reply(id: string, body: string) {
      const ticket = await find(id);
      const now = new Date().toISOString();
      return db.ticket.update({
        where: { id },
        data: {
          status: 'waiting',
          updatedAt: now,
          assignee: ticket.assignee ?? operator?.name ?? null,
          messages: [
            ...ticket.messages,
            { id: newId('m', 6), author: operator?.name ?? 'Operator', from: 'operator', body, at: now },
          ],
        },
      });
    },

    async setStatus(id: string, status: TicketStatus) {
      await find(id);
      return db.ticket.update({ where: { id }, data: { status, updatedAt: new Date().toISOString() } });
    },

    async assignToMe(id: string) {
      await find(id);
      return db.ticket.update({ where: { id }, data: { assignee: operator?.name ?? null, updatedAt: new Date().toISOString() } });
    },

    async search(q: string) {
      const tickets = await db.ticket.findMany({
        where: {
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { subject: { contains: q, mode: 'insensitive' } },
            { merchant: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });
      return tickets.map((t) => ({
        id: t.id,
        title: t.subject,
        subtitle: `${t.id} · ${t.merchant} · ${t.status}`,
        href: `/support?id=${t.id}`,
        kind: 'Ticket',
      }));
    },
  };
}
