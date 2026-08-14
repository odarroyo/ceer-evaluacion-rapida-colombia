# GitHub repository controls

Configure these controls before public visibility:

- Enable secret scanning, push protection, Dependabot alerts and updates, and
  private vulnerability reporting.
- Give review permission to at least two maintainers and require pull requests
  for `main`.
- Require one maintainer approval, passing `secrets`, `application`, and
  `database` checks, resolved conversations, and dismissal of stale approvals.
- Block force pushes and branch deletion. Do not allow bypass except through a
  documented emergency procedure.
- External contributors work through forks. Preview deployments from forks are
  manually authorized and never receive staging secrets automatically.
- Review every GitHub Action SHA before updating it. Dependabot proposals do not
  replace maintainer review.

If the rights gate in `RIGHTS_CHECKLIST.md` is incomplete, create or retain the
repository as private with named collaborators. Public visibility is a separate,
explicit release decision and must not rewrite history.
