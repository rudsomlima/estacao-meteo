# Documentação

| Guia | Para quê |
|---|---|
| [guia-primeira-estacao.md](guia-primeira-estacao.md) | **Comece aqui:** passo a passo com telas para colocar uma estação nova no ar |
| [placa-nova.md](placa-nova.md) | Do cabo ao primeiro dado: o assistente da placa para uma placa nova |
| [placa-existente.md](placa-existente.md) | Atualizar o firmware, trocar a rede ou mudar sensores e pinos de uma placa cadastrada |
| [pendencias-de-teste.md](pendencias-de-teste.md) | O que já foi testado na placa real e o que ainda falta testar |
| [arquitetura.md](arquitetura.md) | Como as partes se falam e por que foi feito assim |
| [hardware.md](hardware.md) | Lista de materiais, ligações, alimentação e instalação |
| [firmware.md](firmware.md) | Gravar, primeiro acesso, ciclo de medição, configuração |
| [energia.md](energia.md) | Consumo, modos de vento, autonomia e como medir |
| [calibracao.md](calibracao.md) | Direção, velocidade, chuva e temperatura |
| [implantacao.md](implantacao.md) | Publicar na Cloudflare, mapa, domínio, backup |
| [api.md](api.md) | Endpoints, formatos e limites |
| [solucao-de-problemas.md](solucao-de-problemas.md) | Sintomas comuns e o que verificar |

## Figuras

| Figura | Onde está | Como se gera |
|---|---|---|
| Diagramas: arquitetura, ligação, ligação I²C, pinagem, perfis de consumo | `img/*.svg` | `python docs/tools/make_diagrams.py`. Edite o script, e não os SVGs. |
| Telas do site | `img/captura-*.png` e `img/guia/*.png` | `node docs/tools/capture_screens.mjs` com o ambiente de desenvolvimento no ar (`npm run dev`). Precisa do Chrome e de `npm i playwright-core` numa pasta qualquer (veja o cabeçalho do script). |

Ao mudar uma tela do site que aparece em um guia, refaça as capturas e confira o texto do guia. `python docs/tools/check_links.py` confere os links entre os documentos.

As telas `guia/06` a `guia/10` (aviso da placa USB) usam uma placa simulada e não são geradas pelo script.
