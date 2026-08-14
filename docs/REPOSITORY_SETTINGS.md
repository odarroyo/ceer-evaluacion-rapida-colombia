# GitHub repository controls

Configure these controls before public visibility:

- Enable secret scanning, push protection, Dependabot alerts and updates, and
  private vulnerability reporting.
- Keep `odarroyo` as the sole maintainer and require pull requests for `main`.
- Require zero external approvals while there is only one maintainer. The
  maintainer reviews the complete diff and passing checks before merging.
- Require passing `secrets`, `application`, and `database` checks and resolved
  conversations. If another maintainer is added later, require one approval and
  dismissal of stale approvals.
- Block force pushes and branch deletion. Do not allow bypass except through a
  documented emergency procedure.
- External contributors work through forks. Preview deployments from forks are
  manually authorized and never receive staging secrets automatically.
- Review every GitHub Action SHA before updating it. Dependabot proposals do not
  replace the maintainer's review.

If the rights gate in `RIGHTS_CHECKLIST.md` is incomplete, create or retain the
repository as private with named collaborators. Public visibility is a separate,
explicit release decision and must not rewrite history.
