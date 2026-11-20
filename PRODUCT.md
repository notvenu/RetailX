# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, TypeScript) + Tailwind CSS v4 + Auth.js (credentials, identifier = email/phone/username) + Lucide icons + Anthropic SDK for AI roles. Hand-built SVG charts and a TypeScript forecasting engine; no chart or ML libraries. Data lives in a server-side JSON store (`src/lib/db.ts`).

## Users

- **Owner** of a micro, small or medium business: signs up, runs onboarding, shapes the workspace, and works with the AI leadership team.
- **Team members** (manager, accountant, staff, or custom roles): sign in with their own email, phone or username, which carries their role; see only what that role can open.

## Product Purpose

A service for MSMEs: sign up, describe the business, and get a workspace built around it (modules, KPIs, forecasts, analytics, automations, AI roles), all customisable afterwards. Success is an owner going from sign-up to recorded data, trustworthy KPIs and useful AI coaching without configuration help.

## Positioning

Not a generic ERP and not a dashboard bolted onto spreadsheets. Industry presets get a business to a working system in minutes; everything stays editable. The AI leadership team (CFO, COO, CTO, Head of People, GM, or custom roles) coaches from the business's own numbers and acts only within the autonomy the owner grants.

## Capabilities and Constraints

- 14 industries with categories; category-specific fields (expiry for pharmacies, sizes for apparel), location fields for multi-branch businesses.
- 18 module templates plus custom modules and fields; quick entry, CSV import/export.
- KPI library (~55) and a formula builder over any module's fields with filters; targets; like-for-like comparison while a period is in progress.
- Forecasting: 10 models, rolling-origin back-test, intervals, scenarios, configurable grain/horizon/season/model.
- Analytics: KPI register, drill-down, driver analysis, breakdowns, robust anomaly detection.
- AI roles with mandate, KPIs, tone and autonomy (advise/draft/act); tools to read the books, create tasks, draft or enable automations, set targets. Rule-based briefings without an API key.
- Automations on record save, schedule or KPI threshold; tasks for people or AI roles.
- Theme (accent, dark mode, density, font, corners, sidebar side) and a drag-and-resize dashboard.

## Product Principles

1. Figures before charts: state the number and its variance first.
2. Every figure traces to recorded transactions; AI never invents numbers.
3. Forecasts show their back-test error and say when they are no better than naive.
4. Role determines what is visible, on every page, action and dashboard tile.
5. Presets are a starting point; the owner can change everything.

## Accessibility & Inclusion

Body/placeholder text ≥ 4.5:1 contrast; keyboard-navigable nav, tables and forms; visible focus ring; numeric data uses tabular figures and right-alignment for scan accuracy.
