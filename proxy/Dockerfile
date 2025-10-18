FROM openresty/openresty:alpine-fat

# Install dependencies with specific versions
RUN apk add --no-cache bash openssl python3 py3-pip git && \
    apk add --no-cache py3-cryptography py3-openssl

# Install acme-nginx and create wrapper script
RUN pip3 install --no-cache-dir acme-nginx pyOpenSSL cryptography --break-system-packages && \
    echo '#!/usr/bin/env python3' > /usr/local/bin/acme-nginx && \
    echo 'from acme_nginx.client import main' >> /usr/local/bin/acme-nginx && \
    echo 'if __name__ == "__main__":' >> /usr/local/bin/acme-nginx && \
    echo '    main()' >> /usr/local/bin/acme-nginx && \
    chmod +x /usr/local/bin/acme-nginx

# Verify acme-nginx installation
RUN acme-nginx --help

# Create ec2-user with a fixed UID (1000)
RUN addgroup -S ec2-user && adduser -S -u 1000 -G ec2-user ec2-user

# Install lua-resty-auto-ssl using pre-installed LuaRocks
RUN luarocks install lua-resty-auto-ssl

# Create required directories for lua-resty-auto-ssl
RUN mkdir -p /etc/resty-auto-ssl/storage \
    /etc/resty-auto-ssl/letsencrypt/conf \
    /etc/openresty/lua /etc/ssl/private

# Set correct permissions
RUN chmod 755 /etc/resty-auto-ssl

# Copy pre-built configuration files
COPY data/openresty.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY data/cacher.lua /etc/openresty/lua/cacher.lua

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
EXPOSE 80 443

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]
