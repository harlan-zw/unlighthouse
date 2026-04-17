# Next

## Highest Priority

- [x] Replace `/api/scan/cancel` cluster shutdown with a non-destructive cancel/reset flow
- [x] Add scan failure broadcasting so the progress page can reliably enter an `error` state
- [x] Test repeated start -> cancel -> rescan cycles and fix any stale worker state that remains

## UX Follow-ups

- [x] Improve the copy and recovery options when a scan is already in progress
- [x] Decide whether cancelled scans should keep partial results available
- [x] Tighten empty-state and no-history transitions across onboarding, history, and scan redirects

## Documentation

- [x] Keep route docs aligned with the smart `/` entry model
- [x] Update any remaining references that imply `/` is the results homepage
