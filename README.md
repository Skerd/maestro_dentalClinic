# dentalClinic Module (Maestro)

Server-side implementation of the Arpeggio dental clinic domain: Mongoose models, the availability engine, booking and lifecycle services, HTTP routes, reminders, data retention, emails and DTO mappers.

Contracts (types, schema-defs, validators) live in **armonia** at `armonia/src/modules/dentalClinic/`. This module implements the runtime layer.

Enable via `ENABLED_MODULES=dentalClinic` (with `core` and `finance`).

## Key rules

- Free times come from the dentist's working hours at a location, inside its opening hours, minus closures, time off and other appointments (buffers included).
- The practitioner's `bookingVersion` is written in every booking, move and time-off transaction, so one slot is never booked twice.
- A staff user linked to a practitioner sees and acts on only that practitioner's appointments.
- Patient messages name the treatment only when the clinic opts in; a daily job removes patient details after the retention period.

## Directory layout

```
dentalClinic/
├── api/dentalClinic/private/      # CRUD routes, @actions, day view, my appointments
├── api/dentalClinic/public/       # clinicStorefront (slots, book, manage)
├── database/moduleBootstrap.ts    # models, default roles
├── database/schemas/<resource>/   # models, indexes, services, snippets, views
├── domain/notifications/          # staff alerts
└── utilities/                     # services, mappers, emails, cron jobs
```
