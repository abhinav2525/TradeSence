/**
 * Which stocks have a Report Card: every member, past or present, of a registered
 * index (decision 0035). One SQL list of the registry's membership names, so the
 * Report Card links on Unusual activity, Top volume and Money flow agree with
 * `supportedStocks`. Bound values only, no raw SQL.
 */
import { sql } from "drizzle-orm";
import { INDICES } from "../ingest/indices";

/** `(…)` for `index_name in ${CARD_INDEX_NAMES}`: every registered index's membership name. */
export const CARD_INDEX_NAMES = sql`(${sql.join(INDICES.map((x) => sql`${x.members}`), sql`, `)})`;
