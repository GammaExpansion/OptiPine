# Leaderboard (R1 / G4)

`LeaderboardPanel` owns the heading, body and footer. `usePageCapacity` observes the body and its
rendered rows. It subtracts the desktop table header, any horizontal scrollbar and collapsed
border slack, then floors the available height divided by the tallest row. Capacity is clamped
to 5–100; the desktop split reserves enough height for five complete rows and the panel's chrome.
Phone cards use their own measured height, with 44 px minimum touch targets. Cards share the
tallest height encountered for their width, language and result, avoiding page-size changes from
shorter cards on a later page. A width, language or result change releases that minimum.

The observer debounces for 150 ms, including pane drags, viewport changes and wrapping headings.
Hidden or empty bodies retain the previous capacity. It disconnects and cancels pending work on
unmount. `ViewSettings.pageSize` is the single source of truth: `OptimizationSession.setPageSize`
preserves the explicit selection's rank, otherwise the previous first visible rank. The default
before measurement is ten. New runs retain capacity and open their first page.

The analysis Worker supplies ranking and metric columns. The existing `optimize-views` functions
slice those columns using the current capacity for the table, cards, footer, scatter highlighting
and draft filter preview. Map and summary selections open the matching page. A changed capacity
requests one view after settling; ordinary page flips use the cached ranking. Neither operation
reruns the optimization or Top 20 curves, and live snapshots keep their existing 250 ms cadence.

Unit tests cover measurement, debounce/cleanup, shared page boundaries and anchored resizing.
`e2e/leaderboard-layout.spec.ts` checks 1440 × 900, 1440 × 1200, minimum pane height and phone
cards with a real Worker run; it writes the three reference screenshots to `test-results/`.
