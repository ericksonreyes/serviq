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
