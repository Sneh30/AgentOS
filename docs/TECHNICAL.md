# GTM OS --- Technical Architecture

## Overview

GTM OS is an autonomous execution platform for GTM teams. It combines
LLM planning, persistent memory, API integrations, and Browser Use into
a unified runtime.

## Stack

-   Next.js 16
-   React 19
-   TypeScript
-   Clerk
-   Supabase
-   Prisma
-   Memory Store
-   Composio
-   Browser Use
-   Playwright

## High-Level Architecture

User ↓ Planner ↓ Memory Retrieval ↓ API Executor / Browser Executor ↓
Result Synthesis ↓ Memory Storage

## Repository

    src/
     app/
      chat/
      agents/
      memory/
      integrations/
      api/
     lib/
      planner/
      browser/
      memory/
      composio/
      scheduler/

## Execution Loop

1.  Receive task
2.  Retrieve memory
3.  Generate plan
4.  Choose API or Browser Use
5.  Execute
6.  Replan if needed
7.  Persist results
8.  Return response

## Browser Layer

Browser Use executes tasks where APIs are unavailable: - LinkedIn -
Apollo - Browser-only dashboards - Internal tools

## Integrations

-   LinkedIn
-   X
-   Gmail
-   Slack
-   HubSpot
-   Salesforce
-   Apollo
-   Notion
-   Google Calendar

## Built-in Agents

-   Prospect Research
-   Social Listening
-   Competitor Watch
-   CRM Hygiene
-   Launch Sync
-   Meeting Prep
-   Outreach

## Memory

Shared semantic memory stores: - conversations - company knowledge -
customer history - previous executions

## Scheduler

Supports: - Manual - Cron - Event triggers

## Security

-   Clerk authentication
-   Row-level security
-   Encrypted credentials
-   Human approval for sensitive actions

## Deployment

Frontend: Vercel Database: Supabase Memory: Memory Store Automation:
Browser Use

## Future

-   Multi-agent orchestration
-   MCP support
-   Analytics dashboard
-   Marketplace
