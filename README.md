# 📟 B_ZONE // SECURE SHELL (2026)

> **Black Market Uplink** — A retro CRT-styled interactive secure terminal designed for clan operations, weapon & ammo crafting calculators, clan orders, trailer stock management, and private encrypted communications.

---

## ⚡ Key Features

- **🖥️ Retro CRT Terminal Interface**:
  - Scanline effects, screen curvature, flicker animations, and ambient CRT noise.
  - Realistic boot sequence with interactive command prompt styling.
  - Cyberpunk aesthetic with phosphor green, amber warnings, and alert accents.

- **👥 Role & Permission Hierarchy**:
  - **Leader (`Lider`)**: Full clan management (manage equipment stock, promote/demote members, approve/reject requests, schedule activities).
  - **Co-Leader (`Colider`)**: Approve clan equipment orders, schedule and manage clan activities.
  - **Coordinator (`Coordonator`)**: Manage trailer inventory and approve member supply requests.
  - **Member (`Membru`)**: Request equipment orders, request trailer supplies, and RSVP to clan activities.

- **🔨 Crafting & Recipe Calculator**:
  - Step-by-step recipes for firearms (TEC-9, Heavy Revolver) and ammunition (9mm / PBM).
  - Dynamic material requirement calculator based on craft quantity multipliers.

- **📦 Clan Orders System**:
  - Submit equipment supply requests (Body Armor, Medical Kit, DB Blueprint, Shotgun).
  - Real-time approval / rejection workflow for clan leadership.

- **🚐 Trailer Supply & Stock (`Rulota`)**:
  - Real-time inventory tracking for contraband and supplies (Cigarettes, Joints, Cocaine, Red Blaze, Green Haze, Blue Curent).
  - Member quantity requests with one-click approval and automated stock deduction.

- **📅 Clan Activities & Events**:
  - Schedule clan operations and events (title, details, requirements, time/location).
  - Live member RSVP system (Confirmed / Declined) with real-time attendee roster.

- **💬 Deep Web Encrypted Chat**:
  - Real-time private communication channel for active operators.

---

## 🚀 Getting Started

This application is built as a standalone, zero-dependency **Single Page Application (SPA)** utilizing pure HTML5, CSS3, and modern vanilla JavaScript.

### Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/gabi10david9-cpu/bzone-site-2026.git
   ```
2. Open `index.html` in any modern web browser (Chrome, Firefox, Edge, Brave):
   - Double-click `index.html`, or
   - Serve using a lightweight HTTP server:
     ```bash
     # Using Node.js
     npx serve .

     # Or using Python
     python -m http.server 8000
     ```

---

## 🔒 Storage & Data Persistence

- Integrates with shared artifact storage where available, with automatic in-memory fallback for standalone browser sessions.
- The first account registered automatically receives the **Leader** (`Lider`) rank.

---

## 👤 Repository & Contributing

- Hosted on [GitHub: bzone-site-2026](https://github.com/gabi10david9-cpu/bzone-site-2026)
