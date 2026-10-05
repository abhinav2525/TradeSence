# docs/proposals

Proposals and reviews written by the two advisor agents in `.claude/agents/`: **quant-advisor**
(indicators, studies, screen content) and **lead-engineer** (architecture, data model,
pipelines, engineering roadmap), in plain language for the owner. This is the only place
those agents may write.

A proposal is not a decision. The owner picks; the technical lead then writes the spec and plan
(`docs/superpowers/`) and the normal build-review-merge path follows. A study proposal here
fixes its pass/fail rules in advance, exactly like a study spec; once a study runs, its rules
are frozen (see root `CLAUDE.md`, "docs/research").

Files: `YYYY-MM-DD-<topic>.md`. Ask for one with "ask the quant advisor to …" in a session,
or run the agent directly.
