# QuickTalk – Real Time Chat Demo
QuickTalk is a small full stack chat application that I built to practice working with a modern stack and real time messaging.
It has a simple WhatsApp style interface, supports private one to one chats between users, and uses WebSockets so messages appear instantly without refreshing the page.
The whole app runs with Docker, so you can bring up the backend, frontend, and database with a single command.

# Features
- Login with email and username (no password, demo only)
- WebSocket based real time messaging using STOMP
- One to one private chats between users
- Sidebar with recent conversations and last message preview
- Clean chat UI with message bubbles and sender labels
- Light and dark theme toggle
- Docker Compose setup for backend, frontend, and database
  
# Tech Stack
**Frontend**
- React with TypeScript
- Vite dev server
- STOMP client for WebSockets

**Backend**
- Java Spring Boot
- STOMP over WebSocket
- REST endpoints for login and messaging
- MySQL (or compatible relational database)

**Infrastructure**
- Docker
- Docker Compose
  
# How to Run (with Docker)
### Prerequisites
- Git
- Docker and Docker Compose installed and running

# Steps
1. **Clone the repo:**
   git clone https://github.com/Saisirimallipeddi333/quicktalk_full_stack_demo.git

2. **Go into the project folder:**
   cd quicktalk_full_stack_demo

3. **Start backend + frontend with Docker:**
   docker compose up --build

4. **Open the app in your browser:**
   http://localhost:5173   (or whatever port your frontend uses)
