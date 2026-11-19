# JobOrbit — Job Portal & Application Tracker

A full-stack job portal that connects candidates and recruiters through job discovery, recruitment management, application tracking, and AI-powered career assistance.

## Overview

JobOrbit is a MERN-based job portal designed to simplify the recruitment process. Candidates can discover opportunities, apply for jobs, manage applications and receive career guidance. Recruiters can publish job listings and manage candidates through a dedicated dashboard.

The application includes an AI-powered Career Assistant to help users with interview preparation, resume improvements and career-related questions.

## Key Features

### Candidate Features
- User registration and authentication.
- Browse and search available job opportunities.
- Filter jobs by relevant categories and criteria.
- View job details and apply for positions.
- Track submitted applications and their statuses.
- Save jobs for later.
- Manage candidate profile information.
- Upload and manage resumes.

### Recruiter Features
- Recruiter authentication and dashboard.
- Create and manage job listings.
- View applicants for published jobs.
- Review candidate applications and resumes.
- Manage application statuses.
- Access recruitment-related information.

### AI Career Assistant
- AI-powered career guidance using Google Gemini.
- Interview preparation and practice tips.
- Resume improvement suggestions.
- Career-related question answering.
- Context-aware guidance using available candidate, application and job information.
- Retry and fallback handling for temporary AI provider failures.

## Technology Stack

| Area | Technologies |
|---|---|
| Frontend | React 19, JavaScript, Vite |
| Routing | React Router DOM |
| Styling | Tailwind CSS, CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcryptjs |
| File handling | Multer |
| AI integration | Google Gemini API |
| Email integration | Resend |
| Testing | Node.js test runner, Supertest, MongoDB Memory Server |
| Deployment | Vercel, Render, MongoDB Atlas |

## Project Structure

```text
JobOrbit/
│
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   └── .env.example
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── app.js
│   │   └── index.js
│   ├── package.json
│   └── .env.example
│
├── docs/
│   ├── API.md
│   └── DEPLOYMENT.md
│
├── .gitignore
├── package.json
├── package-lock.json
├── render.yaml
└── README.md
```

## Prerequisites

Install the following before running JobOrbit:

- Node.js 20.19+ or 22.12+.
- npm.
- MongoDB Atlas account or a local MongoDB instance.
- Git.
- A Google Gemini API key for AI functionality.

Optional integrations such as email and object storage require their respective provider credentials.

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/pooja-shembekar/JobOrbit.git
cd JobOrbit
```

### 2. Install backend dependencies

```bash
npm install --prefix server
```

### 3. Install frontend dependencies

```bash
npm install --prefix client
```

### 4. Configure environment variables

Create your backend environment file:

```text
server/.env
```

Use the supplied example:

```text
server/.env.example
```

Create your frontend environment file:

```text
client/.env
```

Use:

```text
client/.env.example
```

Fill in the required values using the variable names documented in those example files.

**Security:** Never commit `.env` files, API keys, database credentials, JWT secrets or other private configuration.

### 5. Start the backend

From the project root:

```bash
npm run server
```

The backend runs on:

```text
http://localhost:5000
```

### 6. Start the frontend

Open another terminal in the project root:

```bash
npm run client
```

The Vite development server normally runs on:

```text
http://localhost:5173
```

### 7. Verify backend health

Open:

```text
http://localhost:5000/api/health
```

Check that the backend reports a healthy database connection.

## Available Commands

Run these commands from the project root.

| Command | Purpose |
|---|---|
| `npm run server` | Start backend |
| `npm run client` | Start frontend development server |
| `npm run test` | Run backend tests |
| `npm run build` | Build frontend for production |
| `npm run client:build` | Build frontend |
| `npm run server:start` | Start backend without development watch mode |

Additional frontend commands:

```bash
npm run test --prefix client
npm run lint --prefix client
```

## Backend Architecture

The backend follows a modular Express architecture:

- **Config:** Database and application configuration.
- **Controllers:** Handle incoming requests and business logic.
- **Middleware:** Authentication, authorization and request processing.
- **Models:** MongoDB schemas and data models.
- **Routes:** Define API endpoints.
- **Services:** Handle integrations and reusable business operations.

Main database models:

- User
- Job
- Application

## API Documentation

Detailed API routes, authentication requirements, request parameters and response structures are documented here:

[View API Documentation](docs/API.md)

## Testing

Run the backend test suite:

```bash
npm test --prefix server
```

Run frontend tests:

```bash
npm test --prefix client
```

Build the frontend:

```bash
npm run build
```

Provider integrations should also be tested with appropriate credentials. Automated tests that mock external services do not guarantee that live provider services are available.

## Deployment

JobOrbit is designed for separate frontend and backend deployment.

| Component | Hosting |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | MongoDB Atlas |

Refer to the deployment guide:

[View Deployment Documentation](docs/DEPLOYMENT.md)

Production environment variables must be configured securely through the hosting provider's environment-variable settings.

## Contributing

Contributions and improvements are welcome.

1. Fork the repository.
2. Create a new feature branch.
3. Make your changes.
4. Test your changes.
5. Submit a pull request describing your improvements.

Example:

```bash
git checkout -b feature/your-feature
```

Please avoid committing secrets, generated build files or personal configuration.

## Future Improvements

Potential areas for future development include:

- Additional AI-powered recruitment features.
- Improved candidate and recruiter analytics.
- Enhanced job recommendation capabilities.
- Further performance and accessibility improvements.

## Author

**Pooja Shembekar**

GitHub: [@pooja-shembekar](https://github.com/pooja-shembekar)

## License

No license has been specified yet. All rights are reserved unless a license is added to this repository.