// tables.go is the one place a syncable table is declared.
//
// Per-table knowledge — the push whitelist, the write guards, the two
// partition sets, the FR-24.3 lifecycle set, the blocking references, the
// cascade switch, the master pull's visibility filter, the NFR-4.5 backup's
// query list and the API layer's mark whitelist — is declared here once (G-2). Kept as separate
// registries, a table added to four of them and missed in the fifth is not a
// build error — it is a rule that silently does not apply, which is the
// failure CODING_PRINCIPLES §4a was written after. They are all views derived
// from one `tableSpecs` map, and `tables_test.go` refuses a `Table*` constant
// without an entry.

package store

import "sort"

// partitionKind names which sync partition carries a table (Sync-API P-3).
// A mutation is only valid on its own partition's endpoint, or changes
// would leak into the wrong change feed.
type partitionKind int

const (
	// partitionTrip is one trip's feed: rows that are only ever read beside
	// the trip they belong to.
	partitionTrip partitionKind = iota + 1
	// partitionMaster is the instance-wide feed.
	partitionMaster
)

// blockingReference is one child column that refuses its parent's delete,
// i.e. a foreign key deliberately declared without ON DELETE.
type blockingReference struct {
	table  string
	column string
}

// childQuery names one child table and the query that finds its rows for a
// parent id. `?1` may repeat — an include hangs off both of its endpoints.
type childQuery struct{ table, query string }

// visibilityRule decides who may pull one row of a master-partition table
// (Sync-API §4). It is a value rather than a switch arm so that the answer
// for a table is readable beside the table's other rules; exactly one of the
// three fields is set, which `tables_test.go` asserts.
type visibilityRule struct {
	// everyone marks the instance-wide master data (FR-1.6 MVP
	// simplification — everybody sees everything).
	everyone bool
	// tripQuery resolves the row's trip id, and every member of that trip
	// may see the row. A missing row denies: its tombstone follows in the
	// feed, and a tombstone carries only the entity id.
	tripQuery string
	// ownerQuery resolves the row's owning user; nobody else sees it.
	ownerQuery string
}

// exportQuery is how the NFR-4.5 full export selects one table's rows.
// scoped queries take the requesting user's id as their single argument;
// unscoped ones are the instance-wide master data every user may pull
// anyway, so filtering them would drop rows the caller can see.
type exportQuery struct {
	query  string
	scoped bool
}

// tableSpec is everything the sync layer knows about one table. A field left
// zero is a statement — no cascade, nothing that blocks a delete, not
// retirable — and the completeness test is what keeps it a deliberate one.
type tableSpec struct {
	// partition is the feed the table's changes travel on.
	partition partitionKind
	// columns whitelists what a push may touch; everything else is rejected
	// before any SQL is built.
	columns map[string]bool
	// retirable marks the tables FR-24.3 governs: a blocked delete keeps the
	// row and stamps RetiredColumn instead of refusing.
	retirable bool
	// blockedBy lists the child columns that refuse this row's delete, i.e.
	// the foreign keys deliberately declared without ON DELETE. Only the
	// restricting ones belong here — a reference declared ON DELETE CASCADE
	// takes the child with the parent and blocks nothing, and that is what
	// cascades is.
	//
	// It exists so the refusal can be *asked for* instead of inferred from a
	// driver error string, which is not a stable contract across driver
	// versions.
	blockedBy []blockingReference
	// cascades names the child rows an FK cascade will delete, in the order
	// their tombstones must be emitted: a child before the parent it hangs
	// off, always.
	cascades []childQuery
	// visible is the master pull's filter for this table, and is set on
	// master-partition tables alone: the trip partition's whole gate is
	// membership in the trip whose endpoint was called, applied before the
	// feed is read at all.
	visible visibilityRule
	// export selects the table's rows for the NFR-4.5 backup. Every
	// syncable table has one — a backup is a promise about everything the
	// caller can see, and a table left out of it is data that survives no
	// disaster.
	export exportQuery
	// label says where an activity entry about one of the table's rows
	// finds its readable name (FR-32.1). Every table has one: an entry
	// that names nothing tells its reader nothing.
	label activityLabel
	// unlogged names the columns an activity entry leaves out: data no
	// reader of the log reads, too large to copy into every entry.
	unlogged map[string]bool
	// serverOwned is the table's part of invariant 3: the columns no client
	// may decide, stripped from every mutation and stamped back from the
	// actor (stamp.go). The zero value owns nothing.
	serverOwned serverOwned
	// guard is the table's write rule (guard.go), run after the stamp step
	// and, on the trip partition, after the trip-membership check. Never
	// left nil: a table that needs none declares `unguarded`, with why.
	guard guardRule
}

// tableSpecs (declared in tables_registry.go, split out for this file's
// size) lists every syncable table. wiregen (ADR-026) reads it as a single
// bare map literal, so it stays whole there; the derived views and their
// helpers, below, stay here.

// The views. Each is derived once at start-up from tableSpecs, so a table
// can no longer be in one and missing from another.
var (
	// syncableColumns whitelists the tables and columns the push endpoints
	// may touch; everything else is rejected before any SQL is built.
	syncableColumns = derivedColumns()
	// tripPartitionTables and masterPartitionTables are the entity sets each
	// push endpoint accepts (Sync-API P-3).
	tripPartitionTables   = derivedPartition(partitionTrip)
	masterPartitionTables = derivedPartition(partitionMaster)
	// lifecycleTables names the entities FR-24.3 governs. Everything else
	// with a blocking reference — a series, a traveler, a container — keeps
	// refusing its delete: those are not history the way a master item is,
	// and a retired traveler would be a person nobody can see attached to
	// rows everybody can.
	lifecycleTables = derivedRetirable()
	// blockingReferences lists, per deletable table, the references that
	// keep a row alive.
	blockingReferences = derivedBlockers()
)

// TableHasMark reports whether table carries the FR-28.1 item mark. The API
// layer asks rather than keeping a second list: the mark is a column, and
// which tables have it is already stated once, above.
func TableHasMark(table string) bool {
	return tableSpecs[table].columns[MarkColumn]
}

// exportTables returns the NFR-4.5 backup's tables in a stable order, so a
// failing export names the same table on every run.
func exportTables() []string {
	out := make([]string, 0, len(tableSpecs))
	for table := range tableSpecs {
		out = append(out, table)
	}
	sort.Strings(out)
	return out
}

func derivedColumns() map[string]map[string]bool {
	out := make(map[string]map[string]bool, len(tableSpecs))
	for table, spec := range tableSpecs {
		out[table] = spec.columns
	}
	return out
}

func derivedPartition(kind partitionKind) map[string]bool {
	out := map[string]bool{}
	for table, spec := range tableSpecs {
		if spec.partition == kind {
			out[table] = true
		}
	}
	return out
}

func derivedRetirable() map[string]bool {
	out := map[string]bool{}
	for table, spec := range tableSpecs {
		if spec.retirable {
			out[table] = true
		}
	}
	return out
}

func derivedBlockers() map[string][]blockingReference {
	out := map[string][]blockingReference{}
	for table, spec := range tableSpecs {
		if len(spec.blockedBy) > 0 {
			out[table] = spec.blockedBy
		}
	}
	return out
}
