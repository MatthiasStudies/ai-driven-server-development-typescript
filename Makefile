.DEFAULT_GOAL := help

PNPM ?= pnpm
COMPOSE ?= docker compose

.PHONY: help install env up down recreate-db dev build start test typecheck lint format format-check db-studio

help:
	@printf '%s\n' \
		'install env up down recreate-db dev build start test typecheck lint format format-check db-studio' \
		'recreate-db DESTROYS the Compose PostgreSQL volume, including Keycloak data.'

install:
	$(PNPM) install

env:
	@if [ -e .env ] || [ -L .env ]; then \
		printf '%s\n' '.env already exists; leaving it unchanged.'; \
	else \
		(set -C; cat .env.example > .env) && printf '%s\n' 'Created .env from .env.example.'; \
	fi

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

recreate-db:
	@printf '%s\n' 'WARNING: this removes the Compose PostgreSQL volume and ALL application AND Keycloak data.' \
		'Type RESET to destroy the volume and reseed it, or anything else to cancel:'
	@read -r answer; [ "$$answer" = RESET ] || { printf '%s\n' 'Cancelled.'; exit 1; }; \
		$(COMPOSE) down -v && $(COMPOSE) up -d --wait

dev:
	$(PNPM) dev

build:
	$(PNPM) build

start:
	$(PNPM) start

test:
	$(PNPM) test

typecheck:
	$(PNPM) typecheck

lint:
	$(PNPM) lint

format:
	$(PNPM) format

format-check:
	$(PNPM) format:check

db-studio:
	$(PNPM) db:studio
