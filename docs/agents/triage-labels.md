# Triage labels

Default vocabulary (triage skill):

| Label | Role |
|-------|------|
| `needs-triage` | New ticket, not yet triaged |
| `needs-info` | Ticket needs more information |
| `ready-for-agent` | Ticket is ready for an agent to implement |
| `ready-for-human` | Ticket needs a human decision |
| `wontfix` | Ticket will not be fixed |

With the local-markdown tracker, the label is stored as a `status:` field in each ticket's frontmatter (not a GitHub label object).
