# Skill-Bridge

> **Hyperlocal on-demand services platform** — connects neighborhood Seekers with skilled local Providers within 5 km, built with React Native (Expo) + Supabase.

---

## Project Status

```
Sprints completed: 7 of ~12 planned
Estimated completion: ~70%
TypeScript errors: 0
```

| Layer | Status |
|---|---|
| Auth (Email + OTP + Session persistence) | ✅ Complete |
| Role selection (Seeker / Provider) | ✅ Complete |
| Provider onboarding (name / category / GPS) | ✅ Complete |
| Seeker map + provider discovery | ✅ Complete |
| Provider detail bottom sheet | ✅ Complete |
| Booking engine (Book Now → `bookings` table) | ✅ Complete |
| Provider Job Feed (Accept / Decline) | ✅ Complete |
| Real-time booking notifications | ✅ Complete |
| Doorstep PIN handshake (Start Job) | ✅ Complete |
| Seeker active job banner (live status) | ✅ Complete |
| KYC / Identity verification | ❌ Not started |
| Payment flow (Razorpay / UPI) | ❌ Not started |
| Ratings & Reviews | ❌ Not started |
| Provider live location updates | ❌ Not started |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native (Expo SDK 50) |
| Styling | NativeWind v4 (Tailwind for RN) |
| State management | Redux Toolkit |
| Navigation | React Navigation v6 (Native Stack) |
| Backend / DB | Supabase (PostgreSQL + PostGIS) |
| Spatial queries | PostGIS — `ST_DWithin`, `ST_Distance`, `ST_Point` |
| Maps | `react-native-maps` with OpenStreetMap tiles (zero API cost) |
| Location | `expo-location` |
| Real-time | Supabase Realtime channels (`postgres_changes`) |

---

## Design System

| Token | Value |
|---|---|
| Background | `#FFFFFF` — Crisp White |
| Brand / Buttons | `#0F172A` — Deep Navy |
| Surface / Cards | `#F8FAFC` — Cool Grey |
| Borders | `#E2E8F0` — Light Slate |
| Text Primary | `#1E293B` — Dark Slate |
| Text Secondary | `#64748B` — Medium Slate |
| Verified / Success | `#10B981` — Emerald Green |

---

## Repository Structure

```
src/
├── components/
│   └── PinModal.tsx          # Cross-platform 4-digit PIN entry modal
├── lib/
│   └── supabase.ts           # Supabase client instance
├── navigation/
│   └── AppNavigator.tsx      # 5-branch conditional router
├── screens/
│   ├── LoginScreen.tsx       # Email input
│   ├── OtpScreen.tsx         # OTP verification
│   ├── RoleSelectionScreen.tsx
│   ├── ProviderSetupScreen.tsx   # Name / category / price / GPS
│   ├── ProviderJobFeedScreen.tsx # Accept/Decline + PIN Start Job
│   └── SeekerMapDashboard.tsx    # OS map + search + booking + PIN banner
└── store/
    ├── authSlice.ts          # Session, accountType, profileComplete
    └── store.ts
```

---

## Database Schema

```sql
-- Profiles (extends Supabase auth.users)
profiles (
  id uuid PK,
  email text,
  account_type text,           -- 'seeker' | 'provider'
  display_name text,
  service_category text,
  price_per_hour numeric,
  location geography,          -- PostGIS point
  is_active boolean
)

-- Bookings
bookings (
  id uuid PK,
  seeker_id uuid → profiles,
  provider_id uuid → profiles,
  service_category text,
  price_per_hour numeric,
  status text,                 -- pending|accepted|declined|in_progress|completed|cancelled
  doorstep_pin text,           -- 4-digit PIN generated at booking time
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz
)
```

### Supabase RPC Functions
| Function | Purpose |
|---|---|
| `get_providers_nearby(lat, lng, radius)` | PostGIS radius search, returns provider list |
| `set_provider_location(lat, lng)` | Updates provider's GPS coordinates |

---

## Navigation Flow

```
App Launch
    │
    ├─ No session ──────────────────► AuthStack (Login → OTP)
    │
    ├─ Session + no account_type ───► SetupStack (Role Selection)
    │
    ├─ Provider + no display_name ──► ProviderSetupStack (Onboarding)
    │
    ├─ Provider + profile complete ─► ProviderStack (Job Feed)
    │
    └─ Seeker ──────────────────────► SeekerStack (Map Dashboard)
```

---

## Sprint History

| Sprint | Feature | Commit |
|---|---|---|
| 1.1 | Auth UI — Login + OTP screens | `7811f42` |
| 2.1 | Supabase integration + Redux + Routing | `1472de9` |
| 3.1 | OpenStreetMap + GPS location | `a57e2e6` |
| 3.2 | Provider pins + Category search | `34d5f44` |
| 3.3 | Provider Setup screen + Bottom Sheet | `d2b3687` |
| 4.1 | Book Now + Provider Job Feed + Real-time | `42e44bc` |
| 4.2 | Doorstep PIN Handshake + Active Job Banner | `1575f1b` |

---

## What Works End-to-End (Today)

1. **Seeker** logs in → sees OpenStreetMap centered on their GPS location
2. Types "Plumber" → filtered provider pins appear within 5 km
3. Taps a provider pin → bottom sheet shows name, category, price, distance
4. Taps **Book Now** → 4-digit PIN generated, booking inserted in Supabase
5. Active Job Banner replaces search bar: "Waiting for Provider…"
6. **Provider** logs in → Job Feed shows incoming booking with seeker name
7. Provider taps **Accept** → both screens update in real-time (Supabase Realtime)
8. Seeker banner: "Provider on the Way! PIN: **4729**"
9. Provider taps **Start Job** → PIN modal appears
10. Provider enters correct PIN → `status = in_progress`, `started_at` set
11. Seeker banner: "Job In Progress"

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/ANIRUDDHA-12/Skill-Bridge.git
cd Skill-Bridge

# 2. Install
npm install

# 3. Environment — create .env in root
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# 4. Start (tunnel for physical device)
npx expo start --tunnel
```

> **DNS note (India):** If Supabase connections time out on Jio/Airtel, switch your device DNS to `1.1.1.1` (Cloudflare) or `8.8.8.8` (Google).

---

## Remaining Roadmap

| Sprint | Planned |
|---|---|
| 4.3 | "Complete Job" button → `status=completed`, `completed_at` set |
| 5.1 | KYC — PAN/Aadhaar upload + face match (Python FastAPI microservice) |
| 5.2 | Provider go-online toggle + live GPS tracking |
| 6.1 | Ratings & Reviews after job completion |
| 6.2 | Razorpay payment gateway |
| 7.0 | App Store build — icons, splash, privacy policy |