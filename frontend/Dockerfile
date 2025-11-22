# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# 1. Copy only package files first
COPY package.json package-lock.json* ./

# 2. Install ALL deps, including dev (vite)
RUN npm install --include=dev

# 3. Copy the rest of the app
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]