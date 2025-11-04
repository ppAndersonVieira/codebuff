# Configuração do Alias Codebuff Local

Este guia mostra como configurar um alias para usar o binário local do Codebuff em vez da versão instalada globalmente.

## Método Rápido (Recomendado)

Execute o script de configuração automática:

```bash
./scripts/setup-local-alias.sh
```

Este script irá:
1. Construir o binário automaticamente
2. Detectar seu shell (zsh, bash, fish)
3. Adicionar o alias ao arquivo de configuração apropriado
4. Mostrar instruções para ativar o alias

## Método Manual

### 1. Construir o Binário

Primeiro, construa o binário:

```bash
cd npm-app
bun run build
```

Isso criará o binário em `npm-app/bin/codebuff`.

### 2. Configurar o Alias

### Para Bash/Zsh (macOS/Linux)

Adicione ao seu `~/.zshrc` ou `~/.bashrc`:

```bash
# Codebuff local development alias
alias codebuff="/Users/anderson.vieira/Documents/repositorios/codebuff/npm-app/bin/codebuff"
```

Depois recarregue o shell:

```bash
source ~/.zshrc  # ou source ~/.bashrc
```

### Para Fish Shell

Adicione ao seu `~/.config/fish/config.fish`:

```fish
# Codebuff local development alias
alias codebuff="/Users/anderson.vieira/Documents/repositorios/codebuff/npm-app/bin/codebuff"
```

Depois recarregue:

```fish
source ~/.config/fish/config.fish
```

## 3. Verificar

Teste o alias em qualquer diretório:

```bash
cd ~  # ou qualquer outro diretório
codebuff --version
```

Deveria mostrar a versão local do seu build.

## 4. Reconstruir Quando Necessário

Sempre que você fizer mudanças no código, reconstrua o binário:

```bash
cd /Users/anderson.vieira/Documents/repositorios/codebuff/npm-app
bun run build
```

## Resolução de Problemas

### Erro: "Agent template not found for type: base"

Se você ainda receber este erro:

1. **Verifique se o binário foi construído recentemente:**
   ```bash
   ls -lh npm-app/bin/codebuff
   ```

2. **Reconstrua o binário:**
   ```bash
   cd npm-app && bun run build
   ```

3. **Verifique se o alias está apontando para o lugar certo:**
   ```bash
   which codebuff
   ```
   Deveria mostrar o caminho completo do binário.

### O binário não está executando

1. **Certifique-se de que tem permissão de execução:**
   ```bash
   chmod +x npm-app/bin/codebuff
   ```

2. **Tente executar diretamente:**
   ```bash
   npm-app/bin/codebuff --version
   ```

## Alternativa: Adicionar ao PATH

Em vez de um alias, você pode adicionar o diretório bin ao PATH:

```bash
# Adicione ao ~/.zshrc ou ~/.bashrc
export PATH="/Users/anderson.vieira/Documents/repositorios/codebuff/npm-app/bin:$PATH"
```

Isso permite usar `codebuff` em qualquer lugar sem alias.
