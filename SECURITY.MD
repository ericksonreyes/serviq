# Security Policy

## Scope

ServIQ is a local-development proof-of-concept / portfolio project. It is not intended for
production deployment, and its default configuration (documented credentials, `exp`-only JWT
fallback posture, disabled TLS between containers) reflects that scope.

## Reporting a Vulnerability

If you find a security issue — in the architecture documentation, the example configuration,
or the code — please report it privately rather than opening a public issue:

- Open a [GitHub Security Advisory](../../security/advisories/new) on this repository, or
- Contact the maintainer listed on the repository profile.

Please include: the affected file/component, reproduction steps or evidence, and the impact
you believe it could have.

## Notes for reviewers

Known, documented postures (not vulnerabilities):

- `JWT_SECRET` is a local/test fallback only; RS256 keypair is the real mechanism
- `exp`-only token validation when Redis is absent — deliberate, documented (ADR-0007)
- `serviq`/`serviq` local container credentials — development defaults only, never
  production values
- AI Agent has no database access by design (ADR-0003)
