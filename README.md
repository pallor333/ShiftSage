# ShiftSage 🕒  
_All-in-one scheduling and overtime management tool_  

ShiftSage is a **scheduling and workforce management web app** designed to simplify shift planning and overtime tracking. It helps managers build efficient schedules, calculate overtime automatically, and generate fair coverage when team members take time off or during holidays.  

## ✨ Features  

- 📅 **Smart Scheduling** – Build efficient schedules that balance employee availability and coverage needs.  
- ⏱ **Automated Overtime Tracking** – Accurately calculate and track overtime hours for compliance and reporting.  
- 🏖 **Time-Off & Holiday Handling** – Automatically generate overtime shifts to cover vacations and holidays.  
- ⚖️ **Fairness Rules** – Streamline assignments with rules to prevent conflicts and ensure equitable distribution.  
- 📊 **Manager Insights** – Gain clarity and control while making scheduling more transparent for employees.  

## 🛠 Tech Stack  

- **Backend:** Node.js, Express  
- **Database:** MongoDB (Mongoose)  
- **Frontend:** EJS templates, CSS, JavaScript  
- **Other Tools:** Cloudinary (media storage), dotenv (environment config)  

--- 

## 🚀 Getting Started  

### Install  
Clone the repo and install dependencies:  
```bash
npm install


---

# Environment Variables
- Create a `.env` file in config folder and add the following as `key = value`
  - PORT = 2121 (can be any port example: 3000)
  - DB_STRING = `your database URI`
  - CLOUD_NAME = `your cloudinary cloud name`
  - API_KEY = `your cloudinary api key`
  - API_SECRET = `your cloudinary api secret`

---

# Run

`npm start`
open http://localhost:[PORT]/parking in the web browser

📸 Demo (TODO)

🌱 Future Improvements:
- Build a React frontend for a modern UI
- Add automated testing suite