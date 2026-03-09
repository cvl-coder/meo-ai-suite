

# MEO AI Services Platform - Implementation Plan

## Overview

Build a prototype AI services platform where MEO workspace owners can enable and manage AI functions. The first function is an **External AI Information Search** that takes client data and searches predefined URLs. We'll use Lovable Cloud for the prototype backend, and include an **Integration** page documenting what the MEO backend needs to implement.

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Frontend (React)                           │
│                                             │
│  /ai-admin        - AI Functions Dashboard  │
│  /ai-admin/:id    - Function Config Detail  │
│  /ai-admin/search - Run AI Search           │
│  /integration     - MEO Backend Spec Page   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Lovable Cloud (Prototype Backend)   │
│                                      │
│  DB Tables:                          │
│  - ai_functions (id, name, enabled)  │
│  - ai_search_configs (urls, prompts) │
│  - ai_search_results (history)       │
│                                      │
│  Edge Functions:                     │
│  - ai-search (orchestrates search)   │
└──────────────────────────────────────┘
```

## Pages & Components

### 1. AI Admin Dashboard (`/ai-admin`)
- List of available AI functions as cards (toggle enabled/disabled)
- Each card shows: name, description, status, "Configure" button
- First function: "External AI Search" - others can be added later

### 2. AI Search Configuration (`/ai-admin/search`)
- **Client Info Template**: Define what client fields to collect (name, company, industry, etc.)
- **Search Sources**: Add/edit/remove predefined URLs to search
- **Prompts**: Configure the AI prompt templates used for searching
- **Test panel**: Input sample client data and run a test search

### 3. AI Search Execution
- Form to input client information
- Triggers edge function that uses Firecrawl to scrape predefined URLs and Perplexity for AI-powered search
- Displays results with source citations

### 4. Integration Page (`/integration`)
- Auto-generated specification showing:
  - Required API endpoints the MEO backend must implement
  - Database schema (tables, columns, types)
  - Authentication requirements
  - Webhook/callback patterns
  - Example request/response payloads
- Refresh button to regenerate from current prototype state

## Database Schema (Lovable Cloud)

**ai_functions** - Registry of available AI functions
- `id`, `name`, `description`, `type` (enum), `enabled`, `created_at`

**ai_search_configs** - Per-workspace search configuration
- `id`, `function_id` (FK), `search_urls` (jsonb array), `prompt_template` (text), `client_fields` (jsonb), `updated_at`

**ai_search_results** - Search history
- `id`, `config_id` (FK), `client_data` (jsonb), `results` (jsonb), `created_at`

## Edge Functions

**ai-search**: Receives client data + config, scrapes configured URLs via Firecrawl, synthesizes results via Perplexity, returns structured findings.

## Connectors Needed
- **Firecrawl** - for scraping predefined URLs
- **Perplexity** - for AI-powered search synthesis

## Implementation Order

1. Set up Lovable Cloud + database tables
2. Build AI Admin Dashboard page with function cards
3. Build AI Search Config page (URLs, prompts, client fields)
4. Connect Firecrawl + Perplexity connectors
5. Build ai-search edge function
6. Build search execution UI with results display
7. Build Integration specification page

