# Verify recipe

Written and maintained by `gutix:verify`. Every command here was run successfully on the date below; fix it here when
it drifts.

Last checked: YYYY-MM-DD

## Checks
| Check | Command | Time | Notes |
| --- | --- | --- | --- |
| Build / compile | | | |
| Lint / format | | | same as CI |
| Unit, all | | | |
| Unit, one test | | | e.g. `-Dtest=Class#method`, `vitest run path -t name` |
| Integration | | | local deps it needs |
| e2e | | | e2e-repo scenario(s) that cover this repo |

## Local dependencies
How to start what the tests need (DB, Redis, Testcontainers, docker compose) and how to stop it.

## By hand
User flows no automated check covers, and how to try them locally (URL, seed user from the fixtures).

## Limits
What cannot run here and why (secrets, cloud resources, OS). Known flaky tests.
