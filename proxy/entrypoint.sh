#!/bin/bash
set -e

CERT_PATH="/etc/ssl/private/letsencrypt-domain.pem"
KEY_PATH="/etc/ssl/private/letsencrypt-domain.key"

# Enable staging mode if USE_STAGING is set to "true"
STAGING_FLAG=""
if [[ "$USE_STAGING" == "true" ]]; then
  echo "Using Let's Encrypt staging environment"
  STAGING_FLAG="--staging"
fi

# Ensure BLOT_HOST is set
echo "BLOT_HOST=$BLOT_HOST"

# Check if AWS credentials are set
if [[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" && -n "$AWS_REGION" ]]; then
  echo "AWS credentials detected. Using DNS challenge for wildcard certificate."
  DNS_PROVIDER="--dns-provider route53"
  DOMAIN="-d *.$BLOT_HOST"
else
  echo "AWS credentials not found. Falling back to HTTP challenge for single-domain certificate."
  DNS_PROVIDER=""
  DOMAIN="-d $BLOT_HOST"
fi

# Generate SSL certificate if not present
if [[ ! -f "$CERT_PATH" || ! -f "$KEY_PATH" ]]; then
  echo "Generating SSL certificate for $DOMAIN..."
  acme-nginx \
    $DNS_PROVIDER \
    $DOMAIN \
    -o "$CERT_PATH" \
    --domain-private-key "$KEY_PATH" \
    $STAGING_FLAG
  echo "Certificate generated successfully."
else
  echo "Certificate already exists. Skipping generation."
fi

# Start OpenResty
exec /usr/local/openresty/bin/openresty -g "daemon off;"