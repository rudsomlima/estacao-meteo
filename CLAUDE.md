# Instruções do projeto

## Visão geral

Projeto de estação meteorológica ESP32-C3 de baixo consumo. O repositório contém o firmware, o site React/Vite e a API Cloudflare Worker com banco D1. A documentação detalhada fica em [`docs/README.md`](docs/README.md); consulte o manual relevante antes de mudar hardware, firmware, publicação ou configuração.

## Estrutura

- `firmware/`: firmware Arduino/PlatformIO para ESP32-C3 e ferramentas de fábrica e teste.
- `web/`: site React, TypeScript, Vite e Tailwind.
- `worker/`: API Cloudflare Worker, D1, migrations e configuração Wrangler.
- `docs/`: manuais em português, resumos do projeto e ferramentas de documentação.

## Diretrizes de implementação

- Preserve o estilo existente: interface e manuais em português do Brasil, linguagem direta e termos consistentes. O `README.en.md` é o resumo em inglês.
- Antes de editar, confira `git status` e instruções locais. Não sobrescreva mudanças já existentes.
- Mantenha firmware, site, API e documentação coerentes. Parâmetros de configuração podem aparecer em `firmware/src/config.h`, `firmware/src/settings.cpp`, `web/src/types.ts`, componentes/configurações do site e `worker/src/shared.ts`.
- Não inclua senhas, tokens, chaves ou arquivos `.env`/`.dev.vars` no repositório.
- Para mudanças no site, rode `cd web && npm run build`. Para alterações de firmware, compile com `cd firmware && pio run`. Para mudanças na API, rode `cd worker && npm run check` e, quando aplicável, os testes `npm run smoke` com o Worker local preparado.
- Se editar manuais, preserve a organização e o tom de cada documento, atualize links relacionados e valide com `python docs/tools/check_links.py` e `git diff --check`.

## Placas e firmware

- O alvo atual é o **ESP32-C3** e o ambiente PlatformIO é `esp32c3`; confirme compatibilidade antes de introduzir outro modelo de placa.
- Para placa nova/em branco, use no site o assistente assistente da placa (plugue a placa; ou **Administração → Site e placas → Abrir o assistente da placa**). Ele grava a imagem completa, cria ou seleciona uma estação, configura Wi-Fi/vínculo e espera a primeira leitura.
- Limites, padrões e pinos dos campos de configuração vivem em `shared/board-schema.json`. Depois de editá-lo, rode `python tools/gen_schema.py` (gera `web/src/lib/schema.ts`, `worker/src/schema.ts` e `firmware/src/schema_gen.h`); o CI confere com `--check`. Sensores e pinos só se editam no assistente da placa (`web/src/board/`).
- A gravação avançada de firmware não configura Wi-Fi nem vincula a estação. Para atualizar uma placa existente sem trocar o vínculo, grave somente o `.bin` do aplicativo em `0x10000`. Gravar uma imagem completa em `0x0` pode redefinir os dados locais; apagar toda a flash também remove Wi-Fi, chave, calibração e configuração.
- Reconfigurar uma estação existente gera uma chave nova e invalida a anterior para todas as placas que a compartilhavam. Avise disso na interface e nos manuais sempre que alterar esse fluxo.
- Sensores, pinos, intervalos e parâmetros operacionais são configuração da estação, independentes da versão do firmware. Preserve a validação equivalente entre firmware, site e Worker.
- Para instruções completas de gravação, provisionamento, OTA e USB, consulte [`docs/firmware.md`](docs/firmware.md) e [`docs/guia-primeira-estacao.md`](docs/guia-primeira-estacao.md). Para montagem e GPIOs, consulte [`docs/hardware.md`](docs/hardware.md).

## Cloudflare e publicação

- O Worker é configurado em [`worker/wrangler.toml`](worker/wrangler.toml) e serve o site compilado de `web/dist`. Use os scripts de `worker/package.json`; `npm run deploy` compila o site e publica o Worker com Wrangler.
- Faça deploy em produção somente quando solicitado explicitamente. Antes, confira branch, commit, diff, autenticação e configuração Wrangler; nunca aplique migrações ou alterações de D1 sem verificar o escopo.
- Depois do deploy, registre a versão publicada e confirme uma resposta HTTP do endereço configurado.
- O guia de instalação e publicação é [`docs/implantacao.md`](docs/implantacao.md).

## Pull requests e commits

- Não inclua mudanças não relacionadas no commit. Confira `git diff --check`, branch e estado final antes de concluir.
- Não faça commit, push, merge ou publicação sem solicitação explícita.
- Mudanças em telas documentadas podem exigir atualizar as instruções/capturas referenciadas em [`docs/README.md`](docs/README.md).
