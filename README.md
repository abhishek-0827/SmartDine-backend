# Smart Dine Backend (OpenRouter)

This is the Node.js + Express backend for the Smart Dine MVP. It uses **OpenRouter** to access various LLMs (default: `google/gemini-2.0-flash-exp:free`) for NLP slot extraction.

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

1.  Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
    *(On Windows, just copy and rename the file manually or use `copy .env.example .env`)*

2.  Ensure `.env` has your OpenRouter API key:
    ```
    OPENROUTER_API_KEY=your_key_here
    OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
    PORT=4000
    ```

## Running the Server

Start the development server (uses nodemon for auto-restarts):

```bash
npm run dev
```

The server will start on `http://localhost:4000`.

## API Endpoints

### 1. Query (Main NLP Search)

-   **URL:** `/api/query`
-   **Method:** `POST`
-   **Body:** `{ "text": "user query here" }`
-   **Example:**
    ```bash
    curl -X POST http://localhost:4000/api/query \
         -H "Content-Type: application/json" \
         -d '{"text":"cheap veg biryani near Coimbatore"}'
    ```

### 2. Feedback

-   **URL:** `/api/feedback`
-   **Method:** `POST`
-   **Body:** `{ "restaurantId": "r001", "liked": true }`

### 3. Admin

-   **GET** `/api/admin/restaurants`: Get all restaurant data.
-   **POST** `/api/admin/restaurants`: Add a new restaurant.
