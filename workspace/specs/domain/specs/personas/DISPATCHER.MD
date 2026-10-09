# Dispatcher

**Example:** Lisa — QuickFix Dispatcher

Lisa handles the **day-to-day operational workflow**.

A customer requests:

> "My washing machine isn't working."

Lisa sees the service request and:

1. Reviews the request
2. Checks the customer's location
3. Checks available technicians
4. Schedules the appointment
5. Assigns a Service Agent
6. Monitors the job
7. Handles rescheduling/reassignment if necessary

```text
Customer
   │
   │ Service Request
   ▼
Dispatcher
   │
   │ Assignment
   ▼
Service Agent
```

This is potentially one of the most interesting parts of ServIQ from an engineering perspective.