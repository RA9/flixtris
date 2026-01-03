# Frontend Dockerfile - Flixtris
# Serves static files via nginx

FROM nginx:alpine

# Copy static files to nginx html directory
COPY index.html /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY icons/ /usr/share/nginx/html/icons/
COPY manifest.json /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
