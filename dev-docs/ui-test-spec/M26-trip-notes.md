# M26 — Notizen (a trip's notes as threads, FR-7.13)

* **E2E-M26-01** `local` (FR-7.13) — **implemented**
  (`trip-notes.spec.ts`): the notes are a view of their own. M25 is asserted one list with no segment, on a rendered
  screen; the notes pill leads to M26, marked current, with its empty state. Two notes written from the FAB's sheet: a
  quick one is named by its first line and a titled one by its title, the newer first, and **each card shows its words**
  — the titled one's in full, the quick one's after its first line. The writer's own threads carry no checkbox (FR-7.9
  decision 4, and G-8's Local Mode). The titled thread's view makes *4711* a code chip; the quick one's links its spaced
  phone number as `tel:` with the digits alone as the href. Deleting that first note from its menu leaves its view for
  the list, and after a reload the other thread is still there.
* **E2E-M26-02** `local` (FR-7.13) — **implemented**
  (`trip-notes.spec.ts`): a thread reads top to bottom on one writer. Two replies sent from the bottom field land in the
  order written, **under** the first note; the view offers exactly one reply field (one level). The author's *Edit*,
  from the first note's menu, edits title and words in place. Back on the list the thread has moved above a newer one
  (question 1), says *2 replies* and quotes the newest reply; after a reload it is named by the new title and the entry
  says *edited*. Deleting the first note names its two replies on the menu's button and, after a reload, takes them.
* **E2E-M26-03** `server` (FR-7.9/FR-7.13, was E2E-M25-11) — **implemented**
  (`server/trip-notes.spec.ts`): a thread is new for a second member — marked *New* on the card and counted *1* on the
  notes pill's badge — and never new, nor offered *Read*, on its writer's screen (decision 4). *Read* in the thread
  clears itself, the mark and the badge; the thread's first note then says *Seen by* the reader, and only the reader
  (decision 3). A third reader's "new" surviving a second reader's tick is `noteThreads`'s unit coverage and
  `TestStampActor_NoteAckUpsertCannotStealAnotherUsersRow`, both reading only the acting reader's own row.
* **E2E-M26-04** `server` (FR-7.13) — **implemented**
  (`server/trip-notes.spec.ts`): Bob reads Alice's thread; its first note's menu offers him *Copy* and no *Edit*, his
  own reply's offers *Edit* (question 2). Alice sees his reply as new in her own thread, answers, and is offered no
  *Read* — replying is not ticking, but what she answered is behind her. Bob's pill then counts *1*, his thread is *New*
  again, the entries read *Code 4711*, *Danke!*, *Parkplatz 12* top to bottom, exactly one of them — Alice's newer reply
  — carries the unseen mark, and the divider *New since your last visit* stands right above it (question 3's rule,
  applied to a reply). Who a reply *notifies* is `TestPlanNotifications_NoteReply_ReachesTheParticipantsOnly_FR7_13`'s,
  a rule over participants a browser cannot see.
* **E2E-M26-05** `local` (FR-7.15) — **implemented**
  (`trip-notes.spec.ts`): a note names its excursion, and each side leads to the other. With one excursion on the trip,
  the new-note sheet offers exactly its chip; pressed, the note is written about it, and its card names the excursion
  where the plain note beside it names none. The thread's link opens the excursion's list, whose notes line names the
  thread and leads back into it. The author takes the link off in the edit: the words stay, the link goes, and the
  entry does not say *edited*. After a reload the excursion's list — its progress card rendered — carries no notes line.
* **E2E-M26-06** `local` (FR-7.15) — **implemented**
  (`trip-notes.spec.ts`): a deleted excursion leaves its notes as trip notes. A note written about an excursion is
  listed on the excursion's list; the excursion is deleted from its ⋮; after a reload the thread is still on M26, and
  neither its card nor its view names an excursion. That the server keeps the note while it unlinks it, and keeps a
  note whose excursion was deleted before it arrived, is `TestApplyMutation_DeletingAnExcursionKeepsItsNotes_FR7_15`'s
  and `TestApplyMutation_NoteExcursion_IsAnExcursionOfThisTrip_FR7_15`'s; that only the author changes the link,
  `TestApplyMutation_NoteExcursion_OnlyTheAuthorChangesIt_FR7_15`'s.
* **E2E-M26-07** `local` (FR-7.13) — **implemented**
  (`trip-notes.spec.ts`): the thread view heads with its title, or *Note* where it has none. An untitled quick note —
  a number and a time on one line, the seed's Pizzakurier — opens under the head *Note* with the trip as its second
  line; its words are the card's, in full, and the number occurs once on the page, none of it in the head. A titled
  thread opens under its title, its words in the card.
