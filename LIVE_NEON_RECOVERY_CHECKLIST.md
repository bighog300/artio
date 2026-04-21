# Live Neon Recovery Checklist

- [x] 1. create audit/checklist files
- [ ] 2. inspect Prisma status
- [ ] 3. inspect `_prisma_migrations`
- [ ] 4. inspect partial schema state
- [ ] 5. decide if rolled-back resolve is safe
- [ ] 6. recover if safe
- [ ] 7. rerun deploy
- [ ] 8. verify safe-deploy behavior
- [x] 9. report (safe-stop due to missing required env vars)

## Blocker
`DATABASE_URL` and `DIRECT_URL` are missing in this environment, so live Neon recovery cannot safely proceed.
