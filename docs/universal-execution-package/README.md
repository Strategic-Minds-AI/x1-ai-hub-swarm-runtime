# X1 Universal Execution Package
Version 2026-10-12. Canonical system X1 Operating System; historical system Digital Dominance.
Read 00_Source_Truth/MASTER_EXECUTION_PROMPT.txt first. Preserve approved existing source/design and restore fresh account evidence. This package contains operating instructions, reusable build-document contracts, a deterministic manifest/packet compiler, schemas, examples, validation and provider handoff requirements. It contains no credentials or new design assets.
Run: python3 tools/x1_packet.py validate examples/project.preview.json
Generate a packet: python3 tools/x1_packet.py generate examples/project.preview.json /absolute/new/output
Validate package hashes: python3 tools/verify_package.py .
Run regression: python3 -m unittest discover -s tests -v
The included compiler creates build packets and provider plans; it does not itself call provider APIs or deploy websites. Live execution must use existing verified X1 adapters and supervisor. References marked UNKNOWN require resolution; no generic template may be substituted. Native GPT/plugin installation and provider activation are separate from copying this package.
Folder order: 00_Source_Truth, 01_Builder_Docs, 02_Active_Builds, 03_Bridge_Receipts, 04_Social_Systems, 05_Client_Delivery, 06_Governance. Do not overwrite old system files. Reuse authorized existing integration skills at runtime; account credentials are not portable with a ZIP.
