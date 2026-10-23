# Iteration 453 — aligned 0.2.5 preparation

The separate **release/0.2.5** branch inherits the verified standalone prototype
and guarded delivery tooling. Shared master and all existing stable tags remain
unchanged. Version 0.2.5 is not accepted or publicly published yet.

All ten workspace/root manifests and native CMake product version now read
0.2.5. Package README commands select the aligned candidate versions while the
root overview preserves the actual public stable 0.2.4/history. The version guard,
all ten public npm README guards and complete recursive TypeScript build pass.
No dependency or wire-schema version is advanced; FreeRDP remains 3.32.1 at
`bf217a504e54cc719880c228e82353382cd7d4fa`.

The production installer locks still name the accepted 0.2.4 archives at this
checkpoint. They cannot be updated truthfully before the new native/JS archive
hashes exist. No synthetic hash or relabelled 0.2.4 binary is substituted, and
the final full suite is not claimed with those pending inputs.

Next compile new native 0.2.5 workers against the already validated exact SDKs,
run fresh native CTest, produce exact package archives and update the locks from
their bytes/metadata. Then run full checks, external consumers, candidate CI
upgrade and actual lab profiles before stable tagging/publication.
