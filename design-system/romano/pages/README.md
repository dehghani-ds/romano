# Page overrides

Files here override `../MASTER.md` **for one page only**.

Create `<route-name>.md` (for example `admin-orders.md`) when a single screen
genuinely needs to deviate — a denser spacing scale for a data table, a
different hero treatment on a marketing page. State only the deltas; everything
unstated still comes from the master file.

Before building a screen:

1. Read `../MASTER.md`.
2. Check whether `<page-name>.md` exists here. If it does, its rules win.

Regenerate or extend the system with the installed skill:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" \
  --design-system --persist -p "Romano" --page "<page-name>"
```

Nothing lives here yet — every screen currently follows the master file.
