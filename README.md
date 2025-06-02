# Install

`npm install`

---

# Things to add

- Create a `.env` file in config folder and add the following as `key = value`
  - PORT = 2121 (can be any port example: 3000)
  - DB_STRING = `your database URI`
  - CLOUD_NAME = `your cloudinary cloud name`
  - API_KEY = `your cloudinary api key`
  - API_SECRET = `your cloudinary api secret`

---

# Run

`npm start`

# ShiftSage 4/17/25
Bugs: 
- Incorrect error message on login → references to an email
- Seniority shouldn't display day of week (Tuesday) but instead Month/Day/Year
- 'Edit' button on Regular/Overtime Shift and Manage Locations does not work and should be removed in the case of regular + manage locations.
- Does not handle DST when it comes to shifts. 