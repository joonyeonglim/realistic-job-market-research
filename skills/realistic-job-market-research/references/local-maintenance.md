# Updates and Local Changes

Version **1.3.0** includes the simple entrypoint and internal evidence checks
developed against public v1.2.0. Earlier `1.2.1-local.20261109` and
`1.2.2-local.20261109` installations were local working revisions of this change.
Detailed execution lives in [agent workflow](agent-workflows.md).

Before updating an installation, compare any local edits with the public source
and preserve its diff. An installer may replace the canonical skill directory;
an installed-skill lock alone does not prove unmodified local content. Preserve
private candidate profiles outside the public skill and verify the installed
files and discovery links after updating.

Skill maintenance does not itself authorize repository push, package publication,
browser activity or changes to private candidate profiles.
