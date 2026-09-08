# Frontend (React + Vite) -> built and served by nginx
# ---- build stage ----
FROM node:20-slim AS build

WORKDIR /app

# Don't download Chromium for puppeteer during install (not needed to build)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install

COPY . .

# Produces /app/dist (vite default). If `tsc -b` blocks the build with type
# errors, switch the build script to just `vite build`, or run:
#   RUN npx vite build
RUN npm run build

# ---- serve stage ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
