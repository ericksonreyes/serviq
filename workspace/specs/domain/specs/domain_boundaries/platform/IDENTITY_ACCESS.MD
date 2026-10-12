# Identity & Access

### Responsibility

**Who is the user, and what are they allowed to do?**

```text
User
Role
Permission
Authentication
Authorization
Session
```

Authentication in ServIQ should use JWT-based access tokens for stateless API access.

### JWT claim shape

JWTs issued by Identity & Access should carry the canonical identity and authorization claims that services can validate locally.

Suggested claim shape:

```json
{
  "sub": "user-id",
  "tenant_id": "tenant-id",
  "username": "jane.customer",
  "display_name": "Jane Customer",
  "roles": ["Tenant Administrator", "Dispatcher"],
  "permissions": ["payout.read", "payout.execute"],
  "iss": "serviq-identity-access",
  "aud": "serviq-api",
  "exp": 1712345678,
  "iat": 1712342078,
  "jti": "token-id"
}
```

- `sub` identifies the authenticated user.
- `username` and `display_name` carry the human-facing login handle and name for display (`display_name` may be null — fall back to `username`).
- `tenant_id` scopes the user to a tenant when applicable.
- `roles` contains the canonical role names assigned to the user.
- `permissions` contains fine-grained grants used for endpoint or action checks.
- `iss`, `aud`, `exp`, `iat`, and `jti` support token validation and lifecycle control.

### Service-side validation

Each service should:

- verify the JWT signature with Identity & Access public keys or JWKS
- validate `iss`, `aud`, `exp`, and tenant scope before trusting any claims
- authorize the request using the `roles` and `permissions` claims
- reject any client-supplied role headers or body fields as a source of truth
- return `401 Unauthorized` for invalid tokens and `403 Forbidden` for insufficient access

### Roles and permissions

- use roles for coarse-grained access gates
- use permissions for finer-grained endpoint or action checks
- for sensitive actions, require both the appropriate role and permission when needed

Example:

```text
User
 │
 ├── Identity
 ├── Roles
 └── Permissions
```

It understands roles such as:

```text
Platform Administrator
Tenant Administrator
Dispatcher
Service Agent
Customer
```

But Identity & Access should not know how jobs are dispatched.

For example:

```text
Identity & Access
        │
        ▼
"Erickson has Dispatcher permission."
```

Whereas:

```text
Workforce Management
        │
        ▼
"John has AC Repair skill."
```

Those are separate concerns.
