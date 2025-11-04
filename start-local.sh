#!/bin/bash

# Script para rodar Codebuff localmente (banco Docker + backend/web local)

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Iniciando Codebuff (Setup Híbrido)${NC}"
echo ""

# Diretório do projeto
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Verificar se o banco está rodando
echo -e "${YELLOW}Verificando banco de dados...${NC}"
if ! docker ps | grep -q codebuff-db; then
    echo -e "${YELLOW}Iniciando banco de dados...${NC}"
    cd "$PROJECT_DIR" && docker compose up -d db 2>/dev/null || docker-compose up -d db
    sleep 3
else
    echo -e "${GREEN}✓ Banco de dados já está rodando${NC}"
fi

# Função para cleanup ao sair
cleanup() {
    echo ""
    echo -e "${YELLOW}Parando serviços...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $WEB_PID 2>/dev/null
    echo -e "${GREEN}✓ Serviços parados${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Carregar variáveis de ambiente do .env
echo -e "${YELLOW}Carregando variáveis de ambiente...${NC}"
export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)

# Iniciar Backend
echo ""
echo -e "${BLUE}📡 Iniciando Backend (porta 4242)...${NC}"
cd "$PROJECT_DIR/backend"
bun install > /dev/null 2>&1
bun dev > "$PROJECT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend iniciado (PID: $BACKEND_PID)${NC}"
echo -e "   Logs: tail -f backend.log"

# Aguardar backend iniciar
sleep 3

# Iniciar Web
echo ""
echo -e "${BLUE}🌐 Iniciando Web (porta 3000)...${NC}"
cd "$PROJECT_DIR/web"
bun install > /dev/null 2>&1
bun dev > "$PROJECT_DIR/web.log" 2>&1 &
WEB_PID=$!
echo -e "${GREEN}✓ Web iniciado (PID: $WEB_PID)${NC}"
echo -e "   Logs: tail -f web.log"

# Aguardar web iniciar
echo ""
echo -e "${YELLOW}Aguardando serviços iniciarem...${NC}"
sleep 8

# Verificar se os processos estão rodando
if ps -p $BACKEND_PID > /dev/null && ps -p $WEB_PID > /dev/null; then
    echo ""
    echo -e "${GREEN}✅ Todos os serviços estão rodando!${NC}"
    echo ""
    echo "📊 Status dos serviços:"
    echo "   • Database: http://localhost:5432"
    echo "   • Backend:  http://localhost:4242"
    echo -e "   • ${GREEN}Web:       http://localhost:3000${NC} ← ABRA ESTE!"
    echo ""
    echo "📝 Comandos úteis:"
    echo "   • Ver logs backend: tail -f backend.log"
    echo "   • Ver logs web:     tail -f web.log"
    echo "   • Ver logs banco:   docker logs -f codebuff-db"
    echo "   • Parar tudo:       Ctrl+C"
    echo ""
    echo -e "${YELLOW}Pressione Ctrl+C para parar todos os serviços${NC}"
    echo ""
    
    # Abrir navegador automaticamente (opcional)
    sleep 2
    if command -v open &> /dev/null; then
        echo -e "${GREEN}🌐 Abrindo navegador...${NC}"
        open http://localhost:3000
    fi
    
    # Mostrar logs em tempo real
    echo -e "${BLUE}📋 Logs em tempo real (Ctrl+C para parar):${NC}"
    echo ""
    tail -f "$PROJECT_DIR/web.log" "$PROJECT_DIR/backend.log" 2>/dev/null
else
    echo -e "${RED}❌ Erro ao iniciar serviços${NC}"
    echo ""
    echo "Verifique os logs:"
    echo "   backend.log"
    echo "   web.log"
    cleanup
fi
