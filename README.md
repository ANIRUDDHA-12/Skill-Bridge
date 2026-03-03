# Skill-Bridge: Master Architecture & Implementation Context

## 1. Project Overview
**Skill-Bridge** is a hyperlocal, AI-driven mobile marketplace designed to digitize the neighborhood gig economy. It connects users facing immediate household/lifestyle needs (Seekers) with verified local skilled workers (Providers) within a strict 1–5 km radius. 
**Core Philosophy:** The platform prioritizes extreme trust (via AI verification), zero-friction proximity matching (via PostGIS), and zero-commission transactions (direct UPI/Cash).

---

## 2. Technology Stack
**Frontend (Mobile App)**
* Framework: React Native (Expo Bare Workflow)
* Styling: NativeWind (Tailwind CSS for React Native)
* State Management: Redux Toolkit
* Mapping: `react-native-maps` (OpenStreetMap tiles to avoid API costs)

**Backend (API Gateway)**
* Server: Node.js with Express.js

**Database & Spatial Engine**
* Database: Supabase (PostgreSQL)
* Spatial Extension: PostGIS (Crucial: Will use `ST_DWithin` for radius calculations)
* *Network Constraint Note:* Due to regional ISP DNS blocks in India (e.g., Jio/Airtel blocking `*.supabase.co`), the local development environment must use Cloudflare (`1.1.1.1`) or Google (`8.8.8.8`) DNS to communicate with the database.

**AI Verification Microservice**
* Framework: Python with FastAPI
* OCR Engine: Tesseract.js / `pytesseract`
* Liveness/Face Match: `face_recognition` library + OpenCV

---

## 3. Global Design System ("Trust & Clinical")
The AI must strictly adhere to these UI/UX constraints to maintain a highly professional, secure, and mature appearance (avoiding playful or generic "tech blue" drift).
* **Background:** Crisp White (`#FFFFFF`)
* **Primary Brand/Buttons:** Deep Navy Blue (`#0F172A`)
* **Surface/Cards:** Cool Grey (`#F8FAFC`)
* **Borders/Dividers:** Light Slate (`#E2E8F0`)
* **Text Primary:** Dark Slate (`#1E293B`)
* **Text Secondary:** Medium Slate (`#64748B`)
* **Verified Badges:** Emerald Green (`#10B981`)
* **Geometry:** 16px base padding globally, 8px border-radius for cards/buttons (no exaggerated pill-shapes).
* **Typography:** Inter or Roboto (clean sans-serif).

---

## 4. Core Business Logic & Workflows

### A. The Unified Login & Routing
There are NOT two separate apps. There is a single login screen.
1. **Authentication:** Uses Supabase Auth (Phone Number + SMS OTP).
2. **Routing Logic:** Post-login, the frontend queries the user's `account_type` in the PostgreSQL `profiles` table.
   * `IF account_type === 'seeker'` -> Navigate to `SeekerMapDashboard`.
   * `IF account_type === 'provider'` -> Navigate to `ProviderTeaserDashboard`.

### B. The AI Trust Engine (Provider KYC)
Security is paramount. The verification pipeline must execute as follows:
1. **Upload:** Provider uploads PAN/Aadhaar and a live selfie to a private Supabase storage bucket.
2. **OCR & Checksum:** Python worker extracts text. PAN cards must pass Regex validation (`[A-Z]{5}[0-9]{4}[A-Z]{1}`). Aadhaar must pass Verhoeff checksum validation.
3. **Face Match:** Python worker compares ID photo geometry to the live selfie geometry.
4. **Data Ephemerality (Strict Rule):** Upon verification Pass/Fail, the raw image MUST be permanently deleted from the bucket. The DB only stores `is_verified: boolean` and a SHA-256 hash of the ID number to prevent duplicates.

### C. The Doorstep Handshake (Booking OTP)
This is separate from the login OTP and does NOT use SMS.
1. **Generation:** When a Provider accepts a job, the Node.js server generates a random 4-digit PIN and saves it to the `bookings` table (`handshake_otp`).
2. **Display:** The PIN is displayed on the Seeker's UI.
3. **Execution:** Upon physical arrival, the Provider must input this exact PIN into a full-screen number pad UI on their app.
4. **Validation:** The server validates the PIN and changes the job status to `IN_PROGRESS`.

### D. Zero-Friction Payments
Platform takes 0% commission. Post-service, the Provider enters the final bill amount on their app. The Seeker pays directly via personal UPI QR code or cash.

---

## 5. Execution Roadmap for the AI Agent
**AI INSTRUCTION:** Do not attempt to build the entire application in a single prompt. Wait for the human developer to specify which Phase to execute. Generate code iteratively and ask for confirmation before moving to the next Phase.

* **Phase 1: Scaffolding & Auth UI:** Initialize Expo + NativeWind. Build the Deep Navy/Crisp White login and SMS OTP screens.
* **Phase 2: Database & Routing:** Initialize Supabase connection. Create the `profiles` schema. Implement the conditional routing to Seeker/Provider dashboards.
* **Phase 3: Geospatial Core:** Enable PostGIS. Write the `get_nearby_providers` SQL function using `ST_DWithin`. Build the Seeker map UI (`react-native-maps`).
* **Phase 4: AI Microservice:** Build the Python FastAPI server. Implement the ephemeral file upload, Tesseract OCR, and Face Match logic.
* **Phase 5: Booking & Handshake Logic:** Implement the internal Doorstep PIN generation, Provider number pad UI, and final billing flow.

**End of Context Document.**