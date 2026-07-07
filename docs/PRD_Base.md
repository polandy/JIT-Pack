# Product Requirement Document (PRD): „JIT-Pack"

**Document Status:** Ready for Architecture
**Target Audience:** Self-Hosting Enthusiasts, Families, Active Sports/Outdoor Enthusiasts
**Architecture Focus:** Offline-First, Real-Time Collaboration, Multi-User, Infrastructure-as-Code Vibe

## 1. Product Vision & Core Goals

**JIT-Pack** (Just-In-Time Pack) is a self-hosted travel preparation and packing list platform. It eliminates rigid, static lists by introducing a modular template system tailored to the dynamic needs of families and sports/tech-savvy users. The application reduces mental load through automated quantity calculations, delegable tasks, real-time sync during the physical packing process, and a continuous feedback loop that automatically optimizes master templates after a trip.

## 2. System Architecture & Infrastructure (Declarative)

System and environment configurations are 100% declarative, managed strictly via environment variables or configuration files (e.g., within a Docker Compose setup). No administrative infrastructure changes are permitted via the UI.

* **OIDC Authentication:** The application features no internal password database or user registration forms. Authentication is completely decoupled and outsourced to an external Identity Provider (e.g., Authelia) via OpenID Connect (OIDC).
* **Just-In-Time (JIT) Provisioning:** When a new user successfully authenticates via Authelia, the backend automatically provisions their local user profile (Subject ID, name, email) upon their first login.
* **Mobile Authentication (PKCE):** For native mobile applications (iOS/Android built via Capacitor), the system supports the *Authorization Code Flow with PKCE* utilizing a secure in-app browser overlay. This generates long-lived, secure JWTs for the API.

## 3. Functional Requirements (FR)

### 3.1 Template & Master Data Management (Content via UI)

* **FR-1.1 (Central Item Database):** The system manages a master inventory of items (Items) with optional metadata: weight (in grams), estimated price/value (in CHF/EUR), and a default category (e.g., Clothing, Electronics, Bike Gear). This data is fully managed via the UI.
* **FR-1.2 (Modular Templates):** Users can create any number of standalone templates within the UI (e.g., "Base Clothing", "Photo Equipment", "Gravel Bike Weekend").
* **FR-1.3 (Dynamic Quantity Formulas):** Items within a template can utilize mathematical formulas based on trip variables instead of static values (e.g., Quantity = trip_duration + 1 or Quantity = fixed_value).
* **FR-1.4 (Target Assignment Types):** Each item in a template defines how it handles multiple travelers:
  * *Per Person:* The item is multiplied for each individual traveler when generating the trip instance (e.g., toothbrush, helmet).
  * *Trip-Global:* The item is generated exactly once for the entire trip, regardless of the number of participants (e.g., tool kit, pump, first-aid kit).

### 3.2 Trip Management & Aggregation

* **FR-2.1 (Trip Creation):** Trips are defined in the UI using dynamic metadata: Name, start/end dates (which automatically compute the trip duration), and participating members (including profile types like *Adult* or *Child*).
* **FR-2.2 (Modular Aggregation):** When generating a trip, the user selects which master templates to combine via checkboxes.
* **FR-2.3 (Intelligent Deduplication):** If items overlap across selected templates (e.g., "Sunscreen" in both *Base Clothing* and *Beach*), the system intelligently merges them (e.g., takes the maximum value or adds them together based on config).
* **FR-2.4 (Strict Decoupling):** Once generated, the active trip packing list is completely independent of the master templates. Manual edits made to a trip will never alter the global templates.

### 3.3 Procurement Logistics (Buy Mode)

* **FR-3.1 (Procurement Types):** Every item on an active packing list supports three distinct modes:
  * PACK (Standard: Pack from home).
  * BUY_BEFORE (Purchase at home before departure).
  * BUY_LOCAL (Purchase after arrival at the destination).
* **FR-3.2 (Dynamic Filter Views):** The app provides dedicated sub-views (e.g., a "Pre-trip Shopping List") that aggregate all items marked as BUY_BEFORE or BUY_LOCAL.
* **FR-3.3 (State Transition):** When a BUY_BEFORE item is marked as purchased, it automatically shifts its mode to PACK and populates the main packing list.

### 3.4 Multi-User, Collaboration & Delegation

* **FR-4.1 (Trip Sharing):** Users can share specific trips with other registered accounts on the self-hosted instance.
* **FR-4.2 (Separation of Subject and Actor):** The system strictly differentiates between:
  * *User (Assigned to):* Who is using the item? (e.g., Bike helmet for *Leonardo*).
  * *Packer (Packed by):* Which user account is physically responsible for putting it in the bag? (e.g., *Wife's Account*).
* **FR-4.3 (Delegation & Self-Assignment):** Users can delegate packing responsibility for any item to any participant shared on the trip, or claim open items via a quick self-assignment action.
* **FR-4.4 (Real-Time Synchronization):** Any status change (assignment, packing updates) must be pushed instantly (via WebSockets or similar) to the view of all active users without requiring a manual page refresh.

### 3.5 Packing Workflow & Live Status

* **FR-5.1 (Extended Packing States):** Items support granular states: Open, Packing Now (actively being tracked/searched for), and Packed. Additionally, a Late Packer flag marks items that can only be packed right before walking out the door (e.g., house keys, daily toothbrush).
* **FR-5.2 (Quick Action "Packing Now"):** Users can trigger the Packing Now state instantly via a simple UI gesture (e.g., swipe or long-press).
* **FR-5.3 (Collision Prevention):** When an item enters Packing Now, it is visually locked for all other users ("In progress by Andy") to prevent redundant work in different rooms/floors.

### 3.6 Dashboards, Notifications & Deep Linking

* **FR-6.1 (Personalized Dashboard):** Upon logging in, users are greeted with a personalized "My Tasks" view aggregating all items and context-tasks assigned to them across all active trips.
* **FR-6.2 (Notifications):** Delegating an item or mentioning a user triggers an immediate push notification or in-app notification.
* **FR-6.3 (Deep Linking):** Clicking an item on the dashboard or opening a notification uses deep linking to navigate the user *directly to the specific item context within the trip view*, scrolling automatically, flashing the item visually, and opening any attached comments/tasks.

### 3.7 Contextual Task & Comment System

* **FR-7.1 (Contextual Layers):** Comments can be posted globally on a trip level or anchored directly to an individual packing item (e.g., "Rear tire losing air, top off tubeless sealant before packing").
* **FR-7.2 (Ticket Mode / Tasks):** A comment can be flagged as a "Task" with its own lifecycle (Open / Resolved). An item cannot be fully marked as ready until all nested tasks attached to it are Resolved.

### 3.8 Weight & Value Analytics

* **FR-8.1 (Real-Time KPIs):** The active trip view displays live tracking KPIs showing cumulative total weight (in kg) and total monetary value (in CHF/EUR) of the gear (Planned vs. Packed).
* **FR-8.2 (Dimensional Filtering):** Analytics can be filtered by *Person* (e.g., "How much weight is the kid carrying?"), *Category* (e.g., value of electronics), or *Luggage Container* (e.g., weight of left pannier vs. right pannier to prevent bike imbalance).

### 3.9 Continuous Improvement (Post-Trip Review)

* **FR-9.1 (Trip Feedback Flags):** While on the trip or away, users can flag items as Unused (overpacked) or Missing (spontaneously added because it was forgotten at home).
* **FR-9.2 (Review Assistant):** Archiving or completing a trip triggers a guided Post-Trip Review. The app evaluates the flags and offers smart template optimization prompts (e.g., "Reduce quantity of Item X in Template Y?" or "Permanently add missing Item Z to Template Y?"). Changes are written back to the master data via a single-click confirmation.

## 4. Non-Functional Requirements (NFR)

* **NFR-4.1 (Offline-First):** Mobile clients must remain completely functional without a network connection (e.g., in basements, garages, or remote areas). All read/write actions must instantly commit to a local device database.
* **NFR-4.2 (Background Sync):** When a network connection becomes available, the app silently synchronizes upstream with the central database, handling data conflicts gracefully. *(Superseded by Addendum ADR-001 v2: the backend is embedded SQLite, not PostgreSQL — see `docs/ADR-001_v2_Stack_Sync.md`.)*
* **NFR-4.3 (Resource Efficiency):** The backend must be exceptionally lightweight and containerized (Docker), enabling it to run smoothly on standard home lab infrastructure (e.g., local NAS or low-power mini-PC) with minimal RAM footprints.
* **NFR-4.4 (Security):** Local API interaction relies on decoupled JWT validation so that routine sync procedures bypass active Authelia session checks, ensuring smooth offline-to-online transitions.

---

*Superseded by, and to be read alongside, `docs/PRD_Addendum_v2.8.md`, which is authoritative wherever the two disagree (notably NFR-4.2, revised from a central PostgreSQL backend to embedded SQLite per ADR-001 v2).*
