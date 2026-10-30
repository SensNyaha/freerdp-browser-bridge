# Accepted 0.7.0 delivery

Upstream: v0.7.0, afc7f4039ee753e92b026b6bbedcd27a2be5ae41. GitHub: SensNyaha/freerdp-browser-bridge.

Push main and the annotated v0.7.0 tag with an ordinary fast-forward push. Preserve existing public history and immutable tags.

The exact accepted archives stay in the sibling release-assets folder, outside Git. After the repository/workflow exists, configure npm Trusted Publishing with owner SensNyaha, this repository and npm-publish.yml, allowing direct npm publish. Then upload the checked assets through the bootstrap release helper. No manual per-package publishing token is used by CI.

Core must be public before adapter workflows install their exact core dependencies. HTTP precedes Express. New Express-name bootstrap and the seven old 0.2.3 stages remain separate owner interactions; do not start manual approval loops automatically.

Workflow validation is distinct from the original native/compiler and actual desktop/device acceptance. A local export does not prove hosted OIDC or public availability.
