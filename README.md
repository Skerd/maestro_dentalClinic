# dentalClinic Module (Maestro)

Server-side implementation of the Arpeggio dental clinic domain: Mongoose models, the availability engine, booking and lifecycle services, HTTP routes, reminders, data retention, emails and DTO mappers.

Contracts (types, schema-defs, validators) live in **armonia** at `armonia/src/modules/dentalClinic/`. This module implements the runtime layer.

Enable via `ENABLED_MODULES=dentalClinic` (with `core` and `finance`).
Requires `HEALTH_DATA_MASTER_KEY` (base64, 32 bytes; `environment.validator.ts`): medical histories and the X-rays and photos patients upload are stored encrypted (SEC-06, D102).

## Key rules

- Free times come from the dentist's working hours at a location, inside its opening hours, minus closures, time off and other appointments (buffers included).
- The practitioner's `bookingVersion` is written in every booking, move and time-off transaction, so one slot is never booked twice.
- A staff user linked to a practitioner sees and acts on only that practitioner's appointments.
- Patient messages name the treatment only when the clinic opts in; a daily job removes patient details after the retention period.
- A patient reviews a completed appointment once, from the emailed manage link (`POST /api/dentalClinic/clinicStorefront/manage/review`); it shows under their first name and last initial once staff publish it (`/api/dentalClinic/clinicReview` `publish`/`unpublish`). Staff never write or change a review: the panel create is refused (`clinic_review_written_by_patient_only`) and its words are not writable. The site reads the published ones (`/clinicStorefront/reviews`) and the portal's treatment cards show the clinic's average (D178).

## Directory layout

```
dentalClinic/
├── api/dentalClinic/private/      # CRUD routes, @actions, day view, my appointments
├── api/dentalClinic/public/       # clinicStorefront (slots, book, manage, reviews)
├── database/moduleBootstrap.ts    # models, default roles, onAccountVerified (a verified account claims its guest appointments, P23.9)
├── database/schemas/<resource>/   # models, indexes, services, snippets, views
├── domain/notifications/          # staff alerts
├── utilities/                     # services, mappers, emails, cron jobs
└── workflows/                     # guestAppointmentClaim (appointments + folder + membership)
```

## Kafka

Every patient email goes through its own Kafka topic, one per kind, so it survives a restart and is retried (D188, BE-10). Kafka is optional: when core `publishEvent` returns `false` the email is sent in-process instead (`utilities/emails/patientEmailDispatch.ts`, called by `notifyPatient`, `notifyInquiryPatient` and `notifyRequestSent`).

| Topic keys (`KAFKA_TOPIC_<key>`, `KAFKA_CONSUMER_GROUP_<key>`) | Emails |
|---|---|
| `DENTAL_APPOINTMENT_{REQUESTED,CONFIRMED,RESCHEDULED,CANCELLED,REMINDER}_EMAIL` | Appointment emails (the reminder's text message is still sent in-process) |
| `DENTAL_INQUIRY_{REQUEST_SENT,INFO_REQUESTED,CLINIC_MESSAGE,DECLINED,QUOTE_RECEIVED,PLAN_ACCEPTED,DEPOSIT_PAID,TRIP_PLANNED}_EMAIL` | Estimate-request emails to portal patients |

`startDentalClinicKafkaConsumers` (`kafka/kafkaConsumer.ts`) runs one consumer per topic. Its 26 variables are required while Kafka is on, next to `HEALTH_DATA_MASTER_KEY` (`environment.validator.ts`).
