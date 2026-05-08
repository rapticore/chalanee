# Chalanee local git hooks

This directory holds repo-tracked git hooks. They are not active by default —
git only runs hooks under `.git/hooks/`. To opt into the tracked hooks,
configure git once per clone:

```bash
git config core.hooksPath .githooks
```

After that, every `git commit` runs `.githooks/pre-commit`.

## What's enforced

### `pre-commit` — author allowlist

Rejects any commit whose author email is not on the allowlist baked into the
hook (`ALLOWED_EMAILS`). To add a new author, edit the array and commit the
change.

This is a **friction layer**, not a security boundary. A motivated user can:

- `git config core.hooksPath ''` to disable repo-tracked hooks entirely.
- `git commit --no-verify` to bypass for a single commit.
- Edit the hook itself and commit the new version.

For real enforcement on a shared remote, layer GitHub-side controls on top:

- **Branch protection** on `main` requiring pull requests, review approvals,
  and signed commits (`Settings → Branches → Add rule`).
- **Required status checks**, including a CI job that runs the same
  allowlist check server-side.
- **CODEOWNERS** so PRs touching certain paths require specific reviewers.
- **Repo-level visibility** set to `private`; only the maintainer team has
  push access.

GitHub CLI commands for the impatient:

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
   --method PUT \
   --field required_signatures.enabled=true \
   --field enforce_admins=true \
   --field required_pull_request_reviews.required_approving_review_count=1
```

(Adjust to taste; needs admin scope on the repo.)
