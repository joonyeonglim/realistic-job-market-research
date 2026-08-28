# 29-Source Registry

This is the baseline of row-producing channels from the reference census. Counts are deliberately absent:
every run derives them. The public collector uses no browser. Only the
main session may use an owner-configured browser profile, and only for authenticated or personalized surfaces.

| Source key | Declared scope template | Owner | Target completeness |
|---|---|---|---|
| `career` | named AI/LLM/Agent/RAG public API queries | public collector | `complete_query` |
| `catch` | named AI/LLM/Agent/RAG public API queries | public collector | `complete_query` |
| `gojobs` | date-bounded AI/인공지능 title queries | public collector | headline/detail conflict → `partial` |
| `groupby` | public AI job category | public collector | `complete_surface` |
| `gyeonggi_public` | current AI/인공지능 public-job queries | public collector | `complete_query` |
| `himalayas` | named global AI/LLM/Agent/RAG queries | public collector | provider gap → `partial` |
| `incruit` | named AI/LLM/Agent query pages | public collector | `complete_query` |
| `jac_korea` | all exposed Korea technology/AI listings | public collector | `complete_surface` |
| `job_alio` | current in-progress named AI queries | public collector | `complete_query` |
| `jobaba` | full AI·big-data category pages | public collector | `complete_surface` |
| `jobkorea` | named public query pages | public collector | `complete_query` |
| `jobplanet` | publicly indexable job rows | public collector | normally `partial` |
| `jumpit` | named technology-tag pages | public collector | `complete_query` |
| `linkedin` | public guest query cards only | public collector | normally `partial` |
| `nst` | full recruitment board history | public collector | `complete_surface` |
| `onest` | all announcements returned by public API | public collector | `complete_surface` |
| `official_ats` | named official ATS and company-career URLs frozen for the run | public collector | normally `partial` |
| `peoplenjob` | publicly exposed search pages | public collector | normally `partial` |
| `rallit` | complete active public listing | public collector | `complete_surface` |
| `remember` | personalized surfaces plus declared searches | main Chrome only | normally `partial` |
| `remoteok` | declared public AI feed | public collector | `complete_surface` |
| `robert_walters` | public Korea listings plus declared targeted queries | public collector | `complete_query` |
| `rocketpunch` | publicly indexable search rows | public collector | normally `partial` |
| `saramin` | named public query pages | public collector | `complete_query` |
| `seoul_jobs` | named AI queries within Seoul | public collector | `complete_query` |
| `seoul_public` | all-history AI/인공지능 title queries | public collector | `complete_query` |
| `wanted` | current public Korea all-site listing | public collector | `complete_surface` |
| `weworkremotely` | declared public AI/Agent/RAG searches | public collector | provider mismatch → `partial` |
| `work24` | named integrated-search queries and exposed pages | public collector | mirror/pagination coverage gap → `partial`; posting conflicts stay separate |

## Registry rules

1. Before a run, materialize each selected row with exact queries, URLs, page size, termination evidence,
   owner, and expected completeness. A template is not collection evidence.
2. A public collector that hits login/CAPTCHA/403 stops and returns `blocked`; it does not open a browser,
   bypass the challenge, or reuse an undeclared snapshot.
3. Main Chrome collection is read-only. Owner handles login; no credentials are recorded.
4. A source with zero recovered job rows remains in coverage metadata with its failure evidence. Do not add a
   placeholder job to make it appear in the table.
5. Posting status conflict is a row fact, not source completeness. Keep its evidence separate from coverage.
6. New channels may be appended with the same contract. Do not rename a source key after snapshots exist.

Known zero-row blocked channels (for coverage metadata, not the 28-row ledger): Wellfound, Welcome to the
Jungle/Otta login shell, Indeed, Glassdoor, and OKKY when their public route is blocked. Re-test only in a new
run; never carry a historical `blocked` claim forward as current proof.
