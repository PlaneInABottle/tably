---
name: tably-mobile
description: Use for Tably mobile app work: Expo navigation, Supabase table RPCs, table discovery, table chat, join/intro/confirmation flows, safety/reporting/blocking, and Maestro verification.
---

# Tably Mobile

## Product Model

Tably is a local social app for today/tomorrow small-group plans. A "table" can be coffee, dinner, drinks, walk, run, cinema, coworking, culture, sports, or exploring.

The app should not become a passive event board. Prioritize table momentum, next actions, guided chat, confirmations, and inactive-seat replacement.

## Architecture

- App stack: Expo React Native, React Navigation, Supabase, PostGIS, Jest, Maestro.
- Active app tabs: `Today`, `CreateTable`, `Chats`, `Profile`.
- `TableDetail` is a stack screen used from discovery and chats.
- Supabase behavior should be RPC-first. Use service methods in `app/services/tables/tableService.ts` instead of raw table writes from screens.

## Core Flow

1. User discovers a table from list or map.
2. User joins and becomes `pending_intro`.
3. User answers the intro prompt and becomes `pending_confirm`.
4. User confirms attendance and becomes `confirmed`.
5. Expired pending seats are released by RPC calls and waitlisted users are promoted.

## Verification

- Run `pnpm compile` after app or type changes.
- Run focused Jest tests for pure table/date/status logic.
- Use `pnpm test:maestro` for the current smoke flow once a dev build is available.
- Use local Supabase SQL/RPC checks for RLS, seat release, waitlist promotion, report/block, and account deletion behavior.
