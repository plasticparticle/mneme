# Multi-stage build → tiny distroless static binary.
# go.mod requires go >= 1.25 (raised by the pgx v5.9.2 bump); the distroless
# runtime stage is version-independent.
FROM golang:1.25 AS build
WORKDIR /src
COPY server/go.* ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -o /journald ./cmd/journald

FROM gcr.io/distroless/static-debian12
COPY --from=build /journald /journald
EXPOSE 8080
ENTRYPOINT ["/journald"]
