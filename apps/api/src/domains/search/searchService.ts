import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@wiki/db";
import type { SearchQuery, SearchResponse } from "@wiki/types";

export type SearchContext = {
  orgId: string;
  userId: string;
  groupIds: string[];
  isAdmin: boolean;
  canSearch: boolean;
};

type SearchRow = {
  document_id: string;
  document_slug: string;
  space_id: string;
  space_slug: string;
  type: string;
  title: string;
  preview: string | null;
  updated_at: Date;
  score: number;
  title_highlight: string | null;
  body_highlight: string | null;
};

function parseDateBound(value: string, endOfDay: boolean): string {
  if (value.length === 10) {
    return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  }
  return value;
}

function aclFilter(ctx: SearchContext): SQL {
  if (ctx.isAdmin) return sql`TRUE`;
  if (!ctx.groupIds.length) {
    return sql`d.search_acl_user_ids @> ARRAY[${ctx.userId}::uuid]`;
  }
  return sql`(
    d.search_acl_user_ids @> ARRAY[${ctx.userId}::uuid]
    OR d.search_acl_group_ids && ${ctx.groupIds}::uuid[]
  )`;
}

function buildFilters(query: SearchQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.spaceId) {
    filters.push(sql`d.space_id = ${query.spaceId}::uuid`);
  }
  if (query.type === "page") {
    filters.push(sql`(d.type = 'page' OR (d.type = 'pdf' AND d.search_is_editable = true))`);
  } else if (query.type) {
    filters.push(sql`d.type = ${query.type}`);
  }
  if (query.authorId) {
    filters.push(sql`d.owner_id = ${query.authorId}::uuid`);
  }
  if (query.tags?.length) {
    filters.push(sql`d.tags && ${query.tags}::text[]`);
  }
  if (query.from) {
    filters.push(sql`coalesce(d.search_updated_at, d.updated_at) >= ${parseDateBound(query.from, false)}::timestamptz`);
  }
  if (query.to) {
    filters.push(sql`coalesce(d.search_updated_at, d.updated_at) <= ${parseDateBound(query.to, true)}::timestamptz`);
  }
  return filters;
}

function combineSql(parts: SQL[], separator: string): SQL {
  if (!parts.length) return sql`TRUE`;
  return sql.join(parts, sql.raw(` ${separator} `));
}

/** Sanitize user input into tsquery-safe tokens (alphanumeric only). */
function tokenizeForTsquery(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 0);
}

/** Prefix tsquery for typeahead, e.g. "arch" → "arch:*", "system arch" → "system & arch:*". */
function buildPrefixTsQuery(text: string): string | null {
  const tokens = tokenizeForTsquery(text);
  if (!tokens.length) return null;
  const last = tokens[tokens.length - 1]!;
  if (tokens.length === 1) return `${last}:*`;
  return `${tokens.slice(0, -1).join(" & ")} & ${last}:*`;
}

function documentTitleExpr(): SQL {
  return sql`coalesce(d.search_title, d.title)`;
}

function buildTextMatchClause(textQuery: string): SQL {
  const containsPattern = `%${textQuery}%`;
  const prefixPattern = `${textQuery}%`;
  const prefixTsQuery = buildPrefixTsQuery(textQuery);
  const fuzzy = textQuery.length >= 4;

  const parts: SQL[] = [
    sql`d.search_vector @@ websearch_to_tsquery('english', ${textQuery})`,
    sql`${documentTitleExpr()} ILIKE ${containsPattern}`,
    sql`${documentTitleExpr()} ILIKE ${prefixPattern}`,
  ];

  if (prefixTsQuery) {
    parts.push(sql`d.search_vector @@ to_tsquery('english', ${prefixTsQuery})`);
  }

  if (fuzzy) {
    parts.push(sql`${documentTitleExpr()} % ${textQuery}`);
    parts.push(sql`coalesce(d.search_body, '') % ${textQuery}`);
  }

  return sql`(${combineSql(parts, "OR")})`;
}

function buildRankExpr(textQuery: string, hasQuery: boolean): SQL {
  if (!hasQuery) return sql`1.0::float`;

  const prefixTsQuery = buildPrefixTsQuery(textQuery);
  const parts: SQL[] = [
    sql`ts_rank_cd(d.search_vector, websearch_to_tsquery('english', ${textQuery}))`,
    sql`ts_rank_cd(d.search_vector, plainto_tsquery('english', ${textQuery}))`,
  ];
  if (prefixTsQuery) {
    parts.push(sql`ts_rank_cd(d.search_vector, to_tsquery('english', ${prefixTsQuery}))`);
  }
  if (textQuery.length >= 4) {
    parts.push(sql`similarity(${documentTitleExpr()}, ${textQuery})`);
  }

  return sql`GREATEST(${combineSql(parts, ",")})`;
}

const TITLE_HEADLINE_OPTS =
  "MaxFragments=1,MaxWords=20,MinWords=1,StartSel=<mark>,StopSel=</mark>";
const BODY_HEADLINE_OPTS =
  "MaxFragments=3,MaxWords=35,MinWords=1,StartSel=<mark>,StopSel=</mark>";

/** Pick the tsquery that best matches how the row was found (prefix, websearch, plain). */
function buildHeadlineQueryExpr(textQuery: string): SQL {
  const prefixTsQuery = buildPrefixTsQuery(textQuery);
  if (!prefixTsQuery) {
    return sql`websearch_to_tsquery('english', ${textQuery})`;
  }
  return sql`CASE
    WHEN d.search_vector @@ websearch_to_tsquery('english', ${textQuery})
      THEN websearch_to_tsquery('english', ${textQuery})
    WHEN d.search_vector @@ to_tsquery('english', ${prefixTsQuery})
      THEN to_tsquery('english', ${prefixTsQuery})
    ELSE plainto_tsquery('english', ${textQuery})
  END`;
}

function levenshteinSimilarity(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;
  const rows = al.length + 1;
  const cols = bl.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i]![0] = i;
  for (let j = 0; j < cols; j++) matrix[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  const dist = matrix[al.length]![bl.length]!;
  return 1 - dist / Math.max(al.length, bl.length);
}

/** When ts_headline finds no lexeme match (partial ILIKE / fuzzy hits), wrap text manually. */
function applyFallbackHighlight(text: string | null, query: string): string | null {
  if (!text) return text;
  const normalized = text.replace(/<\/?b>/gi, (tag) => (tag.toLowerCase() === "<b>" ? "<mark>" : "</mark>"));
  if (normalized.includes("<mark>")) return normalized;

  const q = query.trim();
  if (!q) return text;

  const qLower = q.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx >= 0) {
    return (
      text.slice(0, idx) +
      "<mark>" +
      text.slice(idx, idx + q.length) +
      "</mark>" +
      text.slice(idx + q.length)
    );
  }

  const wordRe = /\b[\w']+\b/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(text)) !== null) {
    const word = match[0];
    if (word.toLowerCase().startsWith(qLower)) {
      const start = match.index;
      const end = start + word.length;
      return text.slice(0, start) + "<mark>" + text.slice(start, end) + "</mark>" + text.slice(end);
    }
  }

  if (q.length >= 4) {
    let best: { start: number; end: number; sim: number } | null = null;
    wordRe.lastIndex = 0;
    while ((match = wordRe.exec(text)) !== null) {
      const word = match[0];
      const sim = levenshteinSimilarity(word, q);
      if (sim >= 0.45 && (!best || sim > best.sim)) {
        best = { start: match.index, end: match.index + word.length, sim };
      }
    }
    if (best) {
      return (
        text.slice(0, best.start) +
        "<mark>" +
        text.slice(best.start, best.end) +
        "</mark>" +
        text.slice(best.end)
      );
    }
  }

  return text;
}

function resolveHighlight(
  highlight: string | null,
  source: string,
  query: string,
): string | null {
  const hasMarks =
    Boolean(highlight) &&
    (highlight!.includes("<mark>") || /<b>/i.test(highlight!));
  return applyFallbackHighlight(hasMarks ? highlight : source, query);
}

export async function searchDocuments(
  db: Db,
  query: SearchQuery,
  ctx: SearchContext,
): Promise<SearchResponse> {
  const page = query.page ?? 1;
  const size = Math.min(query.size ?? 20, 100);
  const offset = (page - 1) * size;
  const textQuery = query.q?.trim() ?? "";

  if (!ctx.canSearch) {
    return { hits: [], total: 0, page, size };
  }

  const hasQuery = Boolean(textQuery);
  const hasFilters = Boolean(
    query.spaceId ||
      query.type ||
      query.authorId ||
      query.tags?.length ||
      query.from ||
      query.to,
  );
  if (!hasQuery && !hasFilters) {
    return { hits: [], total: 0, page, size };
  }

  const filters = buildFilters(query);
  const acl = aclFilter(ctx);
  const whereClause = combineSql(
    [
      sql`d.org_id = ${ctx.orgId}::uuid`,
      sql`d.status != 'trashed'`,
      sql`d.search_vector IS NOT NULL`,
      acl,
      ...filters,
      hasQuery ? buildTextMatchClause(textQuery) : sql`TRUE`,
    ],
    "AND",
  );

  const rankExpr = buildRankExpr(textQuery, hasQuery);

  const recencyExpr = sql`exp(-greatest(0, extract(epoch from (now() - coalesce(d.search_updated_at, d.updated_at))) / 86400.0 - 7) / 30.0 * ln(2))`;
  const popularityExpr = sql`ln(1 + coalesce(vc.view_count, 0))`;
  const scoreExpr = sql`(${rankExpr} * (1 + 1.5 * ${recencyExpr}) * (1 + 0.25 * ${popularityExpr}))`;

  const headlineQuery = hasQuery
    ? buildHeadlineQueryExpr(textQuery)
    : sql`''::tsquery`;

  const countRows = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM documents d
    WHERE ${whereClause}
  `);
  const total = countRows[0]?.count ?? 0;

  const rows = await db.execute<SearchRow>(sql`
    SELECT
      d.id AS document_id,
      d.slug AS document_slug,
      d.space_id,
      s.slug AS space_slug,
      d.type,
      coalesce(d.search_title, d.title) AS title,
      d.search_preview AS preview,
      coalesce(d.search_updated_at, d.updated_at) AS updated_at,
      ${scoreExpr} AS score,
      CASE
        WHEN ${hasQuery} THEN ts_headline('english', ${documentTitleExpr()}, ${headlineQuery}, ${TITLE_HEADLINE_OPTS})
        ELSE NULL
      END AS title_highlight,
      CASE
        WHEN ${hasQuery} THEN ts_headline('english', coalesce(d.search_body, ''), ${headlineQuery}, ${BODY_HEADLINE_OPTS})
        ELSE NULL
      END AS body_highlight
    FROM documents d
    INNER JOIN spaces s ON s.id = d.space_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS view_count
      FROM recently_viewed rv
      WHERE rv.document_id = d.id
    ) vc ON true
    WHERE ${whereClause}
    ORDER BY score DESC, coalesce(d.search_updated_at, d.updated_at) DESC
    LIMIT ${size}
    OFFSET ${offset}
  `);

  const hits = rows.map((row) => {
    const titleHighlight = hasQuery
      ? resolveHighlight(row.title_highlight, row.title, textQuery)
      : null;
    const bodyHighlight = hasQuery
      ? resolveHighlight(row.body_highlight, row.preview ?? "", textQuery)
      : null;

    const hit: SearchResponse["hits"][number] = {
      documentId: row.document_id,
      documentSlug: row.document_slug,
      spaceId: row.space_id,
      spaceSlug: row.space_slug,
      type: row.type as SearchResponse["hits"][number]["type"],
      title: row.title,
      highlight: {
        title: titleHighlight ? [titleHighlight] : [],
        body: bodyHighlight ? [bodyHighlight] : [],
      },
      score: Number(row.score),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
    if (row.preview) hit.preview = row.preview;
    return hit;
  });

  return { hits, total, page, size };
}

export async function suggestDocumentTitles(
  db: Db,
  q: string,
  ctx: SearchContext,
  spaceId?: string,
): Promise<string[]> {
  const textQuery = q.trim();
  if (!textQuery || !ctx.canSearch) return [];

  const acl = aclFilter(ctx);
  const spaceFilter = spaceId ? sql`AND d.space_id = ${spaceId}::uuid` : sql``;
  const containsPattern = `%${textQuery}%`;
  const prefixPattern = `${textQuery}%`;

  const rows = await db.execute<{ title: string }>(sql`
    SELECT title
    FROM (
      SELECT
        ${documentTitleExpr()} AS title,
        CASE WHEN ${documentTitleExpr()} ILIKE ${prefixPattern} THEN 0 ELSE 1 END AS prefix_rank,
        similarity(${documentTitleExpr()}, ${textQuery}) AS sim
      FROM documents d
      WHERE d.org_id = ${ctx.orgId}::uuid
        AND d.status != 'trashed'
        AND d.search_vector IS NOT NULL
        AND ${acl}
        ${spaceFilter}
        AND (
          ${documentTitleExpr()} ILIKE ${prefixPattern}
          OR ${documentTitleExpr()} ILIKE ${containsPattern}
          OR ${documentTitleExpr()} % ${textQuery}
        )
    ) ranked
    ORDER BY prefix_rank, sim DESC
    LIMIT 7
  `);

  return rows.map((row) => row.title);
}
