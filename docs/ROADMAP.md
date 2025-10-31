# ShiftSage Modernization: Project Roadmap

### ✅ Phase 1: Local Environment Setup
- [x] Configure Node/Express and DB
- [x] Secure env vars (no hardcoded secrets)

### ⏭️ Phase 2: Visual Regression Testing (VRT)
- [ ] Establish Playwright test harness
- [ ] Baseline snapshot generation
- [ ] CI integration with snapshot diffs

### ⏭️ Phase 3: Backend Optimization
- [ ] Modularize routes/controllers
- [ ] Centralized error handling, logging
- [ ] Performance review of DB access

### ⏭️ Phase 4: API Layer Development
- [ ] Add `/api/v1/*` endpoints mirroring app routes
- [ ] JSON schemas + OpenAPI docs

### ⏭️ Phase 5: React Frontend Subproject
- [ ] Initialize React app (Vite)
- [ ] Shared auth + API client
- [ ] Routing and state mgmt

### ⏭️ Phase 6: UI Conversion (EJS → React)
- [ ] View parity checks via VRT
- [ ] Remove legacy EJS progressively

### 🌈 Stretch Goals
- [ ] Dark mode + responsive polish
- [ ] TypeScript adoption
- [ ] Docker Compose
- [ ] Feature: Cloudinary integration
- [ ] CI/CD deploy pipeline
