# Personas

                    ServIQ Platform
                          │
                 Platform Administrator
                          │
              ┌───────────┴───────────┐
              │                       │
        Service Provider         Customers
              │
       Tenant Administrator
              │
        ┌─────┴──────────┐
        │                │
    Dispatcher      Service Agents
        │                │
        └───────┬────────┘
                ▼
          Service Jobs

| Persona                    | Description                                                                                                                                                       |
|----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Platform Administrator** | Manages the overall ServIQ platform, including tenants, platform configuration, subscriptions, financial oversight, and platform-wide operations.              |
| **Tenant Administrator**   | Manages a specific service provider/business within ServIQ, including users, services, settings, financial reporting, and operational configuration.           |
| **Service Provider**       | A business or organization that offers services through ServIQ, such as a logistics company, appliance repair company, cleaning service, or installation company. |
| **Dispatcher**             | Coordinates service operations by scheduling jobs, assigning service agents, monitoring active jobs, and handling operational exceptions.                         |
| **Service Agent**          | The person who performs the actual service in the field—such as a delivery rider, driver, technician, installer, repair specialist, or field worker.              |
| **Customer Support**       | Handles a Service Provider's support cases, complaints, escalations, and refund decisions.                                                                       |
| **Customer**               | An individual or organization that requests and receives services through the platform.                                                                           |

## Example: "QuickFix Appliance Services"

Imagine **QuickFix Appliance Services** is a company using ServIQ.

```text
                         SERVIQ
                           │
                 Platform Administrator
                           │
              ┌────────────┴────────────┐
              │                         │
        QuickFix Tenant            Other Tenants
              │
       Tenant Administrator
              │
        ┌─────┴─────┐
        │           │
    Dispatcher   Service Agents
                    │
             ┌──────┼──────┐
             │      │      │
           John    Maria   Pedro
          Tech.    Tech.   Tech.
                    │
                    │
                 Customers
                    │
             ┌──────┼──────┐
             │      │      │
           Alice   Bob    Carlos
```

## Persona Details

See individual persona files for detailed definitions:

- [Platform Administrator](personas/PLATFORM_ADMINISTRATOR.MD)
- [Service Provider](personas/SERVICE_PROVIDER.MD)
- [Tenant Administrator](personas/TENANT_ADMINISTRATOR.MD)
- [Dispatcher](personas/DISPATCHER.MD)
- [Service Agent](personas/SERVICE_AGENT.MD)
- [Customer Support](personas/CUSTOMER_SUPPORT.MD)
- [Customer](personas/CUSTOMER.MD)

---

# The important relationships

The relationships are:

| Relationship                                  | Responsibility                           |
|-----------------------------------------------|------------------------------------------|
| **Platform Administrator → Service Provider** | Onboard and manage tenants               |
| **Tenant Administrator → Service Provider**   | Manage the business's ServIQ environment |
| **Tenant Administrator → Dispatcher**         | Manage operational staff and permissions |
| **Dispatcher → Service Agent**                | Assign and coordinate jobs               |
| **Dispatcher → Service Job**                  | Schedule, assign, monitor and reassign   |
| **Service Agent → Service Job**               | Execute the actual service               |
| **Customer → Service Request**                | Request and track services               |
| **Service Provider → Customer**               | Provide services                         |
| **Service Provider → Service Agent**          | Employ/contract/manage field workforce   |

### The key architectural idea

A **Service Provider owns the business operation**.

```text
Service Provider
       │
       ├── Users
       │    ├── Tenant Admin
       │    └── Dispatcher
       │
       ├── Service Agents
       │
       ├── Services
       │
       ├── Service Areas
       │
       ├── Customers
       │
       └── Service Jobs
```

While the **Platform Administrator sits above the tenant boundary**:

```text
                ServIQ
                   │
       ┌───────────┼───────────┐
       │           │           │
   QuickFix     CleanCo    FastDelivery
       │           │           │
     Tenant       Tenant      Tenant
       │           │           │
     Users       Users       Users
     Agents      Agents      Agents
     Jobs        Jobs        Jobs
```

That gives ServIQ a foundation for demonstrating **multi-tenancy + RBAC + domain-driven design**.

One resolved modeling decision: **Customers belong to a Service Provider.** A signed-up customer is scoped to one
tenant — the same person using two Service Providers is two distinct customer records. This keeps tenancy and data
ownership simple and matches the tenant-scoped identity model.