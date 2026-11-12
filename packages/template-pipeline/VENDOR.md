Official ylwlceo/template-pipeline snapshot for viral-templates vendoring.
HEAD tree: 5a681526f228cff603ad650737c9ce54fa2c3cf8
Verify every listed file against MANIFEST-sha.txt (git blob SHA-1).
This archive omits cli.ts, ingest/*, pack/io.ts, and vision/openai.ts on purpose:
those are pulled in by official src/index.ts and are not safe for a Pages worker.
Do not import official dist/index.js from the worker. Add a site entry instead.
Do not rewrite these TypeScript sources or the Tiny Desk pack.json.
