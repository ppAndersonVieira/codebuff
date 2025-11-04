.PHONY: help setup up down restart status logs logs-web logs-backend logs-db db-shell db-migrate db-studio db-studio-local db-reset clean cli install-cli setup-cli-alias oauth-help start-local stop-local

# Colors for output
GREEN=\033[0;32m
YELLOW=\033[1;33m
BLUE=\033[0;34m
RED=\033[0;31m
NC=\033[0m # No Color

help: ## Mostra esta mensagem de ajuda
	@echo "$(GREEN)Comandos disponíveis:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)Exemplos:$(NC)"
	@echo "  make start-local    # Iniciar tudo localmente"
	@echo "  make stop-local     # Parar todos os serviços"
	@echo "  make db-studio-local # Abrir Drizzle Studio"
	@echo "  make install-cli    # Rebuildar e instalar CLI"

## Docker Commands

setup: ## Configura e inicia todo o ambiente Docker
	@./scripts/docker-setup.sh

up: ## Inicia os containers
	@echo "$(GREEN)Iniciando containers...$(NC)"
	@docker-compose up -d

down: ## Para e remove os containers
	@echo "$(YELLOW)Parando containers...$(NC)"
	@docker-compose down

restart: ## Reinicia os containers
	@echo "$(YELLOW)Reiniciando containers...$(NC)"
	@docker-compose restart

status: ## Mostra o status dos containers
	@docker-compose ps

logs: ## Mostra logs de todos os containers
	@docker-compose logs -f

logs-web: ## Mostra logs do web
	@docker-compose logs -f web

logs-backend: ## Mostra logs do backend
	@docker-compose logs -f backend

logs-db: ## Mostra logs do database
	@docker-compose logs -f db

## Database Commands

db-shell: ## Acessa o shell do PostgreSQL
	@docker-compose exec db psql -U manicode_user_local -d manicode_db_local

db-migrate: ## Roda migrations do banco
	@docker-compose exec web bun run --cwd /app/packages/internal db:migrate

db-studio: ## Abre o Drizzle Studio (Docker)
	@docker-compose exec web bun run --cwd /app/packages/internal db:studio

db-studio-local: ## Abre o Drizzle Studio (Local)
	@echo "$(GREEN)📊 Abrindo Drizzle Studio...$(NC)"
	@echo "Acesse: https://local.drizzle.studio/"
	@cd packages/internal && bun run db:studio

db-reset: ## CUIDADO: Reseta o banco de dados
	@echo "$(RED)⚠️  ATENÇÃO: Isso vai apagar TODOS os dados!$(NC)"
	@read -p "Tem certeza? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		docker-compose up -d db; \
		echo "$(GREEN)✓ Banco resetado$(NC)"; \
	else \
		echo "$(YELLOW)Cancelado$(NC)"; \
	fi

## CLI Commands

cli: ## Inicia o CLI no container
	@docker-compose run --rm cli bash

install-cli: ## Instala a CLI globalmente como 'codebuff'
	@echo "$(GREEN)📦 Installing CLI globally as 'codebuff'...$(NC)"
	@bun install
	@cd npm-app && bun run build
	@mkdir -p ~/.local/bin
	@ln -sf $(PWD)/npm-app/bin/codebuff ~/.local/bin/codebuff
	@echo "$(GREEN)✅ CLI installed! Use 'codebuff' anywhere.$(NC)"
	@echo ""
	@echo "Location: ~/.local/bin/codebuff"
	@echo ""
	@echo "Test it:"
	@echo "  cd ~/your-project"
	@echo "  codebuff --help"
	@echo "  codebuff"

setup-cli-alias: ## Cria alias codebuff-dev no shell (sem instalar globalmente)
	@echo "$(GREEN)🔗 Setting up CLI alias as 'codebuff-dev'...$(NC)"
	@echo "#!/bin/bash" > scripts/codebuff-cli.sh
	@echo "cd $(PWD) && bun run --cwd npm-app start --cwd \"\$$@\"" >> scripts/codebuff-cli.sh
	@chmod +x scripts/codebuff-cli.sh
	@echo ""
	@echo "$(YELLOW)Adicione ao seu ~/.zshrc ou ~/.bashrc:$(NC)"
	@echo "  alias codebuff-dev='$(PWD)/scripts/codebuff-cli.sh'"
	@echo ""
	@echo "Depois execute:"
	@echo "  source ~/.zshrc"

## Local Development Commands

start-local: ## Inicia tudo localmente (banco Docker + backend/web local)
	@./start-local.sh

stop-local: ## Para serviços locais
	@echo "$(YELLOW)Parando serviços locais...$(NC)"
	@pkill -f "bun.*backend" || true
	@pkill -f "bun.*web.*dev" || true
	@docker-compose stop db
	@echo "$(GREEN)✓ Serviços parados$(NC)"

## Utility Commands

clean: ## Remove node_modules, builds e caches
	@echo "$(YELLOW)Limpando arquivos...$(NC)"
	@find . -name "node_modules" -type d -prune -exec rm -rf {} +
	@find . -name ".next" -type d -prune -exec rm -rf {} +
	@find . -name "dist" -type d -prune -exec rm -rf {} +
	@find . -name ".turbo" -type d -prune -exec rm -rf {} +
	@echo "$(GREEN)✓ Limpeza concluída$(NC)"

oauth-help: ## Mostra ajuda para configurar GitHub OAuth
	@echo "$(GREEN)🔑 GitHub OAuth Setup$(NC)"
	@echo ""
	@echo "1. Acesse: https://github.com/settings/developers"
	@echo "2. Clique: OAuth Apps > New OAuth App"
	@echo "3. Preencha:"
	@echo "   Application name: Codebuff Local Dev"
	@echo "   Homepage URL: http://localhost:3000"
	@echo "   Callback URL: http://localhost:3000/api/auth/callback/github"
	@echo ""
	@echo "4. Copie Client ID e Secret para o arquivo .env"
	@echo "5. Execute: make restart"
	@echo ""
	@echo "📖 Mais detalhes: GITHUB_OAUTH.md"

# Default target
.DEFAULT_GOAL := help
