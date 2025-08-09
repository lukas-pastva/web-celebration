FROM nginx:alpine

# Clean default assets and entrypoint scripts
RUN rm -rf /usr/share/nginx/html/* && rm -rf /docker-entrypoint.d/*

# App files
COPY html/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Prepare temp dirs
RUN mkdir -p /tmp/client_body_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp

# Declare a mount point for images
VOLUME ["/data"]

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
