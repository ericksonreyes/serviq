# Service Agent BFF (:3001)

Aggregation edge — `/agents/{id}/home` fans out to workforce + dispatch +
field-service with the caller's JWT forwarded. No read model by design.
Express for the POC (see portal BFF note).
