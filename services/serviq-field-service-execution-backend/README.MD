# Field Service Execution Backend (:8017)

The agent's work loop. `Assignment.Accepted` opens an execution; the agent
checks in, uploads evidence (files land in MinIO `serviq-evidence`,
structured record in `evidence`), and advances workflow steps by emitting
`Execution.StepStarted/StepCompleted` — Service Job consumes those to
mutate the authoritative `workflow_instance` (last step closes the job).

Evidence store is a port: `Storage::disk('s3')` against MinIO
(`AWS_ENDPOINT`, path-style). Consumes `Assignment.*`, `Job.*`.
