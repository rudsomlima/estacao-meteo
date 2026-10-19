# Contribuindo

Obrigado por ajudar! O projeto está em fase inicial e **o que mais falta é validação em hardware real**. Qualquer relato de montagem ou medição já ajuda.

## Formas de contribuir

1. **Medições de bancada.** Corrente em deep sleep, em light sleep e num envio completo. Ângulo da biruta, pulsos falsos do Hall, alcance do Wi-Fi. Abra uma issue com o modelo da placa, a bateria e os números (veja o modelo de issue "Medição").
2. **Relatos de montagem.** O que funcionou, o que mudou na lista de materiais, fotos.
3. **Documentação.** Correções, traduções (a documentação detalhada está em português do Brasil) e novos diagramas.
4. **Código.** Veja as ideias em [docs/energia.md](docs/energia.md#ideias-para-economizar-ainda-mais).

## Preparar o ambiente

```bash
# tudo de uma vez (banco, estações de exemplo simuladas, API e site): na raiz
npm run dev

# ou separado
# site
cd web && npm ci && npm run dev

# API local
cd worker && npm ci && npm run db:local && npm run seed:local && npm run dev
cd worker && npm run smoke            # testes da API

# firmware
pip install platformio
cd firmware && pio run
```

## Antes de abrir um pull request

- `cd web && npm run build` passa (inclui a checagem de tipos).
- `cd worker && npx tsc --noEmit && npm run smoke` passam com a API rodando.
- `cd firmware && pio run` compila.
- Mudou a ligação, a energia ou a arquitetura? Atualize `docs/tools/make_diagrams.py`, rode `python docs/tools/make_diagrams.py` e inclua os SVGs gerados.
- Mudou um valor de configuração? Atualize juntos: `worker/src/index.ts`, `web/src/types.ts`, `web/src/components/ConfigPanel.tsx`, `firmware/src/settings.cpp` e `docs/firmware.md`.
- Evite números de consumo sem fonte. Se medir, diga como.

## Estilo

- O texto da interface e da documentação é em português do Brasil, em linguagem direta.
- Comentários explicam o **porquê**, não o óbvio.
- Sem segredos no repositório: `.dev.vars`, `.env` e chaves ficam fora do git.

## Segurança

Achou uma falha (por exemplo, forma de ler ou gravar dados sem a chave)? **Não abra uma issue pública.** Use o recurso de aviso privado de vulnerabilidade do GitHub neste repositório.
