# Use Node.js LTS image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && \
    npm cache clean --force

# Copy application files
COPY server.js .
COPY banned.html .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]

