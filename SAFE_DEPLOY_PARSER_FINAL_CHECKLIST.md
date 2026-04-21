# Safe Deploy Parser Final Checklist

## Run status

Blocked by missing required environment variables at Step 1 (`DATABASE_URL`, `DIRECT_URL`).

Per instructions, work stopped immediately before parser hardening and before any Prisma command execution.

## Checklist

- [ ] Pending migration parsing fixed
- [ ] Failed migration parsing fixed
- [ ] Connectivity errors classified
- [ ] Unknown output classified
- [ ] Pre-resolve spam removed or narrowed
- [ ] Validation commands executed

## Next step

Set both required env vars in this runtime and rerun the task from the top.
