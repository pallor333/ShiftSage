# ShiftSage 🕒  
_All-in-one scheduling and overtime management tool_  

ShiftSage is a **scheduling and workforce management web app** designed to simplify shift planning and overtime tracking. It helps managers build efficient schedules, calculate overtime automatically, and generate fair coverage when team members take time off or during holidays. 

<p align="center">
  <img src="./docs/assets/shiftsage-banner.png" width="600" alt="ShiftSage Project (banner placeholder)">
</p>

## ✨ Features  

- 📅 **Smart Scheduling** – Build efficient schedules that balance employee availability and coverage needs.  
- ⏱ **Automated Overtime Tracking** – Accurately calculate and track overtime hours for compliance and reporting.  
- 🏖 **Time-Off & Holiday Handling** – Automatically generate overtime shifts to cover vacations and holidays.  
- ⚖️ **Fairness Rules** – Streamline assignments with rules to prevent conflicts and ensure equitable distribution.  
- 📊 **Manager Insights** – Gain clarity and control while making scheduling more transparent for employees.  

---

## 🚀 Quickstart

```bash
git clone <your-fork-url>
cd shiftsage
npm ci
npm run dev
```

# Environment Variables
Values for /config/.env file:
  - PORT = 2121 (can be any port example: 3000)
  - DB_STRING = `your database URI`
  - SEED_USER = `default username`
  - SEED_PASS = `default user password`
  - CLOUD_NAME = `your cloudinary cloud name`
  - API_KEY = `your cloudinary api key`
  - API_SECRET = `your cloudinary api secret`

---

## 🛠 Tech Stack  

- **Backend:** Node.js, Express  
- **Database:** MongoDB (Mongoose)  
- **Frontend:** EJS templates, CSS, JavaScript  
- **Testing:** Playwright (VRT)
- **CI:** GitHub Actions

## 🧭 Roadmap
See [docs/ROADMAP.md](./docs/ROADMAP.md).

## 🧪 Testing & Quality
- Unit and integration tests (TBD)
- Visual Regression Tests with Playwright (see [docs/vrt-demo.md](./docs/vrt-demo.md))

## 📚 Docs
- [Architecture](./docs/architecture.md)
- [API](./docs/api.md)

## 🤝 Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Pull Request Template](./.github/pull_request_template.md).

## 🪪 License
MIT — see [LICENSE](./LICENSE).
