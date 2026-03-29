# Skill-Bridge

> **Hyperlocal on-demand services platform** — connects neighborhood Seekers with skilled local Providers within 5 km, built with React Native (Expo) + Supabase.

---

## Project Status

```
Status: MVP Complete ✨
Sprints completed: 13 of 13 planned
Estimated completion: 100% (Production Ready)
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
| Provider live location updates | ✅ Complete |
| Ratings & Reviews | ✅ Complete |
| Payment flow (UPI Deep Links / Razorpay) | ✅ Complete |
| KYC / Identity verification | ✅ Complete (React Native camera to Supabase; Admin manual verification) |
| App branding (Splash screens + Icons) | ✅ Complete |
| Android .apk EAS Build | ✅ Complete |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile framework | React Native (Expo SDK 54) |
| Styling | NativeWind v4 (Tailwind for RN) |
| State management | Redux Toolkit |
| Navigation | React Navigation v7 (Native Stack) |
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
│   └── AppNavigator.tsx      # Multi-branch conditional router
├── screens/
│   ├── LoginScreen.tsx       # Email input
│   ├── OtpScreen.tsx         # OTP verification
│   ├── RoleSelectionScreen.tsx
│   ├── ProviderSetupScreen.tsx   # Name / category / price / GPS
│   ├── ProviderKYCScreen.tsx     # ID & Selfie upload for identity verification
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
  upi_id text,
  location geography,          -- PostGIS point
  is_active boolean,
  kyc_status text,             -- 'unverified' | 'pending' | 'verified'
  id_url text,
  selfie_url text
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
    ├─ Provider + kyc unverified ───► KYCStack (ProviderKYC)
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
| 5–7 | Provider sync, Reviews System, Deep-link UPI Payments | *Multiple* |
| 8.1 | KYC Frontend - Camera capture + Supabase upload | `5f58c25` |
| 9.1 | Production App Branding & EAS Standalone Build | `0299520` |

---

## What Works End-to-End (Today)

1. **Provider** sets up account, completes **KYC Integration** (ID/Selfie upload) and enters pending loop until verified by Admin.
2. Verified **Seeker** logs in → sees OpenStreetMap centered on their GPS location.
3. Seeker searches for a service (e.g. "Plumber") → filtered provider pins appear within a 5 km radius.
4. Taps a provider pin → animated bottom sheet shows name, category, hourly rate, and exact distance.
5. Taps **Book Now** → secure 4-digit PIN generated, pending booking inserted in Supabase in real-time.
6. Seeker UI converts to active booking state: "Waiting for Provider…"
7. **Provider** gets real-time push to their Job Feed showing seeker name and distance.
8. Provider **Accepts** → UI dynamically switches for both in real-time.
9. Provider arrives and taps **Start Job** → triggers the Handshake PIN Modal.
10. Entering the correct PIN sets job to `in_progress`.
11. Job Complete triggers end of flow → Native UPI Payment redirection, final Review.

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

## Production Builds (EAS)

The project is currently configured for Expo Application Services (EAS) to orchestrate cloud builds.

To build the standalone Android `.apk` for live untethered testing:

```bash
eas build --platform android --profile preview
```

## Future Roadmap (Post-MVP)

| Phase | Planned |
|---|---|
| v2.0 | Automated AI KYC Verification replacing Admin Panel (Python FastAPI microservice with py-tesseract and liveness check) |
| v2.1 | iOS App Store & Google Play Store release |
| v2.2 | In-app WebSocket Chat System |

## Author
**Aniruddha**
- GitHub: [@ANIRUDDHA-12](https://github.com/ANIRUDDHA-12)
