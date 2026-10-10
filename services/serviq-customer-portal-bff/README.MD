# Customer Portal BFF (:3000)

Customer read side — MongoDB `portal_requests`/`portal_jobs` folded from
`Request.*|Job.*|Assignment.*` by the `-consumer` projector. Verify-only
JWT (IAM JWKS). NOTE: plain Express (not NestJS) — deliberately thin BFF;
porting to Nest keeps this API shape.
