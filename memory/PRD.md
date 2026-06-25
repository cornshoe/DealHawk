# DealHawk AI - Product Requirements

## Overview
A native iOS/Android Expo app to manually evaluate Facebook Marketplace deals. Users paste listing details, attach photos, and an AI returns a deal score, profit estimate, risk warnings, and a negotiation message. No Facebook integration or scraping — manual workflow only.

## Stack
- **Backend**: FastAPI + MongoDB, JWT auth + Emergent Google OAuth session auth, push relay via Emergent.
- **Frontend**: Expo SDK 54, expo-router file-based routing, React Native components only.
- **AI**: Claude Sonnet 4.5 (claude-sonnet-4-5-20250929) via Emergent Universal LLM Key with multimodal vision (text + base64 images).

## Key Features
- Email/password auth (`/auth/signup`, `/auth/login`) + Emergent Google session (`/auth/google/session`).
- `POST /api/analyze` - sends listing + base64 images to Claude, returns structured JSON.
- Deal CRUD with statuses: new, watching, messaged, purchased, sold, skipped.
- Filters by category (electronics, furniture, vehicles, tools, collectibles, appliances, free, other).
- Dashboard ranks top deals by profit and shows aggregate metrics.
- Push notification register (`/api/register-push`) + test trigger.
- Dark-first UI per design guidelines (Personality 7 - obsidian + ember orange).

## Endpoints
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/google/session`, `GET /api/auth/me`, `POST /api/auth/logout`
- `POST /api/analyze` (auth required)
- `POST /api/deals`, `GET /api/deals?status&category&sort`, `GET /api/deals/{id}`, `PATCH /api/deals/{id}`, `DELETE /api/deals/{id}`
- `GET /api/dashboard`
- `POST /api/register-push`, `POST /api/reminders/test`

## Routes (frontend)
- `/auth` - login/signup
- `/(tabs)/dashboard`, `/(tabs)/analyze`, `/(tabs)/board`, `/(tabs)/profile`
- `/deal/[id]` - deal detail

## Notes
- Push notifications only work on real device builds (publish via Emergent), not Expo Go.
- Images are base64 data URLs (no S3, no URLs).
