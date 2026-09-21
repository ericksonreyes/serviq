# ServIQ Documentation Governance

This file guides documentation-oriented work in the ServIQ repository.

## Canonical Sources

- Use `workspace/specs/GLOSSARY.MD` as the source of truth for shared vocabulary.
- Use `workspace/specs/domain/specs/DOMAIN_BOUNDARIES.md` for the high-level domain model and bounded-context map.
- Use `workspace/specs/technical/README.MD` for engineering disciplines, architecture principles, and quality attributes.
- Use `workspace/specs/technical/user_experience/README.MD` for UX guidance.

## Repository Layout and Service Map

- Use `services/` for the application code repositories and service implementations.
- Use `SERVICE_MAP.md` as the canonical inventory/map of services in the repository.
- Keep each service entry in `SERVICE_MAP.md` aligned with its directory under `services/`.
- When a service is added, renamed, moved, or removed, update `services/` and `SERVICE_MAP.md` in the same change.
- Prefer a simple per-service record with `name`, `description`, and `location` fields.

Example service-map entry format:

```md
- name: Customer Portal
  description: Customer Portal PWA
  location: services/serviq-customer-portal-pwa/

- name: Customer Portal BFF
  description: Customer Portal Backend For Frontend
  location: services/serviq-service-provider-portal-bff/
```

## Documentation Structure

- Prefer one canonical file per topic.
- Use `README.MD` files as folder index pages.
- Keep index pages high level and move detailed content into dedicated markdown files.
- Use compatibility stubs only during migration, and remove them once all references are updated.
- When a document is moved or renamed, update every inbound and outbound link in the same change.

## Vocabulary Rules

- Prefer the canonical term in the glossary over older or competing terms.
- If a document needs an alternate or historical term, note it explicitly rather than mixing terms casually.
- Update the glossary whenever a new cross-cutting term is introduced or an existing term is renamed.

## Link and Consistency Rules

- Prefer relative links that resolve from the file location.
- Verify new links after edits, especially when folders move or are renamed.
- Keep terminology consistent across root, domain, and technical documentation.
- Add new cross-cutting documents to the main index pages so they remain discoverable.

## Review Checklist

- Confirm the target file exists.
- Confirm the link paths are correct from the file location.
- Confirm the terminology matches the glossary.
- Confirm temporary migration notes or stubs are removed when they are no longer needed.
