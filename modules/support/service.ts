import { newId, type TicketStatus } from '@ledgerline/core/db';
import { TRPCError, type BaseContext } from '@ledgerline/core/server';

export function createSupportService({ db, operator }: BaseContext) {
  async function find(id: string) {
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: `Ticket ${id} not found` });
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
      return { ticket, payout, hold };
    },

    async reply(id: string, body: string) {
      const ticket = await find(id);
      const now = new Date().toISOString();
      return db.ticket.update({
        where: { id },
        data: {
          status: 'waiting',
          updatedAt: now,
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
  };
}
