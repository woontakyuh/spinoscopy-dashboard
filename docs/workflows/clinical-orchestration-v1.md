# Clinical Workflow Orchestration v1

## Purpose
Create a practical, low-friction workflow for 센터장님's clinical work, with the dashboard acting as the front door and specialized agents handling specific lanes.

## Core division
- Elon: patient-facing clinical work
  - outpatient triage
  - charting support
  - patient data organization
  - surgery prep / postop summaries
  - follow-up lists and reminders
- Brian: research / academic work
  - paper reading
  - study design
  - writing support
  - reviewer/editor work
  - conference abstracts and slides

## Execution model
- Mac mini / dashboard = orchestration and memory
- Windows PC (via WSL2 Hermes) = Elon execution node
- Research work can stay on the dashboard or a separate Hermes profile later

## Clinical workflow by stage

### 1) Before clinic
Inputs:
- schedule
- patient list
- prior surgery history
- PROMs / note history / imaging flags

What Elon should prepare:
- 1-line patient summary
- red flags / priority patients
- what needs confirmation today
- likely next action: observe / image review / surgery discussion / follow-up

### 2) During clinic
Goal:
- reduce cognitive load
- standardize decision capture

For each patient, collect:
- chief complaint
- level / diagnosis
- neuro status
- prior treatment response
- today’s plan
- follow-up interval
- surgery candidate? yes/no/maybe

### 3) After clinic
Elon should:
- turn notes into structured charting draft
- tag patients needing follow-up
- mark surgical candidates
- create a short “important cases” list
- save any reusable pattern into memory

### 4) Surgery workflow
Before surgery:
- case brief
- indication
- level/approach
- risk points
- required documents / imaging checklist

After surgery:
- op note draft
- postop summary
- discharge instruction draft
- follow-up plan
- complication watchlist
- if teachable case, flag for Brian later

### 5) Follow-up workflow
- list patients due soon
- identify missing PROM / imaging / symptom update
- separate stable vs concern vs escalation
- convert unresolved cases into next clinic priority

## Research workflow by stage

### Brian should handle:
- paper triage
- literature summaries
- study idea bank
- draft outlines
- response to reviewers
- editor/reviewer notes
- abstract → slide → manuscript pipeline

## Operational rules
- Read-only queries: auto
- Draft creation: auto
- External side effects: approval required
- If a task is ambiguous, ask one short question only
- Keep responses short unless the task is complex

## Daily operating rhythm

### Morning
- today’s schedule
- patient load preview
- surgery / clinic priority list
- urgent follow-ups

### After clinic
- finalize charting
- update follow-up list
- flag cases worth research or teaching

### Evening
- remaining admin
- research queue
- next-day prep

## Windows Hermes node behavior
- Windows machine runs Hermes as the Elon node
- It should only handle clinical lane tasks
- It should not become the general brain of the system
- All memory / routing should still flow through the central dashboard

## Next implementation steps
1. Wire the Windows Hermes node to the same command taxonomy
2. Add a clinical task queue for Elon
3. Add a research task queue for Brian
4. Create one-click templates for clinic, surgery, follow-up, and research notes
5. Add approval gates for external writes
