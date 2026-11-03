import { Box } from '@ledgerline/core/ui';
import {
  buildSchema,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLNamedType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLScalarType,
  type GraphQLType,
  getNamedType,
} from 'graphql';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PARTNER_API_PUBLIC_URL, partnerApi } from '../lib/partner-api';
import { load, Pre } from '../ui/shared';

export const metadata: Metadata = { title: 'Schema · Developers' };

const BUILT_IN = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

const anchor = (name: string) => `type-${name}`;

/** `[Payout!]!` with the named type linked to its section. */
function TypeRef({ type }: { type: GraphQLType }) {
  const named = getNamedType(type);
  const text = String(type);
  const [before, after] = text.split(named.name) as [string, string];
  return (
    <span className="ll-mono">
      {before}
      {BUILT_IN.has(named.name) ? named.name : <a href={`#${anchor(named.name)}`} className="ll-link">{named.name}</a>}
      {after}
    </span>
  );
}

function Args({ args }: { args: readonly GraphQLArgument[] }) {
  if (!args.length) return null;
  return (
    <>
      (
      {args.map((a, i) => (
        <span key={a.name}>
          {i > 0 && ', '}
          {a.name}: <TypeRef type={a.type} />
        </span>
      ))}
      )
    </>
  );
}

function Operations({ title, fields, scope }: { title: string; fields: GraphQLField<unknown, unknown>[]; scope: ReactNode }) {
  return (
    <Box label={title} meta={scope}>
      <ul className="tw:m-0 tw:grid tw:list-none tw:p-0">
        {fields.map((f) => (
          <li key={f.name} id={`op-${f.name}`} className="tw:grid tw:gap-1 tw:border-b tw:border-[var(--rule-soft)] tw:px-4 tw:py-3 tw:last:border-b-0">
            <code className="ll-mono tw:text-[14px] tw:break-words" translate="no">
              <strong>{f.name}</strong>
              <Args args={f.args} />: <TypeRef type={f.type} />
            </code>
            {f.description && <p className="tw:m-0 tw:whitespace-pre-line ll-muted">{f.description}</p>}
          </li>
        ))}
      </ul>
    </Box>
  );
}

function TypeSection({ type }: { type: GraphQLNamedType }) {
  const kind =
    type instanceof GraphQLEnumType ? 'enum' : type instanceof GraphQLInputObjectType ? 'input' : type instanceof GraphQLScalarType ? 'scalar' : 'type';
  return (
    <section id={anchor(type.name)} className="tw:scroll-mt-24 tw:border-b tw:border-[var(--rule-soft)] tw:px-4 tw:py-4 tw:last:border-b-0">
      <h3 className="tw:m-0 tw:flex tw:items-baseline tw:gap-2 tw:text-lg">
        <span className="ll-tag ll-mono">{kind}</span>
        <span className="ll-mono">{type.name}</span>
      </h3>
      {type.description && <p className="tw:mt-1 tw:mb-0 tw:whitespace-pre-line ll-muted">{type.description}</p>}

      {type instanceof GraphQLEnumType && (
        <dl className="ll-dl tw:mt-3">
          {type.getValues().map((v) => (
            <div key={v.name} className="tw:contents">
              <dt className="ll-mono">{v.name}</dt>
              <dd>{v.description ?? ''}</dd>
            </div>
          ))}
        </dl>
      )}

      {(type instanceof GraphQLObjectType || type instanceof GraphQLInputObjectType) && (
        <div className="ll-table-wrap tw:mt-3">
          <table className="ll-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(type.getFields()).map((f) => (
                <tr key={f.name}>
                  <td className="ll-mono tw:whitespace-nowrap">{f.name}</td>
                  <td className="tw:whitespace-nowrap">
                    <TypeRef type={f.type} />
                  </td>
                  <td className="ll-muted">{f.description ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function DocsPage() {
  const sdl = await load(() => partnerApi.schema());
  if (!sdl.ok) return sdl.node;
  const schema = buildSchema(sdl.value);
  const queries = Object.values(schema.getQueryType()?.getFields() ?? {});
  const mutations = Object.values(schema.getMutationType()?.getFields() ?? {});
  const types = Object.values(schema.getTypeMap())
    .filter((t) => !t.name.startsWith('__') && !BUILT_IN.has(t.name) && t !== schema.getQueryType() && t !== schema.getMutationType())
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="tw:grid tw:items-start tw:gap-6 tw:lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Schema contents" className="tw:hidden tw:lg:sticky tw:lg:top-24 tw:lg:block">
        <p className="ll-label">Operations</p>
        <ul className="tw:mt-1 tw:mb-4 tw:grid tw:list-none tw:gap-1 tw:p-0 tw:text-[14px]">
          {[...queries, ...mutations].map((f) => (
            <li key={f.name}>
              <a href={`#op-${f.name}`} className="ll-link ll-mono">
                {f.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="ll-label">Types</p>
        <ul className="tw:mt-1 tw:grid tw:list-none tw:gap-1 tw:p-0 tw:text-[14px]">
          {types.map((t) => (
            <li key={t.name}>
              <a href={`#${anchor(t.name)}`} className="ll-link ll-mono">
                {t.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="tw:grid tw:min-w-0 tw:gap-6">
        <Box label="About the Schema">
          <div className="ll-box__body tw:grid tw:gap-2 tw:p-4">
            {schema.description && <p className="tw:m-0 tw:whitespace-pre-line">{schema.description}</p>}
            <p className="tw:m-0 ll-muted">
              Read live from the running Partner API. Download it for codegen:{' '}
              <a href={`${PARTNER_API_PUBLIC_URL}/schema.graphql`} className="ll-link ll-mono">
                {PARTNER_API_PUBLIC_URL}/schema.graphql
              </a>
            </p>
          </div>
        </Box>

        <Operations title="Queries" fields={queries} scope={<span className="ll-mono">ledger:read</span>} />
        <Operations title="Mutations" fields={mutations} scope={<span className="ll-mono">payouts:write · Idempotency-Key</span>} />

        <Box label="Types">{types.map((t) => <TypeSection key={t.name} type={t} />)}</Box>

        <Box label="Verifying Webhooks">
          <div className="ll-box__body tw:grid tw:gap-2 tw:p-4">
            <p className="tw:m-0">
              Each delivery carries <span className="ll-mono">Ledgerline-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</span>, an
              HMAC-SHA256 of <span className="ll-mono">t + &quot;.&quot; + rawBody</span> with your webhook secret. Reject anything
              older than five minutes.
            </p>
            <Pre>{`import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, rawBody, header) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}`}</Pre>
          </div>
        </Box>
      </div>
    </div>
  );
}
