FROM shopify/toxiproxy:2.12.0

USER root
RUN apk add --no-cache iproute2

CMD ["/toxiproxy-server", "-host", "0.0.0.0"]
