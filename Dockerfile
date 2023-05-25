FROM cgr.dev/chainguard/wolfi-base AS builder

WORKDIR /src

COPY . .

RUN rm -rf nginx.conf

FROM cgr.dev/chainguard/nginx

COPY --from=builder /src /var/lib/nginx/html

COPY nginx.conf /etc/nginx/
