# AGY CLI Notes

## CLI Availability
- Command checked: `agy --version` and `agy --help`
- Output: `bash: agy: command not found`
- Status: `agy` CLI is not installed on this host environment.

## Headless Adapter Notes & Known Flags (Reference)
Based on Antigravity adapter specifications:
- The daemon (`hubd`) invokes the CLI in headless mode to complete assigned tasks within a git worktree.
- Anticipated execution structure:
  - Non-interactive mode
  - Model selection flag (e.g. `--model <name>`)
  - Target workspace directory / worktree isolation
  - Sandbox permissions flag (e.g. `--strict` or restricted bash/fs tools; avoid passing auto-approve `--yolo` unless explicitly configured)
- Verification step: Once `agy` is installed on a member laptop, run `agy --help` to document exact flag syntax prior to implementing milestone M4 (`packages/daemon`).
